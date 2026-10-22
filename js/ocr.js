const OCR = (() => {
  'use strict';
  const SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const MAX_SIDE = 1800;
  const MIN_SIDE = 1100;
  const THUMB_SIDE = 300;
  const ua = navigator.userAgent;
  const webkitOnly = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Android|Edg/.test(ua));
  let scriptP = null;
  let workerP = null;
  let listener = null;

  function loadImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image')); };
      img.src = url;
    });
  }

  async function decode(file) {
    if (!webkitOnly && typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { src: bmp, w: bmp.width, h: bmp.height, done: () => { if (bmp.close) bmp.close(); } };
      } catch (e) { }
    }
    return loadImg(file);
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function percentile(hist, target) {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  }

  function enhance(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const n = w * h;
    const gray = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const g = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
      gray[i] = g;
      hist[g]++;
    }
    let lo = percentile(hist, n * 0.02);
    let hi = percentile(hist, n * 0.98);
    if (hi - lo < 24) { lo = 0; hi = 255; }
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = ((v - lo) * 255) / (hi - lo);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const v = lut[gray[i]];
      d[j] = v; d[j + 1] = v; d[j + 2] = v; d[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  async function prepare(file) {
    const img = await decode(file);
    try {
      const { w, h } = img;
      if (!w || !h) throw new Error('Could not open that image');
      const long = Math.max(w, h);
      const scale = long > MAX_SIDE ? MAX_SIDE / long : long < MIN_SIDE ? MIN_SIDE / long : 1;
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = makeCanvas(cw, ch);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img.src, 0, 0, cw, ch);

      const ts = Math.min(1, THUMB_SIDE / Math.max(cw, ch));
      const t = makeCanvas(Math.max(1, Math.round(cw * ts)), Math.max(1, Math.round(ch * ts)));
      const tctx = t.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(canvas, 0, 0, t.width, t.height);
      const thumb = t.toDataURL('image/jpeg', 0.6);
      release(t);

      enhance(ctx, cw, ch);
      return { canvas, thumb };
    } finally {
      img.done();
    }
  }

  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptP) {
      scriptP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SRC;
        s.async = true;
        s.onload = () => (window.Tesseract ? resolve() : reject(new Error('The text reader failed to start')));
        s.onerror = () => { s.remove(); reject(new Error('Could not download the text reader. Check your connection.')); };
        document.head.appendChild(s);
      }).catch((e) => { scriptP = null; throw e; });
    }
    return scriptP;
  }

  function getWorker() {
    if (!workerP) {
      workerP = loadScript()
        .then(() => window.Tesseract.createWorker('eng', 1, { logger: (m) => { if (listener) listener(m); } }))
        .then(async (w) => {
          try { await w.setParameters({ tessedit_pageseg_mode: '4' }); } catch (e) { }
          return w;
        })
        .catch((e) => { workerP = null; throw e; });
    }
    return workerP;
  }

  async function recognize(input, onProgress) {
    listener = onProgress || null;
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(input);
      return (data && data.text) || '';
    } catch (e) {
      const p = workerP;
      workerP = null;
      if (p) p.then((w) => w.terminate()).catch(() => {});
      throw e;
    } finally {
      listener = null;
    }
  }

  function release(c) {
    if (c) { c.width = 0; c.height = 0; }
  }

  return { prepare, recognize, release };
})();
