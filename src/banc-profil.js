import Sismo from './sismo/signal.js';
import Refraction from './sismo/refraction.js';

// src/banc-profil.js — banc « profil par distance » : douze stations alignées, traces rangées par
// distance, hodochrones Pg et Pn, et lecture de la croûte (V₁, V₂, épaisseur, distance de croisement).
(() => {
  'use strict';
  const SM = Sismo, Rf = Refraction;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const DISTANCES = Array.from({ length: 12 }, (_, i) => 15 + 30 * i);
  const DMAX = 360, H_FOYER = 5, MW = 5;
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
      const ev = SM.generer({ Mw: MW, delta: d, h: H_FOYER, baz: 90, graine: p.graine * 20 + k, modele: m, fin: d / m.vs1 + 25 });
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
  function texte(ctx, t, x, y, coul, police, align = 'left', base = 'middle') {
    ctx.font = police; ctx.textAlign = align; ctx.textBaseline = base;
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
  function majAide() {
    const t = {
      g: '<strong>Droite Pg.</strong> Cliquez deux points sur les premières arrivées des stations proches (avant le croisement).',
      n: '<strong>Droite Pn.</strong> Cliquez deux points sur les premières arrivées des stations lointaines. Avec la réduction à 8 km/s, elles sont presque alignées à l\'horizontale.',
    }[etat.outil] || '';
    $('#p-aide').innerHTML = t + ' L\'amplitude « P renforcée » écrête les traces pour faire ressortir les premières arrivées, plus faibles que la Sg.';
  }
  function majOutils() { $$('[data-p-outil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pOutil === etat.outil))); }
  function tout() { majOutils(); dessiner(); majLectures(); majVerite(); majAide(); }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 6151 + 9);
    etat.exo = { numero, p: { H: Math.round(u.entre(24, 44)), v1: Math.round(u.entre(5.7, 6.5) * 20) / 20, v2: Math.round(u.entre(7.7, 8.3) * 20) / 20, graine: numero } };
    etat.outil = 'g';
    $('#p-exo-num').textContent = 'Exercice n° ' + numero;
    $('#p-corrige').innerHTML = '';
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
    $('#p-H').addEventListener('input', e => { etat.explo.H = parseInt(e.target.value, 10); majCurseurs(); planifier(); });
    $('#p-v1').addEventListener('input', e => { etat.explo.v1 = parseFloat(e.target.value); majCurseurs(); planifier(); });
    $('#p-v2').addEventListener('input', e => { etat.explo.v2 = parseFloat(e.target.value); majCurseurs(); planifier(); });
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
    else { etat.outil = 'g'; plusTard(regenerer); }
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'profil') return;
    if (!etat.pret) { etat.pret = true; brancher(); majCurseurs(); plusTard(regenerer); }
    else tout();
  });
})();
