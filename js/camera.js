const Cam = (() => {
  'use strict';
  const KEY = 'receipt-snap.camOK';
  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let stream = null;
  let starting = false;
  let blocked = false;
  let granted = false;
  let epoch = 0;
  let lastErr = '';

  const video = () => document.getElementById('cam');
  const notify = () => window.dispatchEvent(new Event('camstate'));

  try { granted = localStorage.getItem(KEY) === '1'; } catch (e) { }
  if (supported && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'camera' }).then((p) => {
      if (p.state === 'granted') granted = true;
      if (p.state === 'denied') { blocked = true; notify(); }
      p.onchange = () => { if (p.state === 'granted') { blocked = false; granted = true; } else if (p.state === 'denied') blocked = true; notify(); };
    }).catch(() => { });
  }

  function state() {
    if (stream) return 'on';
    if (!supported || blocked) return 'blocked';
    return 'idle';
  }

  async function start() {
    if (!supported || stream || starting) return;
    starting = true;
    const mine = ++epoch;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }
      });
      const v = video();
      if (!v || mine !== epoch) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      blocked = false;
      v.srcObject = s;
      try { await v.play(); } catch (e) { }
      document.body.classList.add('cam-on');
      try { localStorage.setItem(KEY, '1'); } catch (e) { }
    } catch (e) {
      lastErr = (e && e.name) || 'Error';
      stream = null;
      blocked = true;
      granted = false;
      try { localStorage.removeItem(KEY); } catch (e2) { }
    } finally {
      starting = false;
      notify();
    }
  }

  function stop() {
    epoch++;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const had = !!stream;
    stream = null;
    const v = video();
    if (v) v.srcObject = null;
    document.body.classList.remove('cam-on');
    if (had) notify();
  }

  function capture() {
    const v = video();
    if (!stream || !v) return Promise.resolve(null);
    const vw = v.videoWidth, vh = v.videoHeight, cw = v.clientWidth, ch = v.clientHeight;
    if (!vw || !vh || !cw || !ch) return Promise.resolve(null);
    const scale = Math.max(cw / vw, ch / vh);
    const sw = cw / scale, sh = ch / scale;
    const c = document.createElement('canvas');
    c.width = Math.round(sw);
    c.height = Math.round(sh);
    c.getContext('2d').drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    return new Promise((resolve) => {
      c.toBlob((b) => {
        c.width = c.height = 0;
        resolve(b ? new File([b], 'receipt.jpg', { type: 'image/jpeg' }) : null);
      }, 'image/jpeg', 0.92);
    });
  }

  async function retry() { blocked = false; granted = false; lastErr = ''; notify(); await start(); }

  return { start, stop, capture, state, retry, supported: () => supported, lastError: () => lastErr, autostart: () => granted && !blocked };
})();
