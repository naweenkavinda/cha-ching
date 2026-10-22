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
    let ctx = null;
    const NOTES = {
      tap: [[880, 0, .16, .1], [1318, .04, .2, .06]],
      tab: [[784, 0, .14, .09], [1175, .05, .18, .05]],
      primary: [[659, 0, .2, .1], [880, .07, .22, .09], [1318, .14, .3, .08]],
      snap: [[1046, 0, .1, .1], [1568, .05, .18, .08]],
      ok: [[523, 0, .22, .1], [659, .09, .22, .09], [784, .18, .24, .09], [1046, .27, .4, .09]]
    };
    function play(kind) {
      if (!settings.get('sound', true) || !NOTES[kind]) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        NOTES[kind].forEach((n) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = n[0];
          g.gain.setValueAtTime(0.0001, t0 + n[1]);
          g.gain.exponentialRampToValueAtTime(n[3], t0 + n[1] + .012);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t0 + n[1]);
          o.stop(t0 + n[1] + n[2] + .05);
        });
      } catch (e) { }
    }
    return { play };
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

  const VIEWS = ['welcome', 'home', 'scan', 'expenses', 'settings'];
  const ROLL_SEL = '.stamp, .notice, .caption, .controls, .actions, .sheet-row, .view-head, .sec, .progress, .home-h, #home-date, .theme-row, .home-actions, .list > li, .empty';
  const SYMBOLS = { LKR: 'Rs', USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', SGD: 'S$', AED: 'AED' };
  const ymdDate = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const fmtLong = (s) => (isYMD(s) ? ymdDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const fmtSeal = (s) => (isYMD(s) ? ymdDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : 'NO DATE');
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
    setTimeout(() => wrap.remove(), 1000);
  }

  function show(view, tab) {
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

  function updateCaption() {
    const s = Cam.state();
    $('cam-caption').textContent = s === 'on' ? 'Keep the receipt inside the stamp.' : s === 'idle' ? 'Tap SNAP to turn on the camera.' : 'Camera is off. SNAP opens your camera app.';
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
    const rows = saved.concat([{ date: $('f-date').value, shop: $('f-shop').value.trim(), amount: amt, currency: cur }]);
    box.textContent = '';
    rows.forEach((r, i) => {
      const num = typeof r.amount === 'number' && isFinite(r.amount) ? numFmt.format(r.amount) + (r.currency && r.currency !== cur ? ' ' + r.currency : '') : '—';
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

  function renderHome() {
    const p = settings.get('profile', null);
    const now = new Date();
    const h = now.getHours();
    $('home-h').textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (p && p.name ? ', ' + p.name : '');
    $('home-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    const rows = state.all.filter((r) => r.date === today()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const totals = {};
    rows.forEach((r) => { if (typeof r.amount === 'number' && isFinite(r.amount)) totals[r.currency] = (totals[r.currency] || 0) + r.amount; });
    $('home-count').textContent = rows.length ? 'TODAY \u00b7 ' + rows.length + (rows.length === 1 ? ' ENTRY' : ' ENTRIES') : 'TODAY';
    const tb = $('home-totals');
    tb.textContent = '';
    if (!rows.length) tb.appendChild(el('p', { class: 'none', text: 'Nothing spent yet today.' }));
    Object.keys(totals).sort((a, b) => totals[b] - totals[a]).forEach((c) => {
      tb.appendChild(el('div', { class: 'total' }, [el('span', { class: 'total-cur', text: c }), el('span', { class: 'total-amt', text: numFmt.format(totals[c]) })]));
    });
    $('home-rows-lbl').hidden = !rows.length;
    const box = $('home-rows');
    box.textContent = '';
    rows.slice(0, 5).forEach((r) => {
      box.appendChild(el('div', { class: 'sheet-row two' }, [
        el('span', { text: (r.shop || 'Unnamed shop') + ' \u00b7 ' + (r.category || FALLBACK_CATEGORY) }),
        el('span', { class: 'amt', text: typeof r.amount === 'number' ? numFmt.format(r.amount) + ' ' + (r.currency || '') : '\u2014' })
      ]));
    });
  }

  function applyTheme(t) {
    const light = t === 'light';
    if (light) document.documentElement.dataset.theme = 'light'; else document.documentElement.removeAttribute('data-theme');
    $('th-dark').setAttribute('aria-pressed', String(!light));
    $('th-light').setAttribute('aria-pressed', String(light));
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#0B0B0C');
  }

  function startView() {
    if (settings.get('profile', null)) { show('home'); return; }
    $('wel-form-wrap').hidden = false;
    $('wel-done').hidden = true;
    show('welcome');
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
    state.busy = false;
    const parsed = failed ? {} : safeParse(text);
    openForm(Object.assign({}, parsed, { thumb: prepared.thumb, rawText: text }), 'scan', null, failed);
  }

  function scanHint(d, failed) {
    if (failed) return 'The text reader could not run. The first scan needs an internet connection to download it. You can still fill in the details by hand.';
    if (!String(d.rawText || '').trim()) return 'No text was found. Try a sharper photo in good light, or fill in the details by hand.';
    const found = [isYMD(d.date), !!d.shop, typeof d.amount === 'number'].filter(Boolean).length;
    if (!found) return 'Could not pick out the details. Fill them in by hand, or open the scanned text below.';
    if (found < 3) return 'Some details were not read. Fill in the fields marked NOT READ before adding.';
    return 'Tap the shop, amount or date to correct it.';
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
    $('raw-text').textContent = state.draft.rawText;
    $('raw').hidden = !state.draft.rawText.trim();
    $('more').open = false;
    $('form-title').textContent = mode === 'edit' ? 'Edit expense' : mode === 'manual' ? 'New expense' : 'Check the details';
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
    $('btn-discard').textContent = mode === 'edit' ? 'Cancel' : mode === 'manual' ? 'Back' : 'Retake';
    $('btn-save').textContent = mode === 'edit' ? 'Save changes' : 'Add to sheet';
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
    else toast('Added to sheet · entry ' + state.all.length);
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
        el('span', { class: 'item-meta', text: fmtDate(r.date) + ' \u00b7 ' + (r.category || FALLBACK_CATEGORY) })
      ]),
      el('span', { class: 'item-amt' }, [
        el('span', { text: amount }),
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
    $('month-wrap').hidden = empty;

    const rows = filtered();
    const totals = {};
    rows.forEach((r) => { if (typeof r.amount === 'number' && isFinite(r.amount)) totals[r.currency] = (totals[r.currency] || 0) + r.amount; });
    $('summary-count').textContent = rows.length + (rows.length === 1 ? ' expense' : ' expenses') + (state.filter === 'all' ? ' in total' : ' in ' + fmtMonth(state.filter));
    const tbox = $('totals');
    tbox.textContent = '';
    Object.keys(totals).sort((a, b) => totals[b] - totals[a]).forEach((c) => {
      tbox.appendChild(el('div', { class: 'total' }, [
        el('span', { class: 'total-cur', text: c }),
        el('span', { class: 'total-amt', text: numFmt.format(totals[c]) })
      ]));
    });

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
    const lines = ['Date,Shop,Amount,Currency,Category,Note'];
    rows.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).forEach((r) => {
      const amount = typeof r.amount === 'number' && isFinite(r.amount) ? r.amount.toFixed(2) : '';
      lines.push([csvCell(r.date), csvCell(r.shop), amount, csvCell(r.currency), csvCell(r.category), csvCell(r.note)].join(','));
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
    saveFile(JSON.stringify(data), 'receipt-snap-backup-' + today() + '.json', 'application/json');
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
      toast('Receipt Snap installed');
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
      const b = e.target.closest && e.target.closest('.btn, .btn-link, .tab, .item, .shutter');
      if (!b) return;
      replay(b.classList.contains('tab') ? b.querySelector('.ic') : b, 'pop');
      if (b.id === 'btn-save') return;
      Sfx.play(b.classList.contains('shutter') ? 'snap' : b.classList.contains('tab') ? 'tab' : b.classList.contains('btn-primary') ? 'primary' : 'tap');
    });
    const applySound = () => {
      const on = settings.get('sound', true);
      $('snd-on').setAttribute('aria-pressed', String(on));
      $('snd-off').setAttribute('aria-pressed', String(!on));
    };
    $('snd-on').addEventListener('click', () => { settings.set('sound', true); applySound(); });
    $('snd-off').addEventListener('click', () => { settings.set('sound', false); applySound(); });
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
    document.addEventListener('visibilitychange', () => { setPostmark(); syncCam(); });
    const msg = 'Hi! I use Receipt Snap to keep track of my expenses. Snap a receipt and the sheet fills itself in. It is free and works on your phone: ' + APP_URL;
    $('btn-invite').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    $('btn-home-scan').addEventListener('click', () => { resetScan(); show('scan'); });
    $('th-dark').addEventListener('click', () => { settings.set('theme', 'dark'); applyTheme('dark'); });
    $('th-light').addEventListener('click', () => { settings.set('theme', 'light'); applyTheme('light'); });
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
