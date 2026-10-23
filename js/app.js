(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD', 'SGD', 'AED'];
  const CURRENCY_NAMES = { LKR: 'Sri Lankan rupee', USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', INR: 'Indian rupee', AUD: 'Australian dollar', SGD: 'Singapore dollar', AED: 'UAE dirham' };
  const CURRENCY_HINTS = {
    LKR: /\bLKR\b|\bRs\.?(?![a-z])|\u0DBB\u0DD4/i,
    USD: /\bUSD\b|\$/,
    EUR: /\bEUR\b|\u20AC/,
    GBP: /\bGBP\b|\u00A3/,
    INR: /\bINR\b|\u20B9|\bRs\.?(?![a-z])/i,
    AUD: /\bAUD\b|A\$/,
    SGD: /\bSGD\b|S\$/,
    AED: /\bAED\b|\bDHS?\b|\u062F\.\u0625/i
  };
  const Parser = typeof ReceiptParser !== 'undefined' ? ReceiptParser : null;
  const CATEGORIES = Parser && Array.isArray(Parser.CATEGORIES) && Parser.CATEGORIES.length
    ? Parser.CATEGORIES.slice()
    : ['Groceries', 'Food & Dining', 'Transport & Fuel', 'Shopping', 'Health', 'Utilities & Bills', 'Entertainment', 'Travel', 'Office & Business', 'Other'];
  const FALLBACK_CATEGORY = CATEGORIES.indexOf('Other') >= 0 ? 'Other' : CATEGORIES[CATEGORIES.length - 1];

  const settings = {
    get(key, def) {
      try { const v = localStorage.getItem('receipt-snap.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('receipt-snap.' + key, JSON.stringify(val)); } catch (e) { }
    }
  };

  const Sfx = (() => {
    let ctx = null, master = null, keep = null, done = false;
    const NOTES = {
      tap: [[880, 0, .18, .3], [1318, .04, .22, .18]],
      tab: [[784, 0, .16, .28], [1175, .05, .2, .16]],
      primary: [[659, 0, .22, .3], [880, .07, .24, .26], [1318, .14, .34, .24]],
      snap: [[1046, 0, .12, .3], [1568, .05, .2, .24]],
      shutter: [],
      coin: [[1568, 0, .1, .22], [2349, .025, .16, .14]],
      warn: [[392, 0, .22, .3], [330, .16, .26, .3], [262, .34, .4, .3]],
      ok: [[523, 0, .24, .3], [659, .09, .24, .27], [784, .18, .26, .27], [1046, .27, .46, .27]]
    };
    const iosLike = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    function silentWav() {
      const n = 8000, b = new Uint8Array(44 + n), dv = new DataView(b.buffer);
      const w = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
      dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
      for (let i = 0; i < n; i++) b[44 + i] = 128;
      return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    }
    function setup() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
      } catch (e) { ctx = null; return false; }
      return true;
    }
    function unlock() {
      if (done || !setup()) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
      try {
        const p = ctx.resume();
        if (p && p.then) p.then(() => { if (ctx.state === 'running') done = true; }).catch(() => { });
      } catch (e) { }
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) { }
      if (iosLike() && !navigator.audioSession && !keep) {
        try {
          keep = new Audio(silentWav());
          keep.loop = true;
          keep.setAttribute('playsinline', '');
          keep.play().catch(() => { keep = null; });
        } catch (e) { keep = null; }
      }
    }
    function noiseHit(t, dur, type, freq, q, gain, pow) {
      const n = Math.ceil(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, pow || 3);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q || 1;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    }
    function sweepTone(t, f0, f1, dur, gain) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    function schedule(kind) {
      const t0 = ctx.currentTime + 0.02;
      if (kind === 'shutter') {
        sweepTone(t0, 900, 5200, 0.3, 0.07);
        noiseHit(t0 + 0.31, 0.02, 'bandpass', 3800, 2, 1.7, 2);
        noiseHit(t0 + 0.36, 0.03, 'highpass', 3000, 1, 1.4, 2);
        sweepTone(t0 + 0.37, 1568, 1568, 0.25, 0.12);
        return;
      }
      NOTES[kind].forEach((n) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t0 + n[1]);
        g.gain.exponentialRampToValueAtTime(n[3], t0 + n[1] + .012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
        o.connect(g);
        g.connect(master);
        o.start(t0 + n[1]);
        o.stop(t0 + n[1] + n[2] + .05);
      });
    }
    function play(kind) {
      if (!settings.get('sound', true) || !NOTES[kind] || !setup()) return;
      try {
        if (ctx.state === 'running') schedule(kind);
        else ctx.resume().then(() => schedule(kind)).catch(() => { });
      } catch (e) { }
    }
    return { play, unlock };
  })();

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  const state = { all: [], filter: settings.get('filter', 'all'), mode: 'idle', editing: null, draft: null, busy: false, previewUrl: null, lastPct: 0, installPrompt: null };

  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const isImgData = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s);
  const defaultCurrency = () => { const c = settings.get('currency', 'LKR'); return CURRENCIES.indexOf(c) >= 0 ? c : 'LKR'; };
  const numFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s) => {
    if (!isYMD(s)) return 'No date';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };

  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) Object.keys(props).forEach((k) => {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach((c) => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function icon(name) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#i-' + name);
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    replay(t, 'pop-in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2800);
  }

  function fillSelect(sel, values, label) {
    sel.textContent = '';
    values.forEach((v) => sel.appendChild(new Option(label ? label(v) : v, v)));
  }

  function parseAmount(v) {
    let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return null;
    const lc = s.lastIndexOf(',');
    const ld = s.lastIndexOf('.');
    if (lc > ld && s.length - lc - 1 <= 2) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function safeParse(text) {
    try { if (Parser && typeof Parser.parse === 'function') return Parser.parse(text || '') || {}; } catch (e) { console.warn('Parser error', e); }
    return {};
  }

  function pickCurrency(d, mode) {
    const c = d.currency;
    if (CURRENCIES.indexOf(c) < 0) return defaultCurrency();
    if (mode === 'edit') return c;
    return d.rawText && CURRENCY_HINTS[c].test(d.rawText) ? c : defaultCurrency();
  }

  async function loadAll() {
    try {
      const rows = await DB.all();
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0));
      state.all = rows;
    } catch (e) {
      state.all = [];
      toast('Storage is not available in this browser mode.', 4500);
    }
  }

  function requestPersist() {
    if (settings.get('persistAsked', false) || !navigator.storage || !navigator.storage.persist) return;
    settings.set('persistAsked', true);
    navigator.storage.persist().catch(() => {});
  }

  const VIEWS = ['welcome', 'home', 'quest', 'summary', 'scan', 'expenses', 'settings'];
  const ROLL_SEL = '.stamp, .notice, .caption, .controls, .actions, .sheet-row, .view-head, .sec, .progress, .home-h, #home-date, .theme-row, .home-actions, .list > li, .empty';
  const SYMBOLS = { LKR: 'Rs', USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', SGD: 'S$', AED: 'AED' };
  const ymdDate = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const fmtLong = (s) => (isYMD(s) ? ymdDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const fmtSeal = (s) => (isYMD(s) ? ymdDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : 'NO DATE');
  const isInc = (r) => !!r && r.kind === 'income';
  const payTag = (r) => (r && r.pay === 'card' ? (r.card || 'Card') : '');
  function sumsOf(rows) {
    const spent = {}, earned = {};
    rows.forEach((r) => {
      if (typeof r.amount !== 'number' || !isFinite(r.amount)) return;
      const m = isInc(r) ? earned : spent;
      m[r.currency] = (m[r.currency] || 0) + r.amount;
    });
    return { spent, earned };
  }
  function fillTotals(box, sums, fmt) {
    box.textContent = '';
    Object.keys(sums.spent).sort((a, b) => sums.spent[b] - sums.spent[a]).forEach((c) => {
      box.appendChild(el('div', { class: 'total' }, [el('span', { class: 'total-cur', text: c }), el('span', { class: 'total-amt', text: fmt(sums.spent[c]) })]));
    });
    Object.keys(sums.earned).sort((a, b) => sums.earned[b] - sums.earned[a]).forEach((c) => {
      box.appendChild(el('div', { class: 'total' }, [el('span', { class: 'total-cur', text: c }), el('span', { class: 'total-amt in', text: '+' + fmt(sums.earned[c]) })]));
    });
  }
  const fmtShort = (s) => (isYMD(s) ? ymdDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');

  function replay(node, cls) {
    node.classList.remove(cls);
    node.getBoundingClientRect();
    node.classList.add(cls);
    node.addEventListener('animationend', function done(e) {
      if (e.target !== node) return;
      node.classList.remove(cls);
      node.removeEventListener('animationend', done);
    });
  }

  function roll(container) {
    const items = Array.prototype.filter.call(container.querySelectorAll(ROLL_SEL), (n) => n.getClientRects().length);
    items.forEach((n) => n.classList.remove('rl'));
    void container.offsetWidth;
    items.forEach((n, i) => {
      n.style.setProperty('--i', Math.min(i, 9));
      replay(n, 'rl');
    });
  }

  function turnPage(forward) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const main = $('main');
    const r = main.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const wrap = el('div', { class: 'leaf-wrap', 'aria-hidden': 'true' });
    wrap.style.top = top + 'px';
    wrap.style.height = Math.max(0, window.innerHeight - top) + 'px';
    const clone = main.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    clone.querySelectorAll('video, input, textarea, select, button, a').forEach((n) => n.setAttribute('tabindex', '-1'));
    clone.style.marginTop = Math.min(0, r.top) + 'px';
    const leaf = el('div', { class: 'leaf ' + (forward ? 'fwd' : 'back') }, [clone]);
    wrap.appendChild(leaf);
    document.body.appendChild(wrap);
    const done = () => wrap.remove();
    leaf.addEventListener('animationend', (e) => { if (e.target === leaf) done(); });
    setTimeout(done, 1000);
  }

  function show(view, tab) {
    setMenu(false);
    const from = VIEWS.findIndex((v) => !$('view-' + v).hidden);
    const target = VIEWS.indexOf(view);
    if (from >= 0 && from !== target) turnPage(target > from);
    VIEWS.forEach((v) => { $('view-' + v).hidden = v !== view; });
    document.querySelectorAll('.tab').forEach((b) => {
      if (b.dataset.view === (tab || view)) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (view === 'home') renderHome();
    if (view === 'expenses') renderExpenses();
    if (view === 'settings') renderSettings();
    setScreen();
    syncCam();
    window.scrollTo(0, 0);
    const to = VIEWS.indexOf(view);
    if (from !== to) {
      const v = $('view-' + view);
      replay(v, to > from ? 'view-in-r' : 'view-in-l');
      roll(v);
    }
  }

  function entryNo() {
    if (state.editing) {
      const order = state.all.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const i = order.findIndex((r) => r.id === state.editing.id);
      return i >= 0 ? i + 1 : state.all.length;
    }
    return state.all.length + 1;
  }

  function setScreen() {
    const v = VIEWS.find((n) => !$('view-' + n).hidden) || 'scan';
    const s = v === 'scan' ? (state.mode === 'review' ? 'review' : state.mode === 'reading' ? 'reading' : 'capture') : v;
    document.body.dataset.screen = s;
    const label = $('top-label');
    label.hidden = s !== 'review';
    if (s === 'review') label.textContent = 'ENTRY ' + entryNo();
  }

  function syncCam() {
    const want = state.mode === 'idle' && !$('view-scan').hidden && !document.hidden;
    if (!want) { Cam.stop(); return; }
    if (Cam.autostart()) Cam.start();
  }

  function camHelp() {
    if (isIOS) return 'Camera is blocked. Open Settings, find Safari (or Cha-Ching if installed), turn Camera on, then reload.';
    if (/Android/.test(navigator.userAgent)) return 'Camera is blocked. Tap the lock icon by the address, choose Permissions, and allow Camera.';
    return 'Camera is blocked. Allow it from the lock icon next to the address bar.';
  }

  function updateCaption() {
    const s = Cam.state();
    $('cam-caption').textContent = s === 'on' ? 'Keep the receipt inside the stamp.'
      : s === 'idle' ? 'Tap SNAP to turn on the camera.'
        : Cam.supported() ? 'Camera is off. SNAP opens your camera app.' : "Camera preview isn't available here. SNAP opens your camera app.";
    $('cam-allow').hidden = !(s === 'blocked' && Cam.supported());
  }

  async function onSnap() {
    if (state.busy) { toast('Still reading the last photo…'); return; }
    const st = Cam.state();
    if (st === 'on') {
      const f = await Cam.capture();
      if (f) {
        const vf = $('vf');
        vf.classList.remove('shot');
        vf.getBoundingClientRect();
        vf.classList.add('shot');
        setTimeout(() => vf.classList.remove('shot'), 450);
        handleFile(f);
        return;
      }
    } else if (st === 'idle') {
      await Cam.start();
      if (Cam.state() === 'on') return;
      toast('Camera not allowed. Tap SNAP to use your camera app, or choose Let me see.', 5000);
    }
    $('file-camera').click();
  }

  function setMode(mode) {
    const changed = state.mode !== mode;
    state.mode = mode;
    $('capture').hidden = mode !== 'idle';
    $('work').hidden = mode === 'idle';
    $('reading').hidden = mode !== 'reading';
    $('form').hidden = mode !== 'review';
    setScreen();
    syncCam();
    if (mode === 'review') refreshReview();
    if (changed) roll($('view-scan'));
  }

  function setUnread(name, on) {
    const f = document.querySelector('#form .fld[data-f="' + name + '"]');
    if (f) f.classList.toggle('unread', !!on);
    if (state.hintFlagged && !document.querySelector('#form .fld.unread')) {
      state.hintFlagged = false;
      $('form-hint').textContent = 'All details filled in. Check them before adding.';
    }
  }

  function autogrow() {
    const t = $('f-shop');
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 'px';
  }

  function fitAmount() {
    const inp = $('f-amount');
    const m = $('amt-measure');
    const avail = inp.clientWidth;
    if (!avail) return;
    m.textContent = inp.value || inp.placeholder || '0.00';
    let size = 54;
    m.style.fontSize = size + 'px';
    while (size > 24 && m.offsetWidth > avail - 2) { size -= 2; m.style.fontSize = size + 'px'; }
    inp.style.fontSize = size + 'px';
  }

  function fitSeal() {
    const c = $('seal-cat');
    let size = 20;
    c.style.fontSize = size + 'px';
    while (size > 9 && (c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > 48)) { size -= 1; c.style.fontSize = size + 'px'; }
  }

  function updateSym() {
    const c = $('f-currency').value;
    $('cur-sym').textContent = SYMBOLS[c] || c;
  }

  function updateDateText() {
    const t = $('date-text');
    const v = $('f-date').value;
    if (isYMD(v)) { t.textContent = fmtLong(v); t.classList.remove('is-empty'); }
    else { t.textContent = 'Tap to set the date'; t.classList.add('is-empty'); }
  }

  function updateSeal() {
    $('seal-cat').textContent = $('f-category').value;
    $('seal-date').textContent = fmtSeal($('f-date').value);
    fitSeal();
  }

  function renderSheet() {
    const box = $('sheet-rows');
    const editingId = state.editing ? state.editing.id : null;
    const saved = state.all.filter((r) => r.id !== editingId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(-2);
    const cur = $('f-currency').value;
    const amt = parseAmount($('f-amount').value);
    const rows = saved.concat([{ date: $('f-date').value, shop: $('f-shop').value.trim(), amount: amt, currency: cur, kind: formKind }]);
    box.textContent = '';
    rows.forEach((r, i) => {
      const num = typeof r.amount === 'number' && isFinite(r.amount) ? (isInc(r) ? '+' : '') + numFmt.format(r.amount) + (r.currency && r.currency !== cur ? ' ' + r.currency : '') : '—';
      box.appendChild(el('div', { class: 'sheet-row' + (i === rows.length - 1 ? ' is-new' : '') }, [
        el('span', { text: fmtShort(r.date) }),
        el('span', { text: r.shop || '—' }),
        el('span', { class: 'amt', text: num })
      ]));
    });
  }

  function refreshReview() {
    updateSym();
    updateDateText();
    updateSeal();
    renderSheet();
    autogrow();
    fitAmount();
  }

  function setPreview(src, isObjectUrl) {
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
    const img = $('preview-img');
    if (src) {
      if (isObjectUrl) state.previewUrl = src;
      img.src = src;
      $('preview').hidden = false;
    } else {
      img.removeAttribute('src');
      $('preview').hidden = true;
    }
  }

  function resetScan() {
    state.editing = null;
    state.draft = null;
    $('form').reset();
    setPreview(null);
    setMode('idle');
  }

  const APP_URL = 'https://naweenkavinda.github.io/receipt-snap/';

  function rainCoins(income) {
    if (typeof Coins === 'undefined') return;
    Coins.rain({ count: income ? 24 : 16, onHit: () => Sfx.play('coin') });
  }

  function setMenu(open) {
    const m = $('menu');
    if (!m) return;
    m.classList.toggle('open', open);
    $('menu-btn').classList.toggle('open', open);
    $('menu-btn').setAttribute('aria-expanded', String(open));
  }

  function inviteFriend() {
    const msg = 'Hi! I use Cha-Ching to keep track of my expenses. Snap a receipt and the sheet fills itself in. It is free and works on your phone: ' + APP_URL;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  const Q = { step: 'what', desc: '', amount: null, currency: 'LKR', kind: 'expense', card: null, cardName: '', history: [] };
  const QSTEPS = {
    what: { emoji: '\uD83D\uDE0F', title: 'What did you do?', sub: 'Spill it. No judgement. (Okay, a little.)' },
    amount: { emoji: '\uD83E\uDD14', title: 'How much?', sub: "Be honest. I won't tell anyone." },
    kind: { emoji: '\uD83E\uDDD0', title: 'Expense or income?', sub: 'Money going out, or money coming in?' },
    card: { emoji: '\uD83D\uDCB3', title: 'Was it a card expense?', sub: 'Did the plastic take the hit?' },
    cardname: { emoji: '\uD83C\uDFE6', title: 'Which card?', sub: 'Visa, Master, something shiny?' }
  };

  function questAfter(from) {
    if (from === 'what') return 'amount';
    if (from === 'amount') return 'kind';
    if (from === 'kind') return Q.kind === 'expense' ? 'card' : 'done';
    if (from === 'card') return Q.card ? 'cardname' : 'done';
    return 'done';
  }

  function openQuest() {
    Object.assign(Q, { step: 'what', desc: '', amount: null, currency: defaultCurrency(), kind: 'expense', card: null, cardName: '', history: [] });
    show('quest', 'home');
    renderQuest();
  }

  function choice(emoji, label, onPick) {
    const b = el('button', { type: 'button', class: 'q-choice' }, [el('span', { class: 'em', text: emoji }), el('span', { text: label })]);
    b.addEventListener('click', onPick);
    return b;
  }

  function renderQuest() {
    const s = QSTEPS[Q.step];
    const emoji = $('q-emoji');
    emoji.textContent = s.emoji;
    replay(emoji, 'pop');
    $('q-title').textContent = s.title;
    $('q-sub').textContent = s.sub;
    $('q-step').textContent = 'QUESTION ' + (Q.history.length + 1);
    $('q-back').style.visibility = Q.history.length ? 'visible' : 'hidden';
    const body = $('q-body');
    body.textContent = '';
    const next = $('q-next');
    next.hidden = false;
    next.textContent = Q.step === 'cardname' ? 'Case closed' : 'And then?';
    const err = el('p', { class: 'q-error', id: 'q-err', 'aria-live': 'polite' });
    let focusEl = null;
    if (Q.step === 'what') {
      focusEl = el('input', { id: 'q-in', class: 'q-in', type: 'text', maxlength: '80', placeholder: 'e.g. Lunch with the team', autocapitalize: 'sentences', enterkeyhint: 'next', 'aria-label': 'What did you do?' });
      focusEl.value = Q.desc;
      body.appendChild(focusEl);
    } else if (Q.step === 'amount') {
      const sym = el('span', { text: SYMBOLS[Q.currency] || Q.currency });
      const sel = el('select', { 'aria-label': 'Currency' });
      CURRENCIES.forEach((c) => sel.appendChild(new Option(c + ' \u2013 ' + CURRENCY_NAMES[c], c)));
      sel.value = Q.currency;
      sel.addEventListener('change', () => { Q.currency = sel.value; sym.textContent = SYMBOLS[Q.currency] || Q.currency; });
      focusEl = el('input', { id: 'q-in', class: 'q-in', type: 'text', inputmode: 'decimal', placeholder: '0.00', enterkeyhint: 'next', 'aria-label': 'Amount' });
      if (Q.amount !== null) focusEl.value = numFmt.format(Q.amount);
      body.appendChild(el('div', { class: 'q-amount' }, [el('span', { class: 'q-cur' }, [sym, sel]), focusEl]));
    } else if (Q.step === 'kind') {
      next.hidden = true;
      body.appendChild(el('div', { class: 'q-choices' }, [
        choice('\uD83D\uDCB8', 'Money out', () => { Q.kind = 'expense'; questAdvance(); }),
        choice('\uD83E\uDD11', 'Money in', () => { Q.kind = 'income'; questAdvance(); })
      ]));
    } else if (Q.step === 'card') {
      next.hidden = true;
      body.appendChild(el('div', { class: 'q-choices' }, [
        choice('\uD83D\uDCB3', 'Swiped it', () => { Q.card = true; questAdvance(); }),
        choice('\uD83D\uDCB5', 'Cold cash', () => { Q.card = false; questAdvance(); })
      ]));
    } else {
      focusEl = el('input', { id: 'q-in', class: 'q-in', type: 'text', maxlength: '40', placeholder: 'e.g. Visa 4521', autocapitalize: 'words', enterkeyhint: 'done', 'aria-label': 'Card name' });
      focusEl.value = Q.cardName;
      body.appendChild(focusEl);
    }
    body.appendChild(err);
    if (focusEl) {
      focusEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); questAdvance(); } });
      setTimeout(() => { try { focusEl.focus(); } catch (e) { } }, 350);
    }
  }

  function questError(msg) {
    const e = $('q-err');
    if (e) e.textContent = msg;
    const card = document.querySelector('.q-card');
    card.classList.remove('q-shake');
    card.getBoundingClientRect();
    card.classList.add('q-shake');
  }

  function questAdvance() {
    const input = $('q-in');
    if (Q.step === 'what') {
      const v = input.value.trim();
      if (!v) { questError('Come on, spill it \uD83D\uDE0F'); return; }
      Q.desc = v;
    } else if (Q.step === 'amount') {
      const n = parseAmount(input.value);
      if (n === null || n <= 0) { questError('A real number above zero, please \uD83E\uDD14'); return; }
      Q.amount = n;
    } else if (Q.step === 'cardname') {
      const v = input.value.trim();
      if (!v) { questError('Give the card a name \uD83C\uDFE6'); return; }
      Q.cardName = v;
    }
    const nxt = questAfter(Q.step);
    if (nxt === 'done') { finishQuest(); return; }
    Q.history.push(Q.step);
    Q.step = nxt;
    renderQuest();
    roll($('view-quest'));
  }

  function questBack() {
    if (!Q.history.length) return;
    Q.step = Q.history.pop();
    renderQuest();
  }

  async function finishQuest() {
    const now = Date.now();
    const income = Q.kind === 'income';
    const rec = {
      date: today(),
      shop: Q.desc,
      amount: Math.round(Q.amount * 100) / 100,
      currency: Q.currency,
      category: income ? FALLBACK_CATEGORY : ((Parser && Parser.parse(Q.desc).category) || FALLBACK_CATEGORY),
      note: '',
      kind: Q.kind,
      pay: !income && Q.card ? 'card' : 'cash',
      card: !income && Q.card ? Q.cardName.slice(0, 40) : '',
      thumb: '',
      rawText: '',
      createdAt: now,
      updatedAt: now
    };
    try {
      await DB.put(rec);
    } catch (err) {
      toast('Could not save. Storage may be full or blocked.', 4500);
      return;
    }
    requestPersist();
    Sfx.play('ok');
    await loadAll();
    show('home');
    setTimeout(() => rainCoins(income), 750);
    toast(income ? 'Money in. Nice one.' : 'Done. Your wallet has been informed.');
    limitAfterSave();
  }

  const dailyLimit = () => {
    const l = settings.get('dailyLimit', null);
    return l && typeof l.amount === 'number' && l.amount > 0 && CURRENCIES.indexOf(l.currency) >= 0 ? l : null;
  };
  const isCheat = () => settings.get('cheatDay', '') === today();
  function spentToday() {
    const l = dailyLimit();
    if (!l) return 0;
    return state.all.filter((r) => r.date === today() && !isInc(r) && r.currency === l.currency && typeof r.amount === 'number').reduce((a, r) => a + r.amount, 0);
  }
  const overLimit = () => { const l = dailyLimit(); return !!l && spentToday() > l.amount; };

  function renderLimit() {
    const l = dailyLimit();
    const sp = spentToday();
    const over = !!l && sp > l.amount;
    const cheat = isCheat();
    const alarm = over && !cheat;
    $('home-card').classList.toggle('over', alarm);
    $('btn-limit').classList.toggle('over', alarm);
    $('tg-cheat-wrap').hidden = !l;
    $('tg-cheat').setAttribute('aria-checked', String(cheat));
    $('home-limit').hidden = !l;
    const btn = $('btn-limit');
    btn.textContent = '';
    btn.appendChild(el('span', { text: 'Pocket Police, On Duty' }));
    if (l) btn.appendChild(el('span', { class: 'limit-sub', text: 'Limit ' + numFmt.format(l.amount) + ' ' + l.currency }));
    if (!l) return;
    $('lim-fill').style.width = Math.min(100, (sp / l.amount) * 100) + '%';
    $('lim-fill').classList.toggle('over', over);
    $('home-limit-text').textContent = over
      ? (cheat ? 'Cheat day is on. Limit paused, enjoy.' : 'Over the limit by ' + numFmt.format(sp - l.amount) + ' ' + l.currency + '. Flip Cheat day to stop the alarm.')
      : numFmt.format(l.amount - sp) + ' ' + l.currency + ' left of ' + numFmt.format(l.amount);
  }

  function openLimit() {
    const l = dailyLimit();
    const sel = $('ld-cur');
    if (!sel.options.length) CURRENCIES.forEach((c) => sel.appendChild(new Option(c + ' \u2013 ' + CURRENCY_NAMES[c], c)));
    sel.value = l ? l.currency : defaultCurrency();
    $('ld-sym').textContent = SYMBOLS[sel.value] || sel.value;
    $('ld-amount').value = l ? numFmt.format(l.amount) : '';
    $('ld-err').textContent = '';
    $('ld-remove').hidden = !l;
    $('limit-dialog').hidden = false;
    setTimeout(() => { try { $('ld-amount').focus(); } catch (e) { } }, 250);
  }
  function closeLimit() { $('limit-dialog').hidden = true; }
  function saveLimit() {
    const n = parseAmount($('ld-amount').value);
    if (n === null || n <= 0) { $('ld-err').textContent = 'Enter an amount above zero.'; return; }
    settings.set('dailyLimit', { amount: Math.round(n * 100) / 100, currency: $('ld-cur').value });
    closeLimit();
    renderHome();
    toast('Daily limit set');
    Sfx.play('ok');
  }
  function removeLimit() {
    settings.set('dailyLimit', null);
    settings.set('cheatDay', '');
    closeLimit();
    renderHome();
    toast('Limit removed');
  }
  function limitAfterSave() {
    if (overLimit() && !isCheat()) {
      Sfx.play('warn');
      setTimeout(() => toast('Whoa, easy there! Over your limit. Flip Cheat day to stop the alarm.', 5000), 1800);
    }
  }

  function greeting(h) {
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 21) return 'Good evening';
    if (h >= 21) return 'Good night';
    return 'Up late';
  }

  function renderHome() {
    const p = settings.get('profile', null);
    const now = new Date();
    const h = now.getHours();
    $('home-h').textContent = greeting(h) + (p && p.name ? ', ' + p.name : '');
    $('home-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    const rows = state.all.filter((r) => r.date === today()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    $('home-count').textContent = rows.length ? 'TODAY \u00b7 ' + rows.length + (rows.length === 1 ? ' ENTRY' : ' ENTRIES') : 'TODAY';
    const tb = $('home-totals');
    fillTotals(tb, sumsOf(rows), (n) => numFmt.format(n));
    if (!rows.length) tb.appendChild(el('p', { class: 'none', text: 'Nothing yet today.' }));
    renderLimit();
  }

  function applyTheme(t) {
    const light = t === 'light';
    if (light) document.documentElement.dataset.theme = 'light'; else document.documentElement.removeAttribute('data-theme');
    $('tg-theme').setAttribute('aria-checked', String(light));
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#0B0B0C');
  }

  function startView() {
    if (settings.get('profile', null)) { show('home'); return; }
    $('wel-form-wrap').hidden = false;
    $('wel-done').hidden = true;
    show('welcome');
  }

  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dShort = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  function buildSummary(kind) {
    const now = new Date();
    let start, end, title;
    if (kind === 'week') {
      const off = (now.getDay() + 6) % 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      title = "This week's bill summary";
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      title = "This month's full bill summary";
    }
    const a = ymd(start), b = ymd(end);
    const rows = state.all.filter((r) => r.date >= a && r.date <= b && typeof r.amount === 'number')
      .sort((x, y) => String(x.date).localeCompare(String(y.date)) || (x.createdAt || 0) - (y.createdAt || 0));
    const W = 42;
    const rule = '-'.repeat(W);
    const two = (l, r) => {
      l = String(l); r = String(r);
      const room = W - r.length - 1;
      if (l.length > room) l = l.slice(0, Math.max(1, room - 1)) + '.';
      return l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;
    };
    const money = (n, c) => numFmt.format(n) + ' ' + c;
    const prof = settings.get('profile', null);
    const lines = ['CHA-CHING', title, dShort(start) + ' - ' + dShort(end) + ' ' + end.getFullYear()];
    if (prof && prof.name) lines.push('Prepared for: ' + prof.name);
    lines.push(rule);
    if (!rows.length) {
      lines.push('No entries in this period.');
    } else {
      const sums = sumsOf(rows);
      const spentKeys = Object.keys(sums.spent).sort((x, y) => sums.spent[y] - sums.spent[x]);
      const earnedKeys = Object.keys(sums.earned).sort((x, y) => sums.earned[y] - sums.earned[x]);
      lines.push('TOTAL SPENT');
      if (!spentKeys.length) lines.push(two('-', '0.00'));
      spentKeys.forEach((c) => lines.push(two(c, numFmt.format(sums.spent[c]))));
      if (earnedKeys.length) {
        lines.push('TOTAL INCOME');
        earnedKeys.forEach((c) => lines.push(two(c, '+' + numFmt.format(sums.earned[c]))));
        lines.push('NET');
        Object.keys(Object.assign({}, sums.spent, sums.earned)).forEach((c) => {
          const n = (sums.earned[c] || 0) - (sums.spent[c] || 0);
          lines.push(two(c, (n >= 0 ? '+' : '-') + numFmt.format(Math.abs(n))));
        });
      }
      lines.push(two('Entries', rows.length));
      const exp = rows.filter((r) => !isInc(r));
      if (exp.length) {
        lines.push(rule, 'BY CATEGORY');
        const cats = {};
        exp.forEach((r) => { const k = (r.category || FALLBACK_CATEGORY) + '|' + r.currency; cats[k] = (cats[k] || 0) + r.amount; });
        Object.keys(cats).sort((x, y) => cats[y] - cats[x]).forEach((k) => { const p = k.split('|'); lines.push(two(p[0], money(cats[k], p[1]))); });
        lines.push(rule, 'PAID WITH');
        const pays = {};
        exp.forEach((r) => { const k = (r.pay === 'card' ? 'Card' : 'Cash') + '|' + r.currency; pays[k] = (pays[k] || 0) + r.amount; });
        Object.keys(pays).sort().forEach((k) => { const p = k.split('|'); lines.push(two(p[0], money(pays[k], p[1]))); });
      }
      lines.push(rule, 'ENTRIES');
      rows.forEach((r) => lines.push(two(fmtShort(r.date) + '  ' + (r.shop || 'Unnamed shop') + (payTag(r) ? ' (' + payTag(r) + ')' : ''), (isInc(r) ? '+' : '') + money(r.amount, r.currency))));
    }
    lines.push(rule, 'Generated ' + new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }));
    const name = 'cha-ching-' + (kind === 'week' ? 'week-' + a : 'month-' + a.slice(0, 7)) + '.pdf';
    return { title, lines, text: lines.join('\n'), name };
  }

  function makePdf(lines) {
    const esc = (s) => String(s).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
    const per = 52;
    const pages = [];
    for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
    if (!pages.length) pages.push(['']);
    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = '<< /Type /Pages /Kids [' + pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
    pages.forEach((p, i) => {
      const pn = 4 + i * 2, cn = pn + 1;
      let s = 'BT /F1 11 Tf 14 TL 50 790 Td\n';
      p.forEach((l) => { s += '(' + esc(l) + ') Tj T*\n'; });
      s += 'ET';
      objs[pn] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + cn + ' 0 R >>';
      objs[cn] = '<< /Length ' + s.length + ' >>\nstream\n' + s + '\nendstream';
    });
    let out = '%PDF-1.4\n';
    const off = [];
    for (let n = 1; n < objs.length; n++) { off[n] = out.length; out += n + ' 0 obj\n' + objs[n] + '\nendobj\n'; }
    const xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (let n = 1; n < objs.length; n++) out += String(off[n]).padStart(10, '0') + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { }
    const ta = el('textarea', { 'aria-hidden': 'true' });
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { }
    ta.remove();
    return ok;
  }

  function openSummary(kind) {
    state.summary = buildSummary(kind);
    $('sum-h').textContent = state.summary.title;
    $('sum-text').textContent = state.summary.text;
    show('summary', 'expenses');
  }

  function setPostmark() {
    const d = new Date();
    $('pm-mon').textContent = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    $('pm-day').textContent = String(d.getDate());
  }

  function setProgress(pct, text) {
    const p = Math.max(state.lastPct, Math.min(100, Math.round(pct)));
    state.lastPct = p;
    $('progress-fill').style.width = p + '%';
    $('progress-bar').setAttribute('aria-valuenow', String(p));
    $('progress-text').textContent = text;
  }

  const LOAD_STAGES = {
    'loading tesseract core': [6, 12],
    'initializing tesseract': [18, 2],
    'initialized tesseract': [20, 0],
    'loading language traineddata': [20, 8],
    'loaded language traineddata': [28, 0],
    'initializing api': [28, 2],
    'initialized api': [30, 0]
  };

  function onOcrProgress(m) {
    const p = typeof m.progress === 'number' ? m.progress : 0;
    if (m.status === 'recognizing text') {
      setProgress(30 + p * 70, 'Reading receipt ' + Math.round(p * 100) + '%');
    } else {
      const stage = LOAD_STAGES[m.status] || [6, 0];
      setProgress(stage[0] + p * stage[1], 'Loading reader\u2026');
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (state.busy) { toast('Still reading the last photo\u2026'); return; }
    if (file.type && !/^image\//.test(file.type)) { toast('Please choose an image file.'); return; }
    state.busy = true;
    resetScan();
    show('scan');
    setPreview(URL.createObjectURL(file), true);
    state.lastPct = 0;
    setMode('reading');
    setProgress(2, 'Preparing photo\u2026');
    let prepared;
    try {
      prepared = await OCR.prepare(file);
    } catch (e) {
      state.busy = false;
      resetScan();
      toast('Could not open that image. Try a JPEG or PNG photo.', 4500);
      return;
    }
    setProgress(5, 'Loading reader\u2026');
    let text = '';
    let failed = false;
    try {
      text = await OCR.recognize(prepared.canvas, onOcrProgress);
    } catch (e) {
      console.warn('OCR failed', e);
      failed = true;
    }
    OCR.release(prepared.canvas);
    let parsed = failed ? {} : safeParse(text);
    if (!failed && foundCount(parsed) < 3) {
      setProgress(96, 'Taking a second look\u2026');
      try {
        OCR.configure({ mode: 'v2', psm: '6' });
        const p2 = await OCR.prepare(file);
        const t2 = await OCR.recognize(p2.canvas, () => {});
        OCR.release(p2.canvas);
        const parsed2 = safeParse(t2);
        const second = foundCount(parsed2) > foundCount(parsed);
        const best = second ? parsed2 : parsed;
        const other = second ? parsed : parsed2;
        const merged = Object.assign({}, best);
        if (!isYMD(merged.date) && isYMD(other.date)) merged.date = other.date;
        if (!merged.shop && other.shop) merged.shop = other.shop;
        if (typeof merged.amount !== 'number' && typeof other.amount === 'number') merged.amount = other.amount;
        parsed = merged;
        if (second) text = t2;
      } catch (e) { console.warn('Second pass failed', e); }
      OCR.configure({ mode: 'v2bin', psm: '6' });
    }
    state.busy = false;
    openForm(Object.assign({}, parsed, { thumb: prepared.thumb, rawText: text }), 'scan', null, failed);
  }

  const foundCount = (d) => [isYMD(d.date), !!d.shop, typeof d.amount === 'number'].filter(Boolean).length;

  function scanHint(d, failed) {
    if (failed) return 'The text reader could not run. The first scan needs an internet connection to download it. You can still fill in the details by hand.';
    if (!String(d.rawText || '').trim()) return 'No text was found. Try a sharper photo in good light, or fill in the details by hand.';
    const found = [isYMD(d.date), !!d.shop, typeof d.amount === 'number'].filter(Boolean).length;
    if (!found) return 'Could not pick out the details. Fill them in by hand, or open the scanned text below.';
    if (found < 3) return 'Some details were not read. Fill in the fields marked NOT READ before adding.';
    return 'Tap the shop, amount or date to correct it.';
  }

  let formKind = 'expense', formPay = 'cash';
  function setKind(k) {
    formKind = k;
    $('k-exp').setAttribute('aria-pressed', String(k === 'expense'));
    $('k-inc').setAttribute('aria-pressed', String(k === 'income'));
    $('pay-wrap').hidden = k === 'income';
    if (state.mode === 'review') renderSheet();
  }
  function setPay(p, name) {
    formPay = p;
    $('p-cash').setAttribute('aria-pressed', String(p === 'cash'));
    $('p-card').setAttribute('aria-pressed', String(p === 'card'));
    $('f-card').hidden = p !== 'card';
    if (name !== undefined) $('f-card').value = name;
  }

  function openForm(d, mode, record, failed) {
    d = d || {};
    state.editing = record || null;
    state.draft = { thumb: isImgData(d.thumb) ? d.thumb : '', rawText: typeof d.rawText === 'string' ? d.rawText : '' };
    const hasDate = isYMD(d.date);
    const hasAmount = typeof d.amount === 'number' && isFinite(d.amount);
    $('f-date').value = hasDate ? d.date : mode === 'manual' ? today() : '';
    $('f-shop').value = d.shop || '';
    $('f-amount').value = hasAmount ? numFmt.format(d.amount) : '';
    $('f-currency').value = pickCurrency(d, mode);
    $('f-category').value = CATEGORIES.indexOf(d.category) >= 0 ? d.category : FALLBACK_CATEGORY;
    $('f-note').value = d.note || '';
    setKind(d.kind === 'income' ? 'income' : 'expense');
    setPay(d.pay === 'card' ? 'card' : 'cash', d.card || '');
    $('raw-text').textContent = state.draft.rawText;
    $('raw').hidden = !state.draft.rawText.trim();
    $('more').open = false;
    $('form-title').textContent = mode === 'edit' ? 'Edit entry' : mode === 'manual' ? 'New entry' : 'Check the details';
    const hint = mode === 'scan' ? scanHint(d, failed) : '';
    $('form-hint').textContent = hint;
    $('form-hint').hidden = !hint;
    ['shop', 'amount', 'date'].forEach((n) => setUnread(n, false));
    state.hintFlagged = false;
    if (mode === 'scan') {
      setUnread('shop', !d.shop); setUnread('amount', !hasAmount); setUnread('date', !hasDate);
      state.hintFlagged = !!document.querySelector('#form .fld.unread');
    }
    $('btn-delete').hidden = mode !== 'edit';
    $('btn-discard').textContent = mode === 'edit' ? 'Cancel' : mode === 'manual' ? 'Back' : 'Nope, again';
    $('btn-save').textContent = mode === 'edit' ? 'Done tweaking' : 'Lock it in';
    setMode('review');
    if (mode === 'manual') $('f-shop').focus();
  }

  async function onSave(e) {
    e.preventDefault();
    const date = $('f-date').value;
    const amount = parseAmount($('f-amount').value);
    if (amount === null) { toast('Enter the amount first.'); setUnread('amount', true); $('f-amount').focus(); return; }
    if (!isYMD(date)) { toast('Set the date first.'); setUnread('date', true); $('f-date').focus(); return; }
    const now = Date.now();
    const wasEditing = !!state.editing;
    const rec = Object.assign({}, state.editing || { createdAt: now }, {
      date,
      shop: $('f-shop').value.trim(),
      amount,
      currency: $('f-currency').value,
      category: $('f-category').value,
      note: $('f-note').value.trim(),
      kind: formKind,
      pay: formKind === 'income' ? 'cash' : formPay,
      card: formKind !== 'income' && formPay === 'card' ? $('f-card').value.trim().slice(0, 40) : '',
      thumb: state.draft ? state.draft.thumb : '',
      rawText: state.draft ? state.draft.rawText : '',
      updatedAt: now
    });
    if (rec.id == null) delete rec.id;
    $('btn-save').disabled = true;
    try {
      await DB.put(rec);
    } catch (err) {
      toast('Could not save. Storage may be full or blocked.', 4500);
      return;
    } finally {
      $('btn-save').disabled = false;
    }
    requestPersist();
    Sfx.play('ok');
    await loadAll();
    if (state.filter !== 'all' && state.filter !== date.slice(0, 7)) { state.filter = date.slice(0, 7); settings.set('filter', state.filter); }
    resetScan();
    if (wasEditing) { show('expenses'); toast('Changes saved'); }
    else { toast(formKind === 'income' ? 'Money in. Nice one.' : 'Done. Your wallet has been informed.'); limitAfterSave(); setTimeout(() => rainCoins(formKind === 'income'), 750); }
  }

  function onDiscard() {
    const wasEditing = !!state.editing;
    resetScan();
    if (wasEditing) show('expenses');
  }

  async function onDelete() {
    if (!state.editing) return;
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try { await DB.remove(state.editing.id); } catch (e) { toast('Could not delete that expense.'); return; }
    await loadAll();
    resetScan();
    show('expenses');
    toast('Expense deleted');
  }

  function editRecord(r) {
    if (state.busy) { toast('Wait for the scan to finish first.'); return; }
    show('scan', 'expenses');
    openForm(r, 'edit', r);
  }

  function monthsWithData() {
    const set = {};
    state.all.forEach((r) => { const m = String(r.date || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) set[m] = true; });
    return Object.keys(set).sort().reverse();
  }

  function filtered() {
    return state.filter === 'all' ? state.all : state.all.filter((r) => String(r.date || '').slice(0, 7) === state.filter);
  }

  function renderRow(r) {
    let thumb;
    if (isImgData(r.thumb)) {
      thumb = el('img', { class: 'thumb', alt: '', loading: 'lazy', decoding: 'async' });
      thumb.src = r.thumb;
    } else {
      thumb = el('span', { class: 'thumb' }, [icon('receipt')]);
    }
    const shop = r.shop || 'Unnamed shop';
    const amount = typeof r.amount === 'number' ? numFmt.format(r.amount) : '-';
    const btn = el('button', { type: 'button', class: 'item', 'aria-label': shop + ', ' + fmtDate(r.date) + ', ' + (r.currency || '') + ' ' + amount + '. Edit' }, [
      thumb,
      el('span', { class: 'item-main' }, [
        el('span', { class: 'item-shop', text: shop }),
        el('span', { class: 'item-meta', text: fmtDate(r.date) + ' \u00b7 ' + (isInc(r) ? 'Income' : (r.category || FALLBACK_CATEGORY)) + (payTag(r) ? ' \u00b7 ' + payTag(r) : '') })
      ]),
      el('span', { class: 'item-amt' }, [
        el('span', { class: isInc(r) ? 'in' : '', text: (isInc(r) ? '+' : '') + amount }),
        el('span', { class: 'item-cur', text: r.currency || '' })
      ])
    ]);
    btn.addEventListener('click', () => editRecord(r));
    return el('li', null, [btn]);
  }

  function renderExpenses() {
    const months = monthsWithData();
    if (state.filter !== 'all' && months.indexOf(state.filter) < 0) state.filter = 'all';
    const sel = $('month');
    sel.textContent = '';
    sel.appendChild(new Option('All months', 'all'));
    months.forEach((m) => sel.appendChild(new Option(fmtMonth(m), m)));
    sel.value = state.filter;

    const empty = state.all.length === 0;
    $('empty').hidden = !empty;
    $('summary').hidden = empty;
    $('sum-grid').hidden = empty;
    $('month-wrap').hidden = empty;

    const rows = filtered();
    $('summary-count').textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries') + (state.filter === 'all' ? ' in total' : ' in ' + fmtMonth(state.filter));
    fillTotals($('totals'), sumsOf(rows), (n) => numFmt.format(n));

    const list = $('list');
    const frag = document.createDocumentFragment();
    rows.forEach((r) => frag.appendChild(renderRow(r)));
    list.textContent = '';
    list.appendChild(frag);
  }

  function renderSettings() {
    $('s-currency').value = defaultCurrency();
    const label = state.filter === 'all' ? 'Current filter (all months)' : 'Current filter (' + fmtMonth(state.filter) + ')';
    $('export-scope').options[0].textContent = label + ' \u00b7 ' + filtered().length;
    $('export-scope').options[1].textContent = 'All expenses \u00b7 ' + state.all.length;
    const prof = settings.get('profile', null);
    $('profile-card').hidden = !prof;
    if (prof) $('profile-text').textContent = 'Signed in on this phone as ' + (prof.name ? prof.name + ', ' : '') + prof.phone + '. Nothing is sent anywhere.';
    renderInstall();
  }

  function renderInstall() {
    const iosHint = isIOSSafari && !isStandalone();
    const canPrompt = !!state.installPrompt && !isStandalone();
    $('ios-hint').hidden = !iosHint;
    $('btn-install').hidden = !canPrompt;
    $('install-card').hidden = !iosHint && !canPrompt;
  }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows) {
    const lines = ['Date,Type,Description,Amount,Currency,Category,Paid with,Card,Note'];
    rows.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).forEach((r) => {
      const amount = typeof r.amount === 'number' && isFinite(r.amount) ? r.amount.toFixed(2) : '';
      lines.push([csvCell(r.date), isInc(r) ? 'Income' : 'Expense', csvCell(r.shop), amount, csvCell(r.currency), csvCell(isInc(r) ? '' : r.category), isInc(r) ? '' : (r.pay === 'card' ? 'Card' : 'Cash'), csvCell(r.pay === 'card' ? r.card : ''), csvCell(r.note)].join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  async function saveFile(content, name, type) {
    const blob = new Blob([content], { type });
    if (isIOS && navigator.canShare && navigator.share && typeof File === 'function') {
      try {
        const file = new File([blob], name, { type });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  function exportCSV() {
    const rows = $('export-scope').value === 'all' ? state.all : filtered();
    if (!rows.length) { toast('Nothing to export yet.'); return; }
    saveFile(toCSV(rows), 'expenses-' + today() + '.csv', 'text/csv');
  }

  function exportBackup() {
    if (!state.all.length) { toast('Nothing to back up yet.'); return; }
    const expenses = state.all.map((r) => { const c = Object.assign({}, r); delete c.id; return c; });
    const data = { app: 'receipt-snap', version: 1, exportedAt: new Date().toISOString(), expenses };
    saveFile(JSON.stringify(data), 'cha-ching-backup-' + today() + '.json', 'application/json');
  }

  function readText(file) {
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file);
    });
  }

  function sanitize(r) {
    if (!r || typeof r !== 'object') return null;
    const amount = typeof r.amount === 'number' ? r.amount : parseAmount(r.amount);
    if (!isYMD(r.date) || amount === null || !isFinite(amount)) return null;
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    const now = Date.now();
    return {
      date: r.date,
      shop: str(r.shop, 120),
      amount: Math.round(amount * 100) / 100,
      currency: CURRENCIES.indexOf(r.currency) >= 0 ? r.currency : defaultCurrency(),
      category: CATEGORIES.indexOf(r.category) >= 0 ? r.category : FALLBACK_CATEGORY,
      note: str(r.note, 500),
      kind: r.kind === 'income' ? 'income' : 'expense',
      pay: r.pay === 'card' ? 'card' : 'cash',
      card: str(r.card, 40),
      thumb: isImgData(r.thumb) && r.thumb.length < 400000 ? r.thumb : '',
      rawText: str(r.rawText, 20000),
      createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
      updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : now
    };
  }

  const recordKey = (r) => [r.date, r.shop, r.amount, r.currency, r.createdAt].join('|');

  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await readText(file)); } catch (e) { toast('That file is not a valid backup.'); return; }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.expenses) ? data.expenses : null;
    if (!list) { toast('That file is not a valid backup.'); return; }
    const seen = {};
    state.all.forEach((r) => { seen[recordKey(r)] = true; });
    const fresh = list.map(sanitize).filter((r) => {
      if (!r) return false;
      const k = recordKey(r);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    if (!fresh.length) { toast('No new expenses found in that backup.'); return; }
    if (!window.confirm('Import ' + fresh.length + (fresh.length === 1 ? ' expense' : ' expenses') + '? They will be added to what is already here.')) return;
    try { await DB.addMany(fresh); } catch (e) { toast('Import failed. Storage may be full.'); return; }
    requestPersist();
    await loadAll();
    renderSettings();
    toast('Imported ' + fresh.length + (fresh.length === 1 ? ' expense' : ' expenses'));
  }

  async function clearAll() {
    if (!state.all.length) { toast('There is nothing to clear.'); return; }
    if (!window.confirm('Delete all ' + state.all.length + ' expenses from this device? Export a backup first if you might need them.')) return;
    try { await DB.clear(); } catch (e) { toast('Could not clear the data.'); return; }
    state.filter = 'all';
    settings.set('filter', 'all');
    await loadAll();
    renderSettings();
    toast('All data cleared');
  }

  const hasFiles = (e) => !!e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
  const firstImage = (files) => Array.prototype.find.call(files || [], (f) => /^image\//.test(f.type));

  function bindDragDrop() {
    let depth = 0;
    const overlay = $('drop');
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.hidden = false; });
    document.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      const f = firstImage(e.dataTransfer.files);
      if (f) handleFile(f); else toast('Drop an image file to scan it.');
    });
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const f = e.clipboardData && firstImage(e.clipboardData.files);
      if (f) { e.preventDefault(); handleFile(f); }
    });
  }

  function bindInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.installPrompt = e;
      renderInstall();
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      renderInstall();
      toast('Cha-Ching installed');
    });
    $('btn-install').addEventListener('click', async () => {
      const p = state.installPrompt;
      if (!p) return;
      state.installPrompt = null;
      try { p.prompt(); await p.userChoice; } catch (e) { }
      renderInstall();
    });
  }

  function init() {
    fillSelect($('f-currency'), CURRENCIES);
    fillSelect($('s-currency'), CURRENCIES, (c) => c + ' \u2013 ' + CURRENCY_NAMES[c]);
    fillSelect($('f-category'), CATEGORIES);
    $('s-currency').value = defaultCurrency();

    ['file-camera', 'file-upload'].forEach((id) => {
      $(id).addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (f) handleFile(f);
      });
    });
    $('file-import').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importBackup(f);
    });

    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.view;
      if (v === 'scan' && state.editing) resetScan();
      show(v);
    }));

    $('btn-manual').addEventListener('click', () => openForm({}, 'manual'));
    $('btn-first').addEventListener('click', () => { resetScan(); show('scan'); });
    $('form').addEventListener('submit', onSave);
    $('btn-discard').addEventListener('click', onDiscard);
    $('btn-delete').addEventListener('click', onDelete);
    $('month').addEventListener('change', (e) => { state.filter = e.target.value; settings.set('filter', state.filter); renderExpenses(); roll($('list')); });
    $('s-currency').addEventListener('change', (e) => { settings.set('currency', e.target.value); toast('Default currency set to ' + e.target.value); });
    $('btn-csv').addEventListener('click', exportCSV);
    $('btn-backup').addEventListener('click', exportBackup);
    $('btn-clear').addEventListener('click', clearAll);

    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.btn, .btn-link, .tab, .item, .shutter, .dots, .menu button');
      if (!b) return;
      replay(b.classList.contains('tab') ? b.querySelector('.ic') : b, 'pop');
      if (b.id === 'btn-save') return;
      Sfx.play((b.classList.contains('shutter') || b.id === 'btn-home-scan' || b.id === 'btn-first') ? 'shutter' : b.classList.contains('tab') ? 'tab' : b.classList.contains('btn-primary') ? 'primary' : 'tap');
    });
    const applySound = () => {
      const on = settings.get('sound', true);
      $('tg-sound').setAttribute('aria-checked', String(on));
    };
    $('tg-sound').addEventListener('click', () => { settings.set('sound', !settings.get('sound', true)); applySound(); });
    applySound();

    $('btn-snap').addEventListener('click', onSnap);
    $('btn-sheet').addEventListener('click', () => show('expenses'));
    $('f-shop').addEventListener('input', () => {
      const t = $('f-shop');
      if (/[\r\n]/.test(t.value)) t.value = t.value.replace(/[\r\n]+/g, ' ');
      setUnread('shop', false);
      autogrow();
      renderSheet();
    });
    $('f-shop').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('f-amount').focus(); } });
    $('f-amount').addEventListener('input', () => { setUnread('amount', false); fitAmount(); renderSheet(); });
    $('f-amount').addEventListener('blur', () => {
      const n = parseAmount($('f-amount').value);
      if (n !== null) { $('f-amount').value = numFmt.format(n); fitAmount(); }
    });
    $('f-amount').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('f-amount').blur(); } });
    $('f-currency').addEventListener('change', () => { updateSym(); fitAmount(); renderSheet(); });
    $('f-category').addEventListener('change', updateSeal);
    ['input', 'change'].forEach((ev) => $('f-date').addEventListener(ev, () => { setUnread('date', false); updateDateText(); updateSeal(); renderSheet(); }));
    $('f-date').addEventListener('click', () => { try { if ($('f-date').showPicker) $('f-date').showPicker(); } catch (err) { } });
    window.addEventListener('resize', () => { if (state.mode === 'review') { autogrow(); fitAmount(); fitSeal(); } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state.mode === 'review') refreshReview(); });
    window.addEventListener('camstate', updateCaption);
    ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, Sfx.unlock, { capture: true, passive: true }));
    $('cam-allow').addEventListener('click', async () => {
      await Cam.retry();
      if (Cam.state() !== 'on') toast(camHelp(), 6000);
    });
    document.addEventListener('visibilitychange', () => { setPostmark(); syncCam(); if (!document.hidden && document.body.dataset.screen === 'home') renderHome(); });
    setInterval(() => { if (!document.hidden && document.body.dataset.screen === 'home') renderHome(); }, 60000);

    $('btn-home-scan').addEventListener('click', () => { resetScan(); show('scan'); });
    $('menu-btn').addEventListener('click', (e) => { e.stopPropagation(); setMenu(!$('menu').classList.contains('open')); });
    $('menu-settings').addEventListener('click', () => { setMenu(false); show('settings', 'home'); });
    $('menu-invite').addEventListener('click', () => { setMenu(false); inviteFriend(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#menu-wrap')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    $('btn-add').addEventListener('click', openQuest);
    $('btn-limit').addEventListener('click', openLimit);
    $('ld-save').addEventListener('click', saveLimit);
    $('ld-cancel').addEventListener('click', closeLimit);
    $('ld-remove').addEventListener('click', removeLimit);
    $('ld-amount').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveLimit(); } });
    $('ld-cur').addEventListener('change', () => { $('ld-sym').textContent = SYMBOLS[$('ld-cur').value] || $('ld-cur').value; });
    $('limit-dialog').addEventListener('click', (e) => { if (e.target === $('limit-dialog')) closeLimit(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('limit-dialog').hidden) closeLimit(); });
    $('tg-cheat').addEventListener('click', () => {
      const on = !isCheat();
      settings.set('cheatDay', on ? today() : '');
      renderHome();
      toast(on ? 'Cheat day on. No judgement.' : 'Cheat day off.');
    });
    $('q-next').addEventListener('click', questAdvance);
    $('q-back').addEventListener('click', questBack);
    $('q-cancel').addEventListener('click', () => show('home'));
    $('k-exp').addEventListener('click', () => setKind('expense'));
    $('k-inc').addEventListener('click', () => setKind('income'));
    $('p-cash').addEventListener('click', () => setPay('cash'));
    $('p-card').addEventListener('click', () => { setPay('card'); if (!$('f-card').value) $('f-card').focus(); });
    $('tg-theme').addEventListener('click', () => { const next = settings.get('theme', 'dark') === 'light' ? 'dark' : 'light'; settings.set('theme', next); applyTheme(next); });
    applyTheme(settings.get('theme', 'dark'));
    $('welcome-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('w-name').value.trim().slice(0, 40);
      const phone = $('w-phone').value.trim();
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) { toast('Enter a valid phone number.'); $('w-phone').focus(); return; }
      settings.set('profile', { name, phone });
      $('wel-name').textContent = 'Welcome, ' + (name || 'friend');
      $('wel-form-wrap').hidden = true;
      $('wel-done').hidden = false;
      roll($('view-welcome'));
    });
    $('btn-start').addEventListener('click', () => show('home'));
    $('btn-signout').addEventListener('click', () => {
      if (!window.confirm('Remove your name and phone number from this phone? Your expenses stay.')) return;
      settings.set('profile', null);
      $('welcome-form').reset();
      startView();
    });
    $('btn-sum-week').addEventListener('click', () => openSummary('week'));
    $('btn-sum-month').addEventListener('click', () => openSummary('month'));
    $('btn-sum-back').addEventListener('click', () => show('expenses'));
    const openSheet = () => show('expenses');
    $('home-card').addEventListener('click', openSheet);
    $('home-card').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(); } });
    $('btn-sum-copy').addEventListener('click', async () => {
      if (!state.summary) return;
      toast((await copyText(state.summary.text)) ? 'Summary copied to clipboard' : 'Could not copy. Select the text and copy it.');
    });
    $('btn-sum-pdf').addEventListener('click', () => {
      if (!state.summary) return;
      saveFile(makePdf(state.summary.lines), state.summary.name, 'application/pdf');
      toast('PDF ready');
    });
    setPostmark();
    updateCaption();
    startView();

    bindDragDrop();
    bindInstall();
    if (!Parser) console.warn('ReceiptParser not found; fields will not be pre-filled.');
    loadAll().then(() => { renderSettings(); if (!$('view-home').hidden) renderHome(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e)); });
    }
  }

  init();
})();
