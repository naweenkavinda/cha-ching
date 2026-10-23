const Float = (() => {
  'use strict';
  const SIZE = 56, R = SIZE / 2, M = 8, TB = 64;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const bodies = [];
  let active = () => true;
  let last = 0, started = false;
  let tilt = null, base = null, haveSensor = false, gx = 0, gy = 0, lastKick = 0, listening = false;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function bounds() {
    return { x0: M, y0: M, x1: window.innerWidth - SIZE - M, y1: window.innerHeight - TB - SIZE - M };
  }

  function pickTarget(b) {
    const bd = bounds();
    b.tx = bd.x0 + Math.random() * Math.max(1, bd.x1 - bd.x0);
    b.ty = bd.y0 + Math.random() * Math.max(1, bd.y1 - bd.y0);
  }

  function put(b) {
    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';
  }

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    haveSensor = true;
    tilt = { b: e.beta, g: e.gamma };
    if (!base) base = { b: tilt.b, g: tilt.g };
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const dev = Math.abs(Math.hypot(a.x, a.y, a.z || 0) - 9.81);
    const now = performance.now();
    if (dev > 14 && now - lastKick > 350) { lastKick = now; kick(Math.min(1.7, dev / 18)); }
  }

  function kick(power) {
    bodies.forEach((b) => {
      const ang = Math.random() * Math.PI * 2;
      b.vx += Math.cos(ang) * 280 * power;
      b.vy += Math.sin(ang) * 280 * power;
    });
  }

  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
  }

  async function ask() {
    const needs = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    try {
      if (needs) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return 'denied';
      }
    } catch (e) { return 'denied'; }
    listen();
    return needs ? 'granted' : 'listening';
  }

  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.033, (t - last) / 1000 || 0);
    last = t;
    if (reduced || document.hidden || !active()) { bodies.forEach((b) => { b.init = false; }); return; }

    if (haveSensor && tilt && base) {
      const k = Math.min(1, dt / 4);
      base.b += (tilt.b - base.b) * k;
      base.g += (tilt.g - base.g) * k;
      gx = clamp((tilt.g - base.g) / 32, -1, 1);
      gy = clamp((tilt.b - base.b) / 32, -1, 1);
    }

    const bd = bounds();
    bodies.forEach((b) => {
      if (!b.init) {
        const s = b.start ? b.start(bd) : [bd.x1, bd.y1];
        b.x = clamp(s[0], bd.x0, bd.x1);
        b.y = clamp(s[1], bd.y0, bd.y1);
        b.vx = b.vy = 0;
        b.init = true;
        pickTarget(b);
        b.el.style.right = 'auto';
        b.el.style.bottom = 'auto';
        put(b);
      }
      if (b.drag) return;
      const dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < 28) pickTarget(b);
      const wx = Math.cos(t / 1300 + b.phase) * 16, wy = Math.sin(t / 900 + b.phase) * 18;
      if (haveSensor) {
        b.vx += (gx * 520 + (dx / dist) * 22 + wx) * dt;
        b.vy += (gy * 520 + (dy / dist) * 22 + wy) * dt;
        const damp = Math.exp(-2.2 * dt);
        b.vx *= damp;
        b.vy *= damp;
      } else {
        const k = Math.min(1, dt * 1.4);
        b.vx += ((dx / dist) * 34 + wx - b.vx) * k;
        b.vy += ((dy / dist) * 34 + wy - b.vy) * k;
        const damp = Math.exp(-0.15 * dt);
        b.vx *= damp;
        b.vy *= damp;
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 460) { b.vx *= 460 / sp; b.vy *= 460 / sp; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < bd.x0) { b.x = bd.x0; b.vx = Math.abs(b.vx) * 0.45; pickTarget(b); }
      if (b.x > bd.x1) { b.x = bd.x1; b.vx = -Math.abs(b.vx) * 0.45; pickTarget(b); }
      if (b.y < bd.y0) { b.y = bd.y0; b.vy = Math.abs(b.vy) * 0.45; pickTarget(b); }
      if (b.y > bd.y1) { b.y = bd.y1; b.vy = -Math.abs(b.vy) * 0.45; pickTarget(b); }
    });

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], c = bodies[j];
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d >= SIZE) continue;
        const nx = dx / d, ny = dy / d, push = (SIZE - d) / 2;
        if (!a.drag) { a.x -= nx * push; a.y -= ny * push; }
        if (!c.drag) { c.x += nx * push; c.y += ny * push; }
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -(1 + 0.8) * rv / 2;
          if (!a.drag) { a.vx -= imp * nx; a.vy -= imp * ny; }
          if (!c.drag) { c.vx += imp * nx; c.vy += imp * ny; }
        }
      }
    }

    bodies.forEach((b) => {
      if (!b.init) return;
      put(b);
      b.el.style.rotate = clamp(b.vx * 0.03, -18, 18) + 'deg';
    });
  }

  function bind(b) {
    const el = b.el;
    const hist = [];
    el.addEventListener('pointerdown', (e) => {
      const bd = bounds();
      if (!b.init) return;
      b.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y };
      b.moved = false;
      hist.length = 0;
      document.body.classList.add('fab-drag');
      try { el.setPointerCapture(e.pointerId); } catch (err) { }
      void bd;
    });
    el.addEventListener('pointermove', (e) => {
      const d = b.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!b.moved && Math.hypot(dx, dy) < 6) return;
      b.moved = true;
      if (window.getSelection) window.getSelection().removeAllRanges();
      el.classList.add('dragging');
      const bd = bounds();
      b.x = clamp(d.ox + dx, bd.x0, bd.x1);
      b.y = clamp(d.oy + dy, bd.y0, bd.y1);
      b.vx = b.vy = 0;
      hist.push([performance.now(), b.x, b.y]);
      if (hist.length > 6) hist.shift();
      put(b);
    });
    const end = () => {
      if (!b.drag) return;
      b.drag = null;
      document.body.classList.remove('fab-drag');
      el.classList.remove('dragging');
      if (b.moved) {
        const f = hist[0], l = hist[hist.length - 1];
        if (f && l && l[0] - f[0] > 10 && performance.now() - l[0] < 120) {
          const dt = (l[0] - f[0]) / 1000;
          b.vx = clamp((l[1] - f[1]) / dt, -700, 700);
          b.vy = clamp((l[2] - f[2]) / dt, -700, 700);
        }
        b.justDragged = true;
        setTimeout(() => { b.justDragged = false; }, 60);
        pickTarget(b);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', () => { if (!b.justDragged && b.onTap) b.onTap(); });
  }

  function add(el, opts) {
    const b = { el, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, init: false, drag: null, moved: false, justDragged: false, phase: Math.random() * 6, start: opts && opts.start, onTap: opts && opts.onTap };
    bodies.push(b);
    bind(b);
    if (!started) {
      started = true;
      listen();
      requestAnimationFrame(frame);
    }
    return b;
  }

  window.addEventListener('resize', () => {
    const bd = bounds();
    bodies.forEach((b) => { if (b.init) { b.x = clamp(b.x, bd.x0, bd.x1); b.y = clamp(b.y, bd.y0, bd.y1); } });
  });

  return { add, kick, ask, needsPermission: () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function', setActive: (fn) => { active = fn; }, sensor: () => haveSensor };
})();
