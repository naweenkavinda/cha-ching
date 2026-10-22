const OCR = (() => {
  'use strict';
  const SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const THUMB_SIDE = 300;
  const cfg = { mode: 'v2bin', psm: '6', maxSide: 2200, minSide: 1400 };
  const ua = navigator.userAgent;
  const webkitOnly = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Android|Edg/.test(ua));
  let scriptP = null;
  let workerP = null;
  let listener = null;

  function configure(o) { Object.assign(cfg, o || {}); }

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

  function enhanceV1(ctx, w, h) {
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

  // Local-mean normalisation (removes shadows and uneven light) using an integral image.
  // binary=true applies a Bradley-Roth style threshold, otherwise keeps soft greys.
  function normalise(ctx, w, h, binary) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const n = w * h;
    const gray = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) gray[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    const W = w + 1;
    const integ = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      const o = (y + 1) * W, p = y * W;
      for (let x = 0; x < w; x++) {
        row += gray[y * w + x];
        integ[o + x + 1] = integ[p + x + 1] + row;
      }
    }
    const r = Math.max(12, Math.round(Math.min(w, h) / 20));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const area = (x1 - x0) * (y1 - y0);
        const sum = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
        const mean = sum / area || 1;
        const g = gray[y * w + x];
        let v;
        if (binary) v = g < mean * 0.86 ? 0 : 255;
        else { v = (g / mean) * 235; v = v >= 235 ? 255 : v * 1.0; }
        const j = (y * w + x) * 4;
        d[j] = d[j + 1] = d[j + 2] = v;
        d[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function estimateSkew(canvas) {
    const sw = 480;
    const s = Math.min(1, sw / canvas.width);
    const w = Math.max(64, Math.round(canvas.width * s)), h = Math.max(64, Math.round(canvas.height * s));
    const t = makeCanvas(w, h);
    const tctx = t.getContext('2d', { willReadFrequently: true });
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, w, h);
    tctx.drawImage(canvas, 0, 0, w, h);
    let best = 0, bestScore = -1;
    const r = makeCanvas(w, h);
    const rctx = r.getContext('2d', { willReadFrequently: true });
    for (let a = -8; a <= 8.01; a += 0.5) {
      rctx.fillStyle = '#fff';
      rctx.fillRect(0, 0, w, h);
      rctx.save();
      rctx.translate(w / 2, h / 2);
      rctx.rotate((a * Math.PI) / 180);
      rctx.drawImage(t, -w / 2, -h / 2);
      rctx.restore();
      const d = rctx.getImageData(0, 0, w, h).data;
      const rows = new Float64Array(h);
      for (let y = 0; y < h; y++) {
        let c = 0;
        for (let x = 0; x < w; x++) if (d[(y * w + x) * 4] < 150) c++;
        rows[y] = c;
      }
      let mean = 0;
      for (let y = 0; y < h; y++) mean += rows[y];
      mean /= h;
      let v = 0;
      for (let y = 0; y < h; y++) v += (rows[y] - mean) * (rows[y] - mean);
      if (v > bestScore) { bestScore = v; best = a; }
    }
    release(t); release(r);
    return best;
  }

  function rotateCanvas(canvas, deg) {
    const rad = (deg * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    const nw = Math.round(canvas.width * c + canvas.height * s), nh = Math.round(canvas.width * s + canvas.height * c);
    const out = makeCanvas(nw, nh);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, nw, nh);
    ctx.translate(nw / 2, nh / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  function addBorder(canvas, px) {
    const out = makeCanvas(canvas.width + px * 2, canvas.height + px * 2);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, px, px);
    return out;
  }

  async function prepare(file) {
    const img = await decode(file);
    try {
      const { w, h } = img;
      if (!w || !h) throw new Error('Could not open that image');
      const long = Math.max(w, h);
      const scale = long > cfg.maxSide ? cfg.maxSide / long : long < cfg.minSide ? cfg.minSide / long : 1;
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      let canvas = makeCanvas(cw, ch);
      let ctx = canvas.getContext('2d', { willReadFrequently: true });
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

      if (cfg.mode === 'v1') {
        enhanceV1(ctx, cw, ch);
      } else {
        normalise(ctx, cw, ch, cfg.mode === 'v2bin');
        if (cfg.deskew !== false) {
          const a = estimateSkew(canvas);
          if (Math.abs(a) >= 0.5) { const r = rotateCanvas(canvas, a); release(canvas); canvas = r; }
        }
        const b = addBorder(canvas, 24);
        release(canvas);
        canvas = b;
      }
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
        .then(() => window.Tesseract.createWorker('eng', 1, { logger: (m) => { if (listener) listener(m); } }, { load_system_dawg: '0', load_freq_dawg: '0' }))
        .catch((e) => { workerP = null; throw e; });
    }
    return workerP;
  }

  async function recognize(input, onProgress) {
    listener = onProgress || null;
    try {
      const worker = await getWorker();
      try { await worker.setParameters({ tessedit_pageseg_mode: cfg.psm, preserve_interword_spaces: '1', user_defined_dpi: '300' }); } catch (e) { }
      const job = worker.recognize(input);
      job.catch(() => {});
      let timer = 0;
      const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The reader took too long')), cfg.timeoutMs || 40000); });
      let res;
      try { res = await Promise.race([job, limit]); } finally { clearTimeout(timer); }
      return (res && res.data && res.data.text) || '';
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

  return { prepare, recognize, release, configure, config: cfg };
})();
