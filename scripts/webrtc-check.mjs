// CDP driver for scripts/webrtc-check.sh — no npm deps (needs Node >= 21 global WebSocket).
//   node webrtc-check.mjs <cdp-port> <page-url> <wait-seconds> <screenshot-path>
// Loads ZLMediaKit's bundled webrtc/index.html (?app=&stream=&type=play), calls
// its global start() via CDP, then polls the <video> element directly (no
// window.__result convention on this page — that was the old test page's own
// contract, not something ZLMediaKit's demo page provides). Exit 0 = PASS.

import fs from 'node:fs';

const [port, pageUrl, waitS, shotPath] = process.argv.slice(2);
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
  await sleep(800); // let the new document actually load before we touch `window`

  const evalJSON = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
    return r.result.value;
  };

  // Collect page-level errors (sync throws AND unhandled promise rejections —
  // ZLMediaKit's demo page captures local camera/mic asynchronously inside
  // ZLMRTCClient.Endpoint's constructor even in recvOnly/play mode, so a
  // rejection there surfaces as an unhandled rejection, not a thrown
  // exception from start() itself).
  await evalJSON(`(() => {
    window.__errors = [];
    window.addEventListener('error', e => window.__errors.push('error: ' + (e.error && e.error.stack || e.message)));
    window.addEventListener('unhandledrejection', e => window.__errors.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
    return 'ok';
  })()`);

  // Let the page's own init (device enumeration, streamUrl prefill from the
  // URL's app/stream/type) finish before we click play.
  await sleep(1500);
  const startResult = await evalJSON(`(() => {
    try { start(); return JSON.stringify({ ok: true }); }
    catch (e) { return JSON.stringify({ ok: false, error: String(e && e.stack || e) }); }
  })()`);
  const started = JSON.parse(startResult || '{"ok":false,"error":"no result"}');
  if (!started.ok) {
    console.error('start() threw:', started.error);
  }
  await sleep(500);
  const pageErrors = JSON.parse((await evalJSON('JSON.stringify(window.__errors || [])')) || '[]');
  if (pageErrors.length) console.error('page errors:', pageErrors);

  const poll = () => evalJSON(`(() => {
    const v = document.getElementById('video');
    if (!v) return JSON.stringify({ state: 'fail', error: 'no #video element' });
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : { totalVideoFrames: 0 };
    let connectionState = 'unknown';
    try { if (window.player && window.player.pc) connectionState = window.player.pc.connectionState; } catch {}
    return JSON.stringify({
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      readyState: v.readyState,
      paused: v.paused,
      ended: v.ended,
      totalVideoFrames: q.totalVideoFrames || 0,
      connectionState,
    });
  })()`);

  const waitMs = (parseFloat(waitS) || 12) * 1000;
  const t0 = Date.now();
  let first = null, last = null;
  while (Date.now() - t0 < waitMs) {
    const snap = JSON.parse((await poll()) || '{}');
    if (snap.connectionState === 'failed') { last = snap; break; }
    if (!first && snap.videoWidth > 0) { first = snap; first._t = Date.now(); }
    last = snap; last._t = Date.now();
    if (first && snap.totalVideoFrames - first.totalVideoFrames >= 5) break; // decoding real frames
    await sleep(500);
  }

  const elapsedS = first ? Math.max(0.1, (last._t - first._t) / 1000) : 0;
  const framesDecoded = first ? (last.totalVideoFrames - first.totalVideoFrames) : 0;
  const decoding = !!first && framesDecoded > 0;
  const result = {
    state: decoding ? 'pass' : 'fail',
    resolution: last && last.videoWidth ? `${last.videoWidth}x${last.videoHeight}` : null,
    framesDecoded: last ? last.totalVideoFrames : 0,
    decodeFps: decoding ? +(framesDecoded / elapsedS).toFixed(1) : 0,
    connectionState: last ? last.connectionState : 'unknown',
    ttffMs: first ? (first._t - t0) : null,
  };

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
