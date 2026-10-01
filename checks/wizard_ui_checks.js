// Focused UI-state checks. This is a small DOM adapter, not a browser layout test.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert/strict');
const file = path.resolve(__dirname, '../index.html');
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
test('Embedded engine matches reviewed release',()=>assert.equal(crypto.createHash('sha256').update(scripts[1]).digest('hex'),'9dda26d2de85c7dd55522a42ac24d1da3e773e3145583ea940bed4c605a72774'));
test('Embedded data matches reviewed release',()=>assert.equal(crypto.createHash('sha256').update(scripts[0]).digest('hex'),'6e4620ec8524e0f50211d0f605dc56b9f3059ffa4fa4a44ec3f16497af51026a'));
test('Static IDs unique and label targets exist',()=>{const ids=[...front.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);for(const m of front.matchAll(/\bfor="([^"]+)"/g))assert.ok(ids.includes(m[1]),m[1]);});
test('Initial view has Location only and blank private operating inputs',()=>{reset();assert.equal(SPS.step(),0);assert.equal(pages.filter(x=>!x.hidden).length,1);assert.equal(H.getState().money.quote,'');assert.equal(H.getState().site.open,'');assert.equal(nodes.get('wizard-back').disabled,true);});
test('Unknown service and power data never trap Next',()=>{reset();click('wizard-next');assert.equal(SPS.step(),1);click('wizard-next');assert.equal(SPS.step(),2);assert.match(nodes.get('wizard-status').textContent,/missing or invalid/);click('wizard-next');assert.equal(SPS.step(),3);assert.equal(nodes.get('wizard-next').hidden,true);assert.equal(SPS.results().L.complete,false);assert.equal(SPS.results().C.projectionUnavailable,true);});
test('Back restores previous page and progress remains active',()=>{reset();H.showStep(3);click('wizard-back');assert.equal(SPS.step(),2);assert.equal(pages.filter(x=>!x.hidden).length,2);assert.equal(nav[2].attrs['aria-current'],'step');assert.ok(nodes.get('wizard-navigation').scrolled);});
test('Scanner powers hidden initially and measured readings still overrideable',()=>{reset();assert.match(nodes.get('scanners').innerHTML,/<details class="power-readings">/);const s=H.getState();Object.assign(s.scanners[0],{model:D.scanners.find(m=>m.type==='measured').id,activeW:200,idleW:180});H.renderRows();assert.match(nodes.get('scanners').innerHTML,/<details class="power-readings">/);assert.match(nodes.get('scanners').innerHTML,/200 W scanning/);assert.match(nodes.get('scanners').innerHTML,/data-f="activeW"/);});
test('Unknown chosen powers and plugged-off readings open automatically',()=>{reset();H.getState().scanners[0].model='own';H.renderRows();assert.match(nodes.get('scanners').innerHTML,/<details class="power-readings" open>/);Object.assign(H.getState().scanners[0],{activeW:200,idleW:180,after:'plugged',offW:''});H.renderRows();assert.match(nodes.get('scanners').innerHTML,/<details class="power-readings" open>/);});
test('India quote uses INR primary and dated USD presentation reference',()=>{reset();input('money.quote','95810');near(SPS.usdReference().value,1000);assert.match(nodes.get('cards').innerHTML,/₹95,810/);assert.match(nodes.get('cards').innerHTML,/US\$1,000/);assert.match(SPS.summary(),/95,810 INR/);assert.match(SPS.summary(),/25 Sept? 2026/);assert.match(SPS.summary(),/not a current or transaction rate/);});
test('Zero quote remains a valid zero reference',()=>{reset();input('money.quote','0');assert.equal(SPS.usdReference().value,0);assert.match(SPS.summary(),/Installed quote: ₹0 INR/);});
test('Operator FX edit clears Federal Reserve attribution and date',()=>{reset();input('money.quote','100000');input('fx.inrPerUsd','100');assert.equal(H.getState().fx.origin,'operator');assert.equal(H.getState().fx.date,'');assert.equal(SPS.usdReference(),null);input('fx.date','2026-10-01');near(SPS.usdReference().value,1000);assert.match(H.fxText(),/operator override/);assert.doesNotMatch(H.fxText(),/Federal Reserve/);click('reset-fx');assert.equal(H.getState().fx.origin,'reference');assert.equal(H.getState().fx.date,'2026-09-25');});
test('Invalid FX and quote inputs suppress USD reference',()=>{reset();const s=H.getState();for(const q of ['','-1','NaN','Infinity']){s.money.quote=q;assert.equal(SPS.usdReference(),null);}s.money.quote=100;for(const rate of ['','0','-1','NaN','Infinity']){s.fx.inrPerUsd=rate;assert.equal(SPS.usdReference(),null);}s.fx.inrPerUsd=100;for(const date of ['','2026-02-30','2026-2-01','not-a-date']){s.fx.date=date;assert.equal(SPS.usdReference(),null);}s.fx.date='2026-09-25';s.money.quote=1e308;s.fx.inrPerUsd=1e-308;assert.equal(SPS.usdReference(),null);});
test('Country change clears local quote and USA uses USD primary only',()=>{reset();input('money.quote','95810');const el=nodes.get('country');el.value=D.countries.find(c=>c.name==='USA').code;H.onChange({target:el});assert.equal(H.getState().money.quote,'');assert.equal(H.currencyCode(),'USD');input('money.quote','12345');assert.equal(SPS.usdReference(),null);assert.match(nodes.get('cards').innerHTML,/US\$12,345/);assert.match(SPS.summary(),/12,345 USD/);assert.equal(nodes.get('fx-block').hidden,true);});
test('Summary retains no-savings scope and compatibility limits',()=>{reset();assert.match(SPS.summary(),/Financial savings, payback and avoided CO2 are not calculated/);assert.match(SPS.summary(),/not a system design or guaranteed autonomy/);assert.match(SPS.summary(),/No pilot savings or patient benefits have been measured/);});
test('Print and mobile navigation have explicit CSS support',()=>{assert.match(html,/\.wizard-page\.result\[hidden\] \{ display: block !important/);assert.match(html,/\.wizard-footer \{ position: fixed; bottom: 0/);assert.match(html,/beforeprint/);assert.match(html,/Summary to copy/);});
fs.writeFileSync(path.resolve(__dirname,'wizard_ui_checks.json'),JSON.stringify({candidate:path.relative(process.cwd(),file),cases,passed:cases.filter(x=>x.pass).length,total:cases.length},null,2));
console.log(cases.map(x=>`${x.pass?'PASS':'FAIL'} ${x.name}${x.error?' — '+x.error:''}`).join('\n'));
if(cases.some(x=>!x.pass))process.exitCode=1;
