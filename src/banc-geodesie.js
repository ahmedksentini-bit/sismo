import Sismo from './sismo/signal.js';
import Geodesie from './sismo/geodesie.js';
import Psha from './sismo/psha.js';

// src/banc-geodesie.js — banc « géodésie » : un réseau GNSS simulé sur les zones du modèle d'aléa, les taux
// de déformation par zone, le taux de moment de Kostrov et la sismicité équilibrée en moment, confrontés
// au catalogue. Les moments estimés peuvent être envoyés au banc « aléa » (événement geodesie:moments).
(() => {
  'use strict';
  const SM = Sismo, G = Geodesie;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const signe = (x, d = 1) => (x > 0 ? '+' : '') + virg(x, d);
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const puissance = n => '10' + String(n).split('').map(c => SUP[c]).join('');
  // 3,3·10¹⁷
  const sci = (x, d = 1) => { if (!(x > 0)) return '—'; const e = Math.floor(Math.log10(x)); return `${virg(x / Math.pow(10, e), d)}·${puissance(e)}`; };

  const MODELE = Psha.modeleDefaut();
  const ZONES = MODELE.zones.map(z => ({ ...z, aire: G.aire(z.polygone) }));
  // Failles du modèle d'aléa (glissement géologique) et leur moment, rattachés à leur zone
  const FAILLES = MODELE.failles.map(f => ({ ...f, moment: Psha.momentFaille(MODELE, f) }));
  const momentFaillesZone = iz => FAILLES.reduce((s, f) => s + (f.zone === iz ? f.moment : 0), 0);
  const DOM = G.DOMAINE;
  const ECHELLE = 15; // km de flèche par mm/an
  const champDepart = () => G.champDefaut();
  const etat = {
    pret: false, mode: 'explorer', champ: champDepart(), reseau: { n: 150, sigma: 0.3, graine: 7 }, mu: 30, H: 15, chi: 0.6,
    zone: 1, vrai: false, stations: [], analyses: [], exo: null, verifie: false,
  };

  // ── Calcul ──────────────────────────────────────────────────────────────
  // Loi du catalogue de la zone (ajustement central de Weichert du modèle d'aléa)
  const loiCatalogue = z => ({ a: Math.log10(z.ajustement.lamPivot) + z.ajustement.b * z.ajustement.mPivot, b: z.ajustement.b, mmin: z.mmin, mmax: z.mmax });
  function tirer() {
    etat.stations = G.genererReseau({ ...etat.reseau, champ: etat.champ });
    analyser();
  }
  function analyser() {
    const opts = { mu: etat.mu * 1e9, H: etat.H };
    etat.analyses = ZONES.map(z => {
      const st = etat.stations.filter(s => G.dansPolygone(s.x, s.y, z.polygone)), aj = G.ajuster(st);
      const vrai = G.deformationMoyenne(etat.champ, z.polygone), o = { ...opts, A: z.aire }, cat = loiCatalogue(z);
      const r = { n: st.length, aj, vrai, momentVrai: G.momentKostrov(vrai, o), momentCat: G.momentGR(cat), momentFailles: momentFaillesZone(ZONES.indexOf(z)), cat };
      if (aj) {
        r.p = G.principales(aj); r.sp = G.incertitudePrincipales(aj);
        r.moment = G.momentKostrov(aj, o); r.tirs = G.momentTires(aj, o);
      }
      return r;
    });
  }
  const loiGeo = (an, z, chi, moment = an.moment) => ({ a: G.aDepuisMoment({ moment: chi * moment, b: an.cat.b, mmin: z.mmin, mmax: z.mmax }), b: an.cat.b, mmax: z.mmax });

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'muted', 'ink', 'paper', 'blue', 'teal', 'soft', 'soft-line'])
      COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  function fleche(ctx, x0, y0, x1, y1, coul, w = 1.4, tete = 5) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (L < 2) return;
    const t = Math.min(tete, L * 0.5);
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - t * Math.cos(a - 0.45), y1 - t * Math.sin(a - 0.45)); ctx.lineTo(x1 - t * Math.cos(a + 0.45), y1 - t * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;
  const COUL_ZONES = ['pick-s', 'amp'];

  function geoCarte(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, m = 22;
    const s = Math.min((W - 2 * m) / (DOM.x1 - DOM.x0), (H - 2 * m - 14) / (DOM.y1 - DOM.y0));
    const cx = (W - s * (DOM.x1 - DOM.x0)) / 2, cy = (H - 14 - s * (DOM.y1 - DOM.y0)) / 2;
    return { s, W, H, X: x => cx + (x - DOM.x0) * s, Y: y => H - 14 - cy - (y - DOM.y0) * s, x: X => DOM.x0 + (X - cx) / s, y: Y => DOM.y0 + (H - 14 - cy - Y) / s };
  }
  function dessinerCarte() {
    const cv = $('#ge-carte');
    if (cv.clientWidth < 50) return;
    const { ctx, W } = preparer(cv), g = geoCarte(cv);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let x = -100; x <= DOM.x1; x += 50) { const X = Math.round(g.X(x)) + 0.5; ctx.beginPath(); ctx.moveTo(X, g.Y(DOM.y1)); ctx.lineTo(X, g.Y(DOM.y0)); ctx.stroke(); }
    for (let y = -100; y <= DOM.y1; y += 50) { const Y = Math.round(g.Y(y)) + 0.5; ctx.beginPath(); ctx.moveTo(g.X(DOM.x0), Y); ctx.lineTo(g.X(DOM.x1), Y); ctx.stroke(); }
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('quadrillage 50 km', 8, 6);
    // Zones
    ZONES.forEach((z, i) => {
      const c = COUL[COUL_ZONES[i]];
      ctx.beginPath(); z.polygone.forEach(([x, y], j) => (j ? ctx.lineTo(g.X(x), g.Y(y)) : ctx.moveTo(g.X(x), g.Y(y)))); ctx.closePath();
      ctx.globalAlpha = i === etat.zone ? 0.14 : 0.06; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.lineWidth = i === etat.zone ? 2.4 : 1.4; ctx.stroke();
      const ymax = Math.max(...z.polygone.map(q => q[1])), xs = z.polygone.map(q => q[0]);
      texte(ctx, W >= 520 ? z.nom : z.nom.split(' (')[0], g.X((Math.min(...xs) + Math.max(...xs)) / 2), g.Y(ymax) - 9, c, `800 12px ${POLICE}`, 'center');
    });
    // Faille cartographiée (zone A)
    const f = etat.champ.faille;
    ctx.save(); ctx.strokeStyle = COUL.amp; ctx.lineWidth = 2; ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.moveTo(g.X(f.x), g.Y(DOM.y1)); ctx.lineTo(g.X(f.x), g.Y(DOM.y0)); ctx.stroke(); ctx.restore();
    for (const fa of FAILLES) {
      const [[x0, y0], [x1, y1]] = fa.trace;
      ctx.strokeStyle = COUL.teal; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.X(x0), g.Y(y0)); ctx.lineTo(g.X(x1), g.Y(y1)); ctx.stroke(); ctx.lineCap = 'butt';
      texte(ctx, `${fa.nom} (aléa)`, g.X(x0) - 6, g.Y(y0) + 4, COUL.teal, `800 11px ${POLICE}`, 'right', 'top');
    }
    // Champ vrai (exploration)
    const k = ECHELLE * g.s;
    if (etat.vrai && !enExercice()) {
      ctx.globalAlpha = 0.45;
      for (let x = DOM.x0 + 20; x < DOM.x1; x += 40) for (let y = DOM.y0 + 20; y < DOM.y1; y += 40) {
        const v = G.vitesse(x, y, etat.champ);
        fleche(ctx, g.X(x), g.Y(y), g.X(x) + v.e * k, g.Y(y) - v.n * k, COUL.teal, 1.2, 4);
      }
      ctx.globalAlpha = 1;
    }
    // Stations : cercle de confiance à 95 % (rayon 2,45σ) au bout de la flèche
    for (const s of etat.stations) {
      const X = g.X(s.x), Y = g.Y(s.y), Xe = X + s.e * k, Ye = Y - s.n * k;
      ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.arc(X, Y, 1.8, 0, 2 * Math.PI); ctx.fill();
      fleche(ctx, X, Y, Xe, Ye, COUL.ink, 1.2, 4);
      ctx.globalAlpha = 0.2; ctx.strokeStyle = COUL.muted; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(Xe, Ye, 2.45 * s.sigma * k, 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // Croix de déformation au centre des stations de chaque zone
    if (!enExercice()) {
      const ks = 1.6 * g.s; // km de demi-bras par ns/an
      etat.analyses.forEach(an => {
        if (!an.aj) return;
        const X = g.X(an.aj.centre.x), Y = g.Y(an.aj.centre.y);
        for (const [e, az] of [[an.p.e1h, an.p.azimutRaccourcissement], [an.p.e2h, an.p.azimutRaccourcissement + 90]]) {
          const L = Math.min(70, Math.abs(e) * ks), dx = Math.sin(az * Math.PI / 180), dy = -Math.cos(az * Math.PI / 180);
          const c = e < 0 ? COUL['pick-p'] : COUL['pick-s'];
          for (const sg of [1, -1]) {
            if (e < 0) fleche(ctx, X + sg * dx * (L + 4), Y + sg * dy * (L + 4), X + sg * dx * 3, Y + sg * dy * 3, c, 2.6, 7);
            else fleche(ctx, X + sg * dx * 3, Y + sg * dy * 3, X + sg * dx * (L + 4), Y + sg * dy * (L + 4), c, 2.6, 7);
          }
        }
      });
    }
    // Échelle des vitesses
    const x0 = g.X(DOM.x1) - 8 - 2 * k, y0 = g.H - 10;
    fleche(ctx, x0, y0, x0 + 2 * k, y0, COUL.ink, 1.6, 5);
    texte(ctx, '2 mm/an', x0 - 6, y0, COUL.ink, `700 11px ${MONO}`, 'right');
  }

  // Profil : vN (haut) et vE (bas) en fonction de x
  function dessinerProfil() {
    const cv = $('#ge-profil');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 12, b: 40, entre: 26 };
    const hP = (H - m.h - m.b - m.entre) / 2, X = x => m.g + ((x - DOM.x0) / (DOM.x1 - DOM.x0)) * (W - m.g - m.d);
    const panneaux = [
      { cle: 'n', titre: W < 560 ? 'vN (mm/an) — faille de A' : 'composante nord vN (mm/an) — faille de la zone A', y0: m.h },
      { cle: 'e', titre: W < 560 ? 'vE (mm/an) — bande de B' : 'composante est vE (mm/an) — bande de la zone B', y0: m.h + hP + m.entre },
    ];
    // Étendue des zones
    ZONES.forEach((z, i) => {
      const xs = z.polygone.map(q => q[0]);
      ctx.fillStyle = COUL[COUL_ZONES[i]]; ctx.globalAlpha = 0.08;
      ctx.fillRect(X(Math.min(...xs)), m.h, X(Math.max(...xs)) - X(Math.min(...xs)), H - m.h - m.b); ctx.globalAlpha = 1;
      texte(ctx, z.nom.split(' (')[0], (X(Math.min(...xs)) + X(Math.max(...xs))) / 2, H - m.b - 8, COUL[COUL_ZONES[i]], `800 11px ${POLICE}`, 'center');
    });
    ctx.font = `10.5px ${MONO}`; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.fillStyle = COUL.muted;
    for (let x = -100; x <= DOM.x1; x += 50) { const xx = Math.round(X(x)) + 0.5; ctx.beginPath(); ctx.moveTo(xx, m.h); ctx.lineTo(xx, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(x).replace('-', '−'), xx, H - m.b + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('x (km, vers l\'est)', W - m.d, H - 3);
    for (const p of panneaux) {
      const vals = etat.stations.map(s => s[p.cle]), sig = etat.reseau.sigma;
      let lo = Math.min(-0.5, ...vals) - sig, hi = Math.max(0.5, ...vals) + sig;
      const pas = [0.25, 0.5, 1, 2].find(q => (hi - lo) / q <= 6) || 2;
      lo = Math.floor(lo / pas) * pas; hi = Math.ceil(hi / pas) * pas;
      const Y = v => p.y0 + hP - ((v - lo) / (hi - lo)) * hP;
      ctx.strokeStyle = COUL['grid-strong']; ctx.strokeRect(m.g + 0.5, p.y0 + 0.5, W - m.g - m.d - 1, hP - 1);
      ctx.fillStyle = COUL.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = lo; v <= hi + 1e-9; v += pas) { const y = Math.round(Y(v)) + 0.5; ctx.strokeStyle = Math.abs(v) < 1e-9 ? COUL['grid-strong'] : COUL.grid; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.fillText(virg(v, pas < 0.5 ? 2 : pas < 1 ? 1 : 0), m.g - 6, y); }
      texte(ctx, p.titre, m.g + 8, p.y0 + 10, COUL.ink, `700 11.5px ${POLICE}`);
      // Champ vrai
      if (!enExercice()) {
        ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
        for (let i = 0; i <= 360; i++) { const x = DOM.x0 + (i / 360) * (DOM.x1 - DOM.x0), v = G.vitesse(x, 0, etat.champ)[p.cle]; if (i) ctx.lineTo(X(x), Y(v)); else ctx.moveTo(X(x), Y(v)); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // Stations ± σ
      ctx.strokeStyle = COUL.muted; ctx.fillStyle = COUL.ink; ctx.lineWidth = 1;
      for (const s of etat.stations) {
        const x = X(s.x), y = Y(s[p.cle]);
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x, Y(s[p.cle] - s.sigma)); ctx.lineTo(x, Y(s[p.cle] + s.sigma)); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 2 * Math.PI); ctx.fill();
      }
    }
  }

  // Budget de moment, échelle logarithmique de 10¹⁴ à 10¹⁹ N·m/an
  function dessinerMoment() {
    const cv = $('#ge-moment');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: W < 520 ? 70 : 120, d: 16, h: 14, b: 28 }, e0 = 14, e1 = 19;
    const X = v => m.g + ((Math.log10(Math.max(v, 1e-30)) - e0) / (e1 - e0)) * (W - m.g - m.d), hL = (H - m.h - m.b) / ZONES.length;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let e = e0; e <= e1; e++) { const x = Math.round(X(Math.pow(10, e))) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(puissance(e), x, H - m.b + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('N·m/an', W - m.d, H - m.b - 3);
    etat.analyses.forEach((an, i) => {
      const y = m.h + hL * (i + 0.5), z = ZONES[i];
      texte(ctx, W < 520 ? z.nom.split(' (')[0] : z.nom, m.g - 10, y, COUL[COUL_ZONES[i]], `800 12px ${POLICE}`, 'right');
      if (an.aj && !enExercice()) {
        ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 6; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(X(an.tirs.q16), y - 8); ctx.lineTo(X(an.tirs.q84), y - 8); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(X(an.moment), y - 8, 5, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = COUL.blue; ctx.beginPath(); ctx.moveTo(X(etat.chi * an.moment), y - 14); ctx.lineTo(X(etat.chi * an.moment) + 5, y - 3); ctx.lineTo(X(etat.chi * an.moment) - 5, y - 3); ctx.closePath(); ctx.fill();
      }
      if (!enExercice()) { ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(an.momentVrai), y - 8, 7, 0, 2 * Math.PI); ctx.stroke(); }
      ctx.fillStyle = COUL.ink; ctx.fillRect(X(an.momentCat) - 5, y + 2, 10, 10);
      if (an.momentFailles > 0) {
        const xf = X(an.momentCat + an.momentFailles);
        ctx.strokeStyle = COUL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xf, y); ctx.lineTo(xf + 6, y + 7); ctx.lineTo(xf, y + 14); ctx.lineTo(xf - 6, y + 7); ctx.closePath(); ctx.stroke();
      }
      let txt = enExercice() || !an.aj ? `catalogue ${sci(an.momentCat)}` : `${W < 520 ? 'cat./géo.' : 'catalogue / géodésie'} = ${virg(an.momentCat / an.moment, 2)}`;
      if (an.momentFailles > 0 && an.aj && !enExercice()) txt += W < 520 ? ` ; + F : ${virg((an.momentCat + an.momentFailles) / an.moment, 2)}` : ` ; avec la faille F : ${virg((an.momentCat + an.momentFailles) / an.moment, 2)}`;
      ctx.font = `700 11px ${POLICE}`;
      const aGauche = X(an.momentCat) + 10 + ctx.measureText(txt).width > W - m.d;
      texte(ctx, txt, aGauche ? X(an.momentCat) - 10 : X(an.momentCat) - 6, y + 24, COUL.ink, `700 11px ${POLICE}`, aGauche ? 'right' : 'left');
    });
  }

  // Récurrence de la zone choisie : N(≥ M) par an
  function dessinerRecurrence() {
    const cv = $('#ge-recurrence');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 14, b: 30 }, z = ZONES[etat.zone], an = etat.analyses[etat.zone];
    const M0 = 4, M1 = 8, L0 = -5, L1 = 1;
    const X = M => m.g + ((M - M0) / (M1 - M0)) * (W - m.g - m.d), Y = lg => H - m.b - ((lg - L0) / (L1 - L0)) * (H - m.h - m.b);
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let M = M0; M <= M1; M += 0.5) { const x = Math.round(X(M)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); if (M % 1 === 0) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(M), x, H - m.b + 5); } }
    for (let lg = L0; lg <= L1; lg++) { const y = Math.round(Y(lg)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(lg === 0 ? '1' : lg === 1 ? '10' : puissance(lg), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('magnitude M', W - m.d - 4, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('séismes de magnitude ≥ M par an', m.g + 6, m.h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    const courbe = loi => { const pts = []; for (let M = M0; M < loi.mmax - 1e-6; M += 0.02) pts.push([X(M), Y(Math.log10(G.tauxGR(loi, M)))]); return pts; };
    const tracer = (pts, c, w, tirets) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]); };
    if (an.aj && !enExercice()) {
      const bas = courbe(loiGeo(an, z, 0.3)), haut = courbe(loiGeo(an, z, 0.9));
      ctx.fillStyle = COUL['pick-p']; ctx.globalAlpha = 0.14; ctx.beginPath();
      haut.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = bas.length - 1; i >= 0; i--) ctx.lineTo(bas[i][0], bas[i][1]);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      tracer(courbe(loiGeo(an, z, etat.chi)), COUL['pick-p'], 2.6);
    }
    tracer(courbe({ ...an.cat }), COUL.ink, 2.2);
    ctx.restore();
    const t5c = G.tauxGR(an.cat, 5);
    const lignes = [[`catalogue : λ(M≥5) = ${virg(t5c, 3)}/an, un tous les ${milliers(1 / t5c)} ans`, COUL.ink]];
    if (an.aj && !enExercice()) { const t5g = G.tauxGR(loiGeo(an, z, etat.chi), 5); lignes.push([`géodésie (χ = ${virg(etat.chi, 2)}) : λ(M≥5) = ${virg(t5g, 3)}/an, un tous les ${milliers(1 / t5g)} ans`, COUL['pick-p']]); }
    lignes.forEach(([t, c], i) => texte(ctx, t, W - m.d - 8, m.h + 24 + 16 * i, c, `700 11.5px ${POLICE}`, 'right'));
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const an = etat.analyses[etat.zone], z = ZONES[etat.zone], cache = enExercice(), ok = !!an.aj && !cache;
    const g = an.aj ? loiGeo(an, z, etat.chi) : null, t6c = G.tauxGR(an.cat, 6), t6g = g ? G.tauxGR(g, 6) : NaN;
    $('#ge-afficheurs').innerHTML = [
      afficheur('Stations dans la zone', String(an.n), `aire ${milliers(z.aire)} km²`),
      afficheur('Raccourcissement ε̇1h', ok ? `${virg(an.p.e1h, 1)}` : '—', ok ? `± ${virg(an.sp.e1h, 1)} ns/an, axe N${milliers(an.p.azimutRaccourcissement)}°E` : an.aj ? 'ns/an' : 'moins de 3 stations'),
      afficheur('Allongement ε̇2h', ok ? `${signe(an.p.e2h, 1)}` : '—', ok ? `± ${virg(an.sp.e2h, 1)} ns/an` : 'ns/an'),
      afficheur('Ṁ0 géodésique (N·m/an)', ok ? sci(an.moment) : '—', ok ? `tirages 16–84 % : ${sci(an.tirs.q16)} – ${sci(an.tirs.q84)}` : '&nbsp;'),
      afficheur('Ṁ0 du catalogue (N·m/an)', sci(an.momentCat), ok ? `couplage apparent ${virg(an.momentCat / an.moment, 2)}${an.momentFailles > 0 ? ` ; avec la faille F (${sci(an.momentFailles)}) : ${virg((an.momentCat + an.momentFailles) / an.moment, 2)}` : ''}` : 'N·m/an'),
      afficheur(`M ≥ 6 (χ = ${virg(etat.chi, 2)})`, ok ? `${milliers(1 / t6g)} ans` : '—', `catalogue : ${milliers(1 / t6c)} ans`),
    ].join('');
  }
  function majControles() {
    const c = etat.champ;
    $$('[data-ge-zone]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.geZone === etat.zone)));
    $('#ge-n').value = etat.reseau.n; $('#ge-n-v').textContent = String(etat.reseau.n);
    $('#ge-sigma').value = etat.reseau.sigma; $('#ge-sigma-v').textContent = virg(etat.reseau.sigma, 2) + ' mm/an';
    $('#ge-v').value = c.bande.V; $('#ge-v-v').textContent = `${virg(c.bande.V, 1)} mm/an · ${virg(1000 * c.bande.V / (c.bande.x1 - c.bande.x0), 1)} ns/an`;
    $('#ge-s').value = c.faille.s; $('#ge-s-v').textContent = virg(c.faille.s, 2) + ' mm/an';
    $('#ge-d').value = c.faille.D; $('#ge-d-v').textContent = c.faille.D + ' km';
    $('#ge-vrai').checked = etat.vrai;
    $('#ge-mu').value = etat.mu; $('#ge-mu-v').textContent = etat.mu + ' GPa';
    $('#ge-h').value = etat.H; $('#ge-h-v').textContent = etat.H + ' km';
    $('#ge-chi').value = etat.chi; $('#ge-chi-v').textContent = virg(etat.chi, 2);
  }
  function dessiner() { lireCouleurs(); dessinerCarte(); dessinerProfil(); dessinerMoment(); dessinerRecurrence(); }
  function tout() { majControles(); dessiner(); majAfficheurs(); }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 6151 + 17);
    etat.exo = { numero };
    etat.champ = { ...champDepart(), bande: { ...champDepart().bande, V: Math.round(u.entre(1.2, 4.5) * 10) / 10 },
      faille: { ...champDepart().faille, s: Math.round(u.entre(0.2, 1.2) * 20) / 20, D: Math.round(u.entre(8, 18)) } };
    etat.reseau = { n: 160, sigma: 0.3, graine: numero };
    etat.mu = 30; etat.H = 15; etat.verifie = false;
    $('#ge-exo-num').textContent = 'Exercice n° ' + numero;
    for (const id of ['#ge-r-e', '#ge-r-m', '#ge-r-c']) $(id).value = '';
    $('#ge-corrige').innerHTML = '';
    tirer(); tout();
  }
  function verifier() {
    const an = etat.analyses[1], vraiE = Math.abs(G.principales(an.vrai).e1h), vraiM = an.momentVrai, vraiC = an.momentCat / vraiM;
    const lu = id => parseFloat(String($(id).value).replace(',', '.').replace(/\s/g, ''));
    const vE = Math.abs(lu('#ge-r-e')), vM = lu('#ge-r-m') * 1e17, vC = lu('#ge-r-c');
    const okE = Math.abs(vE / vraiE - 1) <= 0.2, okM = Math.abs(vM / vraiM - 1) <= 0.25, okC = Math.abs(vC / vraiC - 1) <= 0.25;
    etat.verifie = true;
    const lignes = [
      ['Raccourcissement de la zone B', Number.isFinite(vE) ? virg(vE, 1) + ' ns/an' : '—', virg(vraiE, 1) + ' ns/an', okE, '± 20 % ; pente de vE à travers la bande'],
      ['Ṁ0 géodésique de la zone B', Number.isFinite(vM) ? sci(vM, 2) : '—', sci(vraiM, 2) + ' N·m/an', okM, `± 25 % ; 2μHA·|ε̇|, A = ${milliers(ZONES[1].aire)} km²`],
      ['Couplage apparent', Number.isFinite(vC) ? virg(vC, 2) : '—', virg(vraiC, 2), okC, '± 25 % ; Ṁ0 catalogue / Ṁ0 géodésique'],
    ];
    $('#ge-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Vrai</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">Vrai : perte de ${virg(etat.champ.bande.V, 1)} mm/an vers l'est sur les ${etat.champ.bande.x1 - etat.champ.bande.x0} km de la bande ;
      faille de la zone A à ${virg(etat.champ.faille.s, 2)} mm/an, bloquée jusqu'à ${etat.champ.faille.D} km. Le champ vrai est maintenant tracé.</p>`;
    tout();
  }

  // ── Événements ──────────────────────────────────────────────────────────
  let attente = 0;
  const planifier = (f) => { clearTimeout(attente); attente = setTimeout(() => { f(); tout(); }, 80); };
  let minuteurToast = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function brancher() {
    $$('[data-ge-zone]').forEach(b => b.addEventListener('click', () => { etat.zone = +b.dataset.geZone; tout(); }));
    $('#ge-n').addEventListener('input', e => { etat.reseau.n = parseInt(e.target.value, 10); majControles(); planifier(tirer); });
    $('#ge-sigma').addEventListener('input', e => { etat.reseau.sigma = parseFloat(e.target.value); majControles(); planifier(tirer); });
    $('#ge-tirage').addEventListener('click', () => { etat.reseau.graine = 1 + Math.floor(Math.random() * 1e5); tirer(); tout(); });
    $('#ge-v').addEventListener('input', e => { etat.champ.bande.V = parseFloat(e.target.value); majControles(); planifier(tirer); });
    $('#ge-s').addEventListener('input', e => { etat.champ.faille.s = parseFloat(e.target.value); majControles(); planifier(tirer); });
    $('#ge-d').addEventListener('input', e => { etat.champ.faille.D = parseFloat(e.target.value); majControles(); planifier(tirer); });
    $('#ge-vrai').addEventListener('change', e => { etat.vrai = e.target.checked; dessiner(); });
    $('#ge-mu').addEventListener('input', e => { etat.mu = parseFloat(e.target.value); majControles(); planifier(analyser); });
    $('#ge-h').addEventListener('input', e => { etat.H = parseFloat(e.target.value); majControles(); planifier(analyser); });
    $('#ge-chi').addEventListener('input', e => { etat.chi = parseFloat(e.target.value); majControles(); dessiner(); majAfficheurs(); });
    $('#ge-envoyer').addEventListener('click', () => {
      if (etat.analyses.some(an => !an.aj)) { toast('Une zone a moins de trois stations : densifiez le réseau.'); return; }
      const moments = etat.analyses.map(an => an.moment);
      window.dispatchEvent(new CustomEvent('geodesie:moments', { detail: { moments, source: `réseau de ${etat.reseau.n} stations, σ = ${virg(etat.reseau.sigma, 2)} mm/an` } }));
      $('#ge-envoi').textContent = `Envoyé : zone A ${sci(moments[0])}, zone B ${sci(moments[1])} N·m/an. Le banc Aléa garde ses couplages 0,3 / 0,6 / 0,9.`;
      toast('Moments géodésiques transmis au banc Aléa.');
    });
    $('#ge-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#ge-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#ge-verifier').addEventListener('click', verifier);
    $('#ge-nouvel-exo').addEventListener('click', nouvelExercice);
    const cv = $('#ge-carte');
    cv.addEventListener('pointermove', e => {
      const g = geoCarte(cv), x = g.x(e.offsetX), y = g.y(e.offsetY);
      let best = null, dmin = 12;
      for (const s of etat.stations) { const d = Math.hypot(s.x - x, s.y - y); if (d < dmin) { dmin = d; best = s; } }
      $('#ge-curseur').textContent = best ? `${best.id} : vE ${signe(best.e, 2)}, vN ${signe(best.n, 2)} mm/an (± ${virg(best.sigma, 2)})` : x >= DOM.x0 && x <= DOM.x1 && y >= DOM.y0 && y <= DOM.y1 ? `x ${virg(x, 0)} km, y ${virg(y, 0)} km` : '—';
    });
    const redessiner = () => { if (etat.analyses.length && !$('#banc-geodesie').hidden) dessiner(); };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#ge-carte', '#ge-profil', '#ge-moment', '#ge-recurrence']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#ge-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#ge-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#ge-panneau-explorer').hidden = m !== 'explorer';
    $('#ge-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') { etat.zone = 1; nouvelExercice(); }
    else { etat.champ = champDepart(); etat.reseau = { n: 150, sigma: 0.3, graine: 7 }; etat.verifie = false; tirer(); tout(); }
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'geodesie') return;
    if (!etat.pret) { etat.pret = true; brancher(); tirer(); }
    tout();
  });
})();
