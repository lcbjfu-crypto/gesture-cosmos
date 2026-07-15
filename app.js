(() => {
  "use strict";
  const canvas = document.querySelector("#sceneCanvas");
  const ctx = canvas.getContext("2d");
  const particleCheck = document.querySelector('[data-check="particles"]');
  const TAU = Math.PI * 2;
  const palette = [
    [70, 211, 255], [126, 111, 255], [255, 176, 82], [81, 239, 180],
    [230, 95, 148], [188, 224, 255], [255, 218, 117]
  ];
  const state = { w: 0, h: 0, dpr: 1, time: 0, expanded: false, planetScale: 1, particles: [], stars: [], bursts: [], solarSystem: [], hand: { active: false, x: 0, y: 0, strength: 1 }, responseFrames: 0 };

  class Planet {
    constructor(x, y, z, i, type = "planet") {
      this.base = { x, y, z };
      this.scatter = { x: (Math.random() - .5) * 1050, y: (Math.random() - .5) * 720, z: (Math.random() - .5) * 650 };
      this.x = x + (Math.random() - .5) * 280;
      this.y = y + (Math.random() - .5) * 260;
      this.z = z + (Math.random() - .5) * 240;
      this.vx = this.vy = this.vz = 0;
      this.color = palette[i % palette.length];
      this.size = type === "star" ? 2 + Math.random() * 2.6 : .9 + Math.random() * 2.6;
      this.type = type;
      this.ring = type === "planet" && Math.random() < .13;
      this.phase = Math.random() * TAU;
      this.seed = Math.random();
    }
  }

  function center() { return { x: state.w < 760 ? state.w * .5 : state.w * .63, y: state.h * .52 }; }
  function buildUniverse() {
    state.particles = [];
    state.solarSystem = [
      { name: "水星", orbit: .08, size: 2.5, color: [188, 198, 212], speed: .0017, phase: .3 },
      { name: "金星", orbit: .125, size: 3.8, color: [247, 186, 109], speed: .00125, phase: 1.4 },
      { name: "地球", orbit: .175, size: 4.6, color: [71, 177, 255], speed: .00105, phase: 2.1, ring: false },
      { name: "火星", orbit: .23, size: 3.6, color: [239, 102, 81], speed: .00082, phase: 3.1 },
      { name: "木星", orbit: .34, size: 8.6, color: [230, 179, 126], speed: .00052, phase: .8, ring: true },
      { name: "土星", orbit: .45, size: 7.6, color: [224, 199, 134], speed: .0004, phase: 2.8, ring: true },
      { name: "天王星", orbit: .56, size: 5.8, color: [122, 221, 236], speed: .00031, phase: 4.4 },
      { name: "海王星", orbit: .67, size: 5.6, color: [83, 119, 248], speed: .00025, phase: 5.2 }
    ];
    const radius = Math.min(state.w, state.h) * .36;
    const count = Math.min(1500, Math.max(760, Math.round(state.w * .9)));
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const arm = i % 5;
      const r = (0.8 + Math.pow(t, .64) * .2) * radius;
      const angle = arm * TAU / 5 + r * .032 + (Math.random() - .5) * .58;
      const flat = Math.sin(angle * 2.3 + i) * radius * .055;
      const x = Math.cos(angle) * r * 1.18;
      const y = Math.sin(angle) * r * .42 + flat;
      const z = Math.sin(angle + r * .012) * r * .26 + (Math.random() - .5) * 90;
      const p = new Planet(x, y, z, i);
      p.scatter = {
        x: x + (Math.random() - .5) * state.w * .8,
        y: y + (Math.random() - .5) * state.h * .55,
        z: z + (Math.random() - .5) * 520
      };
      state.particles.push(p);
    }
    for (let i = 0; i < 76; i++) {
      const orbit = .86 + Math.random() * .14;
      const r = radius * orbit;
      const a = Math.random() * TAU;
      const p = new Planet(Math.cos(a) * r * 1.24, Math.sin(a) * r * .48, Math.sin(a * 1.6) * r * .24, i + 2);
      p.size = 3.8 + Math.random() * 5.2;
      p.ring = Math.random() < .55;
      state.particles.push(p);
    }
    state.stars = Array.from({ length: Math.min(260, Math.round(state.w / 5)) }, () => ({ x: Math.random() * state.w, y: Math.random() * state.h, r: Math.random() * 1.4 + .2, a: Math.random(), p: Math.random() * TAU }));
  }
  function resize() {
    state.dpr = Math.min(2, window.devicePixelRatio || 1); state.w = innerWidth; state.h = innerHeight;
    canvas.width = state.w * state.dpr; canvas.height = state.h * state.dpr; ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); buildUniverse();
  }
  function project(x, y, z) { const c = center(), f = 750, s = f / (f + z + 150), zoom = state.planetScale; return { x: c.x + x * zoom * s, y: c.y + y * zoom * s, s }; }
  function update(p, dt) {
    const target = state.expanded ? { x: p.base.x + p.scatter.x, y: p.base.y + p.scatter.y, z: p.base.z + p.scatter.z } : p.base;
    const spring = state.expanded ? .0027 : .014;
    p.vx += (target.x - p.x) * spring * dt; p.vy += (target.y - p.y) * spring * dt; p.vz += (target.z - p.z) * spring * dt;
    if (state.hand.active) {
      const c = center();
      const nx = (state.hand.x - c.x) / Math.max(1, state.w * .5);
      const ny = (state.hand.y - c.y) / Math.max(1, state.h * .5);
      const flow = Math.sin(p.phase + state.time * .004) * state.hand.strength * .045 * dt;
      p.vx += (nx * .32 + flow) * dt;
      p.vy += (ny * .22 + flow * .35) * dt;
      p.vz += Math.cos(p.phase + state.time * .003) * state.hand.strength * .06 * dt;
      state.responseFrames++;
    }
    const damp = Math.pow(.895, dt); p.vx *= damp; p.vy *= damp; p.vz *= damp; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  function planet(x, y, r, color, alpha, p) {
    const [cr, cg, cb] = color; ctx.save(); ctx.globalAlpha = alpha;
    if (p.ring && r > 1.5) { ctx.strokeStyle = `rgba(${cr},${cg},${cb},.45)`; ctx.lineWidth = Math.max(.5, r * .22); ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * .48, -.25, 0, TAU); ctx.stroke(); }
    const g = ctx.createRadialGradient(x - r * .35, y - r * .4, 0, x, y, r * 1.1); g.addColorStop(0, `rgb(${Math.min(255,cr+80)},${Math.min(255,cg+80)},${Math.min(255,cb+80)})`); g.addColorStop(.55, `rgb(${cr},${cg},${cb})`); g.addColorStop(1, `rgba(${cr*.28},${cg*.28},${cb*.28},.9)`); ctx.fillStyle = g; ctx.shadowColor = `rgb(${cr},${cg},${cb})`; ctx.shadowBlur = r > 3 ? 12 : 4; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (r > 3.4 && p.type === "planet") { ctx.shadowBlur = 0; ctx.fillStyle = "rgba(4,8,20,.22)"; ctx.beginPath(); ctx.arc(x + r * .22, y - r * .05, r * .18, 0, TAU); ctx.fill(); }
     ctx.restore();
  }
  function drawSolarSystem(now) {
    const c = center(), radius = Math.min(state.w, state.h) * .36 * state.planetScale;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, .42);
    ctx.lineWidth = 1.15;
    for (const body of state.solarSystem) {
      ctx.strokeStyle = `rgba(154,220,255,${body.orbit < .2 ? .38 : .24})`;
      ctx.beginPath(); ctx.arc(0, 0, radius * body.orbit, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    const sunRadius = 15 * state.planetScale;
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, sunRadius * 4.5);
    glow.addColorStop(0, "rgba(255,238,163,.95)"); glow.addColorStop(.2, "rgba(255,186,72,.46)"); glow.addColorStop(1, "rgba(255,167,57,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(c.x, c.y, sunRadius * 4.5, 0, TAU); ctx.fill();
    planet(c.x, c.y, sunRadius, [255, 191, 69], .98, { ring: false, type: "star" });
    for (const body of state.solarSystem) {
      const angle = body.phase + now * body.speed;
      const orbit = radius * body.orbit;
      const x = c.x + Math.cos(angle) * orbit;
      const y = c.y + Math.sin(angle) * orbit * .42;
      planet(x, y, body.size * state.planetScale, body.color, .98, { ring: Boolean(body.ring), type: "planet" });
    }
  }
  function burst(x, y) { for (let i = 0; i < 90; i++) { const a = Math.random() * TAU, speed = 1.5 + Math.random() * 7; state.bursts.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1, size: .7 + Math.random() * 2.8, c: palette[i % palette.length] }); } }
  function render(now) {
    const dt = Math.min(2, (now - state.time || 16.7) / 16.7); state.time = now; ctx.clearRect(0, 0, state.w, state.h);
    for (const s of state.stars) { ctx.globalAlpha = .15 + (.5 + Math.sin(now * .001 + s.p) * .5) * s.a * .7; ctx.fillStyle = "#dffcff"; ctx.fillRect(s.x, s.y, s.r, s.r); }
    const sorted = state.particles.slice().sort((a, b) => b.z - a.z);
     for (const p of sorted) { update(p, dt); const q = project(p.x, p.y, p.z); if (q.x < -30 || q.x > state.w + 30 || q.y < -30 || q.y > state.h + 30) continue; const pulse = .72 + Math.sin(now * .002 + p.phase) * .22; planet(q.x, q.y, p.size * q.s * state.planetScale, p.color, pulse * Math.max(.25, q.s), p); }
     drawSolarSystem(now);
    for (let i = state.bursts.length - 1; i >= 0; i--) { const b = state.bursts[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= .97; b.vy *= .97; b.life -= .018 * dt; planet(b.x, b.y, b.size, b.c, Math.max(0, b.life), { ring: false, type: "star" }); if (b.life <= 0) state.bursts.splice(i, 1); }
    ctx.globalAlpha = 1; requestAnimationFrame(render);
  }

  function setCheck(name, status, text) { const el = document.querySelector(`[data-check="${name}"]`); if (!el) return; el.classList.toggle("ok", status === "ok"); el.classList.toggle("active", status === "active"); el.querySelector("i").textContent = text; }
  function setHand(x, y, strength = 4) { state.hand = { active: true, x, y, strength }; setCheck("particles", "active", "响应中"); }
  function clearHand() { state.hand.active = false; setCheck("particles", "ok", "就绪"); }
  function setScale(value) { const target = Math.max(.68, Math.min(1.85, Number(value) || 1)); state.planetScale += (target - state.planetScale) * .22; }
  window.UniverseControl = {
    setHand, clearHand,
    setExpanded(value) { const next = Boolean(value); if (state.expanded === next) return; state.expanded = next; const c = center(); burst(c.x, c.y - state.h * .25); },
    setScale,
    resetScale() { setScale(1); },
    burst,
    setCheck,
    debug() { return { particles: state.particles.length, solarPlanets: state.solarSystem.length, expanded: state.expanded, planetScale: Number(state.planetScale.toFixed(2)), handActive: state.hand.active, responseFrames: state.responseFrames, bursts: state.bursts.length }; }
  };
  window.addEventListener("resize", resize); resize(); particleCheck.classList.add("ok"); requestAnimationFrame(render);
})();
