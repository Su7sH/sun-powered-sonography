// Evidence export regression checks. Reuses the lightweight wizard DOM adapter; not a browser/layout test.
// Optional arguments: index.html path, JSON results path (for testing an untouched baseline).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const front = html.slice(0, html.indexOf('<script>'));
const cases = [];
function test(name, f) { try { f(); cases.push({name, pass:true}); } catch(e) { cases.push({name, pass:false, error:e.message}); } }
class El {
  constructor(attrs={}) { Object.assign(this, {id:'',type:'',name:'',value:'',hidden:false,open:false,disabled:false,checked:false,dataset:{},attrs:{},_html:'',_text:''}, attrs); this.classList={toggle(){}}; }
  set innerHTML(v) { this._html=v; this._text=String(v).replace(/<[^>]*>/g,''); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text=v; }
  get textContent() { return this._text; }
  setAttribute(k,v) { this.attrs[k]=v; }
  getAttribute(k) { return this.attrs[k] || null; }
  removeAttribute(k) { delete this.attrs[k]; }
  focus() { doc.activeElement=this; }
  scrollIntoView() { this.scrolled=true; }
  closest(s) { if(s==='label') return this.label || new El(); return this; }
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
}
const nodes = new Map(), inputs=[], pages=[], nav=[];
for (const m of front.matchAll(/<(?:\w+)\b([^>]+)>/g)) {
  const a={dataset:{},attrs:{}};
  for(const x of m[1].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
    const [_,k,v='']=x;
    if(k.startsWith('data-')) a.dataset[k.slice(5).replace(/-([a-z])/g, (_,c)=>c.toUpperCase())]=v;
    else if(['id','type','name','value'].includes(k)) a[k]=v;
    else if(['hidden','open','disabled'].includes(k)) a[k]=true;
    else a.attrs[k]=v;
  }
  const el=new El(a); if(el.id) nodes.set(el.id,el);
  if(a.dataset.k || a.name) inputs.push(el);
  if(a.dataset.wizardStep!==undefined) pages.push(el);
  if(a.dataset.stepTarget!==undefined && nav.length<4) nav.push(el);
}
const headings=['h-loc','h-svc','h-plan','h-res'];
const doc = {
  activeElement:null, addEventListener(){}, getElementById:id=>nodes.get(id)||null,
  querySelector(s) {
    if(s.startsWith('#') && !s.includes(' ') && !s.includes('.')) return nodes.get(s.slice(1))||null;
    if(s==='.result') return nodes.get('step-results');
    const h=s.match(/^\[data-wizard-step="(\d)"\] h2$/); if(h) return nodes.get(headings[+h[1]]);
    return null;
  },
  querySelectorAll(s) {
    if(s==='[data-wizard-step]') return pages;
    if(s==='.step-list [data-step-target]') return nav;
    if(s==='[data-k]') return inputs.filter(x=>x.dataset.k);
    const n=s.match(/^input\[name="(.*)"\]$/); if(n) return inputs.filter(x=>x.name===n[1]);
    if(s==='.choice-grid input[type=radio]') return inputs.filter(x=>x.type==='radio');
    return [];
  }
};
const ctx={window:{addEventListener(){}},document:doc,navigator:{},setTimeout:()=>1,clearTimeout(){},console};
vm.createContext(ctx);
scripts.forEach(s=>new vm.Script(s));
vm.runInContext(scripts[0],ctx); vm.runInContext(scripts[1],ctx);
// Keep the production functions unchanged; skip only boot and expose local test hooks.
const boot='  renderStatic();\n  renderResults();\n  showStep(0, false);';
assert.ok(scripts[2].includes(boot),'UI boot marker');
const hooks='  window.UI_CHECK={getState:()=>S,setState:v=>S=v,renderStatic,renderRows,renderResults,onInput,onChange,onClick,currencyCode,cur,fxText,dateValid,stepNeeds,showStep};';
vm.runInContext(scripts[2].replace(boot,hooks),ctx);
const H=ctx.window.UI_CHECK, SPS=ctx.window.SPS, D=ctx.window.SPS_DATA;
const clone=x=>JSON.parse(JSON.stringify(x)); const initial=clone(H.getState());
const reset=()=>{H.setState(clone(initial)); H.renderStatic(); H.renderResults(); H.showStep(0,false);};
const click=id=>H.onClick({target:nodes.get(id),preventDefault(){}});
const input=(id,value)=>{const el=nodes.get(id);el.value=value;H.onInput({target:el});};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

const setScannerModel=(id)=>H.onChange({target:new El({dataset:{list:'scanners',i:'0',f:'model'},value:id})});
const scannerInput=(f,value)=>H.onInput({target:new El({dataset:{list:'scanners',i:'0',f},value:String(value)})});
const sourceLine=(text,prefix)=>text.split('\n').find(line=>line.includes(prefix))||'';
const complete=()=>{
  reset();const s=H.getState();Object.assign(s.site,{open:9,close:17,days:6});s.hasAC=false;
  Object.assign(s.scanners[0],{model:'own',qty:1,scans:10,minPerScan:20,after:'unplugged',activeW:200,idleW:180,fp:{activeW:'you',idleW:'you'}});
  Object.assign(s.plan,{backup:'diesel',outageH:2,goal:'gridopt',backupH:4});
  Object.assign(s.sys,{moduleKWh:5,dodPct:80,moduleKW:2,etaInv:90,etaRT:85,panelWp:450,pf:0.9,invKVA:3,invShortKVA:5});
  H.renderResults();return s;
};
const rated=()=>{
  const s=complete();const m=D.scanners.find(x=>x.type==='rated'&&x.ratedVA);
  assert.ok(m,'rated VA scanner available');setScannerModel(m.id);
  H.onChange({target:new El({dataset:{bound:'0'},checked:true})});return {s,m};
};
test('Rated scanner export identifies each upper-bound state and its actual source',()=>{
  const {m}=rated();const txt=SPS.summary();
  for(const label of ['scanning:','idle:']){const line=sourceLine(txt,label);assert.match(line,/manufacturer rated-input upper bound/);assert.ok(line.includes(m.src));}
  assert.match(txt,/VA, treated as a watts upper bound at PF=1/);
  assert.match(nodes.get('alerts').textContent,/manufacturer rated-input upper bound/);
});
test('A partial scanner override preserves untouched upper-bound evidence',()=>{
  const {s,m}=rated();scannerInput('activeW',180);assert.equal(s.scanners[0].bound,false);
  const txt=SPS.summary();assert.match(sourceLine(txt,'scanning:'),/operator input/);
  assert.ok(!sourceLine(txt,'scanning:').includes(m.src),'override must not cite manufacturer watts');
  assert.match(sourceLine(txt,'idle:'),/upper bound/);assert.ok(sourceLine(txt,'idle:').includes(m.src));
  assert.match(nodes.get('alerts').textContent,/Scanner 1: idle power uses/);
});
test('Zero-quantity scanner never triggers an upper-bound results warning',()=>{
  const {s}=rated();s.scanners[0].qty=0;H.renderResults();assert.doesNotMatch(nodes.get('alerts').textContent,/rated-input upper bound/);
});
test('Overriding every relevant scanner power removes the upper-bound results warning',()=>{
  rated();scannerInput('activeW',180);scannerInput('idleW',150);
  assert.doesNotMatch(nodes.get('alerts').textContent,/rated-input upper bound/);
  assert.doesNotMatch(SPS.summary(),/manufacturer rated-input upper bound/);
});
test('Measured scanner states retain study source and configuration qualification',()=>{
  complete();const m=D.scanners.find(x=>x.type==='measured'&&x.offW!=null);setScannerModel(m.id);
  H.getState().scanners[0].after='plugged';H.renderResults();const txt=SPS.summary();
  for(const label of ['scanning:','idle:','off, plugged in:']){const line=sourceLine(txt,label);assert.match(line,/measured in published study/);assert.ok(line.includes(m.src));}
  assert.match(txt,/local probes, software and operating demand may differ/);
  scannerInput('idleW',145);assert.match(sourceLine(SPS.summary(),'idle:'),/operator input/);
  assert.ok(!sourceLine(SPS.summary(),'idle:').includes(m.src));
});
test('Results source table distinguishes an overridden state from retained study data',()=>{
  complete();const m=D.scanners.find(x=>x.type==='measured');setScannerModel(m.id);scannerInput('idleW',145);
  const rows=nodes.get('sources').innerHTML.match(/<tr>[\s\S]*?<\/tr>/g);
  const active=rows.find(x=>x.includes('Scanner 1: scanning')),idle=rows.find(x=>x.includes('Scanner 1: idle'));
  assert.match(active,/measured in published study/);assert.ok(active.includes(m.src.replace(/&/g,'&amp;')));
  assert.match(idle,/operator input/);assert.doesNotMatch(idle,/<a /);
});
test('Solar export preserves all twelve modelled yields, query and included losses',()=>{
  complete();const y=SPS.results().Y;const txt=SPS.summary();
  assert.ok(txt.includes(y.monthly.join(', ')));assert.ok(txt.includes(y.src));
  assert.match(txt,/including 14% system losses/);assert.match(txt,/365-day year/);
});
test('Own yield export remains operator-supplied and never claims PVGIS evidence',()=>{
  const s=complete();s.country='XX';s.city='';s.myYield=Array.from({length:12},(_,i)=>String(3+i/10));H.renderResults();
  const line=sourceLine(SPS.summary(),'Monthly PV yield');assert.ok(line.includes(s.myYield.join(', ')));
  assert.match(line,/Operator input; source not recorded/);assert.doesNotMatch(line,/PVGIS|14%/);
});
test('Storage and inverter export includes every input needed to reproduce sizing',()=>{
  complete();const txt=SPS.summary();
  for(const text of ['4 h at average open-hours load','Battery module nominal: 5 kWh','Usable depth of discharge: 80 %','Module continuous discharge: 2 kW DC','Inverter efficiency: 90 %','Battery round-trip efficiency: 85 %','Panel rating: 450 Wp','Load power factor: 0.9','Inverter continuous rating: 3 kVA','Inverter short-term rating: 5 kVA'])assert.ok(txt.includes(text),text);
});
test('Manual equality never assigns reference-battery provenance; button does',()=>{
  const s=complete();s.sys.moduleKWh=D.battery.kwh;s.sys.dodPct=D.battery.dodPct;H.renderResults();
  assert.ok(!SPS.summary().includes(D.battery.src));assert.ok(!nodes.get('sources').innerHTML.includes(D.battery.src));
  click('use-loom');const txt=SPS.summary();assert.match(sourceLine(txt,'Battery module nominal:'),/manufacturer reference/);
  assert.ok(sourceLine(txt,'Battery module nominal:').includes(D.battery.src));
  assert.match(sourceLine(txt,'Usable depth of discharge:'),/manufacturer reference/);
});
test('Editing one battery reference field clears only that field provenance',()=>{
  complete();click('use-loom');input('sys.moduleKWh',String(D.battery.kwh));
  const txt=SPS.summary();assert.match(sourceLine(txt,'Battery module nominal:'),/operator input/);
  assert.ok(!sourceLine(txt,'Battery module nominal:').includes(D.battery.src));
  assert.match(sourceLine(txt,'Usable depth of discharge:'),/manufacturer reference/);
});
test('Air-conditioning and peripheral exports distinguish energy from rated evidence',()=>{
  const s=complete();const a=D.ac[0],o=D.ref[0];s.hasAC=true;
  s.ac=[{name:a.name,qty:1,kwh:2,ratedW:a.ratedW,fp:{ratedW:'rated'},src:a.src}];
  s.other=[{name:o.name,qty:1,W:o.W,hours:3,allday:false,fp:'rated',state:o.state,src:o.src}];H.renderResults();
  const txt=SPS.summary();assert.ok(txt.includes(a.src));assert.ok(txt.includes(o.src));assert.ok(txt.includes(o.state));
  assert.match(txt,/Cooling energy is not derived from rated watts/);assert.match(txt,/off on closed days/);
});
test('X-ray export preserves supply source separately from entered daily energy',()=>{
  const s=complete();const x=D.xray.find(x=>x.inputKVA!=null);
  s.xray={on:true,label:x.label,kwh:2,inputKVA:x.inputKVA,phase:x.phase,mode:x.mode,src:x.src,fp:'rated'};H.renderResults();
  const line=sourceLine(SPS.summary(),'X-ray:');assert.ok(line.includes(x.src));assert.match(line,/operator input; meter reading required/);assert.match(line,/Mains kVA does not determine daily kWh/);
});
test('FX export links dated reference evidence only until an operator overrides it',()=>{
  complete();input('money.quote','95810');assert.ok(SPS.summary().includes(SPS.fxReference.source));
  input('fx.inrPerUsd','100');input('fx.date','2026-10-01');
  assert.match(SPS.summary(),/operator override/);assert.ok(!SPS.summary().includes(SPS.fxReference.source));
});
test('Blank inputs remain explicitly unknown without manufactured source labels',()=>{
  reset();const txt=SPS.summary();assert.match(sourceLine(txt,'Battery module nominal:'),/\? kWh \[not entered or invalid\]/);
  assert.match(sourceLine(txt,'scanning:'),/\? W \[not entered or invalid\]/);
  assert.match(txt,/not a system design or guaranteed autonomy/);
});
const result={candidate:path.basename(file),cases,passed:cases.filter(x=>x.pass).length,total:cases.length};
const report=process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname,'provenance_checks.json');
fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
console.log(cases.map(x=>`${x.pass?'PASS':'FAIL'} ${x.name}${x.error?' — '+x.error:''}`).join('\n'));
console.log(`${result.passed}/${result.total} passed; ${report}`);
if(cases.some(x=>!x.pass))process.exitCode=1;
