import Sismo from './sismo/signal.js';
import Liquefaction from './sismo/liquefaction.js';

// src/banc-liquefaction.js — banc « liquéfaction » : un sondage CPT d'école, une nappe et un séisme (amax, M) ;
// sollicitation cyclique CSR face à la résistance CRR de Boulanger et Idriss (2014), coefficient de sécurité,
// indice LPI et tassement post-liquéfaction. Tout le calcul est dans src/sismo/liquefaction.js (vérifié contre
// liquepy).
(() => {
  'use strict';
  const L = Liquefaction;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

  const PROFILS = {
    lache: { nom: 'Sables lâches', couches: [{ h: 1.5, qc: 3, rf: 1.5 }, { h: 4.5, qc: 5, rf: 0.6 }, { h: 2, qc: 1.5, rf: 3 }, { h: 5, qc: 9, rf: 0.7 }, { h: 3, qc: 0.9, rf: 4.5 }, { h: 4, qc: 18, rf: 0.6 }] },
    alternance: { nom: 'Sables et limons', couches: [{ h: 2, qc: 4, rf: 1.2 }, { h: 2, qc: 6, rf: 0.6 }, { h: 1.5, qc: 2, rf: 2.2 }, { h: 3, qc: 7, rf: 0.8 }, { h: 1.5, qc: 2.5, rf: 2 }, { h: 4, qc: 10, rf: 0.7 }, { h: 6, qc: 14, rf: 0.6 }] },
    dense: { nom: 'Sable dense', couches: [{ h: 2, qc: 8, rf: 0.8 }, { h: 8, qc: 16, rf: 0.6 }, { h: 10, qc: 22, rf: 0.5 }] },
    argile: { nom: 'Argile sur sable', couches: [{ h: 6, qc: 0.8, rf: 4.5 }, { h: 4, qc: 6, rf: 0.6 }, { h: 10, qc: 12, rf: 0.6 }] },
  };
  const reglagesDefaut = () => ({ profil: 'lache', gwl: 1.5, amax: 0.25, M: 6.5, graine: 42 });
  const etat = { pret: false, mode: 'explorer', r: reglagesDefaut(), res: null, exo: null, verifie: false };
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  function calculer() {
    const r = etat.r, son = L.sondageSynthetique(PROFILS[r.profil].couches, { pas: 0.1, graine: r.graine, gwl: r.gwl });
    const res = L.cpt(son, { gwl: r.gwl, amax: r.amax, M: r.M }), pts = res.points;
    const liq = pts.filter(p => p.fs < 1 && p.crr75 < 4), sable = pts.filter(p => p.crr75 < 4);
    const pire = sable.length ? sable.reduce((a, b) => (b.fs < a.fs ? b : a)) : null;
    etat.res = { son, ...res, epaisseur: liq.length * 0.1, pire, msf: sable.length ? [Math.min(...sable.map(p => p.msf)), Math.max(...sable.map(p => p.msf))] : null };
  }

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'teal', 'line'])
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
  // Panneaux côte à côte, profondeur commune (0 → 20 m vers le bas)
  function cadre(cv, titres) {
    const { ctx, W, H } = preparer(cv), m = { h: 30, b: 26 }, g = 38, n = titres.length, larg = (W - g - 10) / n;
    const zmax = Math.ceil(etat.res.points[etat.res.points.length - 1].z), Y = z => m.h + (z / zmax) * (H - m.h - m.b);
    const panneaux = titres.map((t, i) => ({ x0: g + i * larg + (i ? 12 : 0), x1: g + (i + 1) * larg - 4 }));
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let z = 0; z <= zmax; z += 2) { const y = Math.round(Y(z)) + 0.5; ctx.beginPath(); ctx.moveTo(g, y); ctx.lineTo(W - 10, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(z), g - 6, y); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('z (m)', 2, H - m.b + 6);
    // nappe
    const yn = Y(etat.r.gwl);
    ctx.strokeStyle = COUL.blue; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(g, yn); ctx.lineTo(W - 10, yn); ctx.stroke(); ctx.setLineDash([]);
    texte(ctx, '▽ nappe', W - 12, yn - 8, COUL.blue, `700 10.5px ${MONO}`, 'right');
    panneaux.forEach((p, i) => texte(ctx, titres[i], p.x0, 13, COUL.ink, `800 12px ${POLICE}`));
    return { ctx, W, H, Y, panneaux, m };
  }
  function trace(ctx, p, Y, vals, vmin, vmax, coul, w = 1.6, log = false) {
    const X = v => p.x0 + (log ? Math.log(Math.max(v, vmin) / vmin) / Math.log(vmax / vmin) : (Math.min(v, vmax) - vmin) / (vmax - vmin)) * (p.x1 - p.x0);
    // le tracé s'interrompt là où la grandeur n'est pas définie (NaN : argiles, au-dessus de la nappe)
    ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.beginPath();
    let levé = true;
    etat.res.points.forEach((q, i) => {
      if (!Number.isFinite(vals[i])) { levé = true; return; }
      if (levé) ctx.moveTo(X(vals[i]), Y(q.z)); else ctx.lineTo(X(vals[i]), Y(q.z));
      levé = false;
    });
    ctx.stroke();
    return X;
  }
  function axe(ctx, p, H, m, marques, X) {
    ctx.fillStyle = COUL.muted; ctx.font = `10.5px ${MONO}`; ctx.textBaseline = 'top';
    marques.forEach((v, j) => { ctx.textAlign = j === 0 ? 'left' : j === marques.length - 1 ? 'right' : 'center'; ctx.fillText(virg(v, v < 1 && v > 0 ? (v < 0.1 ? 2 : 1) : 0), X(v), H - m.b + 6); });
  }

  function dessinerCPT() {
    const cv = $('#lq-cpt');
    if (cv.clientWidth < 50 || !etat.res) return;
    const { ctx, H, Y, panneaux, m } = cadre(cv, ['qc (MPa)', 'Rf (%)', 'Ic']), pts = etat.res.points, son = etat.res.son;
    const qc = son.qc.map(v => v / 1000), rf = son.fs.map((v, i) => (100 * v) / son.qc[i]), qmax = Math.ceil(Math.max(...qc) / 5) * 5;
    axe(ctx, panneaux[0], H, m, [0, qmax / 2, qmax], trace(ctx, panneaux[0], Y, qc, 0, qmax, COUL.trace));
    axe(ctx, panneaux[1], H, m, [0, 3, 6], trace(ctx, panneaux[1], Y, rf, 0, 6, COUL.amp));
    const Xi = trace(ctx, panneaux[2], Y, pts.map(p => p.ic), 1, 4, COUL.ink);
    ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(Xi(2.6), m.h); ctx.lineTo(Xi(2.6), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    texte(ctx, '2,6', Xi(2.6) + 3, m.h + 8, COUL['pick-p'], `700 10.5px ${MONO}`);
    axe(ctx, panneaux[2], H, m, [1, 2.5, 4], Xi);
  }
  function dessinerCSR() {
    const cv = $('#lq-csr');
    if (cv.clientWidth < 50 || !etat.res) return;
    if (enExercice()) { const { ctx, W, H } = preparer(cv); ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'center'; ctx.fillText('affiché après la vérification', W / 2, H / 2); return; }
    const { ctx, H, Y, panneaux, m } = cadre(cv, ['CSR et CRR(M, σ\'v)', 'FS = CRR / CSR', 'εv (%)']), pts = etat.res.points;
    const cmax = Math.max(0.2, Math.ceil(Math.max(...pts.map(p => p.csr)) * 12) / 10), p0 = panneaux[0];
    const X = v => p0.x0 + (Math.min(v, cmax) / cmax) * (p0.x1 - p0.x0);
    // zones où CRR < CSR
    ctx.fillStyle = COUL['pick-p']; ctx.globalAlpha = 0.18;
    pts.forEach(p => { if (p.crr75 < 4 && p.crr < p.csr) ctx.fillRect(X(p.crr), Y(p.z) - (Y(0.1) - Y(0)) / 2, X(p.csr) - X(p.crr), Y(0.1) - Y(0) + 0.5); });
    ctx.globalAlpha = 1;
    trace(ctx, p0, Y, pts.map(p => (p.crr75 < 4 ? p.crr : NaN)), 0, cmax, COUL.teal, 1.6);
    trace(ctx, p0, Y, pts.map(p => p.csr), 0, cmax, COUL['pick-p'], 2.2);
    axe(ctx, p0, H, m, [0, cmax / 2, cmax], X);
    const Xf = trace(ctx, panneaux[1], Y, pts.map(p => Math.min(p.fs, 2)), 0, 2, COUL.blue, 1.8);
    for (const [v, c] of [[1, COUL['pick-p']], [1.25, COUL.amp]]) { ctx.strokeStyle = c; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(Xf(v), m.h); ctx.lineTo(Xf(v), H - m.b); ctx.stroke(); ctx.setLineDash([]); }
    axe(ctx, panneaux[1], H, m, [0, 1, 2], Xf);
    const ev = pts.map(p => (p.crr75 < 4 && p.ic <= 2.6 ? 100 * L.deformationVolumique(p.fs, p.qc1ncs) : 0)), emax = Math.max(1, Math.ceil(Math.max(...ev)));
    axe(ctx, panneaux[2], H, m, [0, emax / 2, emax], trace(ctx, panneaux[2], Y, ev, 0, emax, COUL.cyan, 1.8));
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const res = etat.res, c = enExercice();
    $('#lq-afficheurs').innerHTML = [
      afficheur('LPI (Iwasaki)', c ? '—' : virg(res.lpi, 1), c ? 'après la vérification' : `potentiel ${L.classeLPI(res.lpi)}`),
      afficheur('Tassement', c ? '—' : `${virg(100 * res.tassement, 1)} cm`, c ? '' : 'Zhang et al. (2002)'),
      afficheur('FS minimal', c || !res.pire ? '—' : virg(res.pire.fs, 2), c || !res.pire ? '' : `à ${virg(res.pire.z, 1)} m`),
      afficheur('Épaisseur FS < 1', c ? '—' : `${virg(res.epaisseur, 1)} m`, 'sous la nappe, Ic ≤ 2,6'),
      afficheur('Séisme', `${virg(etat.r.amax, 2)} g`, `M ${virg(etat.r.M, 1)}`),
      afficheur('MSF', res.msf ? (Math.abs(res.msf[1] - res.msf[0]) < 0.005 ? virg(res.msf[0], 2) : `${virg(res.msf[0], 2)}–${virg(res.msf[1], 2)}`) : '—', 'selon la densité'),
    ].join('');
  }
  function majControles() {
    const r = etat.r;
    $$('[data-lq-profil]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lqProfil === r.profil)));
    $('#lq-gwl').value = r.gwl; $('#lq-gwl-v').textContent = `${virg(r.gwl, 1)} m`;
    $('#lq-amax').value = r.amax; $('#lq-amax-v').textContent = `${virg(r.amax, 2)} g`;
    $('#lq-m').value = r.M; $('#lq-m-v').textContent = virg(r.M, 1);
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majAfficheurs();
    dessinerCPT(); dessinerCSR();
  }
  function recalculer() { calculer(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 60); };

  // ── Exercice : CSR et FS à une profondeur ──────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 23);
    const ids = Object.keys(PROFILS).filter(k => k !== 'argile');
    etat.r = { profil: ids[Math.floor(u() * ids.length)], gwl: Math.round(u.entre(0.5, 3) * 2) / 2, amax: Math.round(u.entre(0.12, 0.45) * 100) / 100, M: Math.round(u.entre(5.5, 7.5) * 10) / 10, graine: numero };
    etat.verifie = false;
    calculer();
    // une profondeur de sable sous la nappe, entre 2 et 12 m
    const candidats = etat.res.points.filter(p => p.crr75 < 4 && p.z >= 2 && p.z <= 12 && Math.abs(p.z * 10 - Math.round(p.z * 10)) < 1e-6 && Math.round(p.z * 10) % 5 === 0);
    const p = candidats[Math.floor(u() * candidats.length)] || etat.res.points.find(q => q.crr75 < 4);
    etat.exo = { numero, p };
    $('#lq-exo-num').textContent = 'Exercice n° ' + numero;
    $('#lq-r-csr').value = ''; $('#lq-r-fs').value = ''; $('#lq-corrige').innerHTML = '';
    $$('[data-lq-rep]').forEach(b => b.setAttribute('aria-pressed', 'false')); etat.rep = null;
    $('#lq-exo-donnees').innerHTML = `<div class="table-defile"><table class="resultats"><tbody>
      ${[['profondeur z', `${virg(p.z, 1)} m`], ['σv / σ\'v', `${virg(p.sv, 1)} / ${virg(p.sve, 1)} kPa`], ['amax', `${virg(etat.r.amax, 2)} g`], ['M', virg(etat.r.M, 1)], ['rd', virg(p.rd, 3)],
        ['qc1Ncs', virg(p.qc1ncs, 1)], ['CRR7,5', virg(p.crr75, 3)], ['MSF', virg(p.msf, 3)], ['Kσ', virg(p.ks, 3)]].map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>`;
    tout();
  }
  function verifier() {
    const p = etat.exo.p, lu = id => parseFloat(String($(id).value).replace(',', '.'));
    const c = lu('#lq-r-csr'), f = lu('#lq-r-fs'), fsv = p.crr / p.csr;
    const okC = Math.abs(c / p.csr - 1) <= 0.03, okF = Math.abs(f / fsv - 1) <= 0.05, okL = etat.rep === (fsv < 1 ? 'oui' : 'non');
    etat.verifie = true;
    const lignes = [
      ['CSR', Number.isFinite(c) ? virg(c, 3) : '—', virg(p.csr, 3), okC, '± 3 % : 0,65·(σv/σ\'v)·amax·rd'],
      ['FS', Number.isFinite(f) ? virg(f, 2) : '—', virg(fsv, 2), okF, '± 5 % : CRR7,5·MSF·Kσ / CSR'],
      ['Liquéfaction ?', etat.rep || '—', fsv < 1 ? 'oui' : 'non', okL, 'FS < 1 (l\'EN 1998-5 recommande en outre FS ≥ 1,25)'],
    ];
    $('#lq-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#lq-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#lq-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#lq-panneau-explorer').hidden = m !== 'explorer';
    $('#lq-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; recalculer(); }
  }

  function brancher() {
    $('#lq-profils').innerHTML = Object.entries(PROFILS).map(([id, p]) => `<button type="button" data-lq-profil="${id}">${p.nom}</button>`).join('');
    $$('[data-lq-profil]').forEach(b => b.addEventListener('click', () => { etat.r.profil = b.dataset.lqProfil; recalculer(); }));
    $('#lq-gwl').addEventListener('input', e => { etat.r.gwl = parseFloat(e.target.value); majControles(); planifier(); });
    $('#lq-amax').addEventListener('input', e => { etat.r.amax = parseFloat(e.target.value); majControles(); planifier(); });
    $('#lq-m').addEventListener('input', e => { etat.r.M = parseFloat(e.target.value); majControles(); planifier(); });
    $('#lq-tirage').addEventListener('click', () => { etat.r.graine = 1 + Math.floor(Math.random() * 1e6); recalculer(); });
    $('#lq-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#lq-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-lq-rep]').forEach(b => b.addEventListener('click', () => { etat.rep = b.dataset.lqRep; $$('[data-lq-rep]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#lq-verifier').addEventListener('click', verifier);
    $('#lq-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-liquefaction').hidden && etat.res) { lireCouleurs(); tout(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#lq-cpt', '#lq-csr']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'liquefaction') return;
    if (!etat.pret) { etat.pret = true; lireCouleurs(); brancher(); recalculer(); }
    else tout();
  });
})();
