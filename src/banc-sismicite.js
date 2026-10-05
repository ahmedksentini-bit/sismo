import Sismo from './sismo/signal.js';
import Sismicite from './sismo/sismicite.js';
import Catalogue from './sismo/catalogue.js';
import Centres from './sismo/centres.js';
import Zones from './sismo/zones.js';
import Mecanismes from './sismo/mecanismes.js';
import Mecanisme from './sismo/mecanisme.js';
import ZonesReel from './zones-reel.js';

// src/banc-sismicite.js — banc « sismicité » : un catalogue simulé, sa complétude, le déclusterage,
// la loi de Gutenberg-Richter ajustée et les probabilités de Poisson qui en découlent.
// Mode « Catalogue réel » : un catalogue chargé (texte FDSN, CSV ou GeoJSON de l'USGS, tableau à en-tête) ou téléchargé par
// le relais FDSN du site (src/sismo/catalogue.js) passe par la même analyse, sur la période et la région de ses données,
// avec la carte de ses épicentres (zoom, déplacement) ; pas de vérité terrain ni de corrigé. Sur cette carte, l'étudiant trace
// des zones sismogènes (src/sismo/zones.js : b, taux, Mmax de chaque zone) et les passe au banc « aléa » (src/zones-reel.js).
(() => {
  'use strict';
  const SM = Sismo, Sc = Sismicite, Cat = Catalogue;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const echapper = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const DEBUT = 1900, FIN = 2025;
  // Domaine des graphiques et bornes des réglages : fixes pour le catalogue simulé, tirés des données en mode réel.
  const DOMAINE_SIMULE = { debut: DEBUT, fin: FIN, mBas: Sc.MMIN, mHaut: 8, debutMin: DEBUT, debutMax: 2015, mcMax: 6, pas: 1 };
  const TABLE_SIMULEE = [[1990, 3.0], [1964, 4.0], [1930, 5.0], [1900, 6.0]];
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // Régions proposées au téléchargement : cadre [latitudes], [longitudes]
  const ZONES = {
    tunisie: ['Tunisie', [30, 38], [7, 12]], algerie: ['Nord de l\'Algérie', [34, 38], [-2, 9]], maroc: ['Nord du Maroc', [30, 37], [-10, -1]],
    italie: ['Italie', [36, 47.5], [6, 19]], grece: ['Grèce et mer Égée', [34, 42], [19, 30]], turquie: ['Turquie', [35, 43], [25, 45]],
    alpes: ['Alpes', [44, 48.5], [5, 16]], mediterranee: ['Méditerranée', [30, 46], [-10, 37]],
  };

  const etat = {
    pret: false, mode: 'explorer',
    explo: { b: 1.0, taux4: 2, Mmax: 7.5, repliques: true, graine: 5, completude: Sc.COMPLETUDE },
    exo: null, cat: [], garde: [], declus: true, debutAnalyse: 1990, Mc: 3.0,
    methode: 'aki', table: TABLE_SIMULEE.map(r => [...r]),
    m: 6, duree: 50, verifie: false,
    dom: DOMAINE_SIMULE, reel: null, fonds: {}, telechargement: false,
    // zones sismogènes tracées sur la carte (gardées d'un catalogue à l'autre), tracé en cours, outil de la carte, site
    zones: [], trace: null, outil: null, site: null, numero: 0,
    // mécanismes au foyer (fichier chargé, ou colonnes strike, dip, rake du catalogue), affichés sur la carte
    mecs: null, afficherMecs: true,
  };
  const reel = () => etat.mode === 'reel';
  const parametres = () => (etat.mode === 'explorer' ? etat.explo : etat.exo.p);
  const D = () => etat.dom;

  // ── Catalogue et analyse ────────────────────────────────────────────────
  function regenerer() {
    if (reel()) return;
    const p = parametres();
    etat.cat = Sc.genererCatalogue({ ...p, debut: DEBUT, fin: FIN });
    etat.garde = Sc.declusterGK(etat.cat);
    etat.verifie = false;
    if (etat.mode === 'exercice') $('#sc-corrige').innerHTML = '';
    tout();
  }
  const independants = () => etat.cat.filter((e, i) => !etat.declus || etat.garde[i]);
  const retenus = () => independants().filter(e => e.t >= etat.debutAnalyse);
  // Table de complétude rangée de la plus récente à la plus ancienne ; Mc de l'époque d'un séisme.
  const tableTriee = () => etat.table.filter(r => Number.isFinite(r[0]) && Number.isFinite(r[1])).sort((a, b) => b[0] - a[0]);
  const mcTable = t => { const tb = tableTriee(); for (const [a, mc] of tb) if (t >= a) return mc; return Infinity; };
  // Aki : une seule période [début, fin] au-dessus de Mc. Weichert : toute la table de complétude.
  function analyse() {
    if (etat.methode === 'aki') {
      const ev = retenus(), annees = D().fin - etat.debutAnalyse;
      return { methode: 'aki', ev, annees, nRet: ev.filter(e => e.M >= etat.Mc - 1e-9).length, r: Sc.recurrence(ev.map(e => e.M), etat.Mc, annees) };
    }
    const tb = tableTriee(), ev = independants();
    if (!tb.length || !ev.length) return { methode: 'weichert', nRet: 0, r: null };
    const comp = Sc.comptagesCompletude(ev, tb, Sc.DM, D().fin - 1), w = Sc.weichert(comp, 4);
    return { methode: 'weichert', comp, nRet: comp.nobs.reduce((a, v) => a + v, 0), r: w };
  }
  // Séisme pris dans l'analyse : gardé par le déclusterage, dans la période et au-dessus de Mc (ou de la table).
  const dans = (e, i) => (!etat.declus || etat.garde[i]) && (etat.methode === 'aki' ? e.t >= etat.debutAnalyse && e.M >= etat.Mc - 1e-9 : e.M >= mcTable(e.t) - 1e-7);
  // Loi vraie des chocs principaux (exponentielle tronquée à Mmax).
  function tauxVrai(m) {
    const p = parametres(), lmin = p.taux4 * Math.pow(10, p.b * (4 - Sc.MMIN)), q = Math.pow(10, -p.b * (p.Mmax - Sc.MMIN));
    return m >= p.Mmax ? 0 : (lmin * (Math.pow(10, -p.b * (m - Sc.MMIN)) - q)) / (1 - q);
  }
  // Années : entières (catalogue simulé, long catalogue réel) ou au mois près (catalogue réel de moins de 15 ans).
  const arrondiPas = (x, pas) => Math.round(Math.round(x / pas) * pas * 10) / 10;
  function moisAnnee(a) { const d = new Date(Cat.depuisAnnee(a)); return `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  const annee = a => (D().pas < 1 ? moisAnnee(a) : String(Math.round(a)));
  const jour = ms => new Date(ms).toISOString().slice(0, 10);
  // Années couvertes, de la première à la dernière (un instant de fin au 1er janvier appartient à l'année précédente).
  const intervalle = (a, b) => { const a0 = Math.floor(a), b0 = Math.floor(b - 1e-9); return a0 === b0 ? String(a0) : `${a0} – ${b0}`; };

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
  // Graphique vide du mode réel tant qu'aucun catalogue n'est chargé.
  function vide(cv) {
    const { ctx, W, H } = preparer(cv);
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    texte(ctx, 'Chargez un catalogue (panneau « Catalogue réel »).', W / 2, H / 2, COUL.muted, `700 12px ${POLICE}`, 'center');
  }
  // Pas de graduation « rond » (1, 2, 5 × 10ⁿ) d'au moins `min`.
  const pasRond = min => { const p = Math.pow(10, Math.floor(Math.log10(min))); return [1, 2, 5, 10].map(k => k * p).find(v => v >= min - 1e-12); };
  const geoCat = cv => {
    const W = cv.clientWidth, H = cv.clientHeight, m = { g: 40, d: 12, h: 12, b: 26 }, d = D();
    return {
      W, H, m,
      X: t => m.g + ((t - d.debut) / (d.fin - d.debut)) * (W - m.g - m.d), T: x => d.debut + ((x - m.g) / (W - m.g - m.d)) * (d.fin - d.debut),
      Y: M => H - m.b - ((M - d.mBas) / (d.mHaut - d.mBas)) * (H - m.h - m.b), M: y => d.mBas + ((H - m.b - y) / (H - m.h - m.b)) * (d.mHaut - d.mBas),
    };
  };
  // Graduations du temps : années rondes, ou mois pour un catalogue de moins de trois ans.
  function graduationsTemps(d, largeur) {
    const n = Math.max(2, Math.floor(largeur / 64)), duree = d.fin - d.debut, out = [];
    if (duree / n >= 1 || !reel()) {
      const pas = reel() ? pasRond(duree / n) : 20;
      for (let a = Math.ceil((reel() ? d.debut : DEBUT) / pas) * pas; a <= d.fin + 1e-9; a += pas) out.push([a, String(a)]);
      return out;
    }
    const pasMois = [1, 2, 3, 6, 12].find(k => (duree * 12) / k <= n) || 12, d0 = new Date(Cat.depuisAnnee(d.debut));
    for (let an = d0.getUTCFullYear(), mo = Math.ceil(d0.getUTCMonth() / pasMois) * pasMois; ; mo += pasMois) {
      const a = Cat.anneeDecimale(Cat.utc(an + Math.floor(mo / 12), (mo % 12) + 1, 1));
      if (a > d.fin) break;
      if (a >= d.debut) out.push([a, mo % 12 === 0 ? String(an + Math.floor(mo / 12)) : MOIS[mo % 12]]);
    }
    return out;
  }
  function dessinerCatalogue() {
    lireCouleurs();
    const cv = $('#sc-catalogue');
    if (cv.clientWidth < 50) return;
    if (!etat.cat.length) { if (reel()) vide(cv); return; }
    const { ctx, W, H } = preparer(cv), g = geoCat(cv), d = D();
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const [a, lib] of graduationsTemps(d, W - g.m.g - g.m.d)) {
      const x = Math.round(g.X(a)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, g.m.h); ctx.lineTo(x, H - g.m.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(lib, x, H - g.m.b + 5);
    }
    for (let M = Math.ceil(d.mBas + 0.5); M <= d.mHaut; M++) {
      const y = Math.round(g.Y(M)) + 0.5;
      ctx.beginPath(); ctx.moveTo(g.m.g, y); ctx.lineTo(W - g.m.d, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('M' + String(M).replace('-', '−'), g.m.g - 6, y);
    }
    // Zone analysée : un rectangle (Aki) ou l'escalier de la table de complétude (Weichert)
    const x0 = g.X(etat.debutAnalyse), y0 = g.Y(etat.Mc);
    if (etat.methode === 'aki') {
      ctx.fillStyle = COUL.soft; ctx.fillRect(x0, g.m.h, W - g.m.d - x0, y0 - g.m.h);
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, g.m.h + 0.5, W - g.m.d - x0 - 1, y0 - g.m.h);
    } else {
      const tb = tableTriee();
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.5;
      tb.forEach(([a, mc], i) => {
        const xa = g.X(Math.max(d.debut, a)), xb = g.X(i === 0 ? d.fin : tb[i - 1][0]);
        ctx.fillStyle = COUL.soft; ctx.fillRect(xa, g.m.h, xb - xa, g.Y(mc) - g.m.h);
        ctx.beginPath(); ctx.moveTo(xa, g.Y(mc) + 0.5); ctx.lineTo(xb, g.Y(mc) + 0.5); ctx.moveTo(xa + 0.5, g.m.h); ctx.lineTo(xa + 0.5, g.Y(mc)); ctx.stroke();
      });
    }
    // Complétude vraie (exploration ou corrigé) ; un catalogue réel n'en a pas
    if (!reel() && (etat.mode === 'explorer' || etat.verifie)) {
      const comp = parametres().completude;
      ctx.save(); ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
      comp.forEach(([a, mc], i) => { const xa = g.X(a), xb = g.X(i + 1 < comp.length ? comp[i + 1][0] : FIN); if (i === 0) ctx.moveTo(xa, g.Y(mc)); else ctx.lineTo(xa, g.Y(mc)); ctx.lineTo(xb, g.Y(mc)); });
      ctx.stroke(); ctx.restore();
    }
    // Séismes : taille selon M ; répliques retirées en ambre ; hors analyse estompés
    const m3 = reel() ? d.mBas + 0.5 : 3;
    for (const passe of [0, 1]) {
      etat.cat.forEach((e, i) => {
        const garde = !etat.declus || etat.garde[i], ok = dans(e, i);
        if ((passe === 1) !== ok) return;
        ctx.globalAlpha = ok ? 0.9 : 0.35;
        ctx.fillStyle = garde ? (ok ? COUL.ink : COUL.muted) : COUL.amp;
        const r = 1 + Math.max(0, e.M - m3) * 1.1;
        ctx.beginPath(); ctx.arc(g.X(e.t), g.Y(e.M), r, 0, 2 * Math.PI); ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
    if (etat.methode === 'aki') {
      const etroit = W - g.m.d - x0 < 190;
      texte(ctx, `analyse : depuis ${annee(etat.debutAnalyse)}, M ≥ ${virg(etat.Mc, 1)}`, etroit ? x0 - 6 : x0 + 6, g.m.h + 10, COUL.blue, `800 11px ${POLICE}`, etroit ? 'right' : 'left');
    } else {
      texte(ctx, 'analyse : table de complétude (Weichert)', W - g.m.d - 6, g.m.h + 10, COUL.blue, `800 11px ${POLICE}`, 'right');
    }
  }
  function dessinerFMD() {
    lireCouleurs();
    const cv = $('#sc-fmd');
    if (cv.clientWidth < 50) return;
    if (!etat.cat.length) { if (reel()) vide(cv); return; }
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 14, b: 30 }, an = analyse(), r = an.r, d = D();
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    // Distribution : taux annuels par classe (carrés) et cumulés (disques). Avec Weichert, chaque
    // classe a sa propre durée d'observation, celle de la table de complétude.
    let classes = [];
    if (an.methode === 'aki') {
      const inc = new Map();
      for (const e of an.ev) { const k = Math.round(e.M * 10); inc.set(k, (inc.get(k) || 0) + 1); }
      classes = [...inc.keys()].sort((p, q) => p - q).map(k => [k / 10, inc.get(k) / an.annees, k / 10 >= etat.Mc - 1e-9]);
    } else if (an.comp) {
      classes = an.comp.centres.map((c, k) => [Math.round((c - Sc.DM / 2) * 10) / 10, an.comp.duree[k] ? an.comp.nobs[k] / an.comp.duree[k] : 0, true]).filter(c => c[1] > 0);
    }
    let cumul = 0;
    const cum = [];
    for (let i = classes.length - 1; i >= 0; i--) { cumul += classes[i][1]; cum.unshift([classes[i][0], cumul, classes[i][2]]); }
    // Axes : fixes pour le catalogue simulé ; d'une classe à l'ensemble du catalogue réel (trois décades au moins)
    let y0 = -3, y1 = 3;
    if (reel() && cum.length) {
      let mn = Infinity;
      for (const c of classes) if (c[1] > 0) mn = Math.min(mn, c[1]);
      y1 = Math.max(1, Math.ceil(Math.log10(cum[0][1]) + 0.3)); y0 = Math.min(y1 - 3, Math.floor(Math.log10(mn) - 0.05));
    }
    const Mmin = reel() ? d.mBas - 0.1 : Sc.MMIN - 0.1, Mmax = d.mHaut;
    const X = M => m.g + ((M - Mmin) / (Mmax - Mmin)) * (W - m.g - m.d), Y = lg => H - m.b - ((lg - y0) / (y1 - y0)) * (H - m.h - m.b);
    const pasY = Math.max(1, Math.ceil((y1 - y0) / Math.max(2, Math.floor((H - m.h - m.b) / 34))));
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let M = reel() ? Math.ceil(Mmin) : 3; M <= Mmax; M++) { const x = Math.round(X(M)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(M).replace('-', '−'), x, H - m.b + 5); }
    for (let lg = y0; lg <= y1; lg += pasY) { const y = Math.round(Y(lg)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(lg >= 0 ? milliers(Math.pow(10, lg)) : lg >= -4 ? String(Math.pow(10, lg)).replace('.', ',') : `10${String(lg).replace('-', '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])}`, m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('M', W - m.d, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('séismes par an', m.g + 6, m.h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    for (const [M, v] of classes) { ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.strokeRect(X(M) - 3, Y(Math.log10(v)) - 3, 6, 6); }
    for (const [M, v, ok] of cum) { ctx.fillStyle = ok ? COUL.ink : COUL.muted; ctx.beginPath(); ctx.arc(X(M), Y(Math.log10(v)), 3.2, 0, 2 * Math.PI); ctx.fill(); }
    // Loi vraie des chocs principaux (catalogue simulé) et droite ajustée
    if (!reel() && (etat.mode === 'explorer' || etat.verifie)) {
      ctx.strokeStyle = COUL.teal; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
      for (let M = Sc.MMIN; M <= parametres().Mmax - 0.02; M += 0.05) { const v = tauxVrai(M); if (M === Sc.MMIN) ctx.moveTo(X(M), Y(Math.log10(v))); else ctx.lineTo(X(M), Y(Math.log10(v))); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    const mDebut = an.methode === 'aki' ? etat.Mc : r ? r.m0 : null;
    if (r) {
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.4; ctx.beginPath();
      ctx.moveTo(X(mDebut), Y(Math.log10(r.taux(mDebut)))); ctx.lineTo(X(Mmax), Y(Math.log10(r.taux(Mmax)))); ctx.stroke();
    }
    ctx.restore();
    if (an.methode === 'aki') {
      const xm = X(etat.Mc);
      ctx.save(); ctx.strokeStyle = COUL.blue; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xm, m.h); ctx.lineTo(xm, H - m.b); ctx.stroke(); ctx.restore();
      texte(ctx, 'Mc', xm + 4, H - m.b - 10, COUL.blue, `800 11px ${POLICE}`);
    }
    if (r) texte(ctx, `log N = ${virg(r.a, 2)} − ${virg(r.b, 2)} M`, W - m.d - 8, m.h + 12, COUL['pick-p'], `800 12px ${MONO}`, 'right');
  }

  // Graphique de Stepp : σλ en fonction de la durée, en échelles logarithmiques ; tirets : pente −1/2.
  const COULEURS_STEPP = ['ink', 'blue', 'teal', 'amp', 'pick-p'];
  const DUREES = [0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 300, 500];
  // Réglages du graphique de Stepp d'un catalogue réel : classes de 0,5 à partir de Mc par courbure maximale − 0,5
  // (cinq au plus, la dernière jusqu'au plus fort séisme), durées jusqu'à la longueur du catalogue.
  function reglagesStepp() {
    if (!reel()) return { anneeFin: FIN, Tmin: 1, Tmax: 150 };
    const d = D(), duree = d.fin - d.debut, ev = independants();
    let mx = -Infinity;
    for (const e of ev) mx = Math.max(mx, e.M);
    const mc = ev.length ? Sc.mcCourbureMax(ev.map(e => e.M)) : d.mBas, classes = [];
    for (let a = Math.floor((mc - 0.5) * 2) / 2; a <= mx && classes.length < 5; a += 0.5) classes.push([a, a + 0.5]);
    if (classes.length) classes[classes.length - 1][1] = Math.max(classes[classes.length - 1][1], Math.round((mx + 0.1) * 10) / 10);
    const durees = DUREES.filter(T => T <= duree * 1.001 && T >= duree / 150);
    if (!durees.length || durees[durees.length - 1] < duree * 0.97) durees.push(Math.round(duree * 100) / 100);
    return { classes, durees, anneeFin: d.fin, Tmin: Math.pow(10, Math.floor(Math.log10(durees[0]))), Tmax: duree * 1.2 };
  }
  function dessinerStepp() {
    lireCouleurs();
    const cv = $('#sc-stepp');
    if (cv.clientWidth < 50) return;
    if (!etat.cat.length) { if (reel()) vide(cv); return; }
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 14, b: 30 }, rs = reglagesStepp();
    ctx.fillStyle = COUL.paper; ctx.fillRect(0, 0, W, H);
    const courbes = Sc.stepp(independants(), rs.classes ? rs : { anneeFin: FIN });
    let y0 = -3, y1 = 1;
    if (reel()) {
      let a = Infinity, b = -Infinity;
      for (const c of courbes) for (const p of c.points) if (p.n > 0) { a = Math.min(a, Math.log10(p.sigma)); b = Math.max(b, Math.log10(p.sigma)); }
      if (b >= a) { y1 = Math.ceil(b + 0.3); y0 = Math.min(y1 - 3, Math.floor(a - 0.3)); }
    }
    const lx = T => Math.log10(T / rs.Tmin) / Math.log10(rs.Tmax / rs.Tmin);
    const X = T => m.g + lx(T) * (W - m.g - m.d), Y = lg => H - m.b - ((lg - y0) / (y1 - y0)) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (const T of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]) {
      if (T < rs.Tmin || T > rs.Tmax) continue;
      const x = Math.round(X(T)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(T).replace('.', ','), x, H - m.b + 5);
    }
    const pasY = Math.max(1, Math.ceil((y1 - y0) / Math.max(2, Math.floor((H - m.h - m.b) / 34))));
    for (let lg = y0; lg <= y1; lg += pasY) { const y = Math.round(Y(lg)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(lg >= 0 ? milliers(Math.pow(10, lg)) : String(Math.pow(10, lg)).replace('.', ','), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(reel() ? `T (ans avant le ${jour(Cat.depuisAnnee(rs.anneeFin)).split('-').reverse().join('/')})` : `durée T (ans, en remontant depuis ${FIN})`, W - m.d, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('σλ (par an)', m.g + 6, m.h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    const legende = [];
    courbes.forEach((c, k) => {
      const coul = COUL[COULEURS_STEPP[k % COULEURS_STEPP.length]], pts = c.points.filter(p => p.n > 0);
      if (!pts.length) return;
      // Pente −1/2 ancrée sur la période récente où la classe a au moins 5 séismes
      const ancre = pts.find(p => p.n >= 5) || pts[pts.length - 1];
      ctx.strokeStyle = coul; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath();
      ctx.moveTo(X(rs.Tmin), Y(Math.log10(ancre.sigma * Math.sqrt(ancre.T / rs.Tmin)))); ctx.lineTo(X(rs.Tmax), Y(Math.log10(ancre.sigma * Math.sqrt(ancre.T / rs.Tmax)))); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(X(p.T), Y(Math.log10(p.sigma))); else ctx.lineTo(X(p.T), Y(Math.log10(p.sigma))); });
      ctx.stroke();
      ctx.fillStyle = coul;
      for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.T), Y(Math.log10(p.sigma)), 2.8, 0, 2 * Math.PI); ctx.fill(); }
      legende.push([`M ${virg(c.m0, 1)}–${virg(c.m1, 1)}`, coul]);
    });
    ctx.restore();
    legende.forEach(([t, c], i) => texte(ctx, t, m.g + 10, H - m.b - 12 - 15 * (legende.length - 1 - i), c, `800 11px ${POLICE}`));
  }

  // ── Carte des épicentres (catalogue réel) ───────────────────────────────
  // Équirectangulaire au cos de la latitude moyenne, cadrée sur le catalogue (Catalogue.cadre, antiméridien compris).
  // Fond : côtes et frontières de Natural Earth, celles du bassin méditerranéen (plus fines) quand la carte y tient.
  const DOMAINE_MED = { lon: [-20, 50], lat: [22, 53] };
  function fond(cle) {
    if (etat.fonds[cle] !== undefined) return etat.fonds[cle];
    etat.fonds[cle] = null;
    fetch(`data/cotes-${cle}.json`).then(r => r.json()).then(j => {
      // boîte de chaque ligne, pour ne dessiner que ce qui se voit
      const boites = l => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let i = 0; i < l.length; i += 2) { a = Math.min(a, l[i]); b = Math.max(b, l[i]); c = Math.min(c, l[i + 1]); d = Math.max(d, l[i + 1]); } return [a, b, c, d]; };
      etat.fonds[cle] = { cotes: j.cotes.map(l => [l, boites(l)]), frontieres: j.frontieres.map(l => [l, boites(l)]) };
      if (reel()) dessinerCarte();
    }).catch(() => { etat.fonds[cle] = false; });
    return null;
  }
  // Vue de la carte : centre (longitude dans la fenêtre du cadre) et facteur de zoom ; 1 = tout le cadre.
  const vueEnsemble = c => ({ clon: (c.lon[0] + c.lon[1]) / 2, clat: (c.lat[0] + c.lat[1]) / 2, z: 1 });
  function projectionCarte(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, c = etat.reel.cadre, m = 8, v = etat.reel.vue;
    const kx0 = Math.max(0.15, Math.cos((((c.lat[0] + c.lat[1]) / 2) * Math.PI) / 180)), latc = v.clat, kx = Math.max(0.15, Math.cos((latc * Math.PI) / 180));
    const k = Math.min((W - 2 * m) / ((c.lon[1] - c.lon[0]) * kx0), (H - 2 * m) / (c.lat[1] - c.lat[0])) * v.z, cx = v.clon;
    const X = lon => W / 2 + (lon - cx) * kx * k, Y = lat => H / 2 - (lat - latc) * k;
    // étendue visible (la carte remplit le cadre du canevas)
    const vue = { lon: [cx - W / 2 / (kx * k), cx + W / 2 / (kx * k)], lat: [Math.max(-90, latc - H / 2 / k), Math.min(90, latc + H / 2 / k)] };
    return { W, H, k, kx, X, Y, vue, lon: x => cx + (x - W / 2) / (kx * k), lat: y => latc - (y - H / 2) / k };
  }
  const pasGraticule = (k, kx) => [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45, 60, 90].find(p => p * kx * k >= 48 && p * k >= 30) || 90;
  // Étiquette d'un méridien (ramené entre −180° et 180°) ou d'un parallèle : 15°E, 70°O, 180°, 0°, 32,5°S…
  function etiquette(v, pas, pos, neg) {
    const w = pos === 'E' ? ((((v + 180) % 360) + 360) % 360) - 180 : v, a = Math.abs(w), z = a < 1e-6 || Math.abs(a - 180) < 1e-6;
    return `${pas < 1 ? virg(a, 1) : Math.round(a)}°${z ? '' : w < 0 ? neg : pos}`;
  }
  function dessinerCarte() {
    lireCouleurs();
    const cv = $('#sc-carte');
    if (cv.clientWidth < 50 || $('#sc-carte-reel').hidden) return;
    if (!etat.reel) { vide(cv); return; }
    // hauteur du canevas : proportions du cadre (CSS : aspect-ratio borné en hauteur) ; le ResizeObserver redessine
    const c = etat.reel.cadre, kc = Math.max(0.15, Math.cos((((c.lat[0] + c.lat[1]) / 2) * Math.PI) / 180));
    const rapport = Math.min(2.6, Math.max(0.8, ((c.lon[1] - c.lon[0]) * kc) / (c.lat[1] - c.lat[0]))).toFixed(2);
    if (cv.style.getPropertyValue('--rapport') !== rapport) cv.style.setProperty('--rapport', rapport);
    const p = projectionCarte(cv), { ctx, W, H } = preparer(cv), { X, Y, vue } = p, o = c.lon[0];
    ctx.fillStyle = COUL.soft; ctx.fillRect(0, 0, W, H);
    // graticule
    const pas = pasGraticule(p.k, p.kx);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let v = Math.ceil(vue.lon[0] / pas) * pas; v <= vue.lon[1]; v += pas) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let v = Math.ceil(vue.lat[0] / pas) * pas; v <= vue.lat[1]; v += pas) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // côtes et frontières : le fond méditerranéen si la vue y tient, sinon celui du monde, recopié à ±360° au besoin
    const med = vue.lon[0] >= DOMAINE_MED.lon[0] && vue.lon[1] <= DOMAINE_MED.lon[1] && vue.lat[0] >= DOMAINE_MED.lat[0] && vue.lat[1] <= DOMAINE_MED.lat[1];
    const f = fond(med ? 'mediterranee' : 'monde');
    if (f) {
      for (const [cle, larg, coul, tirets] of [['frontieres', 0.8, COUL['grid-strong'], [3, 3]], ['cotes', 1.1, COUL.muted, []]]) {
        ctx.strokeStyle = coul; ctx.lineWidth = larg; ctx.setLineDash(tirets); ctx.beginPath();
        for (const dx of [-360, 0, 360]) {
          if (vue.lon[0] > 180 + dx || vue.lon[1] < -180 + dx) continue;
          for (const [l, b] of f[cle]) {
            if (b[1] + dx < vue.lon[0] || b[0] + dx > vue.lon[1] || b[3] < vue.lat[0] || b[2] > vue.lat[1]) continue;
            for (let i = 0; i < l.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(l[i] + dx), Y(l[i + 1]));
          }
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // épicentres : hors analyse, puis répliques retirées, puis séismes retenus ; les plus forts par-dessus, d'autant plus
    // transparents que le catalogue est dense
    const r = e => Math.min(18, 1.5 + 2 * Math.max(0, e.M - D().mBas)), ordre = etat.reel.ordre;
    const opacite = Math.min(0.7, Math.max(0.18, 0.7 * Math.sqrt(1000 / Math.max(1, etat.cat.length))));
    for (const passe of ['hors', 'retiree', 'retenu']) {
      ctx.fillStyle = passe === 'retenu' ? COUL.ink : passe === 'retiree' ? COUL.amp : COUL.muted;
      ctx.globalAlpha = passe === 'hors' ? opacite / 2 : opacite;
      for (const i of ordre) {
        const e = etat.cat[i], garde = !etat.declus || etat.garde[i], cl = !garde ? 'retiree' : dans(e, i) ? 'retenu' : 'hors';
        if (cl !== passe) continue;
        ctx.beginPath(); ctx.arc(X(Cat.lonDans(e.lon, o)), Y(e.lat), r(e), 0, 2 * Math.PI); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    dessinerMecs(ctx, p, o);
    dessinerZones(ctx, p, o);
    // étiquettes du graticule, par-dessus
    ctx.font = `10px ${MONO}`;
    for (let v = Math.ceil(vue.lon[0] / pas) * pas; v <= vue.lon[1]; v += pas) if (X(v) > 20 && X(v) < W - 20) texte(ctx, etiquette(v, pas, 'E', 'O'), X(v), H - 4, COUL.muted, `10px ${MONO}`, 'center', 'bottom');
    for (let v = Math.ceil(vue.lat[0] / pas) * pas; v <= vue.lat[1]; v += pas) if (Math.abs(v) < 89.9 && Y(v) > 14 && Y(v) < H - 18) texte(ctx, etiquette(v, pas, 'N', 'S'), 4, Y(v) - 1, COUL.muted, `10px ${MONO}`, 'left', 'bottom');
    // échelle des magnitudes
    const d = D(), pasM = Math.max(1, Math.round((d.mHaut - d.mBas) / 3)), mags = [1, 2, 3].map(k => d.mBas + k * pasM).filter(M => M <= d.mHaut);
    let x = W - 10;
    ctx.font = `700 10.5px ${MONO}`;
    const cases = mags.map(M => ({ M, rr: r({ M }), lib: 'M' + M })).reverse();
    for (const c of cases) { c.l = ctx.measureText(c.lib).width; x -= c.l + 2 * c.rr + 14; }
    ctx.fillStyle = COUL.paper; ctx.globalAlpha = 0.85; ctx.fillRect(x - 6, 6, W - x, 2 * Math.max(...cases.map(c => c.rr)) + 12); ctx.globalAlpha = 1;
    const yc = 12 + Math.max(...cases.map(c => c.rr));
    for (const c of cases.reverse()) {
      ctx.fillStyle = COUL.ink; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x + c.rr, yc, c.rr, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = COUL.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(c.lib, x + 2 * c.rr + 4, yc);
      x += c.l + 2 * c.rr + 14;
    }
    etat.reel.projection = p;
  }

  // Zones tracées (surface, contour, nom), tracé en cours (sommets, le premier à toucher pour fermer), site du calcul d'aléa.
  const COULEURS_ZONES = ['blue', 'pick-p', 'teal', 'amp', 'cyan', 'pick-s'];
  const couleurZone = i => COUL[COULEURS_ZONES[i % COULEURS_ZONES.length]];
  function dessinerZones(ctx, p, o) {
    const P = ([lon, lat]) => [p.X(Cat.lonDans(lon, o)), p.Y(lat)];
    etat.zones.forEach((z, i) => {
      const pts = z.polygone.map(P), c = couleurZone(i);
      ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.globalAlpha = 0.12; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      texte(ctx, z.nom, cx, cy, c, `800 12px ${POLICE}`, 'center');
    });
    const t = etat.trace;
    if (t && t.length) {
      const pts = t.map(P);
      ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.beginPath();
      pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
      pts.forEach(([x, y], j) => { ctx.fillStyle = j === 0 && t.length >= 3 ? COUL['pick-p'] : COUL.ink; ctx.beginPath(); ctx.arc(x, y, j === 0 && t.length >= 3 ? 7 : 4, 0, 2 * Math.PI); ctx.fill(); });
    }
    const s = siteCalcul();
    if (s) {
      const [x, y] = P([s.lon, s.lat]);
      ctx.fillStyle = COUL['pick-p']; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x - 8, y + 6); ctx.closePath(); ctx.stroke(); ctx.fill();
      texte(ctx, etat.site ? 'Site' : 'Site (centre des zones)', x + 11, y + 1, COUL['pick-p'], `800 11.5px ${POLICE}`);
    }
  }
  // Sphères focales (hémisphère inférieur, quadrants en compression de la couleur du mécanisme), taille selon la magnitude,
  // dessinées une fois dans de petits canevas mis en cache.
  const COULEUR_TYPE = { normale: 'blue', inverse: 'pick-p', decrochement: 'teal' };
  const rayonMec = m => Math.round(Math.max(5, Math.min(14, 5 + 2.5 * ((m.mag || 4) - 4))));
  const cacheMecs = new Map();
  function imageMec(m) {
    const r = rayonMec(m), coul = COUL[COULEUR_TYPE[Mecanismes.REGIMES[m.regime].type] || 'muted'], cle = `${m.cle}|${r}|${coul}|${COUL.paper}`;
    if (cacheMecs.has(cle)) return cacheMecs.get(cle);
    const dpr = window.devicePixelRatio || 1, n = Math.ceil((2 * r + 2) * dpr), cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    const ctx = cv.getContext('2d'), M = Mecanisme.tenseur(m.azimut, m.pendage, m.glissement), R = r * dpr, c = n / 2;
    ctx.fillStyle = COUL.paper; ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = coul;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Mecanisme.projectionInverse(x / R, -y / R);
      if (d && Mecanisme.rayonnementP(M, d.i, d.phi) > 0) ctx.fillRect(c + x - 0.5, c + y - 0.5, 1, 1);
    }
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = Math.max(1, dpr); ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.stroke();
    cacheMecs.set(cle, cv);
    return cv;
  }
  function dessinerMecs(ctx, p, o) {
    if (!etat.mecs || !etat.afficherMecs) return;
    const v = p.vue;
    for (const m of etat.mecs.liste) {
      const lon = Cat.lonDans(m.lon, o);
      if (lon < v.lon[0] || lon > v.lon[1] || m.lat < v.lat[0] || m.lat > v.lat[1]) continue;
      const im = imageMec(m), r = rayonMec(m) + 1;
      ctx.drawImage(im, p.X(lon) - r, p.Y(m.lat) - r, 2 * r, 2 * r);
    }
  }
  // Mécanismes lus (fichier ou colonnes du catalogue) : régime de chacun, carte et zones redessinées.
  // origine : « fichier » (chargé par l'étudiant, garde la main), « catalogue » (colonnes du catalogue) ou « gcmt » (extrait livré).
  function installerMecs(r, nom, origine) {
    etat.mecs = { nom, origine, format: r.format, rejetees: r.rejetees, liste: r.mecanismes.map((m, i) => ({ ...m, regime: Mecanismes.regime(m), cle: `${i}|${m.azimut}|${m.pendage}|${m.glissement}` })) };
    cacheMecs.clear();
    majInfoMecs(); majZones(); dessinerCarte();
  }
  // Extrait méditerranéen du Global CMT livré avec le site (data/mecanismes-mediterranee.json, tools/gcmt/extrait.mjs) : lu
  // une fois, à la demande ; ses mécanismes de la région et de la période du catalogue s'affichent sans fichier à charger
  // quand l'étendue du catalogue tient dans le domaine de l'extrait, tant que l'étudiant n'a pas chargé les siens.
  let extraitGcmt = null, jetonGcmt = 0;
  const lireExtraitGcmt = () => extraitGcmt || (extraitGcmt = fetch('data/mecanismes-mediterranee.json')
    .then(r => { if (!r.ok) throw new Error(`extrait du Global CMT illisible (${r.status})`); return r.text(); })
    .then(t => Mecanismes.lire(t)));
  async function mecsGcmt() {
    const jeton = ++jetonGcmt, r = etat.reel, s = r && r.resume;
    const ok = r && Mecanismes.couvre({ lon: s.lon, lat: s.lat });
    if (!ok) { if (etat.mecs && etat.mecs.origine === 'gcmt') { etat.mecs = null; cacheMecs.clear(); majZones(); dessinerCarte(); } majInfoMecs(); return; }
    let ex;
    try { ex = await lireExtraitGcmt(); } catch (err) { extraitGcmt = null; if (jeton === jetonGcmt) majInfoMecs(); return; }
    if (jeton !== jetonGcmt || etat.reel !== r || (etat.mecs && etat.mecs.origine !== 'gcmt')) return;
    const liste = Mecanismes.selectionner(ex.mecanismes, { cadre: r.cadre, debut: s.debut, fin: s.fin + 1000 });
    installerMecs({ format: ex.format, rejetees: 0, mecanismes: liste }, 'Global CMT, extrait méditerranéen', 'gcmt');
  }
  // Case « Afficher les mécanismes » : grisée tant qu'aucun mécanisme n'est lu (extrait du Global CMT hors de son domaine), suivie de
  // leur nombre ; bilan des mécanismes lus et de ceux qui tombent dans la région du catalogue.
  let AIDE_MECS = '';
  function majInfoMecs() {
    const m = etat.mecs, cas = $('#sc-mec-afficher');
    cas.disabled = !m; $('#sc-mec-compte').textContent = m ? `(${milliers(m.liste.length)})` : '(aucun chargé)';
    if (!m) { $('#sc-mec-info').textContent = AIDE_MECS; return; }
    const credit = m.origine === 'gcmt' ? ` <small>Global CMT Project (Dziewonski et al. 1981 ; Ekström et al. 2012), séismes de la région et de la période du catalogue ;
      « Charger des mécanismes au foyer » les remplace par les vôtres.</small>` : '';
    if (!m.liste.length) { $('#sc-mec-info').innerHTML = `<b>${echapper(m.nom)}</b> : aucun mécanisme au foyer dans la région et la période du catalogue.${credit}`; return; }
    const b = Mecanismes.bilan(m.liste), t = b.parType, pl = n => (n > 1 ? 's' : ''), c = etat.reel && etat.reel.cadre;
    const dans = c ? m.liste.filter(q => { const lon = Cat.lonDans(q.lon, c.lon[0]); return lon <= c.lon[1] && q.lat >= c.lat[0] && q.lat <= c.lat[1]; }).length : null;
    const region = dans === null || dans === b.n ? ''
      : dans === 0 ? ' <b>Aucun n\'est dans la région du catalogue</b> : le fichier couvre-t-il la même région ?'
        : ` ${milliers(dans)} dans la région du catalogue.`;
    $('#sc-mec-info').innerHTML = `<b>${echapper(m.nom)}</b> : ${milliers(b.n)} mécanisme${pl(b.n)} au foyer (${t.normale} normale${pl(t.normale)}, ${t.inverse} inverse${pl(t.inverse)}, ${t.decrochement} décrochement${pl(t.decrochement)}${t.indetermine ? `, ${t.indetermine} indéterminé${pl(t.indetermine)}` : ''}, régimes de Zoback 1992)${m.rejetees ? ` ; ${milliers(m.rejetees)} séisme${pl(m.rejetees)} sans mécanisme lisible` : ''}.${region}`
      + (etat.afficherMecs ? ' Touchez une sphère focale pour lire ses plans nodaux.' : ' Cochez « Afficher les mécanismes » pour les voir sur la carte.') + credit;
  }
  async function chargerMecs(fichier) {
    try {
      if (fichier.size > 50 * 1024 * 1024) throw new Error('fichier trop gros (50 Mo au plus)');
      installerMecs(Mecanismes.lire(new Uint8Array(await fichier.arrayBuffer())), `« ${fichier.name} »`, 'fichier');
    } catch (err) { $('#sc-mec-info').textContent = `Fichier refusé : ${err.message || err}.`; }
  }
  // Mécanisme dont la sphère est sous le point (x, y) du canevas, ou null.
  function mecProche(x, y) {
    const p = etat.reel && etat.reel.projection;
    if (!p || !etat.mecs || !etat.afficherMecs) return null;
    const o = etat.reel.cadre.lon[0];
    let best = null, dmin = Infinity;
    for (const m of etat.mecs.liste) { const d = Math.hypot(p.X(Cat.lonDans(m.lon, o)) - x, p.Y(m.lat) - y); if (d <= rayonMec(m) + 3 && d < dmin) { dmin = d; best = m; } }
    return best;
  }
  function infoMec(m) {
    const aux = Mecanisme.planAuxiliaire(m.azimut, m.pendage, m.glissement), reg = Mecanismes.REGIMES[m.regime];
    $('#sc-carte-info').innerHTML = `<b>${new Date(m.t).toISOString().slice(0, 16).replace('T', ' ')} UTC</b> · ${echapper(m.typeMag || 'M')} ${virg(m.mag, 1)} · h ${m.h === null ? '—' : virg(m.h, 0) + ' km'}`
      + ` · plans ${Math.round(m.azimut)}/${Math.round(m.pendage)}/${Math.round(m.glissement)} et ${Math.round(aux.azimut)}/${Math.round(aux.pendage)}/${Math.round(aux.glissement)} (azimut/pendage/glissement) · ${reg.nom}`;
  }
  // Site du calcul d'aléa : placé par l'étudiant, sinon au centre des zones.
  const siteCalcul = () => etat.site || (etat.zones.length ? { ...Zones.centre(etat.zones), vs30: 800 } : null);

  // ── Zoom et déplacement de la carte (pincer, molette, double clic, glisser) ; toucher : sommet de zone, site ou séisme ──
  function bornerVue() {
    const r = etat.reel, c = r.cadre, v = r.vue;
    v.z = Math.max(1, Math.min(200, v.z));
    v.clon = Math.max(c.lon[0], Math.min(c.lon[1], v.clon)); v.clat = Math.max(c.lat[0], Math.min(c.lat[1], v.clat));
  }
  function zoomerCarte(f, x, y) {
    const p = etat.reel && etat.reel.projection;
    if (!p) return;
    const v = etat.reel.vue, cv = $('#sc-carte'), lon = p.lon(x ?? cv.clientWidth / 2), lat = p.lat(y ?? cv.clientHeight / 2), z = Math.max(1, Math.min(200, v.z * f)), k = v.z / z;
    v.clon = lon + (v.clon - lon) * k; v.clat = lat + (v.clat - lat) * k; v.z = z;
    bornerVue(); dessinerCarte();
  }
  function deplacerCarte(dx, dy) {
    const p = etat.reel && etat.reel.projection;
    if (!p) return;
    etat.reel.vue.clon -= dx / (p.kx * p.k); etat.reel.vue.clat += dy / p.k;
    bornerVue(); dessinerCarte();
  }
  function gestes(cv, h) {
    const pts = new Map();
    let glisse = null, pince = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      pts.set(e.pointerId, pos(e));
      if (pts.size === 1) glisse = { p: pos(e), bouge: false };
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; pince = Math.hypot(a[0] - b[0], a[1] - b[1]); glisse = null; }
    });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e), avant = pts.get(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pince) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d > 0) h.zoomer(d / pince, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pince = d;
        return;
      }
      if (!glisse) return;
      if (!glisse.bouge && Math.hypot(p[0] - glisse.p[0], p[1] - glisse.p[1]) > 6) { glisse.bouge = true; cv.classList.add('glisse'); }
      if (glisse.bouge) h.glisser(p[0] - avant[0], p[1] - avant[1]);
    });
    const fin = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (e.type === 'pointerup' && glisse && !glisse.bouge && !pts.size) h.toucher(...pos(e));
      if (pts.size < 2) pince = null;
      if (!pts.size) { glisse = null; cv.classList.remove('glisse'); }
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); h.zoomer(e.deltaY < 0 ? 1.25 : 0.8, x, y); }, { passive: false });
    // double clic : agrandir, sauf pendant un tracé (les deux clics posent des sommets)
    cv.addEventListener('dblclick', e => { if (etat.outil) return; const [x, y] = pos(e); h.zoomer(2, x, y); });
  }
  // Séisme le plus proche d'un point du canevas (rayon en pixels).
  function seismeProche(x, y, rayon = 14) {
    const p = etat.reel && etat.reel.projection;
    if (!p) return -1;
    let best = -1, dmin = rayon * rayon;
    const o = etat.reel.cadre.lon[0];
    etat.cat.forEach((ev, i) => { const dx = p.X(Cat.lonDans(ev.lon, o)) - x, dy = p.Y(ev.lat) - y, d2 = dx * dx + dy * dy; if (d2 < dmin || (d2 === dmin && best >= 0 && ev.M > etat.cat[best].M)) { dmin = d2; best = i; } });
    return best;
  }
  function infoSeisme(best) {
    const ev = etat.cat[best];
    $('#sc-carte-info').innerHTML = ev
      ? `<b>${new Date(ev.ms).toISOString().slice(0, 16).replace('T', ' ')} UTC</b> · ${echapper(ev.typeMag || 'M')} ${virg(ev.mag, 1)} · h ${ev.h === null ? '—' : virg(ev.h, 0) + ' km'} · ${latLon(ev.lat, 'N', 'S')}, ${latLon(ev.lon, 'E', 'O')}`
        + ` · ${etat.declus && !etat.garde[best] ? 'réplique ou précurseur retiré' : dans(ev, best) ? 'retenu' : 'hors analyse'}`
      : 'Survolez (ou touchez) un épicentre pour lire sa date, sa magnitude et sa profondeur.';
  }
  function toucherCarte(x, y) {
    const p = etat.reel && etat.reel.projection;
    if (!p) return;
    const lon = ((((p.lon(x) + 180) % 360) + 360) % 360) - 180, lat = Math.max(-89.9, Math.min(89.9, p.lat(y)));
    if (etat.outil === 'zone') {
      const t = etat.trace || (etat.trace = []), o = etat.reel.cadre.lon[0];
      // toucher le premier sommet ferme la zone
      if (t.length >= 3 && Math.hypot(p.X(Cat.lonDans(t[0][0], o)) - x, p.Y(t[0][1]) - y) < 12) { fermerZone(); return; }
      t.push([lon, lat]); majZones(); dessinerCarte(); return;
    }
    if (etat.outil === 'site') { etat.site = { lat, lon, vs30: 800 }; etat.outil = null; majZones(); dessinerCarte(); return; }
    const m = mecProche(x, y);
    if (m) infoMec(m); else infoSeisme(seismeProche(x, y, 22));
  }

  // ── Zones sismogènes : tracé, statistiques (Zones.statistiques), modèle passé au banc « aléa » ────────────
  const RAKES = [[0, 'décrochement'], [-90, 'normale'], [90, 'inverse']];
  function fermerZone() {
    if (!etat.trace || etat.trace.length < 3) return;
    etat.numero += 1;
    etat.zones.push({ id: `z${etat.numero}`, nom: `Zone ${etat.numero}`, polygone: etat.trace, rake: 0, mmax: null });
    etat.trace = null; etat.outil = null;
    majZones(); dessinerCarte();
  }
  // Statistiques de chaque zone sur les réglages de l'analyse (méthode d'Aki : période et Mc), b régional = celui de tous
  // les séismes retenus.
  function statsZones() {
    if (!etat.cat.length) return etat.zones.map(() => null);
    const evts = independants(), d = D(), reg = Sc.valeurB(retenus().map(e => e.M), etat.Mc);
    return etat.zones.map(z => Zones.statistiques(evts, z.polygone, { debut: etat.debutAnalyse, fin: d.fin, mc: etat.Mc, bRegional: reg }));
  }
  // Modèle « sismo-zones » des zones tracées.
  function modeleZones() {
    const st = statsZones(), d = D(), reg = Sc.valeurB(retenus().map(e => e.M), etat.Mc), r = etat.reel;
    return {
      format: Zones.FORMAT, version: Zones.VERSION,
      source: { catalogue: `${r ? r.nom : ''}${r && r.famille !== 'tous' ? ` (${r.famille})` : ''}`, debut: etat.debutAnalyse, fin: d.fin, mc: etat.Mc, b: reg ? reg.b : null, sigmaB: reg ? reg.sigma : null },
      site: siteCalcul(),
      zones: etat.zones.map((z, i) => {
        const s = st[i] || {};
        return { id: z.id, nom: z.nom, polygone: z.polygone, mc: etat.Mc, mmax: z.mmax ?? Zones.mmaxPropose(s.mmaxObs, etat.Mc), mmaxObs: s.mmaxObs, b: s.b, sigmaB: s.sigmaB, bPropre: s.bPropre, lam: s.lam, n: s.n, rake: z.rake, profondeur: s.profondeur };
      }),
    };
  }
  function majZones() {
    const sect = $('#sc-zones');
    if (!sect || !reel()) return;
    const t = etat.trace;
    $('#sc-zone-tracer').setAttribute('aria-pressed', String(etat.outil === 'zone'));
    $('#sc-site-placer').setAttribute('aria-pressed', String(etat.outil === 'site'));
    $('#sc-zone-fermer').disabled = !(t && t.length >= 3);
    $('#sc-zone-annuler').disabled = !(t && t.length);
    $('#sc-carte').classList.toggle('trace', !!etat.outil);
    $('#sc-zones-aide').textContent = etat.outil === 'zone'
      ? `Touchez la carte pour poser les sommets (${t ? t.length : 0} posé${t && t.length > 1 ? 's' : ''}) ; touchez le premier sommet ou « Fermer la zone » pour la fermer. Glisser déplace toujours la carte.`
      : etat.outil === 'site' ? 'Touchez la carte à l\'endroit du site.'
        : etat.zones.length ? `Statistiques des zones par la méthode d'Aki sur les réglages de l'analyse (depuis ${annee(etat.debutAnalyse)}, Mc = ${virg(etat.Mc, 1)}, ${etat.declus ? 'déclusteré' : 'sans déclusterage'}) ; b propre à la zone à partir de 30 séismes, sinon b régional (rég.). Mmax proposée : Mmax observée + 0,5.`
          : 'Aucune zone : « Tracer une zone », puis touchez la carte pour en poser les sommets.';
    const st = statsZones(), bil = etat.zones.map(z => (etat.mecs ? Mecanismes.bilan(etat.mecs.liste.filter(m => Zones.contient(z.polygone, m.lon, m.lat))) : null));
    // mécanisme proposé par les mécanismes au foyer de la zone, tant que l'étudiant ne l'a pas choisi
    etat.zones.forEach((z, i) => { if (!z.rakeChoisi && bil[i] && bil[i].dominant) z.rake = bil[i].rake; });
    const abr = { normale: 'norm.', inverse: 'inv.', decrochement: 'déc.' };
    $('#sc-legende-mec').hidden = !(etat.mecs && etat.afficherMecs);
    $('#sc-zones-table').innerHTML = etat.zones.length ? `<thead><tr><th>Zone</th><th>Mécanisme</th>${etat.mecs ? '<th>Mécanismes au foyer</th>' : ''}<th>N ≥ Mc</th><th>b</th><th>λ(≥ Mc) /an</th><th>Mmax obs.</th><th>Mmax</th><th>h (km)</th><th></th></tr></thead><tbody>${etat.zones.map((z, i) => {
      const s = st[i], mm = z.mmax ?? (s ? Zones.mmaxPropose(s.mmaxObs, etat.Mc) : null);
      return `<tr><td><span class="pastille" style="background:${couleurZone(i)}"></span><input type="text" data-sc-zone-nom="${i}" value="${echapper(z.nom)}" aria-label="Nom de la zone"></td>
        <td><select data-sc-zone-rake="${i}" aria-label="Mécanisme de la zone">${RAKES.map(([v, t]) => `<option value="${v}"${v === z.rake ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
        ${etat.mecs ? `<td>${bil[i].n ? `${bil[i].n} : ${['inverse', 'normale', 'decrochement'].filter(t => bil[i].parType[t]).map(t => `${bil[i].parType[t]} ${abr[t]}`).join(', ')}${bil[i].parType.indetermine ? `, ${bil[i].parType.indetermine} ind.` : ''}${!z.rakeChoisi && bil[i].dominant ? ' <small>(proposé)</small>' : ''}` : '—'}</td>` : ''}
        <td class="n">${s ? milliers(s.n) : '—'}</td><td class="n">${s && s.b ? `${virg(s.b, 2)} ± ${virg(s.sigmaB, 2)}${s.bPropre ? '' : ' <small>rég.</small>'}` : '—'}</td>
        <td class="n">${s ? virg(s.lam, s.lam < 1 ? 3 : 2) : '—'}</td><td class="n">${s && s.mmaxObs !== null ? virg(s.mmaxObs, 1) : '—'}</td>
        <td><input type="number" data-sc-zone-mmax="${i}" min="4.5" max="9.5" step="0.1" value="${mm !== null ? mm.toFixed(1) : ''}" aria-label="Mmax retenue"></td>
        <td class="n">${s ? virg(s.profondeur, 0) : '—'}</td><td><button type="button" class="outil neutre" data-sc-zone-suppr="${i}" aria-label="Supprimer la zone">×</button></td></tr>`;
    }).join('')}</tbody>` : '';
    $$('[data-sc-zone-nom]').forEach(x => x.addEventListener('change', () => { etat.zones[+x.dataset.scZoneNom].nom = x.value.trim() || `Zone ${+x.dataset.scZoneNom + 1}`; dessinerCarte(); }));
    $$('[data-sc-zone-rake]').forEach(x => x.addEventListener('change', () => { const z = etat.zones[+x.dataset.scZoneRake]; z.rake = +x.value; z.rakeChoisi = true; majZones(); }));
    $$('[data-sc-zone-mmax]').forEach(x => x.addEventListener('change', () => { const v = parseFloat(String(x.value).replace(',', '.')); etat.zones[+x.dataset.scZoneMmax].mmax = Number.isFinite(v) ? v : null; majZones(); }));
    $$('[data-sc-zone-suppr]').forEach(x => x.addEventListener('click', () => { etat.zones.splice(+x.dataset.scZoneSuppr, 1); majZones(); dessinerCarte(); }));
    const s = siteCalcul();
    $('#sc-zones-alea').disabled = !etat.zones.length || !etat.cat.length;
    $('#sc-zones-enregistrer').disabled = !etat.zones.length || !etat.cat.length;
    if (!$('#sc-zones-info').dataset.message) $('#sc-zones-info').textContent = s ? `Site du calcul d'aléa : ${latLon(s.lat, 'N', 'S')}, ${latLon(s.lon, 'E', 'O')}${etat.site ? '' : ' (centre des zones ; « Placer le site » pour le choisir)'}.` : '';
  }
  function message(texte) { const p = $('#sc-zones-info'); p.textContent = texte; p.dataset.message = '1'; setTimeout(() => { delete p.dataset.message; }, 8000); }
  // Modèle publié pour le banc « aléa », qui s'ouvre (événement alea:zones, src/zones-reel.js).
  function versAlea() {
    try { ZonesReel.publier(modeleZones()); } catch (err) { message(`Zones refusées : ${err.message || err}.`); return; }
    window.dispatchEvent(new CustomEvent('alea:zones'));
    const b = document.querySelector('[data-onglet="alea"]');
    if (b) { b.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function enregistrerZones() {
    let texte;
    try { texte = Zones.ecrire(Zones.lire(modeleZones())); } catch (err) { message(`Zones refusées : ${err.message || err}.`); return; }
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
    a.href = url; a.download = `zones-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message('Fichier de zones enregistré : rechargez-le ici avec un autre catalogue, ou dans le banc « aléa ».');
  }
  async function chargerZones(fichier) {
    try {
      const m = Zones.lire(await fichier.text());
      etat.zones = m.zones.map(z => ({ id: z.id, nom: z.nom, polygone: z.polygone, rake: z.rake, rakeChoisi: true, mmax: z.mmax }));
      etat.numero = Math.max(etat.numero, etat.zones.length); etat.site = m.site; etat.trace = null; etat.outil = null;
      message(`${m.zones.length} zone${m.zones.length > 1 ? 's' : ''} chargée${m.zones.length > 1 ? 's' : ''} : statistiques recalculées sur le catalogue chargé.`);
      majZones(); dessinerCarte();
    } catch (err) { message(`Fichier refusé : ${err.message || err}.`); }
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const an = analyse(), r = an.r;
    $('#sc-afficheurs').innerHTML = [
      afficheur('Séismes retenus', milliers(an.nRet), an.methode === 'aki' ? `${virg(an.annees, reel() && an.annees < 15 ? 1 : 0)} ans, M ≥ ${virg(etat.Mc, 1)}` : `${tableTriee().length} période${tableTriee().length > 1 ? 's' : ''} de complétude`),
      afficheur('Valeur b', r ? virg(r.b, 2) : '—', r ? `± ${virg(r.sigma, 2)} (${an.methode === 'aki' ? 'Aki, Shi et Bolt' : 'Weichert'})` : 'trop peu de séismes'),
      afficheur('λ(M ≥ 5)', r ? virg(r.taux(5), 3) + ' /an' : '—', r ? (r.taux(5) >= 1 ? `${virg(r.taux(5), 1)} par an` : `un tous les ${virg(1 / r.taux(5), 0)} ans`) : ''),
      afficheur('Période de retour M ≥ 6', r ? virg(1 / r.taux(6), 1 / r.taux(6) < 2 ? 1 : 0) + ' ans' : '—', r ? `λ = ${virg(r.taux(6), 4)} /an` : ''),
    ].join('');
    const lam = r ? r.taux(etat.m) : null;
    $('#sc-poisson').innerHTML = [
      afficheur(`λ(M ≥ ${virg(etat.m, 1)})`, lam ? virg(lam, 4) + ' /an' : '—', 'loi ajustée'),
      afficheur('Période de retour', lam ? milliers(1 / lam) + ' ans' : '—', 'T = 1 / λ'),
      afficheur(`P(au moins un en ${etat.duree} ans)`, lam ? virg(100 * Sc.probabilite(lam, etat.duree), 1) + ' %' : '—', 'P = 1 − e<sup>−λt</sup>'),
      afficheur('10 % en 50 ans', virg(Sc.periodeRetour(0.1, 50), 0) + ' ans', 'référence de l\'EC8 (non-effondrement)'),
    ].join('');
    $('#sc-m-v').textContent = 'M ≥ ' + virg(etat.m, 1); $('#sc-t-v').textContent = etat.duree + ' ans';
  }
  // Bornes des réglages : celles du catalogue simulé, ou tirées du catalogue réel.
  function majBornes() {
    const d = D(), borner = (el, min, max, pas) => { el.min = min; el.max = max; el.step = pas; };
    borner($('#sc-debut'), d.debutMin, d.debutMax, d.pas);
    borner($('#sc-mc'), d.mBas, d.mcMax, 0.1);
    etat.table.forEach((_, i) => { borner($(`#sc-ta-${i}`), Math.floor(d.debutMin), Math.ceil(d.fin) - 1, d.pas < 1 ? 'any' : 1); borner($(`#sc-tm-${i}`), d.mBas, 8, 0.1); });
    borner($('#sc-m'), reel() ? Math.max(-1, Math.min(4, Math.floor(d.mBas + 1))) : 4, reel() ? 8 : 7.5, 0.1);
  }
  function majControles() {
    const e = etat.explo;
    majBornes();
    $('#sc-b').value = e.b; $('#sc-b-v').textContent = virg(e.b, 2);
    $('#sc-taux').value = e.taux4; $('#sc-taux-v').textContent = virg(e.taux4, 1) + ' /an';
    $('#sc-mmax').value = e.Mmax; $('#sc-mmax-v').textContent = virg(e.Mmax, 1);
    $('#sc-rep').checked = e.repliques; $('#sc-declus').checked = etat.declus;
    $('#sc-debut').value = etat.debutAnalyse; $('#sc-debut-v').textContent = annee(etat.debutAnalyse);
    $('#sc-mc').value = etat.Mc; $('#sc-mc-v').textContent = virg(etat.Mc, 1);
    $$('[data-sc-methode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scMethode === etat.methode)));
    $('#sc-aki').hidden = etat.methode !== 'aki'; $('#sc-weichert').hidden = etat.methode !== 'weichert';
    etat.table.forEach(([a, mc], i) => { $(`#sc-ta-${i}`).value = Number.isFinite(a) ? a : ''; $(`#sc-tm-${i}`).value = Number.isFinite(mc) ? mc : ''; });
    $('#sc-m').value = etat.m; $('#sc-t').value = etat.duree;
  }
  function majVerite() {
    if (etat.mode !== 'explorer') return;
    const p = etat.explo, nr = etat.cat.filter(e => e.rep).length, retirees = etat.cat.filter((e, i) => e.rep && !etat.garde[i]).length;
    $('#sc-verite').innerHTML = `<b>Vérité terrain.</b> b = <b>${virg(p.b, 2)}</b>, λ(M ≥ 5) = <b>${virg(tauxVrai(5), 3)} /an</b> pour les chocs principaux. `
      + `Catalogue : ${milliers(etat.cat.length)} séismes, dont ${milliers(nr)} répliques ; le déclusterage en retire ${nr ? virg((100 * retirees) / nr, 0) : 0} %. `
      + `Complétude (tirets) : ${p.completude.map(([a, mc]) => `M${virg(mc, 1)} dès ${a}`).join(', ')}.`;
  }
  function majTitre() {
    const d = D();
    $('#sc-cat-titre').textContent = reel() ? (etat.reel ? `Catalogue ${intervalle(d.debut, d.fin)}` : 'Catalogue réel') : `Catalogue ${DEBUT} – ${FIN}`;
    $('#sc-leg-vraie').hidden = reel();
  }
  function tout() { majControles(); majTitre(); dessinerCatalogue(); dessinerFMD(); dessinerStepp(); dessinerCarte(); majAfficheurs(); majVerite(); majReel(); majZones(); }

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

  // ── Catalogue réel ──────────────────────────────────────────────────────
  // Sélection analysée (un type de magnitude ou tous), déclusterage d'HMTK, domaine des graphiques tiré des données.
  function selectionReelle() {
    const r = etat.reel, evts = r.famille === 'tous' ? r.evts : r.evts.filter(e => Cat.familleMag(e.typeMag) === r.famille);
    etat.cat = Cat.pourAnalyse(evts);
    etat.garde = Cat.decluster(evts).garde;
    r.ordre = [...etat.cat.keys()].sort((a, b) => etat.cat[a].M - etat.cat[b].M);
    let mn = Infinity, mx = -Infinity;
    for (const e of etat.cat) { mn = Math.min(mn, e.M); mx = Math.max(mx, e.M); }
    const { debut, fin } = r.periode, duree = fin - debut, pas = duree > 15 ? 1 : 0.1;
    const debutMin = Math.floor(debut / pas + 1e-9) * pas, mBas = Math.floor(mn);
    etat.dom = {
      debut, fin, mBas, mHaut: Math.max(Math.ceil(mx + 0.3), mBas + 3), pas, debutMin: arrondiPas(debutMin, pas),
      debutMax: arrondiPas(Math.max(debutMin, Math.floor((fin - Math.max(pas, 0.1 * duree)) / pas) * pas), pas), mcMax: Math.max(mBas + 1, Math.floor((mx - 0.3) * 10) / 10),
    };
    // Réglages de départ : toute la période, Mc par courbure maximale, déclusterage, table d'une ligne
    etat.debutAnalyse = etat.dom.debutMin; etat.declus = true; etat.verifie = false;
    const ev = retenus();
    etat.Mc = ev.length ? Math.min(etat.dom.mcMax, Math.max(etat.dom.mBas, Sc.mcCourbureMax(ev.map(e => e.M)))) : etat.dom.mBas;
    etat.table = [[Math.floor(debut), etat.Mc], [NaN, NaN], [NaN, NaN], [NaN, NaN]];
  }
  function activerReel() {
    if (!etat.reel) { etat.cat = []; etat.garde = []; etat.dom = DOMAINE_SIMULE; tout(); return; }
    selectionReelle();
    tout();
  }
  const latLon = (v, pos, neg) => `${virg(Math.abs(v), 1)}° ${v < 0 ? neg : pos}`;
  function majReel() {
    if (!reel()) return;
    const r = etat.reel, champ = $('#sc-champ-type'), alerte = $('#sc-melange');
    if (!r) { $('#sc-reel-resume').innerHTML = ''; champ.hidden = true; alerte.hidden = true; $('#sc-carte-legende').textContent = ''; return; }
    const s = r.resume, d = D(), duree = r.periode.fin - r.periode.debut, analyses = etat.cat.length;
    $('#sc-reel-resume').innerHTML = `<div class="afficheurs deux">${[
      afficheur('Séismes', milliers(s.n), r.famille === 'tous' ? 'tous analysés' : `${milliers(analyses)} de type ${echapper(r.famille)} analysés`),
      afficheur('Période', intervalle(r.periode.debut, r.periode.fin), `${virg(duree, duree < 15 ? 1 : 0)} ans${r.tronque ? ', tronquée' : ''}`),
      afficheur('Magnitudes', `${virg(s.mag[0], 1)} – ${virg(s.mag[1], 1)}`, `${s.types.length} type${s.types.length > 1 ? 's' : ''} : ${s.types.slice(0, 4).map(t => echapper(t.type || '?')).join(', ')}${s.types.length > 4 ? '…' : ''}`),
      afficheur('Profondeurs', s.h ? `${virg(s.h[0], 0)} – ${virg(s.h[1], 0)} km` : '—', s.sansH ? `${milliers(s.sansH)} sans profondeur` : 'toutes connues'),
    ].join('')}</div>
      <p class="aide">Région : ${latLon(s.lat[0], 'N', 'S')} à ${latLon(s.lat[1], 'N', 'S')}, ${latLon(s.lon[0], 'E', 'O')} à ${latLon(s.lon[1], 'E', 'O')}. Du ${jour(s.debut)} au ${jour(s.fin)}.
      Magnitudes ramenées aux classes de 0,1 (${virg(d.mBas, 0)} à ${virg(d.mHaut, 0)} sur les graphiques).</p>`;
    // Types de magnitude : choix d'une famille quand le catalogue en mélange plusieurs
    champ.hidden = !s.melange;
    const sel = $('#sc-type-mag'), options = [['tous', `Tous les types (mélange de ${s.familles.length})`], ...s.familles.map(f => [f.famille, `${f.famille === '?' ? 'type non précisé' : f.famille}${f.types.length > 1 || (f.types[0] && f.types[0] !== f.famille) ? ` (${f.types.map(t => t || '?').join(', ')})` : ''} : ${milliers(f.n)}`])];
    const cle = options.map(o => o[0]).join('|');
    if (sel.dataset.cle !== cle) { sel.innerHTML = options.map(([v, t]) => `<option value="${echapper(v)}">${echapper(t)}</option>`).join(''); sel.dataset.cle = cle; }
    sel.value = r.famille;
    alerte.hidden = !s.melange;
    const nomme = f => `${f.famille === '?' ? 'non précisé' : echapper(f.famille)} (${milliers(f.n)})`;
    const liste = s.familles.map(nomme).join(', '), autres = s.familles.filter(f => f.famille !== r.famille).map(nomme).join(', ');
    alerte.innerHTML = r.famille === 'tous'
      ? `<b>Types de magnitude mélangés :</b> ${liste}. Ce ne sont pas les mêmes échelles : ML et mb saturent pour les forts séismes, seule Mw
        ne sature pas, et deux échelles décalées étalent la distribution. Une valeur b calculée sur ce mélange est douteuse : choisissez un
        seul type ci-dessus, ou homogénéisez le catalogue (conversion en Mw) avant de l'analyser.`
      : `<b>Un seul type analysé :</b> ${echapper(r.famille)}, ${milliers(analyses)} séismes sur ${milliers(s.n)} ; les autres (${autres}) sont
        mis de côté, y compris pour le déclusterage. Vérifiez sur le graphique de Gutenberg-Richter que ce type couvre bien toute la gamme.`;
    $('#sc-carte-legende').textContent = `${milliers(analyses)} épicentres ; disques : magnitude ; fond : Natural Earth`;
  }
  // Chargement d'un fichier : lecture (src/sismo/catalogue.js), puis la même analyse que le catalogue simulé.
  async function chargerFichier(fichier) {
    const info = $('#sc-reel-info');
    try {
      if (fichier.size > 50 * 1024 * 1024) throw new Error('fichier trop gros (50 Mo au plus)');
      info.textContent = 'Lecture du fichier…';
      const lu = Cat.lire(new Uint8Array(await fichier.arrayBuffer()));
      installer(lu, lu.evenements, Cat.periode(lu.evenements), `« ${fichier.name} »`, false);
    } catch (err) {
      info.textContent = `Fichier refusé : ${err.message || err}.`;
    }
  }
  function installer(lu, evts, periode, nom, tronque) {
    const cadre = Cat.cadre(evts);
    etat.reel = { lu, evts, periode, nom, tronque, famille: 'tous', resume: Cat.resume(evts), cadre, vue: vueEnsemble(cadre) };
    const avecMec = evts.filter(e => e.mec);
    if (avecMec.length) installerMecs({ format: 'catalogue', mecanismes: avecMec.map(e => ({ t: e.t, lat: e.lat, lon: e.lon, h: e.h, mag: e.mag, typeMag: e.typeMag, id: e.id, ...e.mec })), rejetees: 0 }, `${nom} (colonnes du catalogue)`, 'catalogue');
    else if (etat.mecs && etat.mecs.origine === 'fichier') majInfoMecs(); // mécanismes d'un fichier : comptés de nouveau dans la région du nouveau catalogue
    else { if (etat.mecs && etat.mecs.origine === 'catalogue') { etat.mecs = null; cacheMecs.clear(); } mecsGcmt(); }
    const ec = Object.entries(lu.ecartes || {}), rej = lu.rejets && lu.rejets.length ? ` (ligne ${lu.rejets[0].ligne} : ${lu.rejets[0].raison}${lu.rejetees > 1 ? '…' : ''})` : '';
    const col = Object.values(lu.colonnes || {});
    $('#sc-reel-info').innerHTML = `<b>${echapper(nom)}</b> : ${echapper(lu.nom)}, ${milliers(evts.length)} séismes lus`
      + `${lu.rejetees ? ` ; ${milliers(lu.rejetees)} ligne${lu.rejetees > 1 ? 's' : ''} rejetée${lu.rejetees > 1 ? 's' : ''}${echapper(rej)}` : ' ; aucune ligne rejetée'}`
      + `${ec.length ? ` ; écartés (non-séismes) : ${ec.map(([t, n]) => `${echapper(t)} ${n}`).join(', ')}` : ''}${lu.doublons ? ` ; ${lu.doublons} doublon${lu.doublons > 1 ? 's' : ''}` : ''}.`
      + `${col.length ? `<br><small>Colonnes lues : ${col.map(echapper).join(', ')}.</small>` : ''}`;
    if (reel()) activerReel();
  }

  // ── Téléchargement par le relais FDSN du site (functions/api/fdsn.js) ────
  function formulaire() {
    const v = id => parseFloat(String($(id).value).replace(',', '.')), an0 = Math.round(v('#sc-dl-an0')), an1 = Math.round(v('#sc-dl-an1'));
    return {
      centre: $('#sc-dl-centre').value, lat0: v('#sc-dl-lat0'), lat1: v('#sc-dl-lat1'), lon0: v('#sc-dl-lon0'), lon1: v('#sc-dl-lon1'), an0, an1,
      debut: Number.isFinite(an0) ? Cat.utc(an0) : NaN, fin: Number.isFinite(an1) ? Math.min(Date.now(), Cat.utc(an1 + 1)) : NaN, mmin: v('#sc-dl-mmin'),
    };
  }
  async function telecharger() {
    if (etat.telechargement) return;
    const q = formulaire(), info = $('#sc-dl-info'), bouton = $('#sc-telecharger'), r0 = Cat.requete(q);
    if (r0.erreur) { info.textContent = `Requête refusée : ${r0.erreur}.`; return; }
    etat.telechargement = true; bouton.disabled = true;
    const nom = Centres.CENTRES[q.centre].nom, evts = [], vus = new Set(), lu = { nom: Cat.FORMATS.fdsn, colonnes: {}, lignes: 0, rejetees: 0, rejets: [], ecartes: {}, doublons: 0 };
    let params = r0.params, pages = 0;
    try {
      while (params && pages < Cat.PAGES_MAX) {
        pages++;
        info.textContent = `Téléchargement chez ${nom}… page ${pages} (${milliers(evts.length)} séismes reçus).`;
        const rep = await fetch(`api/fdsn?${new URLSearchParams({ centre: q.centre, service: 'event', ...params })}`);
        if (rep.status === 204) break;
        const corps = await rep.text();
        if (!rep.ok) throw new Error(`réponse ${rep.status}${corps && !/^\s*</.test(corps) ? ` (${corps.trim().split('\n')[0].slice(0, 140)})` : ''}`);
        let page;
        try { page = Cat.lire(corps); } catch (err) { if (/aucun séisme/.test(err.message)) break; throw err; }
        let neufs = 0;
        // les séismes de la seconde qui borne deux pages arrivent deux fois : écartés par leur identifiant
        for (const e of page.evenements) { const k = e.id || `${e.t}|${e.lat}|${e.lon}`; if (vus.has(k)) continue; vus.add(k); evts.push(e); neufs++; }
        lu.doublons += page.doublons;
        lu.lignes += page.lignes; lu.rejetees += page.rejetees; lu.rejets.push(...page.rejets.slice(0, 5 - lu.rejets.length));
        for (const [t, n] of Object.entries(page.ecartes)) lu.ecartes[t] = (lu.ecartes[t] || 0) + n;
        params = neufs ? Cat.pageSuivante(params, page) : null;
      }
      if (!evts.length) throw new Error('aucun séisme dans ce cadre, cette période et au-dessus de cette magnitude');
      evts.sort((a, b) => a.t - b.t);
      const tronque = params !== null && pages >= Cat.PAGES_MAX;
      const periode = { debut: Cat.anneeDecimale(tronque ? evts[0].t : q.debut), fin: Cat.anneeDecimale(q.fin) };
      info.textContent = `${milliers(evts.length)} séismes reçus en ${pages} page${pages > 1 ? 's' : ''}${tronque ? ` : limite de ${milliers(Cat.PAGE * Cat.PAGES_MAX)} atteinte, catalogue tronqué à partir du ${jour(evts[0].t)} (relevez la magnitude minimale ou réduisez le cadre)` : ''}.`;
      installer(lu, evts, periode, `${nom}, ${q.an0}–${q.an1}, M ≥ ${virg(q.mmin, 1)}`, tronque);
    } catch (err) {
      info.textContent = `Téléchargement impossible : ${err.message || err}. Le relais n'existe que sur le site publié ; sinon, téléchargez le catalogue sur le site du centre (format texte) et chargez le fichier.`;
    } finally {
      etat.telechargement = false; bouton.disabled = false;
    }
  }
  function preparerFormulaire() {
    $('#sc-dl-centre').innerHTML = Cat.CENTRES_EVENT.map(c => `<option value="${c.id}">${echapper(Centres.CENTRES[c.id].nom)} : ${echapper(c.couverture)}</option>`).join('');
    $('#sc-dl-zone').innerHTML = Object.entries(ZONES).map(([k, z]) => `<option value="${k}">${echapper(z[0])}</option>`).join('') + '<option value="autre">Autre cadre (ci-dessous)</option>';
    const zone = k => { const z = ZONES[k]; if (!z) return; $('#sc-dl-lat0').value = z[1][0]; $('#sc-dl-lat1').value = z[1][1]; $('#sc-dl-lon0').value = z[2][0]; $('#sc-dl-lon1').value = z[2][1]; };
    zone('tunisie');
    const an = new Date().getUTCFullYear();
    $('#sc-dl-an0').value = an - 30; $('#sc-dl-an1').value = an; $('#sc-dl-mmin').value = 3;
    $('#sc-dl-zone').addEventListener('change', e => zone(e.target.value));
    for (const id of ['#sc-dl-lat0', '#sc-dl-lat1', '#sc-dl-lon0', '#sc-dl-lon1']) $(id).addEventListener('input', () => { $('#sc-dl-zone').value = 'autre'; });
    $('#sc-telecharger').addEventListener('click', telecharger);
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
    $('#sc-debut').addEventListener('input', e => { etat.debutAnalyse = parseFloat(e.target.value); tout(); });
    $('#sc-mc').addEventListener('input', e => { etat.Mc = parseFloat(e.target.value); tout(); });
    $('#sc-mc-auto').addEventListener('click', () => { const ev = retenus(); if (ev.length) { etat.Mc = Sc.mcCourbureMax(ev.map(e => e.M)); tout(); } });
    $$('[data-sc-methode]').forEach(b => b.addEventListener('click', () => { etat.methode = b.dataset.scMethode; tout(); }));
    etat.table.forEach((_, i) => {
      $(`#sc-ta-${i}`).addEventListener('change', e => { etat.table[i][0] = parseFloat(e.target.value); tout(); });
      $(`#sc-tm-${i}`).addEventListener('change', e => { etat.table[i][1] = parseFloat(e.target.value); tout(); });
    });
    $('#sc-m').addEventListener('input', e => { etat.m = parseFloat(e.target.value); majAfficheurs(); });
    $('#sc-t').addEventListener('input', e => { etat.duree = parseInt(e.target.value, 10); majAfficheurs(); });
    $('#sc-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#sc-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#sc-mode-reel').addEventListener('click', () => changerMode('reel'));
    $('#sc-verifier').addEventListener('click', verifier);
    $('#sc-nouvel-exo').addEventListener('click', nouvelExercice);
    $('#sc-fichier').addEventListener('change', e => { if (e.target.files && e.target.files[0]) chargerFichier(e.target.files[0]); e.target.value = ''; });
    $('#sc-type-mag').addEventListener('change', e => { if (etat.reel) { etat.reel.famille = e.target.value; activerReel(); } });
    preparerFormulaire();
    // Un clic sur le catalogue fixe le début de l'analyse et Mc.
    const cv = $('#sc-catalogue');
    cv.addEventListener('click', e => {
      if (etat.methode !== 'aki' || !etat.cat.length) return;
      const g = geoCat(cv), t = g.T(e.offsetX), M = g.M(e.offsetY), d = D();
      if (t < d.debut - 1 || t > d.fin || M < d.mBas || M > d.mHaut) return;
      etat.debutAnalyse = Math.min(d.debutMax, Math.max(d.debutMin, arrondiPas(t, d.pas)));
      etat.Mc = Math.min(d.mcMax, Math.max(d.mBas, Math.round(M * 10) / 10));
      if (etat.verifie) { etat.verifie = false; $('#sc-corrige').innerHTML = ''; }
      tout();
    });
    cv.addEventListener('pointermove', e => {
      const g = geoCat(cv), t = g.T(e.offsetX), M = g.M(e.offsetY), d = D();
      $('#sc-curseur').textContent = etat.cat.length && t >= d.debut && t <= d.fin && M >= d.mBas && M <= d.mHaut ? `${annee(t)} · M ${virg(M, 1)} — cliquer pour analyser à partir d'ici` : '—';
    });
    // Survol de la carte : le séisme le plus proche du pointeur
    const carte = $('#sc-carte');
    carte.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) { const m = mecProche(e.offsetX, e.offsetY); if (m) infoMec(m); else infoSeisme(seismeProche(e.offsetX, e.offsetY)); } });
    $('#sc-mec-fichier').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) chargerMecs(f); });
    AIDE_MECS = $('#sc-mec-info').textContent.replace(/\s+/g, ' ').trim();
    $('#sc-mec-afficher').addEventListener('change', e => { etat.afficherMecs = e.target.checked; majInfoMecs(); majZones(); dessinerCarte(); });
    gestes(carte, { zoomer: zoomerCarte, glisser: deplacerCarte, toucher: toucherCarte });
    $('#sc-carte-plus').addEventListener('click', () => zoomerCarte(2));
    $('#sc-carte-moins').addEventListener('click', () => zoomerCarte(0.5));
    $('#sc-carte-tout').addEventListener('click', () => { if (etat.reel) { etat.reel.vue = vueEnsemble(etat.reel.cadre); dessinerCarte(); } });
    // zones sismogènes
    $('#sc-zone-tracer').addEventListener('click', () => {
      if (etat.outil === 'zone') { etat.outil = null; if (etat.trace && etat.trace.length >= 3) fermerZone(); else etat.trace = null; }
      else { etat.outil = 'zone'; etat.trace = []; }
      majZones(); dessinerCarte();
    });
    $('#sc-zone-fermer').addEventListener('click', fermerZone);
    $('#sc-zone-annuler').addEventListener('click', () => { if (etat.trace) etat.trace.pop(); majZones(); dessinerCarte(); });
    $('#sc-site-placer').addEventListener('click', () => { etat.outil = etat.outil === 'site' ? null : 'site'; etat.trace = null; majZones(); dessinerCarte(); });
    $('#sc-zones-alea').addEventListener('click', versAlea);
    $('#sc-zones-enregistrer').addEventListener('click', enregistrerZones);
    $('#sc-zones-fichier').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) chargerZones(f); });
    const redessiner = () => { if (!$('#banc-sismicite').hidden) { dessinerCatalogue(); dessinerFMD(); dessinerStepp(); dessinerCarte(); } };
    const ro = new ResizeObserver(redessiner);
    ro.observe(cv); ro.observe($('#sc-fmd')); ro.observe($('#sc-stepp')); ro.observe(carte);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changerMode(m) {
    if (etat.mode === m) return;
    const quitteReel = etat.mode === 'reel';
    etat.mode = m;
    for (const n of ['explorer', 'exercice', 'reel']) {
      $(`#sc-mode-${n}`).setAttribute('aria-pressed', String(m === n));
      $(`#sc-panneau-${n}`).hidden = m !== n;
    }
    $('#sc-carte-reel').hidden = m !== 'reel';
    $('#sc-zones').hidden = m !== 'reel';
    if (m !== 'reel') { etat.outil = null; etat.trace = null; }
    etat.verifie = false;
    if (m === 'reel') { activerReel(); return; }
    if (quitteReel) { etat.dom = DOMAINE_SIMULE; etat.table = TABLE_SIMULEE.map(r => [...r]); }
    if (m === 'exercice') nouvelExercice();
    else { etat.debutAnalyse = 1990; etat.Mc = 3.0; etat.declus = true; regenerer(); }
  }

  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'sismicite') return;
    if (!etat.pret) { etat.pret = true; brancher(); regenerer(); }
    else tout();
  });
})();
