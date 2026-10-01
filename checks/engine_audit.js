// Independent pure-engine tests. Read the candidate; write only audit outputs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const candidate = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(candidate, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function load(S)') && s.includes('function compare('));
const dataScript = scripts.find(s => s.includes('window.SPS_DATA ='));
if (!engine || !dataScript) throw new Error('Candidate engine/data scripts not found');
const context = { window: {}, module: { exports: {} } };
vm.createContext(context);
vm.runInContext(dataScript, context);
vm.runInContext(engine, context);
const E = context.module.exports;
const D = context.window.SPS_DATA;
const clone = x => JSON.parse(JSON.stringify(x));
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
const cases = [];
function test(name, fn) {
  try { const detail = fn(); cases.push({ name, pass: true, detail }); }
  catch (e) { cases.push({ name, pass: false, error: e.message }); }
}
function state() {
  return {
    country:'XX', city:'', myYield:Array(12).fill(4), efOverride:0.5,
    site:{open:8,close:18,days:7},
    scanners:[{name:'Test scanner',model:'own',qty:1,scans:10,minPerScan:30,after:'unplugged',activeW:100,idleW:100,offW:''}],
    hasAC:false, ac:[], other:[], xray:{on:false},
    plan:{goal:'gridopt',backup:'none',outageH:0,backupH:2,autonomy:1,keepGenset:false},
    sys:{moduleKWh:1,dodPct:100,etaInv:100,moduleKW:1,etaRT:100,panelWp:500,pf:1,invKVA:1,invShortKVA:2},
    money:{quote:10000,tariff:0.2,dieselPrice:'',fuelRate:''}
  };
}
test('Entirely blank local inputs gate dependent outputs', () => {
  const s=state(); s.site={open:'',close:'',days:''}; s.scanners=[{qty:'',scans:'',minPerScan:'',after:'',activeW:'',idleW:''}]; s.hasAC=null;
  const r=E.run(s,D); assert.equal(r.L.complete,false); assert.equal(r.Z.kWp,undefined); assert.equal(r.B.usable,undefined); assert.equal(r.C.co2Total,undefined); assert.equal(r.C.payback,undefined); return {need:r.L.need};
});
test('Missing scanner scanning watts gate the full load', () => {
  const s=state(); s.scanners[0].activeW=''; const r=E.run(s,D); assert.equal(r.L.complete,false); assert.equal(r.L.annual,undefined); assert.equal(r.Z.kWp,undefined);
});
test('Unknown AC presence gates the load', () => { const s=state();s.hasAC=null;assert.equal(E.run(s,D).L.complete,false); });
test('Plugged-off state requires its own watts', () => {const s=state();s.scanners[0].after='plugged';assert.equal(E.run(s,D).L.complete,false);});
test('One-scanner active and idle hours reconcile independently', () => {
  const s=state();s.scanners[0].idleW=50; const r=E.run(s,D);near(r.L.daily,(100*5+50*5)/1000);near(r.L.annual,0.75*365);return {daily:r.L.daily,annual:r.L.annual};
});
test('Scans per day are shared across two machines', () => {
  const s=state();Object.assign(s.scanners[0],{qty:2,idleW:50});const r=E.run(s,D);near(r.L.daily,2*(100*2.5+50*7.5)/1000);return {daily:r.L.daily};
});
test('Scanner throughput is capped with an explicit warning', () => {
  const s=state();s.scanners[0].scans=100;const r=E.run(s,D);near(r.L.daily,1);assert.ok(r.L.warn.some(x=>x.includes('Only 10 h')));return {warning:r.L.warn};
});
test('Plugged-off energy includes closed days', () => {
  const s=state();s.site.days=6;Object.assign(s.scanners[0],{after:'plugged',offW:10});const r=E.run(s,D);near(r.L.daily,1.14);near(r.L.closedKWh,0.24);near(r.L.annual,1.14*(365*6/7)+0.24*(365/7));return {annual:r.L.annual};
});
test('AC metered energy and nameplate peak stay separate', () => {
  const s=state();s.hasAC=true;s.ac=[{qty:2,kwh:3,ratedW:1000}];const r=E.run(s,D);near(r.L.daily,7);near(r.L.peakW,2100);
});
test('24-hour equipment contributes on closed days', () => {
  const s=state();s.site.days=6;s.other=[{name:'Router',qty:1,W:10,allday:true}];const r=E.run(s,D);near(r.L.daily,1.24);near(r.L.closedKWh,0.24);
});
test('No-backup outages suppress finance and comparative carbon', () => {
  const s=state();s.plan.outageH=2;const r=E.run(s,D);assert.equal(r.C.comparable,false);assert.equal(r.C.co2Total,undefined);assert.equal(r.C.payback,undefined);near(r.C.interruptH,730);return {interruptH:r.C.interruptH,coverH:r.C.coverH};
});
test('Other-backup outages also withhold comparisons', () => {
  const s=state();s.plan.backup='other';s.plan.outageH=2;const r=E.run(s,D);assert.equal(r.C.comparable,false);assert.equal(r.C.saving,undefined);
});
test('Removed genset with insufficient backup suppresses comparisons', () => {
  const s=state();Object.assign(s.plan,{backup:'diesel',outageH:4,backupH:1,keepGenset:false});const r=E.run(s,D);assert.equal(r.C.comparable,false);assert.equal(r.C.projectionUnavailable,true);near(r.C.interruptH,4*365);near(r.C.requestedCoverH,1);assert.equal(r.C.co2Total,undefined);
});
test('Missing financial quote withholds savings/payback', () => {
  const s=state();s.money.quote='';const r=E.run(s,D);assert.equal(r.C.saving,undefined);assert.equal(r.C.payback,undefined);assert.equal(r.C.quoteReference,undefined);assert.equal(r.C.projectionUnavailable,true);
});
test('Missing diesel fuel rate withholds combined carbon and finance', () => {
  const s=state();Object.assign(s.plan,{backup:'diesel',outageH:2});s.money.dieselPrice=100;const r=E.run(s,D);assert.equal(r.C.co2Total,undefined);assert.equal(r.C.dieselCO2,undefined);assert.equal(r.C.gridCO2,undefined);assert.equal(r.C.payback,undefined);assert.equal(r.C.projectionUnavailable,true);
});
test('Lifecycle grid factor is not added to diesel combustion', () => {
  const s=state();s.country='US19';s.city='New York';s.efOverride='';Object.assign(s.plan,{backup:'diesel',outageH:2});Object.assign(s.money,{dieselPrice:100,fuelRate:0.5});const r=E.run(s,D);assert.equal(r.country.ef.lifecycle,true);assert.equal(r.C.gridCO2,undefined);assert.equal(r.C.dieselCO2,undefined);assert.equal(r.C.co2Total,undefined);
});
test('Grid PV arithmetic: 365 kWh/year divided by 4x365 yield', () => {
  const r=E.run(state(),D);near(r.L.annual,365);near(r.Z.kWp,0.25);near(r.Z.solarUsed,365);
});
test('Off-grid arithmetic: worst month and entered battery datasheet', () => {
  const s=state();s.plan.goal='offgrid';s.myYield=Array(12).fill(2.5);Object.assign(s.sys,{moduleKWh:0.5,dodPct:80,etaInv:80,moduleKW:0.1});const r=E.run(s,D);near(r.Z.kWp,0.4);near(r.B.usable,1);near(r.B.nominal,1.5625);assert.equal(r.B.modulesEnergy,4);assert.equal(r.B.modulesPower,2);assert.equal(r.B.modules,4);
});
test('Missing module continuous discharge must block complete module count', () => {
  const s=state();s.sys.moduleKW='';const r=E.run(s,D);assert.equal(r.B.modules,undefined,`Current module count=${r.B.modules} despite missing discharge rating`);
});
test('Zero/infeasible inverter efficiency must not yield module count', () => {
  const s=state();s.sys.etaInv=0;const r=E.run(s,D);assert.equal(r.B.modules,undefined,`Current nominal=${r.B.nominal}, modules=${r.B.modules}`);
});
test('Zero own monthly solar yield must be rejected before PV division', () => {
  const s=state();s.myYield[0]=0;const r=E.run(s,D);assert.equal(r.Z.kWp,undefined,`Current kWp=${r.Z.kWp}, worst=${r.Z.kWpWorst}`);
});
test('Negative equipment input must not be accepted as complete demand', () => {
  const s=state();s.scanners[0].activeW=-100;const r=E.run(s,D);assert.equal(r.L.complete,false,`Current daily=${r.L.daily}`);
});
test('More than seven days per week must be rejected', () => {
  const s=state();s.site.days=8;const r=E.run(s,D);assert.equal(r.L.complete,false,`Current annual=${r.L.annual}`);
});
test('All comparative fields stay absent even with complete user entries', () => {
  const s=state();Object.assign(s.plan,{backup:'diesel',outageH:2});Object.assign(s.money,{dieselPrice:100,fuelRate:0.5});const c=E.run(s,D).C;
  for (const key of ['saving','savings','payback','co2Total','gridCO2','dieselCO2','dieselL0','dieselL1','solarUsed','coveredKWh','coverH']) assert.equal(c[key],undefined,key);
  assert.equal(c.projectionUnavailable,true);assert.equal(c.comparable,false);assert.equal(c.quoteReference,10000);
});
test('Sustained X-ray enters continuous battery DC sizing at PF1 upper bound', () => {
  const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode:'continuous',phase:'single'};Object.assign(s.sys,{etaInv:95,moduleKW:0.15,dodPct:80,invKVA:4});const r=E.run(s,D);
  near(r.B.dcKW,3.1/0.95);assert.equal(r.B.modulesPower,22);assert.equal(r.B.modules,22);assert.equal(r.B.compatibilityVerified,false);assert.ok(r.B.note.includes('upper bound at PF=1'));return {dcKW:r.B.dcKW,modules:r.B.modules,note:r.B.note};
});
test('Momentary X-ray leaves complete module count unavailable', () => {
  const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode:'momentary',phase:'single'};const r=E.run(s,D);
  assert.equal(r.B.modules,undefined);assert.ok(r.B.energyOnlyCount>=1);assert.ok(r.B.moduleNeed.some(x=>x.includes('pulse')));assert.ok(r.B.note.includes('pulse'));assert.equal(r.B.moduleCountComplete,false);
});
test('Missing X-ray input prevents complete module count', () => {
  const s=state();s.xray={on:true,kwh:0.05,inputKVA:'',mode:'continuous',phase:'single'};const r=E.run(s,D);assert.equal(r.B.modules,undefined);assert.ok(r.B.moduleNeed.some(x=>x.includes('known X-ray')));assert.equal(r.P.compatibilityVerified,false);
});
test('Unknown X-ray duration and branch-only data cannot complete module sizing', () => {
  for (const mode of ['unknown','branch']) {const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode,phase:'single'};const r=E.run(s,D);assert.equal(r.B.modules,undefined);assert.equal(r.B.moduleCountComplete,false);}
});
test('Momentary capacity check also tests continuous inverter capacity', () => {
  const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode:'momentary',phase:'single'};s.sys.invKVA=0.05;s.sys.invShortKVA=4;const r=E.run(s,D);assert.equal(r.P.capacityPass,false);assert.ok(r.P.xrayCheck.includes('Not enough'));assert.ok(r.P.xrayCheck.includes('continuous'));
});
test('Numeric X-ray checks never claim phase or BMS compatibility', () => {
  for (const phase of ['single','three','']) {const s=state();s.xray={on:true,kwh:0.05,inputKVA:3,mode:'continuous',phase};s.sys.invKVA=4;const r=E.run(s,D);assert.equal(r.P.compatibilityVerified,false);assert.ok(!r.P.xrayCheck.includes('OK'));assert.ok(r.P.xrayNote.includes('phase'));assert.ok(r.P.xrayNote.includes('BMS'));}
});
test('X-ray toggle off excludes its energy and discharge requirement', () => {
  const s=state();s.xray={on:false,kwh:100,inputKVA:300,mode:'momentary',phase:'three'};const r=E.run(s,D);near(r.L.daily,1);assert.equal(r.B.modules,1);assert.equal(r.L.xray,null);
});
test('Zero scanner quantity does not require unused state readings', () => {
  const s=state();s.scanners=[{qty:0}];const r=E.run(s,D);assert.equal(r.L.complete,true);near(r.L.daily,0);
});
test('Load and battery arithmetic reject overflowing finite inputs', () => {
  const s=state();s.other=[{qty:1,W:1e308,hours:24}];assert.equal(E.run(s,D).L.complete,false);
  const t=state();t.sys.moduleKWh=1e-308;t.plan.backupH=1e308;const r=E.run(t,D);assert.equal(r.B.modules,undefined);
});
// Current-implementation characterization of why comparisons should be cut.
const noBattery=state();Object.assign(noBattery.plan,{backup:'diesel',outageH:2,backupH:2});Object.assign(noBattery.money,{dieselPrice:100,fuelRate:0.5});noBattery.sys={};
const noBatteryR=E.run(noBattery,D);
const throughput=state();throughput.scanners[0].scans=100;
const details={
  noBatteryFeasibilityYetComparison:{battery:noBatteryR.B,comparison:noBatteryR.C},
  insufficientScannerThroughput:E.run(throughput,D).L.warn,
  gridLoss80Percent:(()=>{const s=state();s.sys.etaRT=80;const r=E.run(s,D);return{array:r.Z.kWp,lossUpper:r.Z.kWpUpper,solarUsed:r.Z.solarUsed,co2:r.C.co2Total};})(),
};
const report={candidate:path.relative(process.cwd(),candidate),sha256:crypto.createHash('sha256').update(html).digest('hex'),engineSha256:crypto.createHash('sha256').update(engine).digest('hex'),
  timestamp:new Date().toISOString(),cases,passCount:cases.filter(c=>c.pass).length,failCount:cases.filter(c=>!c.pass).length,
  embeddedData:{cities:D.cities.length,countries:D.countries.length,usaCities:D.cities.filter(c=>c.cc==='US19').length},details};
fs.writeFileSync(path.join(__dirname,'engine_audit.json'),JSON.stringify(report,null,2)+'\n');
for(const t of cases)console.log(`${t.pass?'PASS':'FAIL'} ${t.name}${t.error?' :: '+t.error:''}`);
console.log(JSON.stringify({pass:report.passCount,fail:report.failCount,sha256:report.sha256,embeddedData:report.embeddedData}));
process.exitCode = report.failCount ? 1 : 0;
