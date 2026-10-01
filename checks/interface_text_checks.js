// Focused checks of result wording and evidence placement. Same small DOM adapter as wizard_ui_checks.js:
// these are state and markup checks, not a browser layout test.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const file = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const front = html.slice(0, html.indexOf('<script>'));
const cases = [];
function test(name, f) { try { f(); cases.push({ name, pass: true }); } catch (e) { cases.push({ name, pass: false, error: e.message }); } }
class El {
  constructor(attrs = {}) { Object.assign(this, { id: '', type: '', name: '', value: '', hidden: false, open: false, disabled: false, checked: false, dataset: {}, attrs: {}, _html: '', _text: '' }, attrs); this.classList = { toggle() {} }; }
  set innerHTML(v) { this._html = v; this._text = String(v).replace(/<[^>]*>/g, ''); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] || null; }
  removeAttribute(k) { delete this.attrs[k]; }
  focus() { doc.activeElement = this; }
  scrollIntoView() { this.scrolled = true; }
  closest(s) { if (s === 'label') return this.label || new El(); return this; }
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
}
const nodes = new Map(), inputs = [], pages = [], nav = [];
for (const m of front.matchAll(/<(?:\w+)\b([^>]+)>/g)) {
  const a = { dataset: {}, attrs: {} };
  for (const x of m[1].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
    const [, k, v = ''] = x;
    if (k.startsWith('data-')) a.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    else if (['id', 'type', 'name', 'value'].includes(k)) a[k] = v;
    else if (['hidden', 'open', 'disabled'].includes(k)) a[k] = true;
    else a.attrs[k] = v;
  }
  const el = new El(a); if (el.id) nodes.set(el.id, el);
  if (a.dataset.k || a.name) inputs.push(el);
  if (a.dataset.wizardStep !== undefined) pages.push(el);
  if (a.dataset.stepTarget !== undefined && nav.length < 4) nav.push(el);
}
const headings = ['h-loc', 'h-svc', 'h-plan', 'h-res'];
const doc = {
  activeElement: null, addEventListener() {}, getElementById: id => nodes.get(id) || null,
  querySelector(s) {
    if (s.startsWith('#') && !s.includes(' ') && !s.includes('.')) return nodes.get(s.slice(1)) || null;
    if (s === '.result') return nodes.get('step-results');
    const h = s.match(/^\[data-wizard-step="(\d)"\] h2$/); if (h) return nodes.get(headings[+h[1]]);
    return null;
  },
  querySelectorAll(s) {
    if (s === '[data-wizard-step]') return pages;
    if (s === '.step-list [data-step-target]') return nav;
    if (s === '[data-k]') return inputs.filter(x => x.dataset.k);
    const n = s.match(/^input\[name="(.*)"\]$/); if (n) return inputs.filter(x => x.name === n[1]);
    if (s === '.choice-grid input[type=radio]') return inputs.filter(x => x.type === 'radio');
    return [];
  }
};
const ctx = { window: { addEventListener() {} }, document: doc, navigator: {}, setTimeout: () => 1, clearTimeout() {}, console };
vm.createContext(ctx);
vm.runInContext(scripts[0], ctx); vm.runInContext(scripts[1], ctx);
const boot = '  renderStatic();\n  renderResults();\n  showStep(0, false);';
assert.ok(scripts[2].includes(boot), 'UI boot marker');
const hooks = '  window.UI_CHECK={getState:()=>S,setState:v=>S=v,renderStatic,renderRows,renderResults,showStep};';
vm.runInContext(scripts[2].replace(boot, hooks), ctx);
const H = ctx.window.UI_CHECK, SPS = ctx.window.SPS, D = ctx.window.SPS_DATA;
const clone = x => JSON.parse(JSON.stringify(x)); const initial = clone(H.getState());
const reset = () => { H.setState(clone(initial)); H.renderStatic(); H.renderResults(); H.showStep(0, false); };
const text = id => nodes.get(id).textContent;
const markup = id => nodes.get(id).innerHTML;
// A complete service: one scanner, no cooling, grid kept as backup. Opening 9-17 leaves 16 after-hours hours.
function service(scanner) {
  reset(); const s = H.getState();
  Object.assign(s.site, { open: '9', close: '17', days: '6' });
  s.scanners = [Object.assign({ model: 'own', name: '', qty: '1', scans: '30', minPerScan: '15', after: 'idle', activeW: '200', idleW: '150', offW: '', fp: {activeW:'you',idleW:'you',offW:'you'}, src: '', note: '' }, scanner)];
  if (scanner.model && scanner.model !== 'own') { const model = D.scanners.find(m => m.id === scanner.model); if (model && model.type === 'measured') s.scanners[0].fp = {activeW:'measured',idleW:'measured',offW:'measured'}; }
  s.hasAC = false; Object.assign(s.plan, { backup: 'diesel', outageH: '2', goal: 'gridopt', backupH: '2' });
  H.renderRows(); H.renderResults(); return s;
}
const measured = D.scanners.find(m => m.type === 'measured' && m.offW !== null && m.offW !== undefined);

test('[CF-06] Reduce-first line is shown as a visible alert, not inside the collapsed notes', () => {
  service({ model: measured.id, activeW: measured.activeW, idleW: measured.idleW, offW: measured.offW });
  const expected = (measured.idleW - measured.offW) * 16 / 1000;
  assert.ok(Math.abs(SPS.results().L.saveShutdown - expected) < 1e-12);
  assert.ok(markup('alerts').includes('class="alert tip">Reduce first: '), 'no visible reduce-first alert');
  assert.match(text('alerts'), new RegExp(`about ${expected.toFixed(2).replace('.', '\\.')} kWh less per open day`));
  assert.doesNotMatch(text('info-alerts'), /Reduce first/);
});
test('[CF-02] Reduce-first wording is an energy difference, never a saving claim', () => {
  service({ model: measured.id, activeW: measured.activeW, idleW: measured.idleW, offW: measured.offW });
  assert.ok(text('alerts').includes('energy difference from those readings, not a measured saving'), 'reduce-first line is not framed as an energy difference');
  assert.ok(!(text('alerts') + SPS.summary()).includes('would save'), 'a saving is still claimed');
  assert.ok(html.includes('Apart from the idle-versus-off scanner estimate, savings, payback and avoided CO₂ are not calculated'), 'results banner does not state the exception');
});
test('[CF-06] Exported summary carries the same reduce-first line and keeps the no-savings scope', () => {
  service({ model: measured.id, activeW: measured.activeW, idleW: measured.idleW, offW: measured.offW });
  assert.ok(/Reduce first: .* kWh less per open day\. .* not a measured saving/.test(SPS.summary()), 'summary lacks the reduce-first line');
  assert.ok(SPS.summary().includes('Financial savings, payback and avoided CO2 are not calculated'), 'summary lost the no-savings scope');
});
test('[CF-06] Own scanner left on: estimate waits for the off reading, then uses the entered values', () => {
  const s = service({ offW: '' });
  assert.equal(SPS.results().L.complete, true); assert.equal(SPS.results().L.saveShutdown, null);
  assert.doesNotMatch(text('alerts') + SPS.summary(), /Reduce first/);
  s.scanners[0].offW = '5'; s.scanners[0].qty = '2'; H.renderResults();
  assert.ok(Math.abs(SPS.results().L.saveShutdown - 2 * (150 - 5) * 16 / 1000) < 1e-12);
  assert.ok(text('alerts').includes('switching the scanners off after hours instead of leaving them idle would use about 4.64 kWh less per open day'), 'estimate from entered readings not shown');
});
test('[CF-06] Off reading is optional when left on, required when switched off but plugged in, absent when unplugged', () => {
  service({ after: 'idle' });
  assert.ok(/<span class="u">W, optional<\/span><\/label><input id="scanners-0-offW"[^>]*step="0\.1" value=""><span/.test(markup('scanners')), 'no optional, unhighlighted off reading when left on');
  assert.ok(markup('scanners').includes('Optional: add the off, plugged-in watts'), 'no hint for the optional off reading');
  service({ after: 'plugged' });
  assert.ok(/<span class="u">W<\/span><\/label><input id="scanners-0-offW"[^>]*class="need">/.test(markup('scanners')), 'off reading not required when switched off but plugged in');
  assert.equal(SPS.results().L.complete, false);
  service({ after: 'unplugged' });
  assert.ok(!markup('scanners').includes('scanners-0-offW'), 'off reading offered for an unplugged scanner');
});
test('[CF-06] No estimate when the off reading is not below the idle reading', () => {
  service({ offW: '150' }); assert.doesNotMatch(text('alerts'), /Reduce first/);
  service({ offW: '400' }); assert.doesNotMatch(text('alerts') + SPS.summary(), /Reduce first/);
});
test('[CF-08] Status separates waiting targets from further checks', () => {
  reset(); assert.match(text('result-status'), /^Some targets are waiting for inputs/);
  const s = service({ offW: '5' }); s.plan.backup = ''; s.plan.outageH = ''; H.renderResults();
  const r = SPS.results(); assert.ok(r.L.complete && r.Z.kWp !== undefined && r.B.usable !== undefined);
  assert.ok(text('result-status').startsWith('Energy, solar and battery targets are calculated from the entries above. The items listed below are further checks, not missing targets.'), 'status still reports waiting targets: ' + text('result-status').slice(0, 60));
  assert.ok(text('needs').includes('what powers the service during grid outages today'), 'outage question dropped from the list');
});
test('[CF-08] Each missing input is listed once; engine cross-references are not shown', () => {
  reset();
  const items = [...markup('needs').matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
  assert.ok(items.length > 0); assert.equal(new Set(items).size, items.length);
  assert.equal(items.filter(x => /design goal/.test(x)).length, 1);
  assert.equal(items.filter(x => /complete (load|solar) inputs/.test(x)).length, 0);
});
test('[CF-09] Exported summary prints on-screen wording, not stored option codes', () => {
  service({ offW: '5' });
  const s = SPS.summary();
  assert.ok(s.includes('Outage backup: diesel generator; outages 2 h per open day; goal: keep the grid as backup.'), 'summary prints stored codes for backup or goal');
  assert.ok(s.includes('after hours left on (idle)'), 'summary prints the stored after-hours code');
  assert.ok(!/gridopt|offgrid|goal: \?/.test(s), 'summary still contains an internal code');
});
test('[CF-11] Panel count names the target it belongs to', () => {
  const s = service({ offW: '5' }); s.sys.panelWp = '550'; H.renderResults();
  assert.ok(/About \d+ × 550 Wp panels\./.test(text('cards')), 'panel count missing without storage losses');
  s.sys.etaRT = '90'; H.renderResults();
  assert.ok(/About \d+ × 550 Wp panels for the upper figure\./.test(text('cards')), 'panel count does not name the upper figure');
});
test('[CF-07] Monthly balance and reference table sit on the results step', () => {
  const at = id => front.indexOf(`id="${id}"`);
  for (const id of ['step-results', 'evidence-details', 'balance', 'sources', 'adv']) assert.ok(at(id) > 0, id);
  assert.ok(at('step-results') < at('evidence-details') && at('evidence-details') < at('balance') && at('balance') < at('sources') && at('sources') < at('adv'));
  service({ offW: '5' });
  assert.ok(markup('balance').includes('<svg class="chart"') && markup('sources').includes('<table>'), 'chart or table not rendered');
});
test('[CF-05] Federal Reserve reference links to a dated release', () => {
  assert.match(SPS.fxReference.source, /^https:\/\/www\.federalreserve\.gov\/releases\/h10\/\d{8}\/$/);
  assert.equal(SPS.fxReference.source.match(/(\d{4})(\d{2})(\d{2})/).slice(1).join('-'), SPS.fxReference.released);
});
test('[CF-19] Page keeps a level-one heading on every step', () => {
  assert.equal((front.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(!scripts[2].includes('#wizard-intro").hidden'), 'intro, with the only h1, is removed with the hidden attribute');
  assert.ok(html.includes('.sr-only { position: absolute'), 'no off-screen class for the intro');
});
test('[CF-22] Narrow screens stack the reference table', () => {
  assert.ok(html.includes('#sources table, #sources tbody, #sources tr, #sources td { display: block; }'), 'reference table is not stacked on narrow screens');
});
fs.writeFileSync(path.resolve(__dirname, 'interface_text_checks.json'), JSON.stringify({ candidate: path.basename(file), cases, passed: cases.filter(x => x.pass).length, total: cases.length }, null, 2) + '\n');
console.log(cases.map(x => `${x.pass ? 'PASS' : 'FAIL'} ${x.name}${x.error ? ' — ' + x.error : ''}`).join('\n'));
if (cases.some(x => !x.pass)) process.exitCode = 1;
