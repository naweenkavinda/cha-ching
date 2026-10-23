const Coins = (() => {
  'use strict';
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let running = false;

  function platforms() {
    const out = [];
    document.querySelectorAll('.btn, .shutter, .tab').forEach((n) => {
      if (n.closest('[hidden]') || n.closest('.dialog')) return;
      const r = n.getBoundingClientRect();
      if (r.width < 40 || r.height < 30 || r.top < 80 || r.bottom > window.innerHeight + 4) return;
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      out.push({ l: r.left, r: r.right, t: r.top });
    });
    return out;
  }

  function coin(c, x, y, r, spin) {
    const sx = Math.max(0.22, Math.abs(Math.cos(spin)));
    c.save();
    c.translate(x, y);
    c.scale(sx, 1);
    c.lineJoin = 'round';
    c.fillStyle = '#FFC21A';
    c.strokeStyle = '#3A1F00';
    c.lineWidth = Math.max(2.5, r * 0.16);
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#E09A00';
    c.lineWidth = Math.max(2, r * 0.12);
    c.beginPath(); c.arc(0, 0, r * 0.68, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#A85F00';
    c.font = '800 ' + Math.round(r * 1.05) + 'px "Zilla Slab", Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('$', 0, r * 0.06);
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = Math.max(2, r * 0.12);
    c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, r * 0.82, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
    c.restore();
  }

  function note(c, x, y, r, rot) {
    const w = r * 2.7, h = r * 1.55;
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.lineJoin = 'round';
    c.fillStyle = '#86E08A';
    c.strokeStyle = '#0F3D14';
    c.lineWidth = Math.max(2.5, r * 0.15);
    c.beginPath();
    c.rect(-w / 2, -h / 2, w, h);
    c.fill(); c.stroke();
    c.strokeStyle = '#3FA546';
    c.lineWidth = Math.max(1.5, r * 0.09);
    c.strokeRect(-w / 2 + r * 0.2, -h / 2 + r * 0.2, w - r * 0.4, h - r * 0.4);
    c.fillStyle = '#2E8A36';
    c.beginPath(); c.arc(0, 0, h * 0.28, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#E8FFE9';
    c.font = '800 ' + Math.round(h * 0.4) + 'px "Zilla Slab", Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('$', 0, 1);
    c.restore();
  }

  function rain(opts) {
    opts = opts || {};
    if (reduced || running) return;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:90;pointer-events:none';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const plats = platforms();
    const n = opts.count || 16;
    const items = [];
    for (let i = 0; i < n; i++) {
      const isNote = Math.random() < 0.28;
      items.push({
        note: isNote, r: isNote ? 15 : 17 + Math.random() * 5,
        x: 30 + Math.random() * (W - 60), y: -40, vx: (Math.random() - 0.5) * 120, vy: 0,
        spin: Math.random() * 6, vs: (Math.random() * 9 + 5) * (Math.random() < 0.5 ? -1 : 1),
        bounces: 0, out: false, wait: Math.random() * 1.0, dead: false
      });
    }
    running = true;
    let last = performance.now();
    const t0 = last;
    let lastHit = 0;
    const G = 2200;

    function frame(now) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      c.clearRect(0, 0, W, H);
      let alive = 0;
      items.forEach((it) => {
        if (it.dead) return;
        if ((now - t0) / 1000 < it.wait) { alive++; return; }
        const prevBottom = it.y + it.r;
        it.vy += G * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.spin += it.vs * dt;
        if (!it.out && it.vy > 0) {
          for (let i = 0; i < plats.length; i++) {
            const p = plats[i];
            if (it.x > p.l - 6 && it.x < p.r + 6 && prevBottom <= p.t + 2 && it.y + it.r >= p.t) {
              it.y = p.t - it.r;
              it.bounces++;
              if (it.bounces >= 2) {
                it.out = true;
                const dir = it.x < W / 2 ? -1 : 1;
                it.vx = dir * (330 + Math.random() * 330);
                it.vy = -(620 + Math.random() * 380);
              } else {
                it.vy = -Math.abs(it.vy) * 0.62;
                it.vx += (Math.random() - 0.5) * 140;
              }
              if (opts.onHit && now - lastHit > 70) { lastHit = now; opts.onHit(); }
              break;
            }
          }
        }
        if (it.y > H + 60 || it.x < -70 || it.x > W + 70) { it.dead = true; return; }
        alive++;
        if (it.note) note(c, it.x, it.y, it.r, it.spin * 0.25); else coin(c, it.x, it.y, it.r, it.spin);
      });
      if (alive && now - t0 < 7000) requestAnimationFrame(frame);
      else { cv.remove(); running = false; }
    }
    requestAnimationFrame(frame);
  }

  return { rain };
})();
