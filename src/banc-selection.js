import Spectre from './sismo/spectre.js';
import Psha from './sismo/psha.js';
import Sismo from './sismo/signal.js';
import Accelero from './sismo/accelerogramme.js';
import Selection from './sismo/selection.js';
import Intensite from './sismo/intensite.js';

// src/banc-selection.js — banc « accélérogrammes » : sélection et mise à l'échelle d'un jeu d'accélérogrammes
// synthétiques sur une cible (spectre moyen conditionnel à T1, UHS ou spectre élastique de l'EN 1998-1:2004),
// puis contrôle des règles du § 3.2.3.1.2 (4). L'aléa vient du modèle du banc « aléa » (événement
// alea:modele) ou du modèle d'école. Durée significative et intensité d'Arias de chaque enregistrement.
// Tout le calcul est dans src/sismo/ (psha, accelerogramme, selection, intensite).
(() => {
  'use strict';
  const Sp = Spectre;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const g3 = x => (x >= 1 ? virg(x, 2) : x >= 0.1 ? virg(x, 3) : virg(x, 4));
  const sig2 = x => (x >= 1 ? virg(x, 1) : x > 0 ? virg(x, 1 - Math.floor(Math.log10(x))) : '0'); // deux chiffres significatifs
  const tps = t => virg(t, t < 0.1 ? 2 : t < 1 && Math.abs(t * 10 - Math.round(t * 10)) > 1e-9 ? 2 : 1);

  // Périodes de calcul (s) : celles du modèle d'aléa et quelques intermédiaires
  const T = [0.04, 0.05, 0.07, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1, 1.25, 1.5, 2, 2.5, 3];
  const T1S = [0.2, 0.3, 0.5, 0.7, 1, 1.5, 2];
  const NB_BANQUE = 160, PAR_TRANCHE = 20;
  const CIBLES = { cms: 'CMS à T1', uhs: 'UHS', ec8: 'Spectre EC8' };
  const classeSol = vs30 => (vs30 >= 800 ? 'A' : vs30 >= 360 ? 'B' : vs30 >= 180 ? 'C' : 'D');
  const reglagesDefaut = () => ({ T1: 1, cible: 'cms', proba: [0.1, 50], n: 7, sMax: 4, filtre: false, optimiser: true });
  const etat = {
    pret: false, mode: 'explorer', r: reglagesDefaut(), modeleRecu: null, alea: null, graine: 2024,
    banque: null, enCours: null, sel: null, vu: 0, conformer: false, exo: null, verifie: false, rep: {},
  };
  const periodeRetour = () => Psha.periodeRetour(etat.r.proba[0], etat.r.proba[1]);
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // ── Banque d'enregistrements : M uniforme de 5 à 7,6, Rjb log-uniforme de 3 à 150 km ──
  function genererBanque(graine, fini) {
    const u = Sismo.aleatoire(graine), liste = [], jeton = {};
    etat.enCours = jeton;
    const tranche = () => {
      if (etat.enCours !== jeton) return; // une autre banque a été demandée
      for (let k = 0; k < PAR_TRANCHE && liste.length < NB_BANQUE; k++) {
        const M = Math.round(u.entre(5, 7.6) * 10) / 10, R = Math.round(Math.exp(u.entre(Math.log(3), Math.log(150))));
        const g = 1 + Math.floor(u() * 1e9), rec = Accelero.simuler({ M, R, graine: g }), sp = Accelero.spectre(rec, T);
        // durées et énergie à l'échelle 1 : Arias varie comme s², CAV et PGV comme s, les durées ne changent pas
        const im = Intensite.indicateurs(rec.acc, rec.dt);
        liste.push({ id: liste.length + 1, M, R, graine: g, Sa: sp.Sa, pga: sp.pga, d595: im.d595, arias: im.arias, cav: im.cav, pgv: im.pgv });
      }
      $('#ac-etat').textContent = `banque : ${liste.length} / ${NB_BANQUE} accélérogrammes`;
      if (liste.length < NB_BANQUE) setTimeout(tranche, 0);
      else { etat.enCours = null; etat.banque = liste; $('#ac-etat').textContent = ''; fini(); }
    };
    tranche();
  }

  // ── Aléa du site : courbes aux périodes du banc, mises en cache par modèle ──
  function aleaSite() {
    const base = etat.modeleRecu || 'école';
    if (!etat.alea || etat.alea.base !== base) {
      const m = { ...(etat.modeleRecu || Psha.modeleDefaut()), imts: ['PGA', ...T] };
      etat.alea = { base, modele: m, res: Psha.calculer(m), cms: new Map() };
    }
    return etat.alea;
  }
  function analyser() {
    const a = aleaSite(), r = etat.r, poe = 1 - Math.exp(-a.modele.dureeVie / periodeRetour());
    const uhs = a.modele.imts.map((_, k) => Psha.niveauPourProba(a.res.niveaux, a.res.moyenne[k], poe));
    etat.sel = null; etat.ec8 = null; etat.ec8Affiche = null; etat.facteur = 1;
    if (!(uhs.every(v => v > 0))) { etat.analyse = null; return; }
    const kT = T.indexOf(r.T1), cleCms = `${r.T1}|${poe}`;
    if (!a.cms.has(cleCms)) a.cms.set(cleCms, Psha.spectreConditionnel(a.modele, r.T1, uhs[kT + 1], poe));
    const cms = a.cms.get(cleCms);
    // Spectre de l'EN 1998-1:2004 calé sur le PGA de l'UHS (ag·S), type selon le scénario dominant
    const sol = classeSol(a.modele.site.vs30), type = cms.mMoy > 5.5 ? 1 : 2, agS = uhs[0];
    const Se = T.map(t => Sp.ec8(t, { type, sol, ag: agS / Sp.EC8_2004[type][sol].S }));
    const cible = r.cible === 'cms' ? { ln: cms.moyenne.slice(1).map(Math.log), sigma: cms.ecart.slice(1) }
      : r.cible === 'uhs' ? { ln: uhs.slice(1).map(Math.log) } : { ln: Se.map(Math.log) };
    etat.analyse = { uhs, cms, sol, type, agS, Se, cible, kT, Tmin: Math.max(T[0], 0.2 * r.T1), Tmax: Math.min(T[T.length - 1], 2 * r.T1) };
    if (!etat.banque) return;
    const M0 = cms.mMoy, R0 = cms.rMoy;
    etat.sel = Selection.selectionner(etat.banque, cible, T, {
      n: r.n, Tmin: etat.analyse.Tmin, Tmax: etat.analyse.Tmax, sMax: r.sMax, kStar: r.cible === 'cms' ? kT : null,
      admissible: r.filtre ? c => Math.abs(c.M - M0) <= 0.5 + 1e-9 && c.R >= R0 / 3 && c.R <= 3 * R0 : null,
      optimiser: r.optimiser,
    });
    if (!etat.sel) return;
    const jeu = s => etat.sel.choisis.map(c => ({ Sa: etat.banque[c.i].Sa.map(v => v * c.s * s), pga: etat.banque[c.i].pga * c.s * s }));
    etat.ec8 = Selection.verifierEC8(jeu(1), T, Se, agS, r.T1);
    etat.facteur = etat.conformer && !enExercice() ? etat.ec8.facteurConformite : 1;
    etat.ec8Affiche = etat.facteur === 1 ? etat.ec8 : Selection.verifierEC8(jeu(etat.facteur), T, Se, agS, r.T1);
    etat.vu = Math.min(etat.vu, etat.sel.choisis.length - 1);
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
  function message(cv, t) {
    const { ctx, W, H } = preparer(cv);
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, W / 2, H / 2);
  }
  // Graduations logarithmiques : 1, 2, 5 × 10ⁿ entre a et b
  function graduations(a, b) {
    const out = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) out.push(v); }
    return out;
  }
  const etiquette = v => (v >= 1 ? virg(v, 0) : virg(v, Math.max(0, -Math.floor(Math.log10(v) + 1e-9))));

  function dessinerSpectres() {
    const cv = $('#ac-spectres');
    if (cv.clientWidth < 50) return;
    const a = etat.analyse;
    if (!a) return message(cv, 'probabilité visée non atteinte');
    if (!etat.banque) return message(cv, 'génération de la banque…');
    if (!etat.sel) return message(cv, 'pas assez d\'enregistrements admissibles : élargir le facteur maximal ou retirer le filtre');
    const { ctx, W, H } = preparer(cv), etroit = W < 600, m = { g: 50, d: 14, h: etroit ? 46 : 30, b: 30 };
    const f = etat.facteur, choisis = etat.sel.choisis.map(c => ({ ...c, rec: etat.banque[c.i] }));
    const ech = choisis.map(c => c.rec.Sa.map(v => v * c.s * f));
    const vals = [...ech.flat(), ...a.cible.ln.map(Math.exp), ...a.Se];
    const y0 = Math.min(...vals) * 0.8, y1 = Math.max(...vals) * 1.25, x0 = T[0], x1 = T[T.length - 1];
    const X = t => m.g + (Math.log(t / x0) / Math.log(x1 / x0)) * (W - m.g - m.d), Y = v => H - m.b - (Math.log(v / y0) / Math.log(y1 / y0)) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const t of graduations(x0, x1)) { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(etiquette(t), x, H - m.b + 5); }
    for (const v of graduations(y0, y1)) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(etiquette(v), m.g - 6, y); }
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    // plage de contrôle de l'EC8 et période de l'ouvrage
    ctx.fillStyle = COUL.soft; ctx.fillRect(X(a.Tmin), m.h, X(a.Tmax) - X(a.Tmin), H - m.h - m.b);
    const ligne = (v, coul, w, tirets, k0 = 0, k1 = T.length - 1) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      for (let k = k0; k <= k1; k++) (k === k0 ? ctx.moveTo(X(T[k]), Y(v[k])) : ctx.lineTo(X(T[k]), Y(v[k])));
      ctx.stroke(); ctx.setLineDash([]);
    };
    // bande ± σ du spectre conditionnel
    if (a.cible.sigma) {
      ctx.fillStyle = COUL['pick-p']; ctx.globalAlpha = 0.12; ctx.beginPath();
      T.forEach((t, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, X(t), Y(Math.exp(a.cible.ln[k] + a.cible.sigma[k]))));
      for (let k = T.length - 1; k >= 0; k--) ctx.lineTo(X(T[k]), Y(Math.exp(a.cible.ln[k] - a.cible.sigma[k])));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    // Se (sauf s'il est la cible) et 0,9·Se sur la plage de contrôle
    if (etat.r.cible !== 'ec8') ligne(a.Se, COUL.teal, 1.2, [2, 3]);
    const kmin = T.findIndex(t => t >= a.Tmin - 1e-9), kmax = T.length - 1 - [...T].reverse().findIndex(t => t <= a.Tmax + 1e-9);
    ligne(a.Se.map(v => 0.9 * v), COUL.teal, 2.2, [7, 4], kmin, kmax);
    // enregistrements
    ctx.globalAlpha = 0.45;
    ech.forEach((s, j) => { if (j !== etat.vu) ligne(s, COUL.muted, 1); });
    ctx.globalAlpha = 1;
    ligne(ech[etat.vu], COUL.cyan, 1.8);
    // cible et moyennes du jeu
    ligne(a.cible.ln.map(Math.exp), COUL['pick-p'], 2.6, a.cible.sigma ? null : [8, 4]);
    ligne(etat.sel.moyLn.map(v => Math.exp(v) * f), COUL.blue, 2.6);
    ligne(etat.ec8Affiche.moyenne, COUL.blue, 1.4, [3, 3]);
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(etat.r.T1), m.h + 16); ctx.lineTo(X(etat.r.T1), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, 'période T (s)', W - m.d - 4, m.h + 9, COUL.muted, `10.5px ${MONO}`, 'right');
    texte(ctx, 'Sa (g), ξ = 5 %', m.g + 6, m.h + 9, COUL.muted, `10.5px ${MONO}`);
    const titre = `cible : ${CIBLES[etat.r.cible].replace('T1', `T1 = ${tps(etat.r.T1)} s`)} · Tr ${milliers(periodeRetour())} ans`;
    texte(ctx, titre, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    const droite = `${choisis.length} enregistrements${f !== 1 ? ` · ×${virg(f, 2)} commun` : ''} · écart ln ${virg(Math.sqrt(etat.sel.critere), 2)}`;
    texte(ctx, droite, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
  }

  function dessinerBanque() {
    const cv = $('#ac-mr');
    if (cv.clientWidth < 50) return;
    if (!etat.banque || !etat.analyse) return message(cv, 'génération de la banque…');
    const { ctx, W, H } = preparer(cv), m = { g: 44, d: 14, h: 26, b: 30 }, cms = etat.analyse.cms;
    const R0 = 2, R1 = 200, M0 = 4.9, M1 = 7.7;
    const X = R => m.g + (Math.log(R / R0) / Math.log(R1 / R0)) * (W - m.g - m.d), Y = M => H - m.b - ((M - M0) / (M1 - M0)) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const R of graduations(R0, R1)) { const x = Math.round(X(R)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(R), x, H - m.b + 5); }
    for (let M = 5; M <= 7.5 + 1e-9; M += 0.5) { const y = Math.round(Y(M)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(M, 1), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('distance Rjb (km)', W - m.d - 4, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('M', m.g + 4, m.h + 2);
    if (etat.r.filtre) {
      ctx.strokeStyle = COUL['pick-p']; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
      ctx.strokeRect(X(Math.max(R0, cms.rMoy / 3)), Y(Math.min(M1, cms.mMoy + 0.5)), X(Math.min(R1, 3 * cms.rMoy)) - X(Math.max(R0, cms.rMoy / 3)), Y(cms.mMoy - 0.5) - Y(cms.mMoy + 0.5));
      ctx.setLineDash([]);
    }
    ctx.fillStyle = COUL['grid-strong'];
    for (const c of etat.banque) { ctx.beginPath(); ctx.arc(X(c.R), Y(c.M), 2.6, 0, 2 * Math.PI); ctx.fill(); }
    if (etat.sel) etat.sel.choisis.forEach((c, j) => {
      const b = etat.banque[c.i], x = X(b.R), y = Y(b.M);
      ctx.fillStyle = j === etat.vu ? COUL.cyan : COUL.blue; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
      texte(ctx, String(j + 1), x + 7, y - 7, COUL.ink, `700 10.5px ${MONO}`);
    });
    const xm = X(cms.rMoy), ym = Y(cms.mMoy);
    ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(xm - 7, ym); ctx.lineTo(xm + 7, ym); ctx.moveTo(xm, ym - 7); ctx.lineTo(xm, ym + 7); ctx.stroke();
    texte(ctx, `scénario à T1 : M̄ ${virg(cms.mMoy, 1)} · R̄ ${virg(cms.rMoy, 0)} km`, m.g, 13, COUL['pick-p'], `800 12px ${POLICE}`);
  }

  function dessinerAccelero() {
    const cv = $('#ac-acc');
    if (cv.clientWidth < 50) return;
    if (!etat.sel) return message(cv, '—');
    const c = etat.sel.choisis[etat.vu], b = etat.banque[c.i], s = c.s * etat.facteur;
    const rec = Accelero.simuler({ M: b.M, R: b.R, graine: b.graine }), acc = Array.from(rec.acc, v => (v * s) / Sp.G);
    const im = Intensite.indicateurs(rec.acc, rec.dt);
    const { ctx, W, H } = preparer(cv), etroit = W < 600, m = { g: 50, d: 14, h: etroit ? 46 : 30, b: 28 }, duree = acc.length * rec.dt;
    let amax = 0, imax = 0;
    acc.forEach((v, i) => { if (Math.abs(v) > amax) { amax = Math.abs(v); imax = i; } });
    const ym = amax * 1.15, X = t => m.g + (t / duree) * (W - m.g - m.d), Y = v => m.h + (H - m.h - m.b) / 2 * (1 - v / ym);
    const pasT = duree > 60 ? 10 : duree > 25 ? 5 : 2, pasA = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find(p => ym / p <= 3) || 1;
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let t = 0; t <= duree; t += pasT) { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(t), x, H - m.b + 5); }
    for (let v = -Math.floor(ym / pasA) * pasA; v <= ym + 1e-9; v += pasA) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, pasA < 0.1 ? 2 : 1), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('temps (s)', W - m.d - 4, H - m.b - 3);
    // durée significative : de 5 % à 95 % de l'intensité d'Arias
    ctx.fillStyle = COUL.soft; ctx.globalAlpha = 0.8; ctx.fillRect(X(im.t5), m.h, X(im.t95) - X(im.t5), H - m.h - m.b); ctx.globalAlpha = 1;
    ctx.strokeStyle = COUL.trace; ctx.lineWidth = 1; ctx.beginPath();
    const pas = Math.max(1, Math.floor(acc.length / (2 * (W - m.g - m.d))));
    for (let i = 0; i < acc.length; i += pas) {
      // enveloppe min-max par paquet : aucun pic perdu au dessin
      let lo = acc[i], hi = acc[i];
      for (let j = i; j < Math.min(acc.length, i + pas); j++) { lo = Math.min(lo, acc[j]); hi = Math.max(hi, acc[j]); }
      const x = X(i * rec.dt);
      if (i === 0) ctx.moveTo(x, Y(lo)); else ctx.lineTo(x, Y(lo));
      ctx.lineTo(x, Y(hi));
    }
    ctx.stroke();
    ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(X(imax * rec.dt), Y(acc[imax]), 4, 0, 2 * Math.PI); ctx.fill();
    // courbe de Husid (intensité d'Arias cumulée, normée) sur toute la hauteur du graphe
    const Yh = h => H - m.b - h * (H - m.h - m.b), pasH = Math.max(1, Math.floor(acc.length / (W - m.g - m.d)));
    ctx.strokeStyle = COUL['pick-s']; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 0; i < acc.length; i += pasH) (i ? ctx.lineTo(X(i * rec.dt), Yh(im.husid[i])) : ctx.moveTo(X(0), Yh(0)));
    ctx.lineTo(X((acc.length - 1) * rec.dt), Yh(1)); ctx.stroke();
    ctx.strokeStyle = COUL['pick-s']; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    for (const h of [0.05, 0.95]) { const y = Math.round(Yh(h)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); }
    ctx.setLineDash([]);
    texte(ctx, `n° ${etat.vu + 1} · M ${virg(b.M, 1)} · Rjb ${b.R} km · ×${virg(s, 2)} · PGA ${g3(amax)} g`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    const droite = `D5–95 ${virg(im.d595, 1)} s · Ia ${g3(im.arias * s * s)} m/s`;
    texte(ctx, droite, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL['pick-s'], `800 12px ${POLICE}`, etroit ? 'left' : 'right');
    texte(ctx, 'a (g)', m.g + 6, m.h + 8, COUL.muted, `10.5px ${MONO}`);
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function majTable() {
    const sel = etat.sel;
    if (!sel) { $('#ac-table').innerHTML = '<tbody><tr><td>—</td></tr></tbody>'; return; }
    $('#ac-table').innerHTML = `<thead><tr><th>n°</th><th>M</th><th>Rjb (km)</th><th>facteur</th><th>écart ln</th><th><span style="white-space:nowrap">D5–95</span> (s)</th><th>Arias (m/s)</th></tr></thead><tbody>${sel.choisis.map((c, j) => {
      const b = etat.banque[c.i];
      return `<tr class="${j === etat.vu ? 'vu' : ''}" data-ac-vu="${j}" tabindex="0"><td class="n">${j + 1}</td><td class="n">${virg(b.M, 1)}</td><td class="n">${b.R}</td><td class="n">×${virg(c.s * etat.facteur, 2)}</td><td class="n">${virg(c.e, 2)}</td><td class="n">${virg(b.d595, 1)}</td><td class="n">${sig2(b.arias * (c.s * etat.facteur) ** 2)}</td></tr>`;
    }).join('')}</tbody>`;
    $$('[data-ac-vu]').forEach(tr => {
      const choisir = () => { etat.vu = +tr.dataset.acVu; majTable(); dessinerBanque(); dessinerAccelero(); dessinerSpectres(); };
      tr.addEventListener('click', choisir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    });
    const smax = Math.max(...sel.choisis.map(c => Math.max(c.s, 1 / c.s)));
    const dMoy = sel.choisis.reduce((x, c) => x + etat.banque[c.i].d595, 0) / sel.choisis.length;
    $('#ac-table-info').textContent = `${sel.admissibles} enregistrements admissibles sur ${NB_BANQUE}` + (sel.echanges ? ` · ${sel.echanges} échange${sel.echanges > 1 ? 's' : ''} glouton${sel.echanges > 1 ? 's' : ''}` : '') + ` · facteur extrême ×${virg(smax, 2)} · D5–95 moyenne ${virg(dMoy, 1)} s`;
  }
  function majRegles() {
    const a = etat.analyse, v = etat.ec8Affiche;
    $('#ac-cible-info').textContent = a ? `Sol ${a.sol} (Vs30 ${milliers(aleaSite().modele.site.vs30)} m/s), spectre de type ${a.type} (M̄ ${a.type === 1 ? '>' : '≤'} 5,5) calé sur le PGA de l'UHS : ag·S = ${g3(a.agS)} g. Plage de contrôle : ${tps(a.Tmin)} à ${tps(a.Tmax)} s.`
      + (etat.modeleRecu ? ' Modèle repris du banc « aléa ».' : ' Modèle d\'école du banc « aléa ».') : '';
    if (!v) { $('#ac-regles').innerHTML = ''; return; }
    const ligne = (ok, t, d) => `<li><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${t}<br><small>${d}</small></li>`;
    const R = v.regles;
    $('#ac-regles').innerHTML = `<ul class="regles">${[
      ligne(R.nombre.ok, `a) au moins 3 accélérogrammes : ${R.nombre.valeur}`, 'nombre suffisant pour une moyenne et une variance stables'),
      ligne(R.pga.ok, `b) PGA moyen ${g3(R.pga.valeur)} g ${R.pga.ok ? '≥' : '<'} ag·S = ${g3(R.pga.seuil)} g`, 'moyenne des accélérations à période nulle'),
      ligne(R.spectre.ok, `c) moyenne ≥ 0,9·Se de ${tps(R.spectre.plage[0])} à ${tps(Math.min(R.spectre.plage[1], 3))} s : ${virg(100 * 0.9 * R.spectre.rapportMin, 0)} % de Se au plus bas (${tps(R.spectre.Tpire)} s)`, 'moyenne arithmétique des spectres à 5 %, de 0,2·T1 à 2·T1'),
    ].join('')}</ul>
      <p class="score ${v.conforme ? '' : 'ko'}">${v.conforme ? 'Jeu conforme' : 'Jeu non conforme'}${etat.facteur === 1 && !v.conforme ? ` : facteur commun minimal ×${virg(etat.ec8.facteurConformite, 2)}` : ''}</p>
      <p class="aide">Avec ${R.nombre.valeur} analyses temporelles, on retient ${v.reponse === 'moyenne' ? 'la <b>moyenne</b> des réponses (7 analyses ou plus)' : 'la réponse <b>la plus défavorable</b> (moins de 7 analyses)'} — § 4.3.3.4.3 (3).</p>`;
  }
  function majControles() {
    const r = etat.r;
    $$('[data-ac-t1]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.acT1 === r.T1)));
    $$('[data-ac-cible]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.acCible === r.cible)));
    $$('[data-ac-proba]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.acProba === r.proba.join('|'))));
    $('#ac-n').value = r.n; $('#ac-n-v').textContent = String(r.n);
    $('#ac-smax').value = r.sMax; $('#ac-smax-v').textContent = '×' + virg(r.sMax, 1);
    $('#ac-filtre').checked = r.filtre; $('#ac-optimiser').checked = r.optimiser; $('#ac-optimiser').disabled = r.cible !== 'cms';
    $('#ac-conformer').checked = etat.conformer;
    const ex = etat.mode === 'exercice';
    $$('[data-ac-t1], [data-ac-cible], [data-ac-proba]').forEach(b => { b.disabled = ex; });
  }
  function tout() {
    if (!COUL.paper) lireCouleurs();
    majControles(); majTable(); majRegles(); majExercice();
    $('#ac-ec8').hidden = enExercice();
    dessiner();
  }
  function dessiner() { dessinerSpectres(); dessinerBanque(); dessinerAccelero(); }
  function recalculer() { analyser(); tout(); }
  let attente = 0;
  const planifier = () => { clearTimeout(attente); attente = setTimeout(recalculer, 80); };
  function nouvelleBanque(graine) {
    etat.graine = graine; etat.banque = null; etat.sel = null; etat.ec8 = null; etat.ec8Affiche = null; etat.facteur = 1; tout();
    genererBanque(graine, recalculer);
  }

  // ── Exercice : contrôle EC8 d'un jeu calé sur le CMS ──────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = Sismo.aleatoire(numero * 7919 + 11);
    etat.exo = { numero };
    etat.r = { ...reglagesDefaut(), T1: T1S[Math.floor(u() * T1S.length)], n: 3 + Math.floor(u() * 7), sMax: 4 };
    etat.verifie = false; etat.conformer = false; etat.rep = {};
    $('#ac-exo-num').textContent = 'Exercice n° ' + numero;
    $('#ac-r-facteur').value = '';
    $$('[data-ac-rep]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#ac-corrige').innerHTML = '';
    nouvelleBanque(numero * 104729 + 7);
  }
  function majExercice() {
    if (etat.mode !== 'exercice') return;
    const v = etat.ec8, a = etat.analyse;
    if (!v || !a || !etat.sel) { $('#ac-exo-donnees').innerHTML = ''; return; }
    const ks = T.map((t, k) => k).filter(k => T[k] >= a.Tmin - 1e-9 && T[k] <= a.Tmax + 1e-9);
    $('#ac-exo-donnees').innerHTML = `<p class="aide" style="margin-top:0">ag·S = ${g3(a.agS)} g · PGA moyen du jeu : ${g3(v.pgaMoyen)} g · n = ${etat.sel.choisis.length} · T1 = ${tps(etat.r.T1)} s</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>T (s)</th><th>moyenne (g)</th><th>Se (g)</th></tr></thead><tbody>${ks.map(k =>
        `<tr><td class="n">${tps(T[k])}</td><td class="n">${g3(v.moyenne[k])}</td><td class="n">${g3(a.Se[k])}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function verifier() {
    const v = etat.ec8;
    if (!v) return;
    const lu = parseFloat(String($('#ac-r-facteur').value).replace(',', '.'));
    const okC = etat.rep.conforme === (v.conforme ? 'oui' : 'non');
    const okF = Math.abs(lu / v.facteurConformite - 1) <= 0.05;
    const okR = etat.rep.reponse === v.reponse;
    etat.verifie = true;
    const lignes = [
      ['Jeu conforme au § 3.2.3.1.2 (4) ?', etat.rep.conforme || '—', v.conforme ? 'oui' : 'non', okC, 'les trois règles a), b) et c)'],
      ['Facteur commun minimal', Number.isFinite(lu) ? '×' + virg(lu, 2) : '—', '×' + virg(v.facteurConformite, 2), okF, '± 5 % : max(ag·S / PGA moyen ; 0,9·Se / moyenne)'],
      ['Réponse à retenir', etat.rep.reponse || '—', v.reponse, okR, '§ 4.3.3.4.3 (3) : moyenne dès 7 analyses'],
    ];
    $('#ac-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([n, x, y, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${x}</td><td class="n">${y}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">Un jeu calé sur le spectre moyen conditionnel suit l'aléa du site à T1 et passe sous l'UHS ailleurs ; le spectre de l'EC8,
      enveloppe forfaitaire, est souvent plus exigeant aux longues périodes. Le facteur commun mesure ce surcoût.</p>`;
    tout();
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    etat.mode = m;
    $('#ac-mode-explorer').setAttribute('aria-pressed', String(m === 'explorer'));
    $('#ac-mode-exercice').setAttribute('aria-pressed', String(m === 'exercice'));
    $('#ac-panneau-explorer').hidden = m !== 'explorer';
    $('#ac-panneau-exercice').hidden = m !== 'exercice';
    if (m === 'exercice') nouvelExercice();
    else { etat.r = reglagesDefaut(); etat.verifie = false; nouvelleBanque(2024); }
  }

  // ── Événements ──────────────────────────────────────────────────────────
  function brancher() {
    $('#ac-t1').innerHTML = T1S.map(t => `<button type="button" data-ac-t1="${t}">${tps(t)} s</button>`).join('');
    $$('[data-ac-t1]').forEach(b => b.addEventListener('click', () => { etat.r.T1 = +b.dataset.acT1; etat.vu = 0; recalculer(); }));
    $$('[data-ac-cible]').forEach(b => b.addEventListener('click', () => { etat.r.cible = b.dataset.acCible; etat.vu = 0; recalculer(); }));
    $$('[data-ac-proba]').forEach(b => b.addEventListener('click', () => { etat.r.proba = b.dataset.acProba.split('|').map(Number); recalculer(); }));
    $('#ac-n').addEventListener('input', e => { etat.r.n = parseInt(e.target.value, 10); majControles(); planifier(); });
    $('#ac-smax').addEventListener('input', e => { etat.r.sMax = parseFloat(e.target.value); majControles(); planifier(); });
    $('#ac-filtre').addEventListener('change', e => { etat.r.filtre = e.target.checked; etat.vu = 0; recalculer(); });
    $('#ac-optimiser').addEventListener('change', e => { etat.r.optimiser = e.target.checked; recalculer(); });
    $('#ac-conformer').addEventListener('change', e => { etat.conformer = e.target.checked; recalculer(); });
    $('#ac-banque').addEventListener('click', () => nouvelleBanque(1 + Math.floor(Math.random() * 1e6)));
    $('#ac-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#ac-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $$('[data-ac-rep]').forEach(b => b.addEventListener('click', () => {
      const [q, val] = b.dataset.acRep.split('|');
      etat.rep[q] = val;
      $$(`[data-ac-rep^="${q}|"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#ac-verifier').addEventListener('click', verifier);
    $('#ac-nouvel-exo').addEventListener('click', nouvelExercice);
    const redessiner = () => { if (!$('#banc-selection').hidden) { lireCouleurs(); dessiner(); } };
    const ro = new ResizeObserver(redessiner);
    for (const id of ['#ac-spectres', '#ac-mr', '#ac-acc']) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // Modèle exploré au banc « aléa » : il remplace le modèle d'école
  // (recalculé à l'ouverture du banc seulement : le banc « aléa » publie à chaque réglage)
  window.addEventListener('alea:modele', e => {
    etat.modeleRecu = e.detail.modele;
    etat.perime = true;
  });
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'selection') return;
    if (!etat.pret) {
      etat.pret = true; etat.perime = false; lireCouleurs(); brancher(); majControles();
      // l'aléa d'abord (une fraction de seconde), puis la banque par tranches
      setTimeout(() => { analyser(); tout(); genererBanque(etat.graine, recalculer); }, 30);
    } else if (etat.perime && etat.banque && etat.mode === 'explorer') { etat.perime = false; recalculer(); }
    else tout();
  });
})();
