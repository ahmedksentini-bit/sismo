import Sismo from './sismo/signal.js';
import Sismicite from './sismo/sismicite.js';

// src/banc-sismicite.js — banc « sismicité » : un catalogue simulé, sa complétude, le déclusterage,
// la loi de Gutenberg-Richter ajustée et les probabilités de Poisson qui en découlent.
(() => {
  'use strict';
  const SM = Sismo, Sc = Sismicite;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const DEBUT = 1900, FIN = 2025;

  const etat = {
    pret: false, mode: 'explorer',
    explo: { b: 1.0, taux4: 2, Mmax: 7.5, repliques: true, graine: 5, completude: Sc.COMPLETUDE },
    exo: null, cat: [], garde: [], declus: true, debutAnalyse: 1990, Mc: 3.0,
    m: 6, duree: 50, verifie: false,
  };
  const parametres = () => (etat.mode === 'explorer' ? etat.explo : etat.exo.p);

  // ── Catalogue et analyse ────────────────────────────────────────────────
  function regenerer() {
    const p = parametres();
    etat.cat = Sc.genererCatalogue({ ...p, debut: DEBUT, fin: FIN });
    etat.garde = Sc.declusterGK(etat.cat);
    etat.verifie = false;
    if (etat.mode === 'exercice') $('#sc-corrige').innerHTML = '';
    tout();
  }
  const retenus = () => etat.cat.filter((e, i) => e.t >= etat.debutAnalyse && (!etat.declus || etat.garde[i]));
  function analyse() {
    const ev = retenus(), annees = FIN - etat.debutAnalyse;
    return { ev, annees, r: Sc.recurrence(ev.map(e => e.M), etat.Mc, annees) };
  }
  // Loi vraie des chocs principaux (exponentielle tronquée à Mmax).
  function tauxVrai(m) {
    const p = parametres(), lmin = p.taux4 * Math.pow(10, p.b * (4 - Sc.MMIN)), q = Math.pow(10, -p.b * (p.Mmax - Sc.MMIN));
    return m >= p.Mmax ? 0 : (lmin * (Math.pow(10, -p.b * (m - Sc.MMIN)) - q)) / (1 - q);
  }

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'phase', 'vrai', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'teal'])
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
  const geoCat = cv => {
    const W = cv.clientWidth, H = cv.clientHeight, m = { g: 40, d: 12, h: 12, b: 26 }, Mhaut = 8;
    return {
      W, H, m,
      X: t => m.g + ((t - DEBUT) / (FIN - DEBUT)) * (W - m.g - m.d), T: x => DEBUT + ((x - m.g) / (W - m.g - m.d)) * (FIN - DEBUT),
      Y: M => H - m.b - ((M - Sc.MMIN) / (Mhaut - Sc.MMIN)) * (H - m.h - m.b), M: y => Sc.MMIN + ((H - m.b - y) / (H - m.h - m.b)) * (Mhaut - Sc.MMIN),
    };
  };
  function dessinerCatalogue() {
    lireCouleurs();
    const cv = $('#sc-catalogue');
    if (cv.clientWidth < 50 || !etat.cat.length) return;
    const { ctx, W, H } = preparer(cv), g = geoCat(cv);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let a = 1900; a <= FIN; a += 20) {
      const x = Math.round(g.X(a)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, g.m.h); ctx.lineTo(x, H - g.m.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(a), x, H - g.m.b + 5);
    }
    for (let M = 3; M <= 8; M++) {
      const y = Math.round(g.Y(M)) + 0.5;
      ctx.beginPath(); ctx.moveTo(g.m.g, y); ctx.lineTo(W - g.m.d, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('M' + M, g.m.g - 6, y);
    }
    // Zone analysée
    const x0 = g.X(etat.debutAnalyse), y0 = g.Y(etat.Mc);
    ctx.fillStyle = COUL.soft; ctx.fillRect(x0, g.m.h, W - g.m.d - x0, y0 - g.m.h);
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, g.m.h + 0.5, W - g.m.d - x0 - 1, y0 - g.m.h);
    // Complétude vraie (exploration ou corrigé)
    if (etat.mode === 'explorer' || etat.verifie) {
      const comp = parametres().completude;
      ctx.save(); ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
      comp.forEach(([a, mc], i) => { const xa = g.X(a), xb = g.X(i + 1 < comp.length ? comp[i + 1][0] : FIN); if (i === 0) ctx.moveTo(xa, g.Y(mc)); else ctx.lineTo(xa, g.Y(mc)); ctx.lineTo(xb, g.Y(mc)); });
      ctx.stroke(); ctx.restore();
    }
    // Séismes : taille selon M ; répliques retirées en ambre ; hors analyse estompés
    const dans = (e, i) => e.t >= etat.debutAnalyse && e.M >= etat.Mc - 1e-9 && (!etat.declus || etat.garde[i]);
    for (const passe of [0, 1]) {
      etat.cat.forEach((e, i) => {
        const garde = !etat.declus || etat.garde[i], ok = dans(e, i);
        if ((passe === 1) !== ok) return;
        ctx.globalAlpha = ok ? 0.9 : 0.35;
        ctx.fillStyle = garde ? (ok ? COUL.ink : COUL.muted) : COUL.amp;
        const r = 1 + Math.max(0, e.M - 3) * 1.1;
        ctx.beginPath(); ctx.arc(g.X(e.t), g.Y(e.M), r, 0, 2 * Math.PI); ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
    const etroit = W - g.m.d - x0 < 190;
    texte(ctx, `analyse : depuis ${etat.debutAnalyse}, M ≥ ${virg(etat.Mc, 1)}`, etroit ? x0 - 6 : x0 + 6, g.m.h + 10, COUL.blue, `800 11px ${POLICE}`, etroit ? 'right' : 'left');
  }
  function dessinerFMD() {
    lireCouleurs();
    const cv = $('#sc-fmd');
    if (cv.clientWidth < 50 || !etat.cat.length) return;
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 14, b: 30 }, { ev, annees, r } = analyse();
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const Mmin = Sc.MMIN - 0.1, Mmax = 8, y0 = -3, y1 = 3;
    const X = M => m.g + ((M - Mmin) / (Mmax - Mmin)) * (W - m.g - m.d), Y = lg => H - m.b - ((lg - y0) / (y1 - y0)) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let M = 3; M <= 8; M++) { const x = Math.round(X(M)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(M), x, H - m.b + 5); }
    for (let lg = y0; lg <= y1; lg++) { const y = Math.round(Y(lg)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(lg >= 0 ? milliers(Math.pow(10, lg)) : String(Math.pow(10, lg)).replace('.', ','), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('M', W - m.d, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('séismes par an', m.g + 6, m.h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    // Distribution : incrémentale (carrés) et cumulée (disques)
    const inc = new Map();
    for (const e of ev) { const k = Math.round(e.M * 10); inc.set(k, (inc.get(k) || 0) + 1); }
    const cles = [...inc.keys()].sort((p, q) => p - q);
    let cumul = 0;
    const cum = [];
    for (let i = cles.length - 1; i >= 0; i--) { cumul += inc.get(cles[i]); cum.unshift([cles[i] / 10, cumul]); }
    for (const k of cles) { const v = inc.get(k) / annees; ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.strokeRect(X(k / 10) - 3, Y(Math.log10(v)) - 3, 6, 6); }
    for (const [M, n] of cum) { ctx.fillStyle = M >= etat.Mc - 1e-9 ? COUL.ink : COUL.muted; ctx.beginPath(); ctx.arc(X(M), Y(Math.log10(n / annees)), 3.2, 0, 2 * Math.PI); ctx.fill(); }
    // Loi vraie des chocs principaux et droite ajustée
    if (etat.mode === 'explorer' || etat.verifie) {
      ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
      for (let M = Sc.MMIN; M <= parametres().Mmax - 0.02; M += 0.05) { const v = tauxVrai(M); if (M === Sc.MMIN) ctx.moveTo(X(M), Y(Math.log10(v))); else ctx.lineTo(X(M), Y(Math.log10(v))); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (r) {
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.4; ctx.beginPath();
      ctx.moveTo(X(etat.Mc), Y(Math.log10(r.taux(etat.Mc)))); ctx.lineTo(X(Mmax), Y(Math.log10(r.taux(Mmax)))); ctx.stroke();
    }
    ctx.restore();
    const xm = X(etat.Mc);
    ctx.save(); ctx.strokeStyle = COUL.blue; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xm, m.h); ctx.lineTo(xm, H - m.b); ctx.stroke(); ctx.restore();
    texte(ctx, 'Mc', xm + 4, H - m.b - 10, COUL.blue, `800 11px ${POLICE}`);
    if (r) texte(ctx, `log N = ${virg(r.a, 2)} − ${virg(r.b, 2)} M`, W - m.d - 8, m.h + 12, COUL['pick-p'], `800 12px ${MONO}`, 'right');
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const { ev, annees, r } = analyse();
    const nRet = ev.filter(e => e.M >= etat.Mc - 1e-9).length;
    $('#sc-afficheurs').innerHTML = [
      afficheur('Séismes retenus', milliers(nRet), `${annees} ans, M ≥ ${virg(etat.Mc, 1)}`),
      afficheur('Valeur b', r ? virg(r.b, 2) : '—', r ? `± ${virg(r.sigma, 2)} (Shi et Bolt)` : 'trop peu de séismes'),
      afficheur('λ(M ≥ 5)', r ? virg(r.taux(5), 3) + ' /an' : '—', r ? `un tous les ${virg(1 / r.taux(5), 0)} ans` : ''),
      afficheur('Période de retour M ≥ 6', r ? virg(1 / r.taux(6), 0) + ' ans' : '—', r ? `λ = ${virg(r.taux(6), 4)} /an` : ''),
    ].join('');
    const lam = r ? r.taux(etat.m) : null;
    $('#sc-poisson').innerHTML = [
      afficheur(`λ(M ≥ ${virg(etat.m, 1)})`, lam ? virg(lam, 4) + ' /an' : '—', 'loi ajustée'),
      afficheur('Période de retour', lam ? milliers(1 / lam) + ' ans' : '—', 'T = 1 / λ'),
      afficheur(`P(au moins un en ${etat.duree} ans)`, lam ? virg(100 * Sc.probabilite(lam, etat.duree), 1) + ' %' : '—', 'P = 1 − e^(−λt)'),
      afficheur('10 % en 50 ans', virg(Sc.periodeRetour(0.1, 50), 0) + ' ans', 'référence de l\'EC8 (non-effondrement)'),
    ].join('');
    $('#sc-m-v').textContent = 'M ≥ ' + virg(etat.m, 1); $('#sc-t-v').textContent = etat.duree + ' ans';
  }
  function majControles() {
    const e = etat.explo;
    $('#sc-b').value = e.b; $('#sc-b-v').textContent = virg(e.b, 2);
    $('#sc-taux').value = e.taux4; $('#sc-taux-v').textContent = virg(e.taux4, 1) + ' /an';
    $('#sc-mmax').value = e.Mmax; $('#sc-mmax-v').textContent = virg(e.Mmax, 1);
    $('#sc-rep').checked = e.repliques; $('#sc-declus').checked = etat.declus;
    $('#sc-debut').value = etat.debutAnalyse; $('#sc-debut-v').textContent = String(etat.debutAnalyse);
    $('#sc-mc').value = etat.Mc; $('#sc-mc-v').textContent = virg(etat.Mc, 1);
    $('#sc-m').value = etat.m; $('#sc-t').value = etat.duree;
  }
  function majVerite() {
    if (etat.mode !== 'explorer') return;
    const p = etat.explo, nr = etat.cat.filter(e => e.rep).length, retirees = etat.cat.filter((e, i) => e.rep && !etat.garde[i]).length;
    $('#sc-verite').innerHTML = `<b>Vérité terrain.</b> b = <b>${virg(p.b, 2)}</b>, λ(M ≥ 5) = <b>${virg(tauxVrai(5), 3)} /an</b> pour les chocs principaux. `
      + `Catalogue : ${milliers(etat.cat.length)} séismes, dont ${milliers(nr)} répliques ; le déclusterage en retire ${nr ? virg((100 * retirees) / nr, 0) : 0} %. `
      + `Complétude (tirets) : ${p.completude.map(([a, mc]) => `M${virg(mc, 1)} dès ${a}`).join(', ')}.`;
  }
  function tout() { majControles(); dessinerCatalogue(); dessinerFMD(); majAfficheurs(); majVerite(); }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 3571 + 5);
    const comp = [[1900, 5.5], [1920 + Math.round(20 * u()), 4.5], [1955 + Math.round(20 * u()), 3.5], [1985 + Math.round(15 * u()), 2.5]];
    etat.exo = { numero, p: { b: Math.round(u.entre(0.75, 1.25) * 100) / 100, taux4: Math.round(u.entre(1, 5) * 10) / 10, Mmax: Math.round(u.entre(6.6, 7.8) * 10) / 10, repliques: true, completude: comp, graine: numero } };
    etat.debutAnalyse = 1900; etat.Mc = 2.5; etat.declus = false;
    $('#sc-exo-num').textContent = 'Exercice n° ' + numero;
    $('#sc-corrige').innerHTML = '';
    regenerer();
  }
  function verifier() {
    const { r } = analyse(), p = parametres(), lv = tauxVrai(5);
    const okB = !!r && Math.abs(r.b - p.b) <= Math.max(0.1, 2.5 * r.sigma), rap = r ? r.taux(5) / lv : null, okL = rap !== null && rap > 0.7 && rap < 1.43;
    const okD = etat.declus, cMod = p.completude[p.completude.length - 1];
    etat.verifie = true;
    const lignes = [
      ['Valeur b', r ? `${virg(r.b, 2)} ± ${virg(r.sigma, 2)}` : '—', virg(p.b, 2), okB, `± max(0,1 ; 2,5σ)`],
      ['λ(M ≥ 5) des chocs principaux', r ? virg(r.taux(5), 3) + ' /an' : '—', virg(lv, 3) + ' /an', okL, '± 30 %'],
      ['Catalogue déclusteré', okD ? 'oui' : 'non', 'oui', okD, 'Poisson suppose des séismes indépendants'],
    ];
    $('#sc-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Vrai</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">La complétude vraie (tirets) atteint M${virg(cMod[1], 1)} en ${cMod[0]}. Analyser avant cette date avec un Mc trop bas
      sous-estime b ; garder les répliques gonfle les taux. La loi vraie des chocs principaux est tracée en tirets sur le graphique de Gutenberg-Richter.</p>`;
    tout();
  }

  // ── Événements ──────────────────────────────────────────────────────────
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(regenerer, 200); };
  function brancher() {
    $('#sc-b').addEventListener('input', e => { etat.explo.b = parseFloat(e.target.value); majControles(); planifier(); });
    $('#sc-taux').addEventListener('input', e => { etat.explo.taux4 = parseFloat(e.target.value); majControles(); planifier(); });
    $('#sc-mmax').addEventListener('input', e => { etat.explo.Mmax = parseFloat(e.target.value); majControles(); planifier(); });
    $('#sc-rep').addEventListener('change', e => { etat.explo.repliques = e.target.checked; regenerer(); });
    $('#sc-tirage').addEventListener('click', () => { etat.explo.graine = 1 + Math.floor(Math.random() * 1e5); regenerer(); });
    $('#sc-declus').addEventListener('change', e => { etat.declus = e.target.checked; tout(); });
    $('#sc-debut').addEventListener('input', e => { etat.debutAnalyse = parseInt(e.target.value, 10); tout(); });
    $('#sc-mc').addEventListener('input', e => { etat.Mc = parseFloat(e.target.value); tout(); });
    $('#sc-mc-auto').addEventListener('click', () => { const ev = retenus(); if (ev.length) { etat.Mc = Sc.mcCourbureMax(ev.map(e => e.M)); tout(); } });
    $('#sc-m').addEventListener('input', e => { etat.m = parseFloat(e.target.value); majAfficheurs(); });
    $('#sc-t').addEventListener('input', e => { etat.duree = parseInt(e.target.value, 10); majAfficheurs(); });
    $('#sc-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#sc-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#sc-verifier').addEventListener('click', verifier);
    $('#sc-nouvel-exo').addEventListener('click', nouvelExercice);
    // Un clic sur le catalogue fixe le début de l'analyse et Mc.
    const cv = $('#sc-catalogue');
    cv.addEventListener('click', e => {
      const g = geoCat(cv), t = g.T(e.offsetX), M = g.M(e.offsetY);
      if (t < DEBUT || t > FIN || M < Sc.MMIN || M > 8) return;
      etat.debutAnalyse = Math.min(2015, Math.max(DEBUT, Math.round(t)));
      etat.Mc = Math.min(6, Math.max(Sc.MMIN, Math.round(M * 10) / 10));
      if (etat.verifie) { etat.verifie = false; $('#sc-corrige').innerHTML = ''; }
      tout();
    });
    cv.addEventListener('pointermove', e => {
      const g = geoCat(cv), t = g.T(e.offsetX), M = g.M(e.offsetY);
      $('#sc-curseur').textContent = t >= DEBUT && t <= FIN && M >= Sc.MMIN && M <= 8 ? `${Math.round(t)} · M ${virg(M, 1)} — cliquer pour analyser à partir d'ici` : '—';
    });
    const redessiner = () => { if (etat.cat.length && !$('#banc-sismicite').hidden) { dessinerCatalogue(); dessinerFMD(); } };
    const ro = new ResizeObserver(redessiner);
    ro.observe(cv); ro.observe($('#sc-fmd'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#sc-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#sc-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#sc-panneau-explorer').hidden = m !== 'explorer';
    $('#sc-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.debutAnalyse = 1990; etat.Mc = 3.0; etat.declus = true; regenerer(); }
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'sismicite') return;
    if (!etat.pret) { etat.pret = true; brancher(); regenerer(); }
    else tout();
  });
})();
