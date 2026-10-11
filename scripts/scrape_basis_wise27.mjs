#!/usr/bin/env node
// Scraper for Uni Bonn BASIS course catalog (JSF/PrimeFaces), driven via Chrome DevTools Protocol.
// Modes:
//   recon   - open catalog, confirm semester, list level-1 rows
//   recon2  - drill: expand by text, list children (instrumented expand)
//   recon3  - examine one course leaf row + open its detail view
//   scrape  - full extraction -> data/winter2027_basis_raw.json
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const SHOT_DIR = '/tmp/basis-steps';
const OUT_FILE = join(ROOT, 'data', 'winter2027_basis_raw.json');
const START_URL = 'https://basis.uni-bonn.de/qisserver/rds?state=user&type=0';
const CATALOG_URL = 'https://basis.uni-bonn.de/qisserver/pages/cm/exa/coursecatalog/showCourseCatalog.xhtml?_flowId=showCourseCatalog-flow&navigationPosition=studiesOffered%2CcourseoverviewShow&recordRequest=true';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOT_DIR, { recursive: true });

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  static async connect() {
    let targets = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://localhost:${PORT}/json`);
        targets = await res.json();
        if (targets.find((t) => t.type === 'page')) break;
      } catch {}
      await sleep(300);
    }
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { res, rej } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        for (const [m, fns] of cdp.listeners) if (m === msg.method) fns.forEach((f) => f(msg.params));
      }
    };
    return cdp;
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  waitEvent(method, timeoutMs = 30000) {
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('timeout waiting ' + method)), timeoutMs);
      const fns = this.listeners.get(method) ?? [];
      fns.push((p) => { clearTimeout(to); res(p); });
      this.listeners.set(method, fns);
    });
  }
  async evaluate(expr, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page eval error: ' + JSON.stringify(r.exceptionDetails).slice(0, 2000));
    return r.result?.value;
  }
  async navigate(url) {
    const loaded = this.waitEvent('Page.loadEventFired', 60000).catch(() => null);
    await this.send('Page.navigate', { url });
    await loaded;
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = join(SHOT_DIR, name + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('  [shot]', file);
  }
}

// ---------- page-side helpers ----------
// Tree structure: table rows `tr.treeTableCellLevel*` inside the catalog container.
// A row's own cells (name, toggle, actions) are those whose closest('tr') === the row itself.
const PAGE_HELPERS = `
(() => {
if (!window.__his) {
  const cont = () => document.querySelector('div[id$="courseCatalog"]');
  const ownEls = (row, sel) => [...row.querySelectorAll(sel)].filter(e => e.closest('tr') === row);
  const ownEl  = (row, sel) => ownEls(row, sel)[0] ?? null;
  const parentRowOf = (el) => el.parentElement ? el.parentElement.closest('tr') : null;
  const levelOf = (row) => { let l = 0, e = row; while (e && (e = parentRowOf(e))) l++; return l; };
  const rowClassOf = (row) => [...row.classList].find(c => /Expanded|Collapsed|leaf/i.test(c)) || '';
  const tglTdOf = (row) => ownEl(row, 'td.rootExpanded, td.rootCollapsed, td.nodeExpanded, td.nodeCollapsed') || null;
  const isExpanded = (row) => { const td = tglTdOf(row); return !!td && /expanded/i.test(td.className); };
  const isLeaf = (row) => !ownEl(row, 'button[class*="treeTableIcon"]');
  const childrenDivIdOf = (row) => row.id.replace(/row$/, 'children');
  const childRows = (row) => [...cont().querySelectorAll('tr[class*="treeTableCellLevel"]')]
      .filter(r => r !== row && parentRowOf(r) === row);
  const allRows = () => [...cont().querySelectorAll('tr[class*="treeTableCellLevel"]')];
  const rowInfo = (r) => {
    const nameEl = ownEl(r, '.treeElementName');
    const tgl = ownEl(r, 'button[class*="treeTableIcon"]');
    const actionLinks = ownEls(r, 'td.smallestPossible a[href], td.smallestPossible button, td:last-child a, td:last-child button')
        .map(e => ({ tag: e.tagName, id: e.id, title: e.title, cls: e.className, text: (e.textContent || '').trim().slice(0, 60), href: e.getAttribute('href')?.slice(0, 200) }));
    const permalink = ownEl(r, 'input#autologinRequestUrl')?.value ?? ownEl(r, 'input[value*="startFlow"]')?.value ?? null;
    return { id: r.id, level: levelOf(r), text: (nameEl?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200),
             nameElId: nameEl?.id ?? null, toggleId: tgl?.id ?? null, expanded: isExpanded(r), leaf: isLeaf(r),
             permalink, actionLinks };
  };
  window.__his = { cont, ownEl, ownEls, parentRowOf, levelOf, isExpanded, isLeaf, childrenDivIdOf, childRows, allRows, rowInfo };
}
return true;
})()`;

async function injectHelpers(cdp) {
  const ok = await cdp.evaluate(PAGE_HELPERS);
  if (!ok) throw new Error('helper injection failed');
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'basis-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1600,1200', '--no-first-run', '--disable-dev-shm-usage', 'about:blank',
  ], { stdio: 'ignore' });
  return { proc, profile };
}
function killChromeByPort() {
  try { execSync('pkill -f "remote-debugging-port=9333" 2>/dev/null || true'); } catch {}
}

async function openCatalog(cdp) {
  console.log('[*] opening start page:', START_URL);
  await cdp.navigate(START_URL);
  await sleep(2000);
  console.log('    url now:', await cdp.evaluate('location.href', false));
  await cdp.shot('01-start');
  console.log('[*] opening catalog:', CATALOG_URL);
  await cdp.navigate(CATALOG_URL);
  await sleep(1500);
  console.log('    url now:', await cdp.evaluate('location.href', false));
  const treeReady = await cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      const c = document.querySelector('div[id$="courseCatalog"]');
      if (c && c.querySelector('tr[class*="treeTableCellLevel"]')) return true;
      await sleep(500);
    }
    return false;
  })()`);
  if (!treeReady) throw new Error('catalog tree never populated');
  await injectHelpers(cdp);
  await cdp.shot('02-catalog-initial');
}

// Expand the row at `level` whose name contains `text`; poll for children to render.
async function expandByText(cdp, text, level, label) {
  const r = await cdp.evaluate(`
    (async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const needle = ${JSON.stringify(text)}.toLowerCase();
      const rows = __his.allRows().filter(r => __his.levelOf(r) === ${level});
      const row = rows.find(r => __his.rowInfo(r).text.toLowerCase().includes(needle));
      if (!row) return { found: false, have: rows.map(r => __his.rowInfo(r).text) };
      const info0 = __his.rowInfo(row);
      if (__his.isExpanded(row)) return { found: true, id: row.id, text: info0.text, alreadyExpanded: true, childCount: __his.childRows(row).length };
      if (!info0.toggleId) return { found: true, id: row.id, text: info0.text, error: 'no toggle', leaf: info0.leaf };
      const childrenDivId = __his.childrenDivIdOf(row);
      // instrument ajax to observe failures
      window.__ajaxLog = window.__ajaxLog || [];
      if (!window.__ajaxInstrumented && window.jsf && jsf.ajax) {
        const origReq = jsf.ajax.request;
        jsf.ajax.request = function(...a) { window.__ajaxLog.push({ t: Date.now(), type: 'request', src: a[0]?.id }); return origReq.apply(this, a); };
        window.__ajaxInstrumented = true;
      }
      document.getElementById(info0.toggleId).click();
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        const re = document.getElementById(row.id);
        const div = document.getElementById(childrenDivId);
        if (re && div && div.querySelector('tr')) {
          return { found: true, id: row.id, text: __his.rowInfo(re).text, childCount: __his.childRows(re).length, ajax: window.__ajaxLog.slice(-3) };
        }
      }
      return { found: true, id: row.id, text: info0.text, error: 'expand timeout', ajax: window.__ajaxLog.slice(-3),
               divExists: !!document.getElementById(childrenDivId), divLen: document.getElementById(childrenDivId)?.innerHTML?.length ?? -1 };
    })()`);
  console.log(`[expand ${label}]`, JSON.stringify(r).slice(0, 600));
  return r;
}

async function listChildren(cdp, rowId, label) {
  const kids = await cdp.evaluate(`(() => {
    const row = document.getElementById(${JSON.stringify(rowId)});
    if (!row) return null;
    return __his.childRows(row).map(k => { const i = __his.rowInfo(k); return { id: i.id.split(':').slice(-2).join(':'), text: i.text, leaf: i.leaf, toggle: !!i.toggleId, permalink: i.permalink ? 'yes' : null }; });
  })()`);
  console.log(`[children of ${label}] count=${kids?.length}`);
  if (kids) for (const k of kids) console.log('   ', JSON.stringify(k).slice(0, 220));
  return kids;
}

// ---------- main ----------
const MODE = process.argv[2] ?? 'recon';
killChromeByPort();
await sleep(500);
const chrome = await launchChrome();
const cleanup = (code) => { try { chrome.proc.kill('SIGTERM'); } catch {} killChromeByPort(); process.exit(code); };
process.on('SIGINT', () => cleanup(130));
process.on('exit', () => { try { chrome.proc.kill('SIGTERM'); } catch {} });

const cdp = await CDP.connect();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });

await openCatalog(cdp);
const heading = await cdp.evaluate(`document.querySelector('div[id$="courseCatalogFieldset"] .box_title h2, .box_title h2')?.textContent?.trim()`);
const semesterSelect = await cdp.evaluate(`[...document.querySelectorAll('select')].map(s => ({ id: s.id, val: s.options[s.selectedIndex]?.textContent.trim() })).filter(s => /term|semester/i.test(s.id))`);
console.log('[semester] heading:', heading, '| term select:', JSON.stringify(semesterSelect));

if (MODE === 'recon') {
  const root = await cdp.evaluate(`(() => __his.allRows().filter(r => __his.levelOf(r) === 1).map(r => { const i = __his.rowInfo(r); return { id: i.id.split(':').slice(-2).join(':'), text: i.text.slice(0, 90), toggle: !!i.toggleId }; }))()`);
  console.dir(root, { depth: 2 });
  cleanup(0);
}

if (MODE === 'recon2') {
  const a = await expandByText(cdp, 'Informatik', 1, 'L1 Informatik');
  await sleep(400);
  await cdp.shot('05-expanded-L1-informatik');
  if (a.found && !a.error) {
    const kids = await listChildren(cdp, a.id, 'Informatik L1');
    console.dir(kids, { depth: 3 });
  }
  cleanup(0);
}

if (MODE === 'recon4') {
  // Capture the ajax response body for a tree toggle click.
  await cdp.send('Network.enable');
  const netLog = [];
  const pendingBodies = new Map();
  const onResp = (p) => {
    if (p.type !== 'XHR') return;
    netLog.push({ requestId: p.requestId, url: p.response.url.slice(0, 100), status: p.response.status, type: p.type, body: null });
  };
  const onReq = (p) => {
    if (p.type !== 'XHR') return;
    netLog.push({ requestId: p.requestId, request: p.request.method + ' ' + p.request.url.slice(0, 100), post: p.request.postData?.slice(0, 400) });
  };
  const onFinished = async (p) => {
    for (let i = 0; i < 20; i++) {
      try {
        const b = await cdp.send('Network.getResponseBody', { requestId: p.requestId });
        const entry = netLog.find((n) => n.requestId === p.requestId && n.body === null);
        if (entry) entry.body = b.body;
        return;
      } catch { await sleep(300); }
    }
  };
  cdp.listeners.set('Network.requestWillBeSent', [onReq]);
  cdp.listeners.set('Network.responseReceived', [onResp]);
  cdp.listeners.set('Network.loadingFinished', [onFinished]);
  await cdp.evaluate(`
    (async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const row = __his.allRows().find(r => __his.levelOf(r) === 1 && __his.rowInfo(r).text.toLowerCase().includes('informatik'));
      const tgl = document.getElementById(__his.rowInfo(row).toggleId);
      tgl.click();
      await sleep(6000);
      const div = document.getElementById(__his.childrenDivIdOf(row));
      return { divLen: div?.innerHTML?.length ?? -1,
               msgBox: document.querySelector('[id*="messages-infobox"]')?.textContent?.trim()?.slice(0, 500) ?? null };
    })()`).then((r) => console.log('[click result]', JSON.stringify(r, null, 2)));
  await sleep(2000);
  console.log('[network]');
  for (const n of netLog) console.log(JSON.stringify(n, null, 2).slice(0, 4000), '\n---');
  await cdp.shot('06-recon4-after-click');
  cleanup(0);
}

if (MODE === 'recon5') {
  // Real trusted mouse click on the Informatik toggle via CDP Input.dispatchMouseEvent.
  await cdp.send('Network.enable');
  let postCount = 0;
  cdp.listeners.set('Network.requestWillBeSent', [(p) => { if (p.type === 'XHR' && p.request.method === 'POST') { postCount++; console.log('[net] POST #' + postCount, (p.request.postData || '').replace(/&/g, ' ').slice(0, 300)); } }]);
  const target = await cdp.evaluate(`(() => {
    const row = __his.allRows().find(r => __his.levelOf(r) === 1 && __his.rowInfo(r).text.toLowerCase().includes('informatik'));
    const tgl = row && document.getElementById(__his.rowInfo(row).toggleId);
    if (!tgl) return null;
    tgl.scrollIntoView({ block: 'center' });
    const r = tgl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rowId: row.id };
  })()`);
  console.log('[recon5] click at', JSON.stringify(target));
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: target.x, y: target.y, button: 'left', clickCount: 1 });
    await sleep(80);
  }
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const st = await cdp.evaluate(`(() => {
      const row = document.getElementById(${JSON.stringify(target.rowId)});
      if (!row) return { gone: true };
      const div = document.getElementById(__his.childrenDivIdOf(row));
      return { kids: div ? div.querySelectorAll('tr').length : -1, expanded: __his.isExpanded(row) };
    })()`);
    if (st.kids > 0) { console.log('[recon5] SUCCESS children rows:', st.kids); break; }
    if (i % 4 === 3) console.log('[recon5] waiting…', JSON.stringify(st), 'postsSoFar:', postCount);
  }
  const kids = await listChildren(cdp, target.rowId, 'Informatik L1 (real click)');
  console.dir(kids?.slice(0, 40), { depth: 3 });
  await cdp.shot('07-recon5-real-click');
  cleanup(0);
}

if (MODE === 'recon6') {
  // Dump de.his.ajax.Refresher + any tree-related scripts to understand the expansion flow.
  const src = await cdp.evaluate(`(() => {
    const out = {};
    try { out.Refresher = Object.getOwnPropertyNames(de.his.ajax.Refresher).map(k => '=== ' + k + ' ===\\n' + String(de.his.ajax.Refresher[k]).slice(0, 2500)).join('\\n'); } catch (e) { out.RefresherErr = String(e); }
    out.hisAjaxKeys = Object.keys(de.his.ajax || {});
    out.hisKeys = Object.keys(de.his || {});
    return out;
  })()`);
  console.log(src.RefresherErr ?? src.Refresher);
  console.log('de.his.ajax keys:', JSON.stringify(src.hisAjaxKeys));
  console.log('de.his keys:', JSON.stringify(src.hisKeys));
  cleanup(0);
}

if (MODE === 'drill') {
  // Navigate to an arbitrary catalog permalink (arg 3) and dump the rendered rows.
  const url = process.argv[3];
  if (!url) { console.log('usage: drill <permalink>'); cleanup(1); }
  await cdp.navigate(url);
  await sleep(1500);
  console.log('    url now:', await cdp.evaluate('location.href', false));
  await cdp.evaluate(`(async () => { const s = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 30; i++) { if (document.querySelector('div[id$="courseCatalog"] tr[class*="treeTableCellLevel"]')) return true; await s(500); } return false; })()`);
  await injectHelpers(cdp);
  await cdp.shot('09-drill');
  const rows = await cdp.evaluate(`(() => __his.allRows().map(r => {
    const i = __his.rowInfo(r);
    return { id: i.id.split('courseCatalog:').pop(), text: i.text.slice(0, 130), leaf: i.leaf, exp: i.expanded,
             acts: i.actionLinks, path: (i.permalink.match(/path=([^&]*)/)?.[1] ?? null) && decodeURIComponent(i.permalink.match(/path=([^&]*)/)[1]) };
  }))()`);
  console.log('[drill] rows rendered:', rows?.length);
  console.dir(rows, { depth: 4 });
  cleanup(0);
}

if (MODE === 'leaf') {
  // Open a course detail view (detailView-flow) and dump its content structure.
  const unitId = process.argv[3] ?? '23364';
  const url = `https://basis.uni-bonn.de/qisserver/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=${unitId}&periodId=142&navigationPosition=courseoverviewShow`;
  await cdp.navigate(url);
  await sleep(2500);
  console.log('    url now:', await cdp.evaluate('location.href', false));
  await sleep(2500);
  await cdp.shot('10-leaf-detail');
  const dump = await cdp.evaluate(`(() => {
    const txt = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim();
    const main = document.querySelector('main') ?? document.body;
    return {
      title: document.title,
      h1: [...document.querySelectorAll('h1,h2,h3')].map(txt).slice(0, 12),
      tables: [...document.querySelectorAll('table')].map(t => ({ cls: t.className.slice(0, 60), rows: t.rows.length, head: txt(t.rows[0]).slice(0, 200) })),
      mainText: txt(main).slice(0, 4000),
    };
  })()`);
  console.dir(dump, { depth: 4 });
  cleanup(0);
}

if (MODE === 'leafhtml') {
  // Dump selector-oriented structure of a detail view for building the extractor.
  const unitId = process.argv[3] ?? '40134';
  const url = `https://basis.uni-bonn.de/qisserver/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=${unitId}&periodId=142&navigationPosition=courseoverviewShow`;
  await cdp.navigate(url);
  await sleep(1500);
  const ready = await cdp.evaluate(`(async () => {
    const s = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      const t = [...document.querySelectorAll('table')].find(t => (t.textContent || '').includes('Rhythmus'));
      const hasBasic = (document.body.textContent || '').includes('Veranstaltungsart') || (document.body.textContent || '').includes('Modulbeschreibung');
      if (t || (i > 12 && hasBasic)) return { ok: true, hasTable: !!t, i };
      await s(500);
    }
    return { ok: false };
  })()`);
  console.log('[leaf] page ready:', JSON.stringify(ready));
  const dump = await cdp.evaluate(`(() => {
    const txt = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')].map(t => ({
      cls: t.className, id: t.id,
      headers: [...(t.tHead?.rows[0]?.cells ?? t.rows[0]?.cells ?? [])].map(c => txt(c).replace(/\\[Sortierbare Spalte\\]/g, '').trim()),
      bodyRows: [...(t.tBodies?.[0]?.rows ?? t.rows)].slice(0, 5).map(r => [...r.cells].map(c => txt(c).slice(0, 90))),
    })).filter(t => t.headers.length || t.bodyRows.length);
    const fsContainers = [...document.querySelectorAll('fieldset')].map(f => ({ legend: txt(f.querySelector('legend')).slice(0, 60), htmlLen: f.innerHTML.length }));
    const grund = [...document.querySelectorAll('fieldset')].find(f => txt(f.querySelector('legend')) === 'Grunddaten');
    return { tables, fsContainers: fsContainers.slice(0, 30), grundHtml: grund ? grund.innerHTML.slice(0, 5000) : null };
  })()`);
  console.dir(dump, { depth: 6 });
  await cdp.shot('11-leaf-html-' + unitId);
  cleanup(0);
}

if (MODE === 'cellhtml') {
  const unitId = process.argv[3] ?? '40134';
  const url = `https://basis.uni-bonn.de/qisserver/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=${unitId}&periodId=142&navigationPosition=courseoverviewShow`;
  await cdp.navigate(url);
  await cdp.evaluate(`(async () => {
    const s = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('table[id$="appointmentSeriesTableTable"]')) return true; await s(500); }
    return false;
  })()`);
  await sleep(800);
  const dump = await cdp.evaluate(`(() => {
    const t = document.querySelector('table[id$="appointmentSeriesTableTable"]');
    if (!t) return { err: 'no table' };
    const body = t.tBodies[0];
    const row0 = body.rows[0];
    return { rowCount: body.rows.length,
             headHtml: (t.tHead?.rows[0]?.outerHTML ?? '').slice(0, 1200),
             cellHtmls: [...row0.cells].slice(0, 4).map(c => c.outerHTML.slice(0, 700)) };
  })()`);
  console.dir(dump, { depth: 6 });
  cleanup(0);
}

if (MODE === 'recon7') {

  // Deep-link into the catalog via the row's permalink and see what renders.
  const link = await cdp.evaluate(`(() => {
    const row = __his.allRows().find(r => __his.levelOf(r) === 1 && __his.rowInfo(r).text.toLowerCase().includes('informatik'));
    return row ? __his.rowInfo(row).permalink : null;
  })()`);
  console.log('[recon7] Informatik permalink:', link);
  if (link) {
    await cdp.navigate(link);
    await sleep(3000);
    console.log('    url now:', await cdp.evaluate('location.href', false));
    await cdp.evaluate(`(async () => { const s = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 30; i++) { if (document.querySelector('div[id$="courseCatalog"] tr[class*="treeTableCellLevel"]')) return true; await s(500); } return false; })()`);
    await injectHelpers(cdp);
    await cdp.shot('08-recon7-permalink');
    const rows = await cdp.evaluate(`(() => __his.allRows().map(r => { const i = __his.rowInfo(r); return { id: i.id.split('courseCatalog:').pop(), lvl: i.level, text: i.text.slice(0, 130), leaf: i.leaf, exp: i.expanded, permalink: i.permalink }; }))()`);
    console.log('[recon7] rows rendered:', rows?.length);
    console.dir(rows, { depth: 3 });
  }
  cleanup(0);
}



// ======================================================================
// SCRAPE MODE
// Strategy (discovered via recon): the tree's ajax expansion replies with an
// empty <div ...:children> in headless mode, but every node carries a
// deep-link permalink that renders that node expanded server-side. So the
// walk is done via stateless GET navigations:
//   VVZ root -> Informatik -> master branches -> area groups -> module nodes
// Each module node expands to Veranstaltung rows carrying a plain
// "detailView-flow&unitId=..." link; those unit detail pages supply
// Grunddaten (type, responsible) and the Termine tables (rhythm/day/time/room).
// ======================================================================

const DETAIL_URL = (unitId) => `https://basis.uni-bonn.de/qisserver/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=${unitId}&periodId=142&navigationPosition=courseoverviewShow`;
const CHECKPOINT = join(SHOT_DIR, 'scrape_checkpoint.json');
const polite = () => sleep(250 + Math.random() * 250);

async function waitRows(cdp) {
  return cdp.evaluate(`(async () => {
    const s = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      const c = document.querySelector('div[id$="courseCatalog"]');
      if (c && c.querySelector('tr[class*="treeTableCellLevel"]')) return true;
      await s(500);
    }
    return false;
  })()`);
}

// rows: [{suffix, text, toggle, expanded, permalink, unitId}]
async function treeRows(cdp, url, shotName) {
  if (url) {
    await cdp.navigate(url);
    await polite();
  }
  await waitRows(cdp);
  await injectHelpers(cdp);
  if (shotName) await cdp.shot(shotName);
  return cdp.evaluate(`(() => __his.allRows().map(r => {
    const i = __his.rowInfo(r);
    const showLink = (i.actionLinks || []).find(a => a.tag === 'A' && a.href && a.href.includes('detailView-flow'));
    const m = showLink?.href?.match(/unitId=(\\d+)/);
    return { suffix: i.id.replace(/^.*courseCatalog:/, '').replace(/:row$/, ''),
             text: i.text, toggle: !!i.toggleId, expanded: i.expanded,
             permalink: i.permalink, unitId: m ? m[1] : null };
  }))()`);
}

const childrenOf = (rows, suffix) =>
  rows.filter((r) => r.suffix.startsWith(suffix + ':') && r.suffix.slice(suffix.length + 1).split(':').length === 1);

// ---------- detail-page extractor (runs in page) ----------
const DETAIL_EXTRACT = `(() => {
  const txt = (el) => (el ? el.textContent : '').replace(/\\s+/g, ' ').trim();
  const out = { kind: null, nummer: null, kv: {}, appointments: [], rawText: '' };
  const content = document.querySelector('div[id*="detailViewData"]') || document.querySelector('#content') || document.body;
  // clean copy for text search (strip script/noscript so textContent is real text)
  const clean0 = (document.querySelector('#content') || document.body).cloneNode(true);
  clean0.querySelectorAll('noscript, script, style, .warningtext').forEach((n) => n.remove());
  {
    const fullText = txt(clean0);
    const hm = fullText.match(/Detailansicht\\s+(.+?)\\s*\\|\\s*([0-9]+[^|]*)\\s*\\|\\s*(Veranstaltung|Modul|Orgunit|Einrichtung)/);
    if (hm) { out.headTitle = hm[1].trim(); out.nummer = hm[2].trim(); out.kind = hm[3]; }
    out.rawText = fullText.slice(0, 4000);
  }
  for (const fs of [...document.querySelectorAll('fieldset')]) {
    const legend = txt(fs.querySelector('legend'));
    if (legend !== 'Grunddaten') continue;
    for (const li of [...fs.querySelectorAll('.labelItemLine')]) {
      const k = txt(li.querySelector('label')).replace(/:$/, '');
      const ans = li.querySelector('.answer');
      const lis = [...(ans?.querySelectorAll('li') ?? [])].map(txt).filter(Boolean);
      const v = lis.length ? lis.join(' | ') : txt(ans);
      if (k && v && !(k in out.kv)) out.kv[k] = v;
    }
  }
  // appointments: key each cell by its responsive header label (robust to column shifts)
  for (const t of [...document.querySelectorAll('table[id*="appointmentSeriesTable"]')]) {
    const rows = t.tBodies[0] ? [...t.tBodies[0].rows] : [...t.rows].slice(1);
    for (const r of rows) {
      const rec = {};
      for (const td of [...r.cells]) {
        const c = td.cloneNode(true);
        const marker = c.querySelector('span[data-type="responsive"]');
        let key = marker ? txt(marker) : null;
        if (marker) marker.remove();
        const lis = [...c.querySelectorAll('li')].map(txt).filter(Boolean);
        const v = (lis.length ? lis.join(' | ') : txt(c)).trim();
        key = key ? key.replace(/\\s*\\[Sortierbare Spalte\\]/g, '').replace(/[-:]/g, ' ').trim().toLowerCase() : null;
        if (key) rec[key] = v;
      }
      if (!Object.keys(rec).length) continue;
      out.appointments.push(rec);
    }
  }
  return out;
})()`;

async function extractDetail(cdp, unitId, attempt = 1) {
  await cdp.navigate(DETAIL_URL(unitId));
  await polite();
  const ready = await cdp.evaluate(`(async () => {
    const s = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      if ([...document.querySelectorAll('fieldset')].some(f => (f.querySelector('legend')?.textContent || '').trim() === 'Grunddaten')) return true;
      if (document.querySelector('table[id*="appointmentSeriesTable"]')) return true;
      await s(500);
    }
    return false;
  })()`);
  if (!ready && attempt < 3) { console.log(`    [retry] unitId=${unitId} attempt ${attempt}`); await sleep(2000); return extractDetail(cdp, unitId, attempt + 1); }
  const d = await cdp.evaluate(DETAIL_EXTRACT);
  d.unitId = unitId;
  d.detailUrl = DETAIL_URL(unitId);
  if (!ready) d.fetchWarning = 'Grunddaten/Termine never appeared';
  return d;
}

// ---------- code / title / type helpers ----------
const CODE_RE = /\b((?:MA|BA)-[A-ZÄÖÜ]{1,5}\s*\d{3,4}[a-z]?)\b/;
function parseCode(text) { const m = text.match(CODE_RE); return m ? m[1].replace(/\s+/, ' ') : null; }
function cleanTitle(text, code) {
  let t = text.trim();
  if (code) {
    const idx = t.indexOf(code);
    if (idx >= 0) t = t.slice(idx + code.length);
  } else {
    t = t.replace(/^\d{6,}[^-]*-\S*\s+/, '');              // drop leading '614004020-Bauckhage' style prefix
  }
  t = t.replace(/^\s*[-—:/]\s*/, '').trim();
  return t || text.trim();
}
function mapType(art) {
  if (!art) return null;
  const a = art.toLowerCase();
  if (/kick.?off/.test(a)) return 'Kickoff';
  if (/vorlesung/.test(a)) return 'Lecture';
  if (/übung|uebung|tutorium|repetitorium|tutorial/.test(a)) return 'Exercise';
  if (/seminar/.test(a)) return 'Seminar';
  if (/praktikum|projekt|forschungs|lab/.test(a)) return 'Lab';
  return art;
}
const DAY_MAP = { montag: 'Mon', dienstag: 'Tue', mittwoch: 'Wed', donnerstag: 'Thu', freitag: 'Fri', samstag: 'Sat', sonntag: 'Sun' };
function normDay(d) { const key = d.toLowerCase().replace(/\.$/, ''); const k2 = Object.keys(DAY_MAP).find((k) => key.startsWith(k.slice(0, 2))); return k2 ? DAY_MAP[k2] : (d || null); }
function normTime(t) {
  if (!t || t === '-') return null;
  const m = t.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return t;
  let out = `${String(m[1]).padStart(2, '0')}:${m[2]} - ${String(m[3]).padStart(2, '0')}:${m[4]}`;
  if (/c\.?\s*t/i.test(t)) out += ' c.t.';
  else if (/s\.?\s*t/i.test(t)) out += ' s.t.';
  else if (m[2] === '15' || m[2] === '45') out += ' c.t.';
  else if (m[2] === '00') out += ' s.t.';
  return out;
}

if (MODE === 'extract1') {
  const unitId = process.argv[3];
  const d = await extractDetail(cdp, unitId);
  console.dir(d, { depth: 6 });
  cleanup(0);
}

if (MODE === 'scrape') {
  const MAX_COURSES = process.argv[3] ? Number(process.argv[3]) : Infinity;
  const t0 = Date.now();
  const semesterLabel = await cdp.evaluate(`(() => {
    const h = document.querySelector('div[id$="courseCatalogFieldset"] .box_title h2, .box_title h2');
    const sel = document.querySelector('select[id*="termSelection"]');
    return { heading: h?.textContent?.trim() ?? null, termSelect: sel?.options?.[sel.selectedIndex]?.textContent?.trim() ?? null };
  })()`);
  console.log('[scrape] semester on page:', JSON.stringify(semesterLabel));
  if (!/Wintersemester 2026\/27/.test((semesterLabel.heading ?? '') + ' ' + (semesterLabel.termSelect ?? ''))) {
    console.error('[scrape] ABORT: page is not showing Wintersemester 2026/27');
    cleanup(1);
  }

  // 1) Informatik L1
  const l1 = await treeRows(cdp, null, '20-scrape-root');
  const infNode = l1.find((r) => /^Informatik,/.test(r.text));
  if (!infNode) { console.error('[scrape] Informatik L1 node not found'); cleanup(1); }
  console.log('[scrape] Informatik node:', infNode.suffix, '-', infNode.text.slice(0, 80));

  // 2) master branches
  const rowsInf = await treeRows(cdp, infNode.permalink, '21-scrape-informatik');
  const branches = childrenOf(rowsInf, infNode.suffix).filter((r) => /master/i.test(r.text));
  console.log('[scrape] master branches:', branches.map((b) => b.text).join(' || '));

  // 3) BFS through branches; module/course nodes have detailView unitIds
  const courseNodes = new Map(); // key: code+title -> {code, text, permalink, unitId, branch}
  const queue = branches.map((b) => ({ ...b, branch: b.text, depth: 1 }));
  const visited = new Set();
  let walkShots = 0;
  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node.permalink) || node.depth > 6) continue;
    visited.add(node.permalink);
    const rows = await treeRows(cdp, node.permalink, walkShots < 12 ? `22-walk-${String(walkShots++).padStart(2, '0')}` : null);
    const kids = childrenOf(rows, node.suffix);
    console.log(`[walk] ${node.text.slice(0, 60)} -> ${kids.length} children`);
    for (const k of kids) {
      if (k.unitId) {
        const code = parseCode(k.text);
        const key = (code ?? k.text.slice(0, 60)).toLowerCase();
        if (!courseNodes.has(key)) courseNodes.set(key, { code, text: k.text, permalink: k.permalink, suffix: k.suffix, unitId: k.unitId, toggle: k.toggle, branches: new Set() });
        courseNodes.get(key).branches.add(node.branch);
      } else if (k.toggle) {
        queue.push({ ...k, branch: node.branch, depth: node.depth + 1 });
      }
    }
  }
  console.log(`[walk] done. course nodes found: ${courseNodes.size}`);
  const nodeList = [...courseNodes.values()].slice(0, MAX_COURSES);
  console.log('[walk] sample:', nodeList.slice(0, 8).map((n) => n.text.slice(0, 70)).join(' | '));

  // 4) per course node: expand to Veranstaltung unitIds, fetch detail pages
  const courses = [];
  const failures = [];
  for (let ci = 0; ci < nodeList.length; ci++) {
    const n = nodeList[ci];
    let units = [{ unitId: n.unitId, text: n.text, isModuleSelf: true }];
    if (n.toggle) {
      try {
        const rows = await treeRows(cdp, n.permalink, ci === 0 ? '23-first-course-expand' : null);
        const vkids = childrenOf(rows, n.suffix).filter((k) => k.unitId);
        if (vkids.length) units = vkids.map((k) => ({ unitId: k.unitId, text: k.text }));
      } catch (e) { console.log('  [warn] expand failed for', n.text.slice(0, 60), e.message); }
    }
    const seenHere = new Set();
    units = units.filter((u) => !seenHere.has(u.unitId) && seenHere.add(u.unitId));
    const course = {
      code: n.code ?? null, title: cleanTitle(n.text, n.code), nodeText: n.text,
      branches: [...n.branches], detailUrlOrId: n.permalink, unitIds: [], events: [], instructors: new Set(),
      arts: new Set(), rawText: '', byArrangement: false, _units: [],
    };
    for (const u of units) {
      try {
        const d = await extractDetail(cdp, u.unitId);
        course._units.push(d);
        course.unitIds.push(String(u.unitId));
        if (!course.rawText && d.rawText) course.rawText = d.rawText;
        if (d.kind === 'Modul') continue;                       // module-level page: no appointments
        const art = d.kv['Veranstaltungsart'] || null;
        if (art) course.arts.add(art);
        const resp = [d.kv['Verantwortliche/-r'], d.kv['Verantwortliche/r'], d.kv['Dozent/-innen'], d.kv['Dozent/in']].filter(Boolean);
        for (const r of resp) for (const name of r.split('|')) { const nm = name.trim(); if (nm) course.instructors.add(nm); }
        for (const d0 of d.appointments) {
          const get = (...subs) => { for (const [k, v] of Object.entries(d0)) if (subs.some((s) => k.includes(s))) return v; return ''; };
          const ap = { rhythm: get('rhythmus'), day: get('wochentag'), time: get('von', ' bis'), cancelled: get('ausfall'), range: get('enddatum', 'startdatum'), remark: get('bemerkung'), dozent: get('führende', 'dozent', 'lehrende'), room: get('raum', 'ort') };
          const instructors = (ap.dozent || '').split('|').map((s) => s.trim()).filter(Boolean);
          for (const nm of instructors) course.instructors.add(nm);
          // drop appointment-less rows ("nach Vereinbarung" with nothing fixed)
          if (!ap.day && (!ap.time || ap.time === '-') && !ap.room) {
            if (/vereinbarung/i.test(ap.rhythm)) course.byArrangement = true;
            continue;
          }
          course.events.push({
            type: mapType(art), day: normDay(ap.day), time: normTime(ap.time),
            room: ap.room || null, rhythm: ap.rhythm || null,
            range: ap.range || null, comment: ap.remark || null, instructors, unitId: String(u.unitId),
          });
        }
      } catch (e) {
        console.log('  [fail] detail unitId', u.unitId, e.message.slice(0, 140));
        failures.push({ code: n.code, unitId: u.unitId, error: e.message.slice(0, 300) });
      }
      await polite();
    }
    // byArrangement: a unit says "nach Vereinbarung" somewhere and no fixed events remain
    const hasFixed = course.events.some((e) => (e.day && e.time) || e.room);
    const mentioned = course._units.some((d) => (d.rawText || '').includes('nach Vereinbarung')) ||
                      course.events.some((e) => /vereinbarung/i.test(e.rhythm || ''));
    if (!hasFixed && mentioned) course.byArrangement = true;
    course.instructors = [...course.instructors];
    // course-level type: most "senior" art
    const prio = ['Vorlesung', 'Übung', 'Seminar', 'Praktikum'];
    const arts = [...course.arts];
    const senior = prio.find((p) => arts.some((a) => a.toLowerCase().includes(p.toLowerCase()))) ?? arts[0] ?? null;
    course.type = mapType(senior);
    courses.push(course);
    console.log(`[course ${ci + 1}/${nodeList.length}] ${course.code ?? '?'} ${course.title.slice(0, 50)} | units=${course._units.length} events=${course.events.length} byArr=${course.byArrangement}`);
    if ((ci + 1) % 5 === 0) {
      writeFileSync(CHECKPOINT, JSON.stringify({ semesterLabel, done: ci + 1, courses }, null, 1));
    }
  }

  const out = {
    semester: 'Wintersemester 2026/27',
    semesterOnPage: semesterLabel,
    scrapedAt: new Date().toISOString(),
    count: courses.length,
    courses: courses.map(({ arts, _units, ...c }) => c),
    failures,
  };
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));
  console.log(`[done] ${courses.length} courses, ${failures.length} failed detail fetches, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  console.log('[done] wrote', OUT_FILE);
  await cdp.shot('99-final-state');
  cleanup(0);
}
