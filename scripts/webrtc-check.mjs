// CDP driver for scripts/webrtc-check.sh — no npm deps (needs Node >= 21 global WebSocket).
//   node webrtc-check.mjs <cdp-port> <page-url> <wait-seconds> <screenshot-path> [--all]
// Loads services/go2rtc/www/webrtc-test.html, waits, prints window.__result JSON,
// writes a screenshot. Exit 0 = PASS.

import fs from 'node:fs';

const [port, pageUrl, waitS, shotPath, mode] = process.argv.slice(2);
const isAll = mode === '--all';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0; this.pending = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('CDP ws error')); });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close() { try { this.ws.close(); } catch {} }
}

const main = async () => {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); }
    catch {}
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('no Chrome page target on CDP port ' + port);

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: pageUrl });

  const evalJSON = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.value;
  };

  if (isAll) {
    // poll until the page reports the run finished (verdict contains "test all done")
    for (let i = 0; i < 240; i++) {
      await sleep(1000);
      const v = await evalJSON('JSON.stringify(window.__result || {})');
      const j = JSON.parse(v || '{}');
      if ((j.verdict || '').includes('test all done')) break;
    }
    const summary = await evalJSON(`(() => {
      const rows = [...document.querySelectorAll('#summary tr')].map(tr =>
        [...tr.children].map(td => td.textContent.trim()));
      return JSON.stringify(rows);
    })()`);
    const rows = JSON.parse(summary || '[]');
    let pass = 0;
    for (const r of rows) { console.log(r.join('  ')); if (r[1] === 'PASS') pass++; }
    if (shotPath) {
      try { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(shotPath, Buffer.from(data, 'base64')); } catch {}
    }
    cdp.close();
    process.exit(rows.length && pass === rows.length ? 0 : 1);
  }

  // poll until the page settles on pass/fail, capped at wait+15s
  const cap = ((parseFloat(waitS) || 12) + 15) * 1000;
  const start = Date.now();
  let result = { state: '?' };
  while (Date.now() - start < cap) {
    await sleep(700);
    result = JSON.parse((await evalJSON('JSON.stringify(window.__result || {state:"?"})')) || '{}');
    if (result.state === 'fail') break;
    if (result.state === 'pass') {
      // let fps stabilise before reporting
      await sleep(2500);
      result = JSON.parse((await evalJSON('JSON.stringify(window.__result || {})')) || '{}');
      break;
    }
  }
  if (shotPath) {
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shotPath, Buffer.from(data, 'base64'));
      result._screenshot = shotPath;
    } catch (e) { result._screenshotError = String(e); }
  }
  console.log(JSON.stringify(result, null, 2));
  cdp.close();
  process.exit(result.state === 'pass' ? 0 : 1);
};

main().catch(e => { console.error('probe error:', e.message); process.exit(2); });
