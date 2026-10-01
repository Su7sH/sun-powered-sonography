// Numerical regression checks; reads a candidate without writing beside it.
// Usage: node checks/numeric_boundary_checks.js [path/to/index.html]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const candidate = path.resolve(process.argv[2] || path.join(__dirname, '../index.html'));
const html = fs.readFileSync(candidate, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function load(S)') && s.includes('function compare('));
const data = scripts.find(s => s.includes('window.SPS_DATA ='));
assert.ok(engine && data, 'Embedded engine/data scripts found');
const context = {window: {}, module: {exports: {}}};
vm.createContext(context);
vm.runInContext(data, context);
vm.runInContext(engine, context);
const E = context.module.exports, D = context.window.SPS_DATA;
const cases = [];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
function test(name, fn) {
  try { fn(); cases.push({name, pass:true}); }
  catch (error) { cases.push({name, pass:false, error:error.message}); }
}
function state() {
  return {
    country:'XX', city:'', myYield:Array(12).fill(4),
    site:{open:8,close:18,days:7},
    scanners:[{name:'Test scanner',qty:1,scans:10,minPerScan:30,after:'unplugged',activeW:100,idleW:100}],
    hasAC:false, ac:[], other:[], xray:{on:false},
    plan:{goal:'gridopt',backup:'none',outageH:0,backupH:2,autonomy:1},
    sys:{moduleKWh:1,dodPct:100,etaInv:100,moduleKW:1,etaRT:100,panelWp:500,pf:1,invKVA:1,invShortKVA:2},
    money:{quote:10000}
  };
}
test('Ordinary load, solar, storage and panel arithmetic is unchanged', () => {
  const r=E.run(state(),D);
  assert.equal(r.L.complete,true);near(r.L.daily,1);near(r.L.annual,365);
  near(r.Z.kWp,0.25);near(r.Z.kWpUpper,0.25);near(r.Z.solarUsed,365);assert.equal(r.Z.panels,1);
  near(r.B.usable,0.2);assert.equal(r.B.modules,1);near(r.B.battKWh,1);assert.equal(r.B.moduleCountComplete,true);
});
test('Finite over-capacity throughput still caps at opening hours with warning', () => {
  const s=state();s.scanners[0].scans=100;const r=E.run(s,D);
  assert.equal(r.L.complete,true);near(r.L.daily,1);assert.ok(r.L.warn.some(w=>w.includes('Only 10 h')));
});
test('Overflowing throughput suppresses load and dependent targets before capping', () => {
  const s=state();Object.assign(s.scanners[0],{scans:1e308,minPerScan:60});const r=E.run(s,D);
  assert.equal(r.L.complete,false);assert.equal(r.L.annual,undefined);assert.equal(r.Z.kWp,undefined);assert.equal(r.B.usable,undefined);
  assert.ok(r.L.need.some(n=>n.includes('throughput')));
});
test('A derived infinite average load is rejected', () => {
  const s=state();s.site={open:0,close:Number.MIN_VALUE,days:7};s.scanners[0].qty=0;s.hasAC=true;s.ac=[{qty:1,kwh:1,ratedW:1000}];
  assert.equal(E.run(s,D).L.complete,false);
});
test('Monthly PV production overflow with finite sizing targets is rejected', () => {
  const s=state();s.scanners[0].activeW=1e290;s.scanners[0].idleW=1e290;
  s.myYield=Array(12).fill(1e20);s.myYield[0]=1e-20;s.plan.goal='offgrid';s.sys.panelWp='';
  const r=E.run(s,D);assert.equal(r.L.complete,true);assert.equal(r.Z.kWp,undefined);assert.equal(r.Z.months,undefined);
  assert.ok(r.Z.need.some(n=>n.includes('monthly solar')));
});
test('Annual solar totals must be finite even when individual months are finite', () => {
  // Direct boundary probe of the pure solar function, not a plausible site or a load-model fixture.
  const s=state();s.sys.panelWp='';
  const r=E.solar(s,{complete:true,opDays:365,daily:1e306,closedKWh:0,annual:1e308},{monthly:Array(12).fill(1)});
  assert.equal(r.kWp,undefined);assert.equal(r.shortfall,undefined);assert.ok(r.need.some(n=>n.includes('monthly solar')));
});
test('Overflowing nominal installed battery capacity withholds complete count', () => {
  const s=state();s.sys.moduleKWh=1e308;s.sys.moduleKW=0.04;const b=E.run(s,D).B;
  assert.equal(b.modulesPower,3);assert.equal(b.moduleCountComplete,false);assert.equal(b.modules,undefined);assert.equal(b.battKWh,undefined);
  assert.ok(b.moduleNeed.some(n=>n.includes('total nominal battery capacity')));
});
test('A tiny positive energy target requires one energy module', () => {
  const s=state();s.plan.backupH=1e-9;const b=E.run(s,D).B;
  assert.ok(b.nominal>0);assert.equal(b.modulesEnergy,1);
});
test('A tiny positive power requirement requires one discharge module', () => {
  const s=state();s.sys.moduleKW=1e10;assert.equal(E.run(s,D).B.modulesPower,1);
});
test('A tiny positive array requires one panel', () => {
  const s=state();s.sys.panelWp=1e15;assert.equal(E.run(s,D).Z.panels,1);
});
test('A real requirement just above an integer rounds up, not down', () => {
  const s=state();s.plan.backupH=10.000000001;assert.equal(E.run(s,D).B.modulesEnergy,2);
});
test('Underflow in positive requirement/capacity division still requires one module', () => {
  const s=state();s.plan.backupH=1e-307;s.sys.moduleKWh=1e308;const b=E.run(s,D).B;
  assert.ok(b.nominal>0);assert.equal(b.modulesEnergy,1);
});
test('True zero requirements retain zero panel and battery counts', () => {
  const s=state();s.scanners=[{qty:0}];const r=E.run(s,D);
  assert.equal(r.L.complete,true);assert.ok(r.Z.panels===0);assert.ok(r.B.modulesEnergy===0);assert.ok(r.B.modulesPower===0);assert.ok(r.B.modules===0);
});
test('Panel counts beyond safe integer precision are withheld', () => {
  const s=state();s.sys.panelWp=1e-20;const z=E.run(s,D).Z;
  assert.equal(z.panels,undefined);assert.equal(z.kWp,undefined);assert.ok(z.need.length>0);
});
test('Module counts beyond safe integer precision are withheld', () => {
  for(const key of ['moduleKWh','moduleKW']) {
    const s=state();s.sys[key]=1e-20;const b=E.run(s,D).B;
    assert.equal(b.modules,undefined);assert.equal(b.moduleCountComplete,false);assert.ok(b.moduleNeed.length>0);
  }
});
test('Continuous X-ray remains an unverified PF=1 DC-discharge screen', () => {
  const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode:'continuous',phase:'single'};
  Object.assign(s.sys,{etaInv:95,moduleKW:0.15,dodPct:80,invKVA:4});const r=E.run(s,D);
  near(r.B.dcKW,3.1/0.95);assert.equal(r.B.modules,22);assert.equal(r.B.compatibilityVerified,false);assert.ok(r.B.note.includes('upper bound at PF=1'));
});
test('Momentary, unknown and branch-only X-ray still withhold complete modules', () => {
  for(const mode of ['momentary','unknown','branch']) {
    const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode,phase:'single'};const b=E.run(s,D).B;
    assert.equal(b.modules,undefined);assert.equal(b.moduleCountComplete,false);assert.ok(b.energyOnlyCount>=1);assert.equal(b.compatibilityVerified,false);
  }
});
for(const c of cases)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}${c.error?' :: '+c.error:''}`);
const failures=cases.filter(c=>!c.pass).length;
const report = {candidate:path.basename(candidate),sha256:crypto.createHash('sha256').update(html).digest('hex'),cases,passed:cases.length-failures,total:cases.length};
fs.writeFileSync(path.join(__dirname,'numeric_boundary_checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({candidate:path.basename(candidate),pass:cases.length-failures,fail:failures}));
process.exitCode=failures?1:0;
