import Globe from './sismo/globe.js';
import Propagation from './sismo/propagation.js';
import Teleseisme from './sismo/teleseisme.js';
import Sismo from './sismo/signal.js';

// src/propagation-anim.js — animation en boucle de la propagation du séisme du banc « station » : coupe du globe
// (téléséisme) ou coupe de la croûte (séisme local). Fronts d'onde P et S tirés des rais (src/sismo/propagation.js,
// ou rais droits et réfractés dans la croûte du générateur), rais qui atteignent la station avec un point mobile, ondes
// de surface le long de la surface, et sismogramme vertical qui s'écrit à mesure que les ondes arrivent. Canvas seul.
const RAD = Math.PI / 180;
const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
const virg = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—');
const minSec = t => { const m = Math.floor(t / 60), s = Math.round(t - 60 * m); return m ? `${m} min ${String(s === 60 ? 59 : s).padStart(2, '0')} s` : `${virg(t, t < 10 ? 1 : 0)} s`; };
const ONDES_P = new Set(['P', 'pP', 'sP', 'PcP', 'PKP', 'PKiKP', 'PKIKP', 'Pg', 'Pn', 'PmP']);
const PHASES_STATION = ['P', 'pP', 'sP', 'PcP', 'PKIKP', 'PKiKP', 'PKP', 'S', 'ScS', 'SKS'];

// ── Scènes ────────────────────────────────────────────────────────────────────────────────────────────────────
// Téléséisme : faisceaux P et S du foyer, rais vers la station, durée jusqu'au passage des ondes de surface.
function sceneTele(ev) {
  const { h, delta } = ev.p, x = delta * RAD * Globe.R;
  const rais = Propagation.raisStation(h, delta, PHASES_STATION);
  const tSurf = x / Teleseisme.groupe('LR', 20);
  const tMax = Math.min(ev.t0 + ev.n * ev.dt, Math.max(tSurf * 1.08, (rais.length ? rais[rais.length - 1].temps : 0) * 1.1));
  const ombre = Globe.arrivees('P', h, 98)[0];
  return {
    type: 'tele', h, delta, rais, tMax, tOmbre: ombre ? ombre.temps : Infinity,
    faisceaux: { P: Propagation.faisceau('P', h), S: Propagation.faisceau('S', h) },
    surface: [['LQ', 'Love'], ['LR', 'Rayleigh']].map(([o, nom]) => ({ nom, rapide: Teleseisme.groupe(o, 60), lent: Teleseisme.groupe(o, 12) })),
    marques: [...rais.map(r => ({ nom: r.phase, t: r.temps })), { nom: 'LQ', t: x / Teleseisme.groupe('LQ', 20) }, { nom: 'LR', t: tSurf }],
    trace: traceCompressee(ev, tMax),
  };
}
// Séisme local : croûte du générateur (Sismo.MODELE) sur le manteau ; rais Pg, Sg, et Pn, Sn au-delà du point critique.
function sceneLocale(ev) {
  const m = Sismo.MODELE, { h, delta } = ev.p, tt = ev.tt;
  const rais = [];
  const droit = (nom, v) => rais.push({ phase: nom, temps: tt.R / v, pts: [[0, h, 0], [delta, 0, tt.R / v]] });
  droit('Pg', m.vp1); droit('Sg', m.vs1);
  const conique = (nom, v1, v2, t) => {
    if (t === null) return;
    const ic = Math.asin(v1 / v2), x1 = (m.H - h) * Math.tan(ic), x2 = m.H * Math.tan(ic), t1 = (m.H - h) / (v1 * Math.cos(ic)), t2 = t1 + (delta - x1 - x2) / v2;
    rais.push({ phase: nom, temps: t, pts: [[0, h, 0], [x1, m.H, t1], [delta - x2, m.H, t2], [delta, 0, t]] });
  };
  conique('Pn', m.vp1, m.vp2, tt.tPn); conique('Sn', m.vs1, m.vs2, tt.tSn);
  rais.sort((a, b) => a.temps - b.temps);
  const marques = rais.map(r => ({ nom: r.phase, t: r.temps }));
  const surface = delta >= 15;
  if (surface) marques.push({ nom: 'LQ', t: tt.tLQ }, { nom: 'LR', t: tt.tLR });
  const tMax = Math.min(ev.t0 + ev.n * ev.dt, Math.max(...marques.map(q => q.t)) * 1.15 + 2);
  return { type: 'local', h, delta, m, rais, marques, surface, tMax, trace: traceCompressee(ev, tMax) };
}
// Sismogramme vertical sans bruit, de l'origine à tMax, comprimé (racine) pour voir la P à côté des ondes de surface.
function traceCompressee(ev, tMax) {
  const z = ev.vit.Z, n = 900, out = new Float32Array(2 * n);
  let max = 0;
  for (let i = 0; i < z.length; i++) max = Math.max(max, Math.abs(z[i]));
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, Math.round(((tMax * k) / n - ev.t0) / ev.dt)), b = Math.min(z.length, Math.round(((tMax * (k + 1)) / n - ev.t0) / ev.dt) + 1);
    let mn = 0, mx = 0;
    for (let i = a; i < b; i++) { if (z[i] < mn) mn = z[i]; if (z[i] > mx) mx = z[i]; }
    out[2 * k] = Math.sqrt(mx / (max || 1)); out[2 * k + 1] = -Math.sqrt(-mn / (max || 1));
  }
  return out;
}

// Position sur une ligne brisée [x, z, t] au temps t (rais de la croûte), ou null.
function surLigne(pts, t) {
  if (t < 0 || t > pts[pts.length - 1][2]) return null;
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][2]) {
    const [xa, za, ta] = pts[i - 1], [xb, zb, tb] = pts[i], k = tb > ta ? (t - ta) / (tb - ta) : 0;
    return [xa + k * (xb - xa), za + k * (zb - za)];
  }
  return null;
}

// ── Animation ─────────────────────────────────────────────────────────────────────────────────────────────────
export function creerAnimation({ canvas, bouton, vitesse, legende }) {
  const etat = { scene: null, enCours: true, debut: 0, decalage: 0, visible: false, cache: false, raf: 0, message: '', messageCache: '' };
  const COUL = {};
  const lireCouleurs = () => {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['paper', 'ink', 'muted', 'line', 'soft', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'trace', 'vrai']) COUL[k] = cs.getPropertyValue('--' + k).trim();
  };
  const dureeBoucle = () => ({ lente: 40, normale: 22, rapide: 12 }[vitesse ? vitesse.value : 'normale'] || 22);
  const tempsCourant = maintenant => {
    const s = etat.scene, D = dureeBoucle() * 1000, pauseFin = 1500;
    const e = (etat.enCours ? maintenant - etat.debut : etat.decalage) % (D + pauseFin);
    return Math.min(1, e / D) * s.tMax;
  };

  function preparer() {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }
  // Texte avec halo, gardé dans le canvas (les libellés proches du bord sont décalés vers l'intérieur).
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    const w = ctx.measureText(t).width, W = canvas.clientWidth, g = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    if (g < 4) x += 4 - g; else if (g + w > W - 4) x -= g + w - (W - 4);
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  const couleurPhase = nom => (ONDES_P.has(nom) ? COUL['pick-p'] : nom === 'LQ' || nom === 'LR' ? COUL.amp : COUL['pick-s']);

  // Sismogramme qui s'écrit : bande du bas, de l'origine à tMax.
  function dessinerTrace(ctx, s, t, x0, y0, w, hh) {
    ctx.strokeStyle = COUL.line; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
    const n = s.trace.length / 2, yc = y0 + hh / 2 + 6, a = (hh - 22) / 2, X = tt => x0 + 6 + (tt / s.tMax) * (w - 12);
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    const kMax = Math.min(n, Math.floor((t / s.tMax) * n));
    for (let k = 0; k < kMax; k++) { const x = x0 + 6 + (k / n) * (w - 12); ctx.moveTo(x, yc - s.trace[2 * k] * a); ctx.lineTo(x, yc - s.trace[2 * k + 1] * a); }
    ctx.stroke();
    // arrivées déjà passées
    let dernier = -1e9;
    for (const q of s.marques) {
      if (q.t > t || q.t > s.tMax) continue;
      const x = X(q.t);
      ctx.strokeStyle = couleurPhase(q.nom); ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(x, y0 + 14); ctx.lineTo(x, y0 + hh - 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.font = `800 10.5px ${POLICE}`;
      if (x > dernier) { texte(ctx, q.nom, x + 2, y0 + 8, couleurPhase(q.nom), `800 10.5px ${POLICE}`, 'left'); dernier = x + ctx.measureText(q.nom).width + 6; }
    }
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(t), y0 + 2); ctx.lineTo(X(t), y0 + hh - 2); ctx.stroke();
    texte(ctx, 'sismogramme vertical à la station', x0 + w - 6, y0 + 8, COUL.muted, `10.5px ${POLICE}`, 'right');
  }

  // Coupe du globe
  function dessinerGlobe(ctx, s, t, W, H, bande) {
    const Hg = H - bande - 8, Rp = Math.min(Hg / 2 - 18, W / 2 - 16), cx = W / 2, cy = 14 + Rp + 4, k = Rp / Globe.R;
    const X = (r, a) => cx + r * k * Math.sin(a), Y = (r, a) => cy - r * k * Math.cos(a);
    const { d410, d660, noyau, graine } = Globe.RAYONS;
    const disque = (r, fond, trait, tirets) => { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 2 * Math.PI); if (fond) { ctx.fillStyle = fond; ctx.fill(); } if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = 1; ctx.setLineDash(tirets || []); ctx.stroke(); ctx.setLineDash([]); } };
    disque(Globe.R, 'rgba(180,120,60,0.14)', COUL['grid-strong']);
    disque(d410, null, COUL.grid, [3, 3]); disque(d660, null, COUL.grid, [3, 3]);
    disque(noyau, 'rgba(234,179,8,0.20)', COUL['grid-strong']);
    disque(graine, 'rgba(234,179,8,0.40)', COUL['grid-strong']);
    texte(ctx, 'manteau', cx, cy + (Globe.R - 900) * k, COUL.muted, `700 10.5px ${POLICE}`, 'center');
    texte(ctx, 'noyau externe liquide', cx, cy + (noyau - 500) * k, COUL.muted, `700 10.5px ${POLICE}`, 'center');
    texte(ctx, 'graine', cx, cy, COUL.muted, `700 10.5px ${POLICE}`, 'center');
    // zone d'ombre de P, une fois le front passé
    if (t > s.tOmbre) {
      ctx.strokeStyle = COUL.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (const sg of [1, -1]) { ctx.beginPath(); ctx.arc(cx, cy, Rp + 7, -Math.PI / 2 + sg * 103 * RAD, -Math.PI / 2 + sg * 142 * RAD, sg < 0); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      texte(ctx, "zone d'ombre de P", X(Globe.R * 1.0, 122 * RAD) + 8, Y(Globe.R * 1.0, 122 * RAD) + 14, COUL.muted, `700 10.5px ${POLICE}`, 'left');
    }
    // rais vers la station, avec leur point mobile
    for (const r of s.rais) {
      if (!r.pts) continue;
      const arrive = t >= r.temps;
      ctx.strokeStyle = couleurPhase(r.phase); ctx.globalAlpha = arrive ? 0.75 : 0.22; ctx.lineWidth = arrive ? 1.6 : 1;
      ctx.beginPath(); r.pts.forEach(([rr, a], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(rr, a), Y(rr, a))); ctx.stroke();
      ctx.globalAlpha = 1;
      const q = Globe.position(r.pts, t);
      if (q) { ctx.fillStyle = couleurPhase(r.phase); ctx.beginPath(); ctx.arc(X(q[0], q[1]), Y(q[0], q[1]), 3.2, 0, 2 * Math.PI); ctx.fill(); }
    }
    // fronts réfléchis sur le noyau (PcP, ScS), puis fronts transmis
    for (const [fam, coul] of [['P', COUL['pick-p']], ['S', COUL['pick-s']]]) {
      const rais = s.faisceaux[fam];
      ctx.strokeStyle = coul; ctx.lineJoin = 'round';
      for (const [refl, larg, alpha, tirets] of [[true, 1.2, 0.55, [4, 3]], [false, 2.4, 1, []]]) {
        ctx.lineWidth = larg; ctx.globalAlpha = alpha; ctx.setLineDash(tirets);
        for (const l of Propagation.front(rais, t, { reflechis: refl })) {
          // fronts réfléchis sous la surface au-dessus du foyer (pP, sS…) : plus fins, juste derrière P et S
          const surf = !refl && l.phase[0] === l.phase[0].toLowerCase();
          ctx.lineWidth = surf ? 1.2 : larg; ctx.globalAlpha = surf ? 0.6 : alpha;
          for (const sg of [1, -1]) { ctx.beginPath(); l.forEach(([rr, a], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(rr, sg * a), Y(rr, sg * a))); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }
    // ondes de surface : bandes le long de la surface, des deux côtés
    ctx.lineCap = 'round';
    s.surface.forEach((o, j) => {
      const a1 = (o.lent * t) / Globe.R, a2 = (o.rapide * t) / Globe.R;
      if (a2 < 0.01) return;
      ctx.strokeStyle = COUL.amp; ctx.globalAlpha = j ? 0.85 : 0.5; ctx.lineWidth = j ? 7 : 4;
      for (const sg of [1, -1]) { ctx.beginPath(); ctx.arc(cx, cy, Rp + (j ? 4 : 10), -Math.PI / 2 + sg * Math.min(Math.PI, a1), -Math.PI / 2 + sg * Math.min(Math.PI, a2), sg < 0); ctx.stroke(); }
      if (j && a2 > 0.06 && a2 < Math.PI * 0.95) {
        const am = Math.min(a2, Math.PI);
        texte(ctx, 'ondes de surface', X(Globe.R * 1.1, -am), Y(Globe.R * 1.1, -am), COUL.amp, `800 10.5px ${POLICE}`, Math.sin(am) > 0.3 ? 'right' : 'center');
      }
    });
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    // foyer et station
    const fx = X(Globe.R - s.h, 0), fy = Y(Globe.R - s.h, 0);
    etoile(ctx, fx, fy, 7, COUL['pick-p']);
    const sa = s.delta * RAD, sx = X(Globe.R, sa), sy = Y(Globe.R, sa);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(sa); ctx.fillStyle = COUL.vrai; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 2); ctx.lineTo(-7, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    texte(ctx, `station, Δ = ${virg(s.delta)}°`, X(Globe.R * 1.06, sa) + (Math.sin(sa) > 0.3 ? 4 : 0), Y(Globe.R * 1.06, sa) - 6, COUL.ink, `800 11px ${POLICE}`, Math.sin(sa) > 0.3 ? 'left' : Math.sin(sa) < -0.3 ? 'right' : 'center');
    texte(ctx, `foyer à ${virg(s.h)} km`, fx + 10, fy - 12, COUL.ink, `800 11px ${POLICE}`, 'left');
    texte(ctx, `t = ${minSec(t)}`, 8, 12, COUL.ink, `800 13px ${MONO}`, 'left');
  }
  function etoile(ctx, x, y, r, coul) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = coul; ctx.fill(); ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.2; ctx.stroke();
  }

  // Coupe de la croûte (échelle verticale exagérée, indiquée)
  function dessinerCroute(ctx, s, t, W, H, bande) {
    const m = s.m, zMax = Math.max(2.2 * m.H, s.h + 25), xa = -Math.max(25, 0.12 * s.delta), xb = s.delta * 1.08 + 15;
    const g = { x0: 10, x1: W - 10, y0: 26, y1: H - bande - 14 };
    const sx = (g.x1 - g.x0) / (xb - xa), sz = (g.y1 - g.y0) / zMax, X = x => g.x0 + (x - xa) * sx, Y = z => g.y0 + z * sz;
    ctx.fillStyle = 'rgba(180,120,60,0.10)'; ctx.fillRect(g.x0, Y(0), g.x1 - g.x0, Y(m.H) - Y(0));
    ctx.fillStyle = 'rgba(180,120,60,0.22)'; ctx.fillRect(g.x0, Y(m.H), g.x1 - g.x0, g.y1 - Y(m.H));
    ctx.strokeStyle = COUL['grid-strong']; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(g.x0, Y(m.H)); ctx.lineTo(g.x1, Y(m.H)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(g.x0, Y(0)); ctx.lineTo(g.x1, Y(0)); ctx.stroke();
    texte(ctx, `croûte : Vp ${virg(m.vp1, 1)} km/s, Vs ${virg(m.vs1, 1)} km/s`, g.x1 - 6, Y(m.H / 2), COUL.muted, `700 10.5px ${POLICE}`, 'right');
    texte(ctx, `Moho à ${m.H} km · manteau : Vp ${virg(m.vp2, 1)} km/s, Vs ${virg(m.vs2, 1)} km/s`, g.x1 - 6, Y(m.H) + 12, COUL.muted, `700 10.5px ${POLICE}`, 'right');
    texte(ctx, `échelle verticale ×${virg(sz / sx, sz / sx < 10 ? 1 : 0)}`, g.x0 + 4, g.y1 - 8, COUL.muted, `10.5px ${POLICE}`, 'left');
    ctx.save(); ctx.beginPath(); ctx.rect(g.x0, Y(0), g.x1 - g.x0, g.y1 - Y(0)); ctx.clip();
    // rais vers la station
    for (const r of s.rais) {
      const arrive = t >= r.temps;
      ctx.strokeStyle = couleurPhase(r.phase); ctx.globalAlpha = arrive ? 0.75 : 0.22; ctx.lineWidth = arrive ? 1.6 : 1;
      ctx.beginPath(); r.pts.forEach(([x, z], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), Y(z))); ctx.stroke(); ctx.globalAlpha = 1;
      const q = surLigne(r.pts, t);
      if (q) { ctx.fillStyle = couleurPhase(r.phase); ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 3.2, 0, 2 * Math.PI); ctx.fill(); }
    }
    // fronts : direct (cercle dans la croûte), réfléchi sur le Moho, transmis dans le manteau, onde conique
    const tracer = (pts, coul, larg, alpha, tirets) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = coul; ctx.lineWidth = larg; ctx.globalAlpha = alpha; ctx.setLineDash(tirets || []);
      ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), Y(z))); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    };
    for (const [v1, v2, coul] of [[m.vp1, m.vp2, COUL['pick-p']], [m.vs1, m.vs2, COUL['pick-s']]]) {
      const r = v1 * t, ic = Math.asin(v1 / v2), cercle = [], refl = [];
      for (let k = 0; k <= 240; k++) {
        const a = (k / 240) * 2 * Math.PI, x = r * Math.sin(a), z = s.h - r * Math.cos(a);
        if (z >= 0 && z <= m.H) cercle.push([x, z]); else { tracer(cercle, coul, 2.4, 1); cercle.length = 0; }
        const zr = 2 * m.H - s.h - r * Math.cos(a);
        if (r > m.H - s.h && zr >= 0 && zr <= m.H && Math.cos(a) > 0) refl.push([x, zr]); else { tracer(refl, coul, 1.1, 0.5, [4, 3]); refl.length = 0; }
      }
      tracer(cercle, coul, 2.4, 1); tracer(refl, coul, 1.1, 0.5, [4, 3]);
      // transmis dans le manteau : rais descendants sous l'angle critique, réfractés au Moho (Snell)
      for (const sg of [1, -1]) {
        const tr = [];
        for (let k = 0; k <= 80; k++) {
          const i = (k / 80) * ic * 0.999, tm = (m.H - s.h) / (v1 * Math.cos(i));
          if (t <= tm) continue;
          const i2 = Math.asin(Math.min(1, (v2 / v1) * Math.sin(i))), xm = (m.H - s.h) * Math.tan(i), d = v2 * (t - tm);
          tr.push([sg * (xm + d * Math.sin(i2)), m.H + d * Math.cos(i2)]);
        }
        tracer(tr, coul, 2.4, 1);
        // onde conique dans la croûte : t = x/V2 + (2H − h − z)·cos(ic)/V1, au-delà du point critique
        const con = [];
        for (let k = 0; k <= 40; k++) {
          const z = m.H * (1 - k / 40), x = v2 * (t - ((2 * m.H - s.h - z) * Math.cos(ic)) / v1);
          if (x >= (2 * m.H - s.h - z) * Math.tan(ic)) con.push([sg * x, z]);
        }
        tracer(con, coul, 2.4, 1);
      }
    }
    // ondes de surface
    if (s.surface) {
      ctx.strokeStyle = COUL.amp; ctx.globalAlpha = 0.7; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const a = 2.7 * t, b = 3.4 * t;
      for (const sg of [1, -1]) { ctx.beginPath(); ctx.moveTo(X(sg * a), Y(0) + 3); ctx.lineTo(X(sg * b), Y(0) + 3); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }
    ctx.restore();
    etoile(ctx, X(0), Y(s.h), 7, COUL['pick-p']);
    ctx.fillStyle = COUL.vrai; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(s.delta), Y(0) - 1); ctx.lineTo(X(s.delta) + 7, Y(0) - 13); ctx.lineTo(X(s.delta) - 7, Y(0) - 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    texte(ctx, `station, Δ = ${virg(s.delta)} km`, X(s.delta), Y(0) - 20, COUL.ink, `800 11px ${POLICE}`, X(s.delta) > W - 90 ? 'right' : 'center');
    texte(ctx, `t = ${minSec(t)}`, 8, 12, COUL.ink, `800 13px ${MONO}`, 'left');
  }

  function dessiner(maintenant) {
    if (!etat.scene && !etat.message) return;
    if (!COUL.paper) lireCouleurs();
    const { ctx, W, H } = preparer();
    if (etat.cache || !etat.scene) {
      // message sur plusieurs lignes au besoin (téléphone)
      const mots = ((etat.cache ? etat.messageCache : etat.message) || '').split(' '), lignes = [''];
      ctx.font = `700 13px ${POLICE}`;
      for (const m of mots) { const l = lignes[lignes.length - 1], e = l ? `${l} ${m}` : m; if (ctx.measureText(e).width > W - 40 && l) lignes.push(m); else lignes[lignes.length - 1] = e; }
      lignes.forEach((l, i) => texte(ctx, l, W / 2, H / 2 + (i - (lignes.length - 1) / 2) * 19, COUL.muted, `700 13px ${POLICE}`, 'center'));
      return;
    }
    const s = etat.scene, t = tempsCourant(maintenant), bande = 74;
    if (s.type === 'tele') dessinerGlobe(ctx, s, t, W, H, bande); else dessinerCroute(ctx, s, t, W, H, bande);
    dessinerTrace(ctx, s, t, 8, H - bande - 4, W - 16, bande);
    if (legende) majLegende(s, t);
  }
  function majLegende(s, t) {
    const vues = s.marques.filter(q => q.t <= s.tMax).map(q => `<span class="${t >= q.t ? 'arrivee' : ''}" style="--c:${couleurPhase(q.nom)}">${q.nom} ${minSec(q.t)}</span>`).join('');
    if (legende.dataset.cle !== `${vues}`) { legende.innerHTML = vues; legende.dataset.cle = vues; }
  }
  function boucle(maintenant) {
    etat.raf = 0;
    if (!etat.visible) return;
    dessiner(maintenant);
    if (etat.enCours && etat.scene && !etat.cache) etat.raf = requestAnimationFrame(boucle);
  }
  const relancer = () => { if (!etat.raf && etat.visible) etat.raf = requestAnimationFrame(boucle); };

  if (bouton) bouton.addEventListener('click', () => {
    const maintenant = performance.now();
    if (etat.enCours) { etat.decalage = maintenant - etat.debut; etat.enCours = false; }
    else { etat.debut = maintenant - etat.decalage; etat.enCours = true; }
    bouton.textContent = etat.enCours ? 'Pause' : 'Lecture';
    bouton.setAttribute('aria-pressed', String(!etat.enCours));
    relancer(); dessiner(maintenant);
  });
  if (vitesse) vitesse.addEventListener('change', () => { etat.debut = performance.now(); etat.decalage = 0; relancer(); });
  new IntersectionObserver(e => { etat.visible = e[0].isIntersecting; relancer(); }).observe(canvas);
  new ResizeObserver(() => dessiner(performance.now())).observe(canvas);
  const theme = () => { lireCouleurs(); dessiner(performance.now()); };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return {
    // charge l'événement (local ou lointain) ; le calcul des rais du globe est différé pour ne pas bloquer la page
    charger(ev) {
      etat.scene = null; etat.message = ev.tele ? 'Calcul des rais dans le globe…' : '';
      dessiner(performance.now());
      setTimeout(() => {
        etat.scene = ev.tele ? sceneTele(ev) : sceneLocale(ev);
        etat.message = ''; etat.debut = performance.now(); etat.decalage = 0;
        relancer(); dessiner(performance.now());
      }, 20);
    },
    // masque l'animation (mode Exercice avant la vérification : elle donnerait la distance et la profondeur)
    masquer(cache, message) { etat.cache = cache; etat.messageCache = message || ''; if (legende) { legende.innerHTML = ''; legende.dataset.cle = ''; } relancer(); dessiner(performance.now()); },
  };
}
