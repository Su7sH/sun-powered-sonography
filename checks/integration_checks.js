// Additional merged-release safety checks. Reuse the reviewed DOM adapter only.
const fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname,'interface_text_checks.js'),'utf8');
const boundary = source.indexOf("test('[CF-06]");
if(boundary<0)throw new Error('Reviewed DOM adapter marker missing');
let adapter = source.slice(0,boundary);
adapter = adapter.replace('renderResults,showStep};', 'renderResults,showStep,reduceFirstEstimate,reduceFirstText};');
const extra = `
test('Rated idle upper bound never produces an avoided-energy estimate',()=>{
  service({offW:'5',fp:{activeW:'bound',idleW:'bound',offW:'you'}});
  assert.equal(H.reduceFirstEstimate(SPS.results().L),null);
  assert.doesNotMatch(text('alerts')+SPS.summary(),/Reduce first:/);
  assert.match(text('alerts'),/rated-input upper bound/);
});
test('Missing origin flags cannot be guessed as measured readings',()=>{
  service({offW:'5',fp:{}});assert.equal(H.reduceFirstEstimate(SPS.results().L),null);
});
test('Operator idle reading can compare with measured off reading after partial override',()=>{
  const s=service({model:measured.id,activeW:measured.activeW,idleW:measured.idleW,offW:measured.offW});
  s.scanners[0].idleW='150';s.scanners[0].fp.idleW='you';H.renderResults();
  assert.equal(s.scanners[0].fp.idleW,'you');assert.equal(s.scanners[0].fp.offW,'measured');
  assert.ok(H.reduceFirstEstimate(SPS.results().L).kwh>0);assert.match(text('alerts'),/not a measured saving/);
});
test('Active nameplate bound does not contaminate a separate genuine idle-off comparison',()=>{
  service({offW:'5',fp:{activeW:'bound',idleW:'you',offW:'you'}});
  assert.ok(Math.abs(H.reduceFirstEstimate(SPS.results().L).kwh-2.32)<1e-12);
  assert.match(text('alerts'),/rated-input upper bound/);
});
test('A missing reading in another idle scanner prevents a silent partial total',()=>{
  const s=service({offW:'5'});s.scanners.push({...s.scanners[0],offW:'',fp:{activeW:'you',idleW:'you'}});H.renderResults();
  assert.equal(H.reduceFirstEstimate(SPS.results().L),null);assert.doesNotMatch(text('alerts')+SPS.summary(),/Reduce first:/);
});
test('Zero-quantity rows neither contribute nor block the energy difference',()=>{
  const s=service({offW:'5'});s.scanners.push({qty:0,after:'idle',fp:{}});H.renderResults();
  assert.ok(Math.abs(H.reduceFirstEstimate(SPS.results().L).kwh-2.32)<1e-12);
});
test('Nonfinite or negative optional readings suppress the estimate',()=>{
  for(const offW of ['Infinity','NaN','-1']){service({offW});assert.equal(H.reduceFirstEstimate(SPS.results().L),null);}
  service({offW:'5'});H.getState().scanners[0].qty=Number.MAX_SAFE_INTEGER+1;
  assert.equal(H.reduceFirstEstimate({complete:true,afterH:16}),null);
});
test('Finite inputs whose idle-off product overflows never export infinity',()=>{
  const s=service({qty:'1000000000000',activeW:0,idleW:0,offW:1e308,fp:{activeW:'you',idleW:'you',offW:'you'}});
  assert.equal(SPS.results().L.complete,true);assert.equal(SPS.results().L.saveShutdown,null);
  assert.equal(H.reduceFirstEstimate(SPS.results().L),null);assert.doesNotMatch(text('alerts'),/Infinity|NaN/);
});
test('Reduce-first comparison never silently resizes the existing PV target',()=>{
  const s=service({offW:'5'});const original=SPS.results().Z.kWp;H.renderResults();assert.equal(SPS.results().Z.kWp,original);
  assert.match(text('alerts'),/does not change the current load or solar target/);assert.match(SPS.summary(),/To size the reduced load, change After hours to switched off/);
  s.scanners[0].after='plugged';H.renderResults();assert.ok(SPS.results().Z.kWp<original);assert.doesNotMatch(text('alerts'),/Reduce first:/);
});
test('Embedded data equals companion references file, with full source notes',()=>{
  const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/references.json'),'utf8'));
  assert.equal(JSON.stringify(D),JSON.stringify(reference));
  assert.equal(D.ref.find(r=>r.name.includes('PRIMA T2')).src,'https://www.fujifilm.com/br/en/parts/common/659');
  assert.equal(new Set(D.cities.map(c=>c.cc)).size,21);assert.equal(D.countries.length,22);
  assert.ok(D.scanners.some(m=>m.note.length>400));
});
test('Confirmed hospital name appears without inventing measured pilot outcomes',()=>{
  assert.ok(front.includes('Om Chaitanya Multi-Specialty Hospital (OCH), Alephata, India'));
  assert.ok(front.includes('Its loads and operating hours are not measured yet'));
});
fs.writeFileSync(path.join(__dirname,'integration_checks.json'),JSON.stringify({candidate:'index.html',cases,passed:cases.filter(c=>c.pass).length,total:cases.length},null,2)+'\\n');
console.log(cases.map(c=>(c.pass?'PASS ':'FAIL ')+c.name+(c.error?' — '+c.error:'')).join('\\n'));
if(cases.some(c=>!c.pass))process.exitCode=1;
`;
new Function('require','__dirname',adapter+extra)(require,__dirname);
