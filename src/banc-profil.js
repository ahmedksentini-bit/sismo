import Sismo from './sismo/signal.js';
import Refraction from './sismo/refraction.js';

// src/banc-profil.js — banc « profil par distance » : douze stations alignées, traces rangées par
// distance, hodochrones Pg et Pn, et lecture de la croûte (V₁, V₂, épaisseur, distance de croisement).
// Carte des stations et coupe de la Terre redessinées à chaque changement : la croûte tirée des droites de
// l'utilisateur, le modèle simulé en tirets en mode Explorer ou après « Vérifier » seulement.
(() => {
  'use strict';
  const SM = Sismo, Rf = Refraction;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const DISTANCES = Array.from({ length: 12 }, (_, i) => 15 + 30 * i);
  const DMAX = 360, H_FOYER = 5, MW = 5;
  const BAZ = 90; // azimut de chaque station vers la source : les stations sont à l'ouest de l'épicentre (azimut 270°)
  const VPVS1 = 1.73, VPVS2 = 1.75;

  const etat = {
    pret: false, mode: 'explorer',
    explo: { H: 32, v1: 6.0, v2: 8.0, graine: 7 }, exo: null,
    reduction: 8, ampli: 'p', hodo: true, outil: 'g',
    points: { g: [], n: [] }, droites: { g: null, n: null }, traces: [], verifie: false, curseur: null,
  };
  const parametres = () => (etat.mode === 'explorer' ? etat.explo : etat.exo.p);
  const modele = p => ({ H: p.H, vp1: p.v1, vs1: p.v1 / VPVS1, vp2: p.v2, vs2: p.v2 / VPVS2 });

  function occupe(on) {
    const b = $('#etat-calcul');
    b.classList.toggle('calcul', on);
    b.lastElementChild.textContent = on ? 'Calcul des 12 stations…' : 'Signal prêt';
  }
  function plusTard(fn) { occupe(true); setTimeout(() => { try { fn(); } finally { occupe(false); } }, 30); }

  // ── Génération des douze traces (composante Z, vitesse filtrée 1–10 Hz) ─
  function regenerer() {
    const p = parametres(), m = modele(p);
    etat.traces = DISTANCES.map((d, k) => {
      const ev = SM.generer({ Mw: MW, delta: d, h: H_FOYER, baz: BAZ, graine: p.graine * 20 + k, modele: m, fin: d / m.vs1 + 25 });
      const rec = SM.enregistrer(ev, 'HH', 'calme', p.graine * 7 + k);
      const z = SM.convertir(rec.series.Z, ev.dt, 'HH', 'vitesse', [1, 10]);
      // Normalisations : trace entière, ou fenêtre des ondes P (de la première P à la Sg)
      const iP = Math.round((ev.tt.tP - ev.t0 - 1) / ev.dt), iS = Math.round((Math.min(ev.tt.tSg - 1, ev.tt.tP + 8) - ev.t0) / ev.dt);
      let mt = 0, mp = 0;
      for (let i = 0; i < ev.n; i++) mt = Math.max(mt, Math.abs(z[i]));
      for (let i = Math.max(0, iP); i < Math.min(ev.n, iS); i++) mp = Math.max(mp, Math.abs(z[i]));
      return { d, t0: ev.t0, dt: ev.dt, z, tt: ev.tt, mt: mt || 1, mp: mp || 1 };
    });
    etat.points = { g: [], n: [] }; etat.droites = { g: null, n: null }; etat.verifie = false;
    if (etat.mode === 'exercice') $('#p-corrige').innerHTML = '';
    tout();
  }

  // ── Géométrie du profil ─────────────────────────────────────────────────
  const fenetre = () => (etat.reduction === 8 ? [-4, 50] : etat.reduction === 6 ? [-4, 45] : [0, 115]);
  const reduit = (t, d) => (etat.reduction ? t - d / etat.reduction : t);
  const vrai = (tr, d) => (etat.reduction ? tr + d / etat.reduction : tr);
  function geo(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, m = { g: 58, d: 14, h: 16, b: 34 }, [ta, tb] = fenetre();
    return {
      W, H, m, ta, tb,
      X: t => m.g + ((t - ta) / (tb - ta)) * (W - m.g - m.d),
      T: x => ta + ((x - m.g) / (W - m.g - m.d)) * (tb - ta),
      Y: d => m.h + (d / DMAX) * (H - m.h - m.b),
      D: y => ((y - m.h) / (H - m.h - m.b)) * DMAX,
    };
  }

  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'vrai', 'muted', 'ink', 'paper', 'blue'])
      COUL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function preparer(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    return { ctx, W, H };
  }
  // Texte avec halo, gardé dans le canvas (un libellé proche du bord est décalé vers l'intérieur).
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
    const w = ctx.measureText(t).width, W = ctx.canvas.clientWidth, g = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    if (g < 3) x += 3 - g; else if (g + w > W - 3) x -= g + w - (W - 3);
    ctx.lineWidth = 4; ctx.strokeStyle = COUL.paper; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
    ctx.fillStyle = coul; ctx.fillText(t, x, y);
  }
  // Hodochrones théoriques (temps vrais depuis l'origine) pour le modèle courant.
  function hodochrones() {
    const p = parametres(), m = modele(p), L = [];
    const branche = (nom, f, coul) => { const pts = []; for (let d = 0; d <= DMAX; d += 2) { const t = f(d); if (t !== null) pts.push([d, t]); } L.push({ nom, pts, coul }); };
    branche('Pg', d => Math.hypot(d, H_FOYER) / m.vp1, COUL.phase);
    branche('Pn', d => SM.temps(d, H_FOYER, Object.assign({}, SM.MODELE, m)).tPn, COUL.phase);
    branche('Sg', d => Math.hypot(d, H_FOYER) / m.vs1, COUL.muted);
    return L;
  }
  function dessiner() {
    lireCouleurs();
    const cv = $('#p-section');
    if (cv.clientWidth < 50 || !etat.traces.length) return;
    const { ctx, W, H } = preparer(cv), g = geo(cv);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    // Axes : temps (réduit) en abscisse, distance en ordonnée
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    const pas = g.tb - g.ta > 80 ? 10 : 5;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = Math.ceil(g.ta / pas) * pas; t <= g.tb; t += pas) {
      const x = Math.round(g.X(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? COUL['grid-strong'] : COUL.grid;
      ctx.beginPath(); ctx.moveTo(x, g.m.h); ctx.lineTo(x, H - g.m.b); ctx.stroke();
      ctx.fillText(virg(t, 0), x, H - g.m.b + 5);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(etat.reduction ? `t − Δ/${etat.reduction} (s)` : 't (s)', W - g.m.d, H - 3);
    ctx.textBaseline = 'middle';
    for (const tr of etat.traces) ctx.fillText(tr.d + ' km', g.m.g - 6, g.Y(tr.d));
    // Traces en surface variable (lobes positifs remplis)
    const ecart = g.Y(30) - g.Y(0), px = W - g.m.g - g.m.d;
    for (const tr of etat.traces) {
      const yb = g.Y(tr.d), norme = etat.ampli === 'p' ? tr.mp : tr.mt, k = (0.6 * ecart) / norme, lim = 0.95 * ecart;
      ctx.save(); ctx.beginPath(); ctx.rect(g.m.g, yb - ecart, px, 2 * ecart); ctx.clip();
      ctx.beginPath();
      const colonnes = [];
      for (let c = 0; c < px; c++) {
        const ta = vrai(g.T(g.m.g + c), tr.d) - tr.t0, tb = vrai(g.T(g.m.g + c + 1), tr.d) - tr.t0;
        const ia = Math.floor(ta / tr.dt), ib = Math.ceil(tb / tr.dt);
        if (ib < 0 || ia >= tr.z.length) { colonnes.push(null); continue; }
        let mn = Infinity, mx = -Infinity;
        for (let i = Math.max(0, ia); i <= Math.min(tr.z.length - 1, ib); i++) { const v = tr.z[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        colonnes.push([Math.max(-lim, Math.min(lim, mn * k)), Math.max(-lim, Math.min(lim, mx * k))]);
      }
      ctx.fillStyle = COUL.trace;
      colonnes.forEach((cl, c) => { if (cl && cl[1] > 0) ctx.fillRect(g.m.g + c, yb - cl[1], 1, cl[1]); });
      ctx.strokeStyle = COUL.trace; ctx.lineWidth = 0.8; ctx.beginPath();
      let premier = true;
      colonnes.forEach((cl, c) => {
        if (!cl) { premier = true; return; }
        const X = g.m.g + c + 0.5;
        if (premier) { ctx.moveTo(X, yb - cl[1]); premier = false; } else ctx.lineTo(X, yb - cl[1]);
        ctx.lineTo(X, yb - cl[0]);
      });
      ctx.stroke(); ctx.restore();
    }
    // Hodochrones théoriques
    if ((etat.mode === 'explorer' && etat.hodo) || etat.verifie) {
      for (const b of hodochrones()) {
        ctx.save(); ctx.strokeStyle = b.coul; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.beginPath();
        b.pts.forEach(([d, t], i) => { const x = g.X(reduit(t, d)), y = g.Y(d); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke(); ctx.restore();
        const last = b.pts[b.pts.length - 1];
        if (last) { const x = g.X(reduit(last[1], last[0])); if (x > g.m.g && x < W - g.m.d) texte(ctx, b.nom, x + 4, g.Y(last[0]) - 8, b.coul, `800 11px ${POLICE}`); }
      }
    }
    // Droites de l'utilisateur
    for (const [cle, coul, nom] of [['g', COUL['pick-p'], 'Pg'], ['n', COUL['pick-s'], 'Pn']]) {
      const dr = etat.droites[cle];
      if (dr) {
        ctx.save(); ctx.beginPath(); ctx.rect(g.m.g, g.m.h, W - g.m.g - g.m.d, H - g.m.h - g.m.b); ctx.clip();
        ctx.strokeStyle = coul; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(g.X(reduit(dr.ti, 0)), g.Y(0)); ctx.lineTo(g.X(reduit(dr.ti + DMAX / dr.V, DMAX)), g.Y(DMAX)); ctx.stroke(); ctx.restore();
        const dl = cle === 'g' ? 60 : 300, xl = g.X(reduit(dr.ti + dl / dr.V, dl));
        if (xl > g.m.g && xl < W - g.m.d - 60) texte(ctx, `${nom} : ${virg(dr.V, 2)} km/s`, xl + 8, g.Y(dl), coul, `800 11.5px ${POLICE}`);
      }
      for (const pt of etat.points[cle]) {
        ctx.fillStyle = coul; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.X(reduit(pt.t, pt.d)), g.Y(pt.d), 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      }
    }
    if (etat.curseur) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = COUL.muted; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(etat.curseur[0] + 0.5, g.m.h); ctx.lineTo(etat.curseur[0] + 0.5, H - g.m.b);
      ctx.moveTo(g.m.g, etat.curseur[1] + 0.5); ctx.lineTo(W - g.m.d, etat.curseur[1] + 0.5); ctx.stroke(); ctx.restore();
    }
  }

  // ── Lectures ────────────────────────────────────────────────────────────
  function lectures() {
    const g = etat.droites.g, n = etat.droites.n, r = { V1: g ? g.V : null, V2: n ? n.V : null, ti: n ? n.ti : null };
    if (g && n && n.V > g.V) {
      r.ic = Math.asin(g.V / n.V);
      r.H = Rf.epaisseur(g.V, n.V, n.ti, H_FOYER);
      r.xc = Rf.intersection(g, n);
    }
    return r;
  }
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majLectures() {
    const r = lectures(), deg = a => virg((a * 180) / Math.PI, 1) + '°';
    $('#p-afficheurs').innerHTML = [
      afficheur('Vitesse de la croûte V₁', r.V1 ? virg(r.V1, 2) + ' km/s' : '—', r.V1 ? 'pente de la droite Pg' : 'outil « Droite Pg »'),
      afficheur('Vitesse du manteau V₂', r.V2 ? virg(r.V2, 2) + ' km/s' : '—', r.V2 ? 'pente de la droite Pn' : 'outil « Droite Pn »'),
      afficheur("Temps d'intercept tᵢ", r.ti !== null ? virg(r.ti, 2) + ' s' : '—', r.ti !== null ? 'droite Pn prolongée à Δ = 0' : ''),
      afficheur('Angle critique iᶜ', r.ic ? deg(r.ic) : '—', r.ic ? 'sin iᶜ = V₁ / V₂' : ''),
      afficheur('Épaisseur de la croûte H', r.H ? virg(r.H, 1) + ' km' : '—', r.H ? 'profondeur du Moho' : 'les deux droites'),
      afficheur('Distance de croisement', r.xc ? Math.round(r.xc) + ' km' : '—', r.xc ? 'Pn devance Pg au-delà' : ''),
      afficheur('Profondeur du foyer h', H_FOYER + ' km', 'donnée'),
      afficheur('Réduction', etat.reduction ? `${etat.reduction} km/s` : 'aucune', etat.reduction ? 'une onde à cette vitesse est horizontale' : ''),
    ].join('');
    const e = [];
    e.push(['1', 'Vitesse de la croûte', 'Les ondes directes Pg s\'alignent sur une droite qui passe près de l\'origine ; sa pente est la lenteur 1/V₁.',
      r.V1 ? `V₁ = (Δ₂ − Δ₁) / (t₂ − t₁) = <b>${virg(r.V1, 2)} km/s</b>` : 'V₁ = (Δ₂ − Δ₁) / (t₂ − t₁) sur la droite Pg']);
    e.push(['2', 'Vitesse du manteau et temps d\'intercept', 'Au-delà de la distance critique, la première arrivée est Pn : elle a voyagé sous le Moho, à V₂.',
      r.V2 ? `V₂ = <b>${virg(r.V2, 2)} km/s</b> ; tᵢ = <b>${virg(r.ti, 2)} s</b>` : 'droite Pn : t = tᵢ + Δ / V₂']);
    e.push(['3', 'Épaisseur de la croûte', 'Le temps d\'intercept mesure le trajet oblique dans la croûte, à l\'aller et au retour.',
      r.H ? `H = (tᵢ · V₁ / cos iᶜ + h) / 2 = (${virg(r.ti, 2)} × ${virg(r.V1, 2)} / ${virg(Math.cos(r.ic), 3)} + ${H_FOYER}) / 2 = <b>${virg(r.H, 1)} km</b>` : 'H = (tᵢ · V₁ / cos iᶜ + h) / 2, avec sin iᶜ = V₁ / V₂']);
    $('#p-etapes').innerHTML = e.map(([n, h, p, f]) => `<div class="etape"><span>${n}</span><div><h4>${h}</h4><p>${p}</p><div class="formule">${f}</div></div></div>`).join('');
  }
  function verite() {
    const p = parametres(), ti = Rf.intercept(p.v1, p.v2, p.H, H_FOYER);
    return { V1: p.v1, V2: p.v2, H: p.H, ti, xc: Rf.croisement(p.v1, p.v2, ti, H_FOYER) };
  }
  function majVerite() {
    if (etat.mode !== 'explorer') return;
    const v = verite();
    $('#p-verite').innerHTML = `<b>Vérité terrain.</b> V₁ = <b>${virg(v.V1, 2)} km/s</b>, V₂ = <b>${virg(v.V2, 2)} km/s</b>, H = <b>${virg(v.H, 0)} km</b> ; tᵢ = ${virg(v.ti, 2)} s ; Pn devance Pg au-delà de <b>${Math.round(v.xc)} km</b>.`;
  }
  // ── Carte des stations et coupe de la Terre ─────────────────────────────
  // Croûte de l'utilisateur : V₁ et V₂ des pentes, H des lectures (Refraction.coupe) ; la phase première à chaque
  // station est celle de la droite la plus précoce (le croisement des droites, comme l'afficheur). Le modèle simulé
  // (première arrivée du générateur) ne se montre qu'en mode Explorer ou après « Vérifier ».
  const vraiVisible = () => etat.mode === 'explorer' || etat.verifie;
  const CROUTE = 'rgba(180,120,60,0.10)', MANTEAU = 'rgba(180,120,60,0.24)';
  function interpretation() {
    const r = lectures(), g = etat.droites.g, n = etat.droites.n;
    const coupe = g ? Rf.coupe(g.V, r.H ? n.V : null, r.H || null, H_FOYER, DISTANCES) : null;
    return { r, g, n, coupe, premieres: DISTANCES.map(d => Rf.premiereLue(g, n, d)) };
  }
  function modeleVrai() { const p = parametres(); return Rf.coupe(p.v1, p.v2, p.H, H_FOYER, DISTANCES); }
  const couleurPhase = ph => (ph === 'Pn' ? COUL['pick-s'] : COUL['pick-p']);
  function etoile(ctx, x, y, r, coul) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = coul; ctx.fill(); ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1.2; ctx.stroke();
  }
  // Triangle de station (pointe en haut sur la carte, en bas sur la coupe) ; creux si la phase première n'est pas lue.
  function triangle(ctx, x, y, s, sens, plein) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s, y - sens * 1.8 * s); ctx.lineTo(x + s, y - sens * 1.8 * s); ctx.closePath();
    ctx.fillStyle = plein || COUL.paper; ctx.fill(); ctx.lineWidth = plein ? 1.2 : 1.4; ctx.strokeStyle = plein ? COUL.paper : COUL.ink; ctx.stroke();
  }
  const ligne = (ctx, pts, X, Z) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); };
  // Cote horizontale à double flèche de xd à xf (px) : libellé dessus si la place suffit, sinon à droite (gardé dans
  // le canvas), le trait s'interrompant sous le libellé ; « suite » [texte, couleur] prolonge le libellé.
  function cote(ctx, xd, xf, y, coul, etiquette, police, tirets = false, suite = null) {
    ctx.font = police;
    const a = Math.min(xd, xf), b = Math.max(xd, xf), w1 = ctx.measureText(etiquette).width, w = w1 + (suite ? ctx.measureText(suite[0]).width : 0);
    let xg = w + 24 < b - a ? (a + b) / 2 - w / 2 : b + 6;
    xg = Math.max(3, Math.min(ctx.canvas.clientWidth - 3 - w, xg));
    ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineWidth = 1.2; ctx.setLineDash(tirets ? [5, 3] : []);
    ctx.beginPath();
    for (const [u, v] of [[a, Math.min(b, xg - 4)], [Math.max(a, xg + w + 4), b]]) if (v > u) { ctx.moveTo(u, y); ctx.lineTo(v, y); }
    ctx.stroke(); ctx.setLineDash([]);
    const s = Math.sign(xf - xd) || 1;
    for (const [x, sg] of [[xd, -s], [xf, s]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sg * 6, y - 3.5); ctx.lineTo(x - sg * 6, y + 3.5); ctx.closePath(); ctx.fill(); }
    texte(ctx, etiquette, xg, y, coul, police, 'left');
    if (suite) texte(ctx, suite[0], xg + w1, y, suite[1], police, 'left');
  }

  // Carte : épicentre à l'origine, x vers l'est, y vers le nord (km), échelle isotrope ; stations le long du profil.
  function dessinerCarte() {
    const cv = $('#p-carte');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), I = interpretation(), V = vraiVisible() ? modeleVrai() : null;
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const mg = 16, md = 36, k = (W - mg - md) / DMAX, xE = W - md, yP = Math.round(H * 0.42);
    const X = x => xE + x * k, Y = y => yP - y * k;
    // Quadrillage tous les 50 km depuis l'épicentre
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let x = 0; X(x) > 0; x -= 50) { ctx.beginPath(); ctx.moveTo(Math.round(X(x)) + 0.5, 0); ctx.lineTo(Math.round(X(x)) + 0.5, H); ctx.stroke(); }
    for (let y = -Math.floor(yP / k / 50) * 50; Y(y) > 0; y += 50) { ctx.beginPath(); ctx.moveTo(0, Math.round(Y(y)) + 0.5); ctx.lineTo(W, Math.round(Y(y)) + 0.5); ctx.stroke(); }
    // Nord et échelle
    const nx = mg + 8, ny = 10;
    ctx.fillStyle = COUL.ink; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx - 6, ny + 16); ctx.lineTo(nx + 6, ny + 16); ctx.closePath(); ctx.fill();
    texte(ctx, 'N', nx, ny + 19, COUL.ink, `800 11px ${POLICE}`, 'center', 'top');
    const L = 100 * k < W * 0.45 ? 100 : 50, ye = H - 22;
    ctx.fillStyle = COUL.ink;
    ctx.fillRect(mg, ye, (L / 2) * k, 4); ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1; ctx.strokeRect(mg + 0.5, ye + 0.5, L * k, 4);
    for (const [v, a] of [[0, 'center'], [L / 2, 'center'], [L, 'left']]) texte(ctx, v === L ? `${v} km` : String(v), mg + v * k - (v === L ? 3 : 0), ye + 7, COUL.ink, `10px ${MONO}`, a, 'top');
    // Profil (azimut 270°) et épicentre
    ctx.save(); ctx.strokeStyle = COUL.muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(0), yP); ctx.lineTo(X(-DMAX), yP); ctx.stroke(); ctx.restore();
    texte(ctx, `profil vers l'ouest (azimut ${(BAZ + 180) % 360}°)`, nx + 14, ny + 8, COUL.muted, `600 10.5px ${POLICE}`, 'left');
    // Croisement selon vos droites (trait plein), selon le modèle simulé (tirets, sous les stations)
    const xc = I.r.xc;
    if (Number.isFinite(xc) && xc > 0 && xc < DMAX) {
      ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(-xc), yP - 18); ctx.lineTo(X(-xc), yP + 6); ctx.stroke();
      texte(ctx, `Xc ${Math.round(xc)} km`, X(-xc), yP - 25, COUL.ink, `800 10.5px ${POLICE}`, 'center', 'bottom');
    }
    // Stations : couleur de la phase première selon vos droites ; distances dessous, sur deux rangs si elles sont
    // serrées (l'unité sur la plus proche seulement si la place manque)
    ctx.font = `10.5px ${MONO}`;
    const pas = 30 * k, wkm = ctx.measureText('345 km').width + 10, deuxRangs = wkm > pas, toutes = wkm <= (deuxRangs ? 2 * pas : pas);
    const yv = yP + (deuxRangs ? 44 : 34);
    if (V && V.xc !== null && V.xc < DMAX) {
      ctx.save(); ctx.strokeStyle = COUL.vrai; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(-V.xc), yP + 4); ctx.lineTo(X(-V.xc), yv + 8); ctx.stroke(); ctx.restore();
    }
    DISTANCES.forEach((d, i) => {
      const ph = I.premieres[i];
      triangle(ctx, X(-d), yP - 8, 6, -1, ph ? couleurPhase(ph) : null);
      texte(ctx, toutes || i === 0 ? `${d} km` : String(d), X(-d), yP + 8 + (deuxRangs && i % 2 ? 12 : 0), COUL.ink, `10.5px ${MONO}`, 'center', 'top');
    });
    if (V) {
      if (V.xc !== null && V.xc < DMAX) texte(ctx, `Xc simulé ${Math.round(V.xc)} km`, X(-V.xc), yv + 11, COUL.vrai, `800 10.5px ${POLICE}`, 'center', 'top');
      V.stations.forEach(s => { ctx.fillStyle = couleurPhase(s.premiere); ctx.strokeStyle = COUL.paper; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(-s.d), yv, 3.6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); });
      texte(ctx, 'simulé', X(-DISTANCES[0]) + 8, yv, COUL.vrai, `700 10px ${POLICE}`, 'left');
    }
    etoile(ctx, X(0), yP, 8, COUL.amp);
    texte(ctx, 'épicentre', X(0), yP - 13, COUL.ink, `700 10.5px ${POLICE}`, 'center', 'bottom');
  }

  // Coupe verticale le long du profil : x = distance (km) depuis l'épicentre, z = profondeur, échelle verticale exagérée.
  function dessinerCoupe() {
    const cv = $('#p-coupe');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), I = interpretation(), V = vraiVisible() ? modeleVrai() : null;
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const P = I.coupe || V, deVous = !!I.coupe;   // dessin principal : votre croûte ; sans droite Pg, le modèle simulé visible
    const premieres = deVous ? I.premieres : P ? P.stations.map(s => s.premiere) : DISTANCES.map(() => null);
    const Hp = P && P.H > 0 ? P.H : null, xcP = deVous ? I.r.xc : P ? P.xc : null;
    const m = { g: 46, d: 12, h: 54, b: 34 }, xa = -12, xb = DMAX;
    const zMax = Math.min(160, Math.max(70, Math.ceil((1.3 * Math.max(Hp || 0, V ? V.H : 0)) / 10) * 10));
    const sx = (W - m.g - m.d) / (xb - xa), sz = (H - m.h - m.b) / zMax, X = x => m.g + (x - xa) * sx, Z = z => m.h + z * sz;
    const x0 = X(xa), x1 = X(xb), y0 = Z(0), y1 = Z(zMax), PETIT = W < 560;
    // Couches de l'interprétation principale
    if (P) {
      const zm = Hp !== null ? Math.min(Hp, zMax) : zMax;
      ctx.fillStyle = CROUTE; ctx.fillRect(x0, y0, x1 - x0, Z(zm) - y0);
      if (Hp !== null && Hp < zMax) { ctx.fillStyle = MANTEAU; ctx.fillRect(x0, Z(Hp), x1 - x0, y1 - Z(Hp)); }
    }
    // Axes : profondeur à gauche, distance en bas
    const pz = zMax > 100 ? 20 : 10;
    ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let z = 0; z <= zMax + 1e-9; z += pz) {
      ctx.strokeStyle = COUL.grid; ctx.beginPath(); ctx.moveTo(x0, Math.round(Z(z)) + 0.5); ctx.lineTo(x1, Math.round(Z(z)) + 0.5); ctx.stroke();
      ctx.fillText(String(z), x0 - 5, Z(z));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let d = 0; d <= DMAX; d += 50) {
      ctx.strokeStyle = COUL.grid; ctx.beginPath(); ctx.moveTo(Math.round(X(d)) + 0.5, y0); ctx.lineTo(Math.round(X(d)) + 0.5, y1); ctx.stroke();
      ctx.fillText(String(d), X(d), y1 + 5);
    }
    ctx.save(); ctx.translate(11, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
    texte(ctx, 'profondeur (km)', 0, 0, COUL.muted, `600 10.5px ${POLICE}`, 'center'); ctx.restore();
    texte(ctx, 'distance Δ (km)', W - m.d, H - 4, COUL.muted, `600 10.5px ${POLICE}`, 'right', 'bottom');
    texte(ctx, `exagération verticale ×${virg(sz / sx, 1)}`, x0, H - 4, COUL.muted, `600 10.5px ${POLICE}`, 'left', 'bottom');
    ctx.strokeStyle = COUL['grid-strong']; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    if (!P) {
      const l = ['Tracez la droite Pg puis la droite Pn sur le profil :', 'la coupe de votre croûte se dessine ici.'];
      if (etat.mode === 'exercice') l.push('Le modèle simulé n\'apparaît qu\'après « Vérifier ».');
      l.forEach((t, i) => texte(ctx, t, (x0 + x1) / 2, (y0 + y1) / 2 + (i - (l.length - 1) / 2) * 19, COUL.muted, `700 ${PETIT ? 12 : 13}px ${POLICE}`, 'center'));
    }
    const PL = `800 ${PETIT ? 10.5 : 11.5}px ${POLICE}`;
    // Modèle simulé en tirets sous votre croûte : Moho, rai Pn vers la station la plus lointaine
    if (V && deVous) {
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.strokeStyle = COUL.vrai; ctx.lineWidth = 1.8; ctx.setLineDash([8, 5]);
      ctx.beginPath(); ctx.moveTo(x0, Z(V.H)); ctx.lineTo(x1, Z(V.H)); ctx.stroke();
      const loin = V.stations[V.stations.length - 1].pn;
      if (loin) { ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85; ligne(ctx, loin.pts, X, Z); }
      ctx.restore();
    }
    // Rais vers chaque station : la première arrivée en trait épais, l'autre phase estompée
    if (P) {
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 - 1, x1 - x0, y1 - y0 + 1); ctx.clip();
      const rais = [];
      P.stations.forEach((s, i) => {
        const pr = premieres[i];
        for (const [ph, r] of [['Pg', s.pg], ['Pn', s.pn]]) if (r) rais.push({ ph, r, rang: pr === null ? 1 : pr === ph || (ph === 'Pg' && !s.pn) ? 2 : 0 });
      });
      rais.sort((a, b) => a.rang - b.rang);
      for (const { ph, r, rang } of rais) {
        ctx.strokeStyle = couleurPhase(ph); ctx.globalAlpha = [0.3, 0.7, 0.95][rang]; ctx.lineWidth = [1, 1.3, 2.2][rang];
        ligne(ctx, r.pts, X, Z);
      }
      ctx.globalAlpha = 1;
      // rai critique (réflexion à l'angle critique) : il fixe la distance critique
      if (P.xcr !== null) {
        const xm = (P.H - P.h) * Math.tan(P.ic);
        ctx.strokeStyle = COUL['pick-s']; ctx.lineWidth = 1.1; ctx.setLineDash([2, 3]);
        ligne(ctx, [[0, P.h], [xm, P.H], [P.xcr, 0]], X, Z); ctx.setLineDash([]);
      }
      ctx.restore();
      ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
      if (Hp !== null && Hp < zMax) { ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x0, Z(Hp)); ctx.lineTo(x1, Z(Hp)); ctx.stroke(); }
    }
    // Cotes : croisement (rang 1) et distance critique (rang 2), repères du modèle simulé en tirets
    const ry1 = 14, ry2 = 32;
    // [distance, rang, couleur, libellé, tirets, complément] ; sans cote à vous, celle du modèle simulé en tirets
    const reperes = [], sim = V && deVous, nomXc = PETIT ? 'croisement' : 'distance de croisement';
    const suite = x => (sim && !PETIT && x !== null ? [` · simulé ${Math.round(x)} km`, COUL.vrai] : null);
    if (P && Number.isFinite(xcP)) reperes.push([xcP, ry1, COUL.ink, `${nomXc} Xc = ${virg(xcP, 0)} km`, false, suite(V && V.xc)]);
    else if (sim && V.xc !== null) reperes.push([V.xc, ry1, COUL.vrai, `${nomXc} simulée ${Math.round(V.xc)} km`, true]);
    if (P && P.xcr !== null) reperes.push([P.xcr, ry2, COUL['pick-s'], `distance critique ${Math.round(P.xcr)} km`, false, suite(V && V.xcr)]);
    else if (sim && V.xcr !== null) reperes.push([V.xcr, ry2, COUL.vrai, `distance critique simulée ${Math.round(V.xcr)} km`, true]);
    for (const [x, y] of reperes) { ctx.save(); ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(Math.max(xa, Math.min(xb, x))), y + 4); ctx.lineTo(X(Math.max(xa, Math.min(xb, x))), y0); ctx.stroke(); ctx.restore(); }
    if (sim) for (const [x, y] of [[V.xc, ry1], [V.xcr, ry2]]) if (x !== null && x < xb) {
      ctx.save(); ctx.strokeStyle = COUL.vrai; ctx.lineWidth = 2; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(X(x), y - 8); ctx.lineTo(X(x), y + 8); ctx.stroke(); ctx.restore();
    }
    for (const [x, y, c, t, ti, su] of reperes) cote(ctx, X(0), X(Math.max(xa, Math.min(xb, x))), y, c, t, `700 ${PETIT ? 10.5 : 11}px ${POLICE}`, ti, su);
    // Stations (pointe sur la surface) et foyer
    DISTANCES.forEach((d, i) => triangle(ctx, X(d), y0 - 1, 6, 1, premieres[i] ? couleurPhase(premieres[i]) : null));
    etoile(ctx, X(0), Z(H_FOYER), 7.5, COUL.amp);
    if (!P) return;
    // Annotations : V₁, V₂, Moho, angle critique (angles déformés par l'exagération verticale)
    // libellé du Moho simulé au bout de sa ligne, du côté opposé à votre Moho ; V₁ dans la croûte, à l'écart de lui
    const yVrai = V && deVous ? Z(V.H) + (Hp === null || V.H >= Hp ? 11 : -10) : -99;
    const yV1 = [0.62, 0.32, 0.85].map(f => Z((Hp !== null ? Math.min(Hp, zMax) : zMax / 2) * f)).find(y => Math.abs(y - yVrai) > 16) ?? Z(Hp * 0.62);
    texte(ctx, `${deVous ? 'votre croûte' : 'croûte simulée'} · V₁ = ${virg(P.V1, 2)} km/s`, x1 - 6, yV1, COUL.ink, PL, 'right');
    if (Hp !== null && Hp < zMax) {
      texte(ctx, `${deVous ? 'votre Moho' : 'Moho simulé'} · H = ${virg(Hp, deVous ? 1 : 0)} km`, x0 + 6, Z(Hp) + 12, COUL.ink, PL, 'left');
      if (P.V2) texte(ctx, `manteau · V₂ = ${virg(P.V2, 2)} km/s`, x1 - 6, Math.max(Z(Hp) + 30, y1 - 14), COUL.ink, PL, 'right');
    }
    if (V && deVous) texte(ctx, `Moho simulé · ${virg(V.H, 0)} km`, x1 - 6, yVrai, COUL.vrai, PL, 'right');
    if (P.ic !== null && P.xcr !== null) {
      const cx = X(0), cy = Z(P.h), xm = (P.H - P.h) * Math.tan(P.ic), th = Math.atan2(Z(P.H) - cy, X(xm) - cx), r = Math.min(30, 0.6 * (Z(P.H) - cy));
      ctx.save(); ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + r + 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, r, th, Math.PI / 2); ctx.stroke(); ctx.restore();
      texte(ctx, `iᶜ = ${virg((P.ic * 180) / Math.PI, 1)}°`, cx + 1.25 * r * Math.cos(th) + 9, cy + 1.25 * r * Math.sin(th), COUL.ink, PL, 'left');
    }
  }

  // Légendes et explications sous les deux figures
  function majTextesFigures() {
    const I = interpretation(), V = vraiVisible() ? modeleVrai() : null, r = I.r, deg = a => virg((a * 180) / Math.PI, 1) + '°';
    const auDela = ps => ps.filter(p => p === 'Pn').length;
    const simule = V ? `modèle simulé : V₁ = ${virg(V.V1, 2)} km/s, V₂ = ${virg(V.V2, 2)} km/s, H = ${virg(V.H, 0)} km, iᶜ = ${deg(V.ic)}, distance critique ${Math.round(V.xcr)} km, croisement ${Math.round(V.xc)} km` : '';
    const attente = etat.mode === 'exercice' && !etat.verifie ? ' Le modèle simulé n\'apparaît qu\'après « Vérifier ».' : '';
    // Carte
    let c;
    if (I.premieres[0] !== null) {
      const n = auDela(I.premieres);
      c = `Selon vos droites, Pn arrive la première ${Number.isFinite(r.xc) && r.xc > 0 ? `au-delà de <b>${Math.round(r.xc)} km</b>` : 'partout'} : <b>${n} station${n > 1 ? 's' : ''}</b> sur 12.`;
    } else c = 'Tracez les deux droites : chaque station prend la couleur de la phase qui y arrive la première selon vous.';
    if (V) { const n = auDela(V.stations.map(s => s.premiere)); c += ` Points : ${n} station${n > 1 ? 's' : ''} en Pn d'abord dans le modèle simulé.`; }
    $('#p-carte-aide').innerHTML = c + attente;
    $('#p-carte-leg-vrai').hidden = !V;
    // Coupe
    let t;
    if (!I.g) t = V ? `Dessin du ${simule}. ${I.n ? 'Il manque la droite Pg' : 'Tracez vos droites Pg et Pn'} : votre croûte remplacera ce dessin, le modèle simulé restera en tirets.`
      : 'Il faut d\'abord la droite Pg (V₁), puis la droite Pn (V₂ et tᵢ) pour situer le Moho.';
    else if (!I.n) t = `Votre droite Pg donne V₁ = ${virg(r.V1, 2)} km/s : tracez la droite Pn pour situer le Moho.`;
    else if (!r.H) t = 'Votre droite Pn est plus lente que la droite Pg : sans manteau plus rapide, pas d\'onde conique ni de Moho. Reprenez la droite Pn sur les stations lointaines.';
    else if (r.H <= H_FOYER) t = `Votre Moho (H = ${virg(r.H, 1)} km) passe au-dessus du foyer (h = ${H_FOYER} km) : tᵢ est trop petit, reprenez la droite Pn.`;
    else t = `Votre croûte : V₁ = ${virg(r.V1, 2)} km/s, V₂ = ${virg(r.V2, 2)} km/s, H = ${virg(r.H, 1)} km, iᶜ = ${deg(r.ic)} ; Pn n'existe qu'au-delà de la distance critique (${Math.round(I.coupe.xcr)} km) et devance Pg au-delà du croisement de vos droites.`;
    if (I.g && V) t += ` Tirets : ${simule}.`;
    $('#p-coupe-aide').innerHTML = t + attente;
    $('#p-coupe-leg-vrai').hidden = !(V && I.g);
  }
  function figures() { lireCouleurs(); dessinerCarte(); dessinerCoupe(); majTextesFigures(); }

  function majAide() {
    const t = {
      g: '<strong>Droite Pg.</strong> Cliquez deux points sur les premières arrivées des stations proches (avant le croisement).',
      n: '<strong>Droite Pn.</strong> Cliquez deux points sur les premières arrivées des stations lointaines. Avec la réduction à 8 km/s, elles sont presque alignées à l\'horizontale.',
    }[etat.outil] || '';
    $('#p-aide').innerHTML = t + ' L\'amplitude « P renforcée » écrête les traces pour faire ressortir les premières arrivées, plus faibles que la Sg.';
  }
  function majOutils() { $$('[data-p-outil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pOutil === etat.outil))); }
  function tout() { majOutils(); dessiner(); figures(); majLectures(); majVerite(); majAide(); }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 6151 + 9);
    etat.exo = { numero, p: { H: Math.round(u.entre(24, 44)), v1: Math.round(u.entre(5.7, 6.5) * 20) / 20, v2: Math.round(u.entre(7.7, 8.3) * 20) / 20, graine: numero } };
    // la croûte du nouvel exercice ne doit pas apparaître avant « Vérifier » : verrou tout de suite, sans attendre le calcul
    etat.outil = 'g'; etat.verifie = false; etat.points = { g: [], n: [] }; etat.droites = { g: null, n: null };
    $('#p-exo-num').textContent = 'Exercice n° ' + numero;
    $('#p-corrige').innerHTML = '';
    figures();
    plusTard(regenerer);
  }
  function verifier() {
    const r = lectures(), v = verite();
    const lignes = [
      ['Vitesse de la croûte V₁', r.V1 ? virg(r.V1, 2) + ' km/s' : '—', virg(v.V1, 2) + ' km/s', r.V1 !== null && Math.abs(r.V1 - v.V1) <= 0.25, '± 0,25 km/s'],
      ['Vitesse du manteau V₂', r.V2 ? virg(r.V2, 2) + ' km/s' : '—', virg(v.V2, 2) + ' km/s', r.V2 !== null && Math.abs(r.V2 - v.V2) <= 0.3, '± 0,3 km/s'],
      ['Épaisseur de la croûte', r.H ? virg(r.H, 1) + ' km' : '—', virg(v.H, 0) + ' km', !!r.H && Math.abs(r.H - v.H) <= 4, '± 4 km'],
      ['Distance de croisement', r.xc ? Math.round(r.xc) + ' km' : '—', Math.round(v.xc) + ' km', !!r.xc && Math.abs(r.xc - v.xc) <= 20, '± 20 km'],
    ];
    etat.verifie = true;
    $('#p-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Vrai</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">tolérance ${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 4 lectures justes</p>
      <p class="verite">Les hodochrones théoriques (tirets) sont maintenant tracées. Une erreur sur V₁ se reporte sur H : vérifiez d'abord la droite Pg.</p>`;
    tout();
  }

  // ── Événements ──────────────────────────────────────────────────────────
  function majCurseurs() {
    const e = etat.explo;
    $('#p-H').value = e.H; $('#p-H-v').textContent = e.H + ' km';
    $('#p-v1').value = e.v1; $('#p-v1-v').textContent = virg(e.v1, 2) + ' km/s';
    $('#p-v2').value = e.v2; $('#p-v2-v').textContent = virg(e.v2, 2) + ' km/s';
  }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(() => plusTard(regenerer), 400); };
  function brancher() {
    // la coupe et la carte suivent le curseur tout de suite ; les traces sont recalculées un peu après
    const curseur = (cle, lire) => e => { etat.explo[cle] = lire(e.target.value); majCurseurs(); figures(); majVerite(); planifier(); };
    $('#p-H').addEventListener('input', curseur('H', v => parseInt(v, 10)));
    $('#p-v1').addEventListener('input', curseur('v1', parseFloat));
    $('#p-v2').addEventListener('input', curseur('v2', parseFloat));
    $('#p-hodo').addEventListener('change', e => { etat.hodo = e.target.checked; dessiner(); });
    $('#p-tirage').addEventListener('click', () => { etat.explo.graine = 1 + Math.floor(Math.random() * 1e5); plusTard(regenerer); });
    $('#p-reduction').addEventListener('change', e => { etat.reduction = parseInt(e.target.value, 10); tout(); });
    $('#p-ampli').addEventListener('change', e => { etat.ampli = e.target.value; dessiner(); });
    $$('[data-p-outil]').forEach(b => b.addEventListener('click', () => { etat.outil = b.dataset.pOutil; majOutils(); majAide(); }));
    $('#p-effacer').addEventListener('click', () => { etat.points = { g: [], n: [] }; etat.droites = { g: null, n: null }; if (etat.verifie) { etat.verifie = false; $('#p-corrige').innerHTML = ''; } tout(); });
    $('#p-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#p-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#p-verifier').addEventListener('click', verifier);
    $('#p-nouvel-exo').addEventListener('click', nouvelExercice);

    const cv = $('#p-section');
    cv.addEventListener('pointermove', e => {
      const g = geo(cv), d = g.D(e.offsetY), tr = g.T(e.offsetX);
      etat.curseur = [e.offsetX, e.offsetY];
      $('#p-curseur').textContent = d >= 0 && d <= DMAX ? `Δ = ${Math.round(d)} km · t = ${virg(vrai(tr, d), 2)} s${etat.reduction ? ` (réduit ${virg(tr, 2)} s)` : ''}` : '—';
      dessiner();
    });
    cv.addEventListener('pointerleave', () => { etat.curseur = null; dessiner(); });
    cv.addEventListener('click', e => {
      const g = geo(cv), d = g.D(e.offsetY);
      if (!etat.outil || d < 0 || d > DMAX || e.offsetX < g.m.g) return;
      const pts = etat.points[etat.outil];
      if (pts.length >= 2) pts.length = 0;
      pts.push({ d, t: vrai(g.T(e.offsetX), d) });
      etat.droites[etat.outil] = pts.length === 2 ? Rf.droite(pts[0], pts[1]) : null;
      if (pts.length === 2 && etat.outil === 'g' && !etat.droites.n) etat.outil = 'n';
      if (etat.verifie) { etat.verifie = false; $('#p-corrige').innerHTML = ''; }
      tout();
    });
    const redessiner = () => { if (etat.traces.length && !$('#banc-profil').hidden) tout(); };
    new ResizeObserver(redessiner).observe(cv);
    const refigurer = () => { if (!$('#banc-profil').hidden) figures(); };
    for (const id of ['#p-carte', '#p-coupe']) new ResizeObserver(refigurer).observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#p-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#p-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#p-panneau-explorer').hidden = m !== 'explorer';
    $('#p-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.outil = 'g'; figures(); plusTard(regenerer); }
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'profil') return;
    if (!etat.pret) { etat.pret = true; brancher(); majCurseurs(); plusTard(regenerer); }
    else tout();
  });
})();
