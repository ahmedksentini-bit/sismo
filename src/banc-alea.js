import Sismo from './sismo/signal.js';
import Spectre from './sismo/spectre.js';
import Psha from './sismo/psha.js';
import Isolignes from './sismo/isolignes.js';
import Zones from './sismo/zones.js';
import Failles from './sismo/failles.js';
import Gnss from './sismo/gnss.js';
import ZonesReel from './zones-reel.js';

// src/banc-alea.js — banc « aléa » : calcul probabiliste de l'aléa sismique (PSHA) sur un modèle d'école,
// avec son arbre logique ; courbe d'aléa, spectre à probabilité uniforme face à l'EC8, désagrégation et
// sensibilité aux branches. Tout le calcul est dans src/sismo/psha.js (vérifié contre OpenQuake).
// Mode « Zones du catalogue » : les zones sismogènes tracées sur un catalogue réel au banc « sismicité » (état partagé
// src/zones-reel.js, événement alea:zones) ou lues dans un fichier « sismo-zones », projetées en km autour de leur centre
// (Zones.modelePsha) ; site en latitude et longitude, côtes réelles ; failles actives de la base GEM (extrait méditerranéen
// data/failles-mediterranee.json ou GeoJSON chargé, src/sismo/failles.js) et moments géodésiques d'un champ de vitesses GNSS
// chargé (src/sismo/gnss.js).
(() => {
  'use strict';
  const SM = Sismo, Sp = Spectre;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const virg = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '—';
  const milliers = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const POLICE = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const puissance = n => '10' + String(n).split('').map(c => SUP[c]).join('');
  // Accélération en g : trois chiffres significatifs
  const sci = (x, d = 1) => { if (!(x > 0)) return '—'; const e = Math.floor(Math.log10(x)); return `${virg(x / Math.pow(10, e), d)}·${puissance(e)}`; };
  const g3 = x => (x >= 1 ? virg(x, 2) : x >= 0.1 ? virg(x, 3) : virg(x, 4));

  const BASE = Psha.modeleDefaut();
  const POINTS = BASE.zones.map(z => Psha.discretiser(z.polygone, BASE.pasGrille));
  const K_PGA = 0, K_SA02 = BASE.imts.indexOf(0.2), K_SA1 = BASE.imts.indexOf(1);
  const CHOIX_IMTS = ['PGA', 0.1, 0.2, 0.3, 0.5, 1, 2].map(i => BASE.imts.indexOf(i));
  const nomImt = k => (BASE.imts[k] === 'PGA' ? 'PGA' : `Sa(${String(BASE.imts[k]).replace('.', ',')} s)`);
  const periode = k => (BASE.imts[k] === 'PGA' ? 0 : BASE.imts[k]);
  const reglagesDefaut = () => ({
    site: { x: 0, y: 0, vs30: 800 },
    zones: BASE.zones.map(z => ({ lam: z.ajustement.lamPivot, b: z.ajustement.b, mmax: z.mmax })),
    incAB: true, incMmax: true, lois: Object.fromEntries(BASE.gmpe.map(g => [g.id, true])),
    geo: { actif: true, poids: 0.5, moments: BASE.taux.find(t => t.id === 'geodesie').moments.slice(), source: 'champ GNSS du modèle d\'école' },
    faille: { actif: true, glissement: BASE.failles[0].glissement },
  });
  const etat = {
    pret: false, mode: 'explorer', r: reglagesDefaut(), zone: 0, proba: [0.1, 50], k: K_PGA,
    modele: null, res: null, desag: null, sens: null, exo: null, verifie: false, dom: null, carte: null,
    // mode « Zones du catalogue » : modèle préparé (repère, points, domaine, côtes), version lue de l'état partagé,
    // réglages d'Explorer mis de côté, mode demandé avant la construction du banc
    zm: null, zonesVersion: 0, sauvegarde: null, modeDepart: 'explorer',
  };
  const enZones = () => etat.mode === 'zones';

  // ── Calcul ──────────────────────────────────────────────────────────────
  function construire(r) {
    if (enZones()) return construireZones(r);
    const zones = BASE.zones.map((z, i) => {
      const p = r.zones[i], aj = { ...z.ajustement, b: p.b, lamPivot: p.lam };
      return { ...z, points: POINTS[i], mmax: p.mmax, ajustement: aj,
        ab: r.incAB ? Psha.branchesAB(aj) : [{ a: Math.log10(p.lam) + p.b * aj.mPivot, b: p.b, poids: 1 }] };
    });
    // Lois retenues, à poids égaux
    const ids = BASE.gmpe.map(g => g.id).filter(id => r.lois[id]), gmpe = ids.map(id => ({ id, poids: 1 / ids.length }));
    const wGeo = r.geo.actif ? r.geo.poids : 0;
    const taux = [{ id: 'catalogue', nom: 'Catalogue', poids: 1 - wGeo }];
    if (wGeo > 0) taux.push({ id: 'geodesie', nom: 'Géodésie', poids: wGeo, couplage: Psha.COUPLAGE, moments: r.geo.moments });
    const failles = r.faille.actif && r.faille.glissement > 0 ? BASE.failles.map(f => ({ ...f, glissement: r.faille.glissement })) : [];
    return { ...BASE, site: { ...r.site }, zones, failles, dMmax: r.incMmax ? BASE.dMmax : [{ d: 0, poids: 1 }], gmpe, taux };
  }
  // Probabilité visée P en t années → probabilité en 50 ans (durée des courbes) et période de retour.
  const periodeRetour = () => Psha.periodeRetour(etat.proba[0], etat.proba[1]);
  const poeCible = () => 1 - Math.exp(-BASE.dureeVie / periodeRetour());
  const niveau = (courbe) => Psha.niveauPourProba(etat.res.niveaux, courbe, poeCible());
  const uhs = courbes => courbes.map(c => niveau(c));
  function calculer() {
    arreterCarte();
    etat.modele = construire(etat.r);
    etat.res = Psha.calculer(etat.modele);
    analyser();
    // le banc « accélérogrammes » reprend le modèle exploré (jamais celui, caché, d'un exercice)
    if (etat.mode !== 'exercice') window.dispatchEvent(new CustomEvent('alea:modele', { detail: { modele: etat.modele } }));
  }
  // Ce qui dépend de la grandeur et de la probabilité choisies
  function analyser() {
    if (etat.carte && (etat.carte.k !== etat.k || etat.carte.poe !== poeCible())) arreterCarte();
    const res = etat.res;
    etat.uhs = { moy: uhs(res.moyenne), q16: uhs(res.fractiles[0.16]), q84: uhs(res.fractiles[0.84]) };
    etat.desag = etat.uhs.moy[etat.k] > 0 ? Psha.desagregation(etat.modele, BASE.imts[etat.k], etat.uhs.moy[etat.k]) : null;
    etat.sens = Psha.sensibilite(res, etat.modele, etat.k, poeCible());
    // Spectre moyen conditionnel à la grandeur choisie, au niveau de l'UHS moyen
    const xk = etat.uhs.moy[etat.k];
    etat.cms = xk > 0 ? Psha.spectreConditionnel(etat.modele, BASE.imts[etat.k], xk, poeCible()) : null;
  }

  // ── Carte d'aléa : niveau moyen à la probabilité visée, site par site, sur une grille de 20 km ──
  const PAS_CARTE = 20;
  function arreterCarte() {
    etat.carte = null;
    const b = $('#al-carte-alea');
    if (b) { b.textContent = 'Carte d\'aléa'; b.disabled = enExercice(); }
  }
  function lancerCarte() {
    if (!etat.modele || (enZones() && !etat.zm)) return;
    const grille = enZones() ? etat.zm.grille : Psha.grilleCarte({ ...DOMAINE, pas: PAS_CARTE }), modele = etat.modele, k = etat.k, poe = poeCible();
    const carte = { k, poe, grille, valeurs: new Float64Array(grille.sites.length).fill(NaN), n: 0, t0: performance.now() };
    etat.carte = carte;
    $('#al-carte-alea').disabled = true;
    const tranche = () => {
      if (etat.carte !== carte) return; // modèle, grandeur ou probabilité changés
      // tranches de 6 sites (modèle d'école) ou d'environ 150 ms (zones réelles, un site y coûte bien plus)
      const fin = Math.min(grille.sites.length, carte.n + 6), t = performance.now();
      if (enZones()) do { carte.valeurs[carte.n] = Psha.niveauSite(modele, grille.sites[carte.n], BASE.imts[k], poe); carte.n++; } while (carte.n < grille.sites.length && performance.now() - t < 150);
      else for (; carte.n < fin; carte.n++) carte.valeurs[carte.n] = Psha.niveauSite(modele, grille.sites[carte.n], BASE.imts[k], poe);
      $('#al-carte-alea').textContent = carte.n < grille.sites.length ? `Carte : ${Math.round((100 * carte.n) / grille.sites.length)} %` : 'Carte d\'aléa';
      if (carte.n >= grille.sites.length) { carte.duree = performance.now() - carte.t0; $('#al-carte-alea').disabled = false; }
      dessinerCarte();
      if (carte.n < grille.sites.length) setTimeout(tranche, 0);
    };
    setTimeout(tranche, 0);
  }

  // ── Dessin ──────────────────────────────────────────────────────────────
  const COUL = {};
  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['trace', 'grid', 'grid-strong', 'pick-p', 'pick-s', 'amp', 'muted', 'ink', 'paper', 'blue', 'cyan', 'soft', 'teal', 'line', 'violet', 'rose', 'sature', 'vrai'])
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
  const COUL_ZONES = ['pick-s', 'amp'];
  // zones d'un catalogue réel : autant de couleurs que de zones (au-delà de huit, elles reviennent)
  const PALETTE_ZONES = ['pick-s', 'amp', 'teal', 'violet', 'sature', 'rose', 'cyan', 'vrai'];
  const couleurZone = i => COUL[enZones() ? PALETTE_ZONES[i % PALETTE_ZONES.length] : COUL_ZONES[i]];
  const enExercice = () => etat.mode === 'exercice' && !etat.verifie;

  // Carte : échelle isotrope autour du domaine des zones (modèle d'école), ou des zones réelles et du site
  const DOMAINE = { x0: -120, x1: 240, y0: -120, y1: 150 };
  function geoCarte(cv) {
    const D = enZones() && etat.zm ? etat.zm.domaine : DOMAINE, W = cv.clientWidth, H = cv.clientHeight, m = enZones() ? 14 : 26;
    const s = Math.min((W - 2 * m) / (D.x1 - D.x0), (H - 2 * m) / (D.y1 - D.y0));
    const cx = (W - s * (D.x1 - D.x0)) / 2, cy = (H - s * (D.y1 - D.y0)) / 2;
    return { s, X: x => cx + (x - D.x0) * s, Y: y => H - cy - (y - D.y0) * s, x: X => D.x0 + (X - cx) / s, y: Y => D.y0 + (H - cy - Y) / s };
  }
  // Couleur opaque entre le fond et `vers` (couleurs #rrggbb), t de 0 à 1
  const rgb = c => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null);
  function melange(t, vers) {
    const a = rgb(COUL.paper), b = rgb(vers);
    if (!a || !b) return vers;
    return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
  }
  // Cases colorées (échelle logarithmique), isolignes aux niveaux ronds, légende
  function dessinerCarteAlea(ctx, g, W, H) {
    const c = etat.carte, gr = c.grille, v = Array.from(c.valeurs).filter(x => x > 0);
    if (!v.length) return;
    const vmin = Math.min(...v), vmax = Math.max(...v), t = x => (vmax > vmin ? Math.log(x / vmin) / Math.log(vmax / vmin) : 1), d = (gr.pas * g.s) / 2;
    gr.sites.forEach((s, n) => {
      const x = c.valeurs[n];
      if (!(x > 0)) return;
      ctx.fillStyle = melange(0.06 + 0.5 * t(x), COUL['pick-p']);
      ctx.fillRect(Math.floor(g.X(s.x) - d), Math.floor(g.Y(s.y) - d), Math.ceil(2 * d) + 1, Math.ceil(2 * d) + 1);
    });
    if (c.n < gr.sites.length) return;
    const places = [];
    for (const niv of Isolignes.niveauxRonds(vmin, vmax, 5)) {
      const segs = Isolignes.segments(c.valeurs, gr.nx, gr.ny, niv), P = ([i, j]) => [g.X(gr.x0 + i * gr.pas), g.Y(gr.y0 + j * gr.pas)];
      ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.7; ctx.beginPath();
      for (const [a, b] of segs) { const [x1, y1] = P(a), [x2, y2] = P(b); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke(); ctx.globalAlpha = 1;
      // étiquette : le point le plus à droite qui ne chevauche pas une étiquette déjà posée
      const lab = segs.map(([a]) => P(a)).filter(([x, y]) => x > 40 && x < W - 40 && y > 30 && y < H - 30).sort((a, b) => b[0] - a[0])
        .find(([x, y]) => places.every(([u, w]) => Math.abs(u - x) > 46 || Math.abs(w - y) > 16));
      if (lab) { places.push(lab); texte(ctx, g3(niv), lab[0], lab[1], COUL.ink, `700 10.5px ${MONO}`, 'center'); }
    }
    const lib = W >= 520 ? `${nomImt(c.k)} moyen à ${virg(100 * etat.proba[0], 0)} % en ${etat.proba[1]} ans : ${g3(vmin)} à ${g3(vmax)} g`
      : `${nomImt(c.k)}, Tr ${milliers(periodeRetour())} ans : ${g3(vmin)} à ${g3(vmax)} g`;
    texte(ctx, lib, 8, H - 8, COUL['pick-p'], `800 11.5px ${POLICE}`, 'left', 'bottom');
  }
  function dessinerCarte() {
    if (enZones()) { dessinerCarteZones(); return; }
    const cv = $('#al-carte');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), g = geoCarte(cv), site = etat.r.site;
    // Quadrillage de 50 km
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let x = -100; x <= DOMAINE.x1; x += 50) { const X = Math.round(g.X(x)) + 0.5; ctx.beginPath(); ctx.moveTo(X, g.Y(DOMAINE.y1)); ctx.lineTo(X, g.Y(DOMAINE.y0)); ctx.stroke(); }
    for (let y = -100; y <= DOMAINE.y1; y += 50) { const Y = Math.round(g.Y(y)) + 0.5; ctx.beginPath(); ctx.moveTo(g.X(DOMAINE.x0), Y); ctx.lineTo(g.X(DOMAINE.x1), Y); ctx.stroke(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('quadrillage 50 km', 8, 6);
    if (etat.carte && !enExercice()) dessinerCarteAlea(ctx, g, W, H);
    // Zones : surface, contour, points de calcul
    etat.modele.zones.forEach((z, i) => {
      const c = COUL[COUL_ZONES[i]];
      ctx.beginPath(); z.polygone.forEach(([x, y], j) => (j ? ctx.lineTo(g.X(x), g.Y(y)) : ctx.moveTo(g.X(x), g.Y(y)))); ctx.closePath();
      ctx.globalAlpha = 0.1; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = c; ctx.globalAlpha = 0.55;
      for (const p of z.points) { ctx.beginPath(); ctx.arc(g.X(p.x), g.Y(p.y), 1.5, 0, 2 * Math.PI); ctx.fill(); }
      ctx.globalAlpha = 1;
      const p = etat.r.zones[i], ymax = Math.max(...z.polygone.map(q => q[1])), xs = z.polygone.map(q => q[0]), xm = (Math.min(...xs) + Math.max(...xs)) / 2;
      if (W >= 520) {
        texte(ctx, z.nom, g.X(xm), g.Y(ymax) - 22, c, `800 12px ${POLICE}`, 'center');
        texte(ctx, `λ(M≥4) ${virg(p.lam, 2)}/an · b ${virg(p.b, 2)} · Mmax ${virg(p.mmax, 1)}`, g.X(xm), g.Y(ymax) - 8, c, `700 10.5px ${MONO}`, 'center');
      } else texte(ctx, z.nom.split(' (')[0], g.X(xm), g.Y(ymax) - 9, c, `800 11.5px ${POLICE}`, 'center');
    });
    // Failles : trace épaisse, projection en surface si elle est pentée
    for (const f of BASE.failles) {
      const actif = etat.modele.failles.length > 0, [[x0, y0], [x1, y1]] = f.trace;
      ctx.strokeStyle = COUL.teal; ctx.globalAlpha = actif ? 1 : 0.35; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.X(x0), g.Y(y0)); ctx.lineTo(g.X(x1), g.Y(y1)); ctx.stroke(); ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
      const lib = W >= 520 ? `${f.nom} · ${virg(etat.r.faille.glissement, 1)} mm/an · M ≤ ${virg(f.mmax, 1)}` : f.nom;
      texte(ctx, lib, g.X(x0) - 6, g.Y(y0) + 4, COUL.teal, `800 11px ${POLICE}`, 'right', 'top');
    }
    // Cercles de distance et site
    ctx.save();
    for (const R of [50, 100, 200]) {
      ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(g.X(site.x), g.Y(site.y), R * g.s, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
      texte(ctx, `${R} km`, g.X(site.x), g.Y(site.y) + R * g.s + 3, COUL.muted, `10.5px ${MONO}`, 'center', 'top');
    }
    ctx.restore();
    const Xs = g.X(site.x), Ys = g.Y(site.y);
    ctx.fillStyle = COUL['pick-p']; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Xs, Ys - 9); ctx.lineTo(Xs + 8, Ys + 6); ctx.lineTo(Xs - 8, Ys + 6); ctx.closePath(); ctx.stroke(); ctx.fill();
    texte(ctx, `Site · Vs30 ${milliers(site.vs30)} m/s`, Xs + 12, Ys + 2, COUL['pick-p'], `800 12px ${POLICE}`);
  }

  // ── Mode « Zones du catalogue » : préparation du modèle et carte ──────────
  // Repère fixe en km autour du centre des zones ; pas de discrétisation choisi pour qu'un calcul dure une à deux
  // secondes (1 500 points au plus) ; grille de la carte d'aléa sur le domaine des zones et du site (250 sites au plus) ;
  // branches (a, b) en énumération complète jusqu'à quatre zones à σ(b) > 0 (3⁴ × 3 × 3 = 729 réalisations).
  const CIBLE_POINTS = 1500, SITES_CARTE = 250, MAX_VARIANTES_AB = 81, DOMAINE_MED = { lon: [-20, 50], lat: [22, 53] };
  const echapper = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const geoTexte = (v, pos, neg, d = 2) => `${virg(Math.abs(v), d)}°${v >= 0 ? pos : neg}`;
  const lonPres = l => ((((l + 180) % 360) + 360) % 360) - 180;
  const latLon = (lat, lon, d = 2) => `${geoTexte(lat, 'N', 'S', d)} ${geoTexte(lonPres(lon), 'E', 'O', d)}`;
  const tauxTexte = x => (x >= 10 ? virg(x, 1) : x >= 0.1 ? virg(x, 2) : virg(x, 3));
  const fonds = {};
  const chargerFond = cle => (fonds[cle] = fonds[cle] || fetch(`data/cotes-${cle}.json`).then(r => r.json()).catch(() => null));
  function preparerZones(m) {
    const reference = Zones.centre(m.zones), pr = Zones.projection(reference.lat, reference.lon);
    const polys = m.zones.map(z => z.polygone.map(pr.versKm)), siteKm = pr.versKm([m.site.lon, m.site.lat]);
    const { pas, points, n } = Zones.pasAdapte(polys, { cible: CIBLE_POINTS });
    const domaine = Zones.domaine(polys, siteKm), nSigma = m.zones.filter(z => z.sigmaB > 0).length;
    // km par degré de longitude et de latitude (méridiens et parallèles sont droits dans ce repère)
    const kx = pr.versKm([reference.lon + 1, reference.lat])[0], ky = pr.versKm([reference.lon, reference.lat + 1])[1];
    const zm = { modele: m, reference, pr, pas, points, n, domaine, grille: Zones.grilleAlea(domaine, { nMax: SITES_CARTE }),
      nSigma, abPossible: nSigma > 0 && Math.pow(3, nSigma) <= MAX_VARIANTES_AB, kx, ky, fond: null, boite: null,
      failles: null, traces: null, faillesSource: null, gnss: null };
    // fond de carte : côtes et frontières de la Méditerranée (plus fines) quand la vue y tient, sinon du monde ; la boîte
    // déborde du domaine, que la carte montre au-delà quand ses proportions diffèrent de celles du canevas
    const L = Math.max(domaine.x1 - domaine.x0, domaine.y1 - domaine.y0);
    const boite = { x0: domaine.x0 - L, x1: domaine.x1 + L, y0: domaine.y0 - L, y1: domaine.y1 + L };
    zm.boite = boite;
    const med = reference.lon + boite.x0 / kx >= DOMAINE_MED.lon[0] && reference.lon + boite.x1 / kx <= DOMAINE_MED.lon[1]
      && reference.lat + boite.y0 / ky >= DOMAINE_MED.lat[0] && reference.lat + boite.y1 / ky <= DOMAINE_MED.lat[1];
    chargerFond(med ? 'mediterranee' : 'monde').then(j => {
      if (!j || etat.zm !== zm) return;
      zm.fond = { cotes: Zones.lignesKm(j.cotes, pr, boite), frontieres: Zones.lignesKm(j.frontieres || [], pr, boite) };
      if (enZones() && etat.res && !$('#banc-alea').hidden) dessinerCarte();
    });
    return zm;
  }
  // Réglages de départ : valeurs du fichier (λ, b, Mmax de chaque zone, site), toutes les branches possibles
  function reglagesZones() {
    const zm = etat.zm, m = zm.modele, [x, y] = zm.pr.versKm([m.site.lon, m.site.lat]);
    return {
      site: { x, y, lat: m.site.lat, lon: m.site.lon, vs30: m.site.vs30 },
      zones: m.zones.map(z => ({ lam: z.lam, b: z.b, mmax: z.mmax })),
      incAB: zm.abPossible, incMmax: true, lois: Object.fromEntries(BASE.gmpe.map(g => [g.id, true])),
      geo: { actif: !!reel.gnss, poids: 0.5, marge: 0, moments: null, source: '' }, faille: { ...reglagesDefaut().faille, actif: false },
      failles: { actif: true, glissementDefaut: 0 },
    };
  }

  // ── Failles actives et champ de vitesses GNSS (mode « Zones du catalogue ») ──
  // Sources chargées une fois (elles survivent aux changements de modèle de zones) : failles de l'extrait GEM livré ou d'un
  // fichier, vitesses GNSS d'un fichier. Ce qui dépend des zones (failles retenues, traces en km, tenseurs) vit dans zm.
  const reel = { failles: null, gnss: null, chargement: null, erreurFailles: null };
  const CIBLE_RUPTURES = 15000;
  function chargerFaillesDefaut() {
    if (reel.failles) return Promise.resolve(reel.failles);
    if (!reel.chargement) {
      reel.chargement = fetch('data/failles-mediterranee.json').then(r => { if (!r.ok) throw new Error(`extrait des failles illisible (${r.status})`); return r.text(); })
        .then(t => { if (!reel.failles) reel.failles = { ...Failles.lire(t), nom: 'extrait méditerranéen de la base GEM', defaut: true }; reel.erreurFailles = null; return reel.failles; })
        .catch(err => { reel.chargement = null; reel.erreurFailles = err.message || String(err); return null; });
    }
    return reel.chargement;
  }
  // Failles du jeu chargé : traces en km de celles qui touchent la boîte de la carte (une fois par jeu et par modèle de
  // zones), failles retenues par les zones (selon le glissement par défaut).
  function majFaillesZones() {
    const zm = etat.zm, F = reel.failles;
    if (!zm) return;
    if (!F) { zm.failles = null; zm.traces = null; zm.faillesSource = null; return; }
    if (zm.faillesSource !== F) {
      zm.faillesSource = F;
      const b = zm.boite;
      zm.traces = [];
      F.failles.forEach((f, i) => {
        const xy = f.trace.flatMap(q => zm.pr.versKm(q));
        let dedans = false;
        for (let k = 0; k < xy.length && !dedans; k += 2) dedans = xy[k] >= b.x0 && xy[k] <= b.x1 && xy[k + 1] >= b.y0 && xy[k + 1] <= b.y1;
        if (dedans) zm.traces.push({ i, xy: Float64Array.from(xy) });
      });
    }
    const r = Failles.retenir(F.failles, zm.modele.zones, { glissementDefaut: etat.r.failles.glissementDefaut });
    zm.failles = { ...r, parIndice: new Map(r.retenues.map(f => [f.indice, f])) };
  }
  // Tenseur et moment géodésique de chaque zone (stations de la zone et de sa marge), flèches de la carte (vitesses des
  // stations de la boîte, leur moyenne retirée).
  function majGnssZones() {
    const zm = etat.zm, G = reel.gnss;
    if (!zm) return;
    if (!G) { zm.gnss = null; return; }
    const marge = etat.r.geo.marge || 0, b = zm.boite;
    const zones = zm.modele.zones.map(z => Gnss.tenseurZone(G.stations, z.polygone, { marge }));
    const utiles = new Set(zones.flatMap(t => t.stations));
    const pts = G.stations.map((st, i) => ({ st, i, xy: zm.pr.versKm([st.lon, st.lat]) })).filter(p => p.xy[0] >= b.x0 && p.xy[0] <= b.x1 && p.xy[1] >= b.y0 && p.xy[1] <= b.y1);
    const rel = Gnss.vitessesRelatives(pts.map(p => p.st));
    zm.gnss = { source: G, marge, zones, fleches: pts.map((p, k) => ({ x: p.xy[0], y: p.xy[1], de: rel[k].de, dn: rel[k].dn, id: p.st.id, e: p.st.e, n: p.st.n, utile: utiles.has(p.i) })) };
  }
  const momentsGeo = zm => (zm && zm.gnss ? zm.gnss.zones.map(t => (Number.isFinite(t.moment) ? t.moment : null)) : null);
  // Modèle PSHA des zones (Zones.modelePsha), réglages du banc appliqués ; les points de chaque zone sont calculés une fois
  function construireZones(r) {
    const zm = etat.zm, m = zm.modele, ids = BASE.gmpe.map(g => g.id).filter(id => r.lois[id]);
    // failles retenues qui agissent dans une branche au moins (Mmax de la faille au-delà de Mmax de la zone + ΔMmax le plus
    // bas : sinon, leur moment retiré du fond de la zone dans les variantes géodésiques ne serait libéré nulle part), maillées
    // au pas qui tient le budget de ruptures ; moments géodésiques des zones (null sans tenseur)
    const dMin = r.incMmax ? Math.min(...BASE.dMmax.map(d => d.d)) : 0;
    const fz = r.failles.actif && zm.failles ? zm.failles.retenues.filter(f => f.mmax > r.zones[f.zone].mmax + dMin + 1e-9) : [];
    zm.maillage = fz.length ? Failles.pasAdapte(fz, r.zones.map(z => z.mmax), { cible: CIBLE_RUPTURES }) : null;
    const moments = momentsGeo(zm), geodesie = r.geo.actif && moments && moments.some(Number.isFinite) ? { poids: r.geo.poids, moments } : null;
    const mod = Zones.modelePsha({ ...m, zones: m.zones.map((z, i) => ({ ...z, ...r.zones[i] })) }, {
      reference: zm.reference, site: { lat: r.site.lat, lon: r.site.lon, vs30: r.site.vs30 }, gmpe: ids,
      incAB: r.incAB && zm.abPossible, incMmax: r.incMmax, pasGrille: zm.pas,
      failles: fz, pasFaille: zm.maillage ? zm.maillage.pas : 1, geodesie,
    });
    mod.zones.forEach((z, i) => { z.points = zm.points[i]; });
    return mod;
  }
  // Cercles de distance autour du site, selon la taille du domaine (300 km : portée du calcul)
  function cercles() {
    if (!enZones() || !etat.zm) return [50, 100, 200];
    const d = etat.zm.domaine, L = Math.max(d.x1 - d.x0, d.y1 - d.y0);
    return L > 700 ? [100, 200, 300] : L > 300 ? [50, 100, 200] : [25, 50, 100];
  }
  // Raccourcit un texte à une largeur donnée (points de suspension)
  function raccourcir(ctx, t, larg, police) {
    ctx.font = police;
    if (ctx.measureText(t).width <= larg) return t;
    let s = t;
    while (s.length > 1 && ctx.measureText(s + '…').width > larg) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  // Carte des zones réelles : graticule, carte d'aléa, côtes et frontières projetées, zones, cercles, site, échelle
  function dessinerCarteZones() {
    const cv = $('#al-carte'), zm = etat.zm;
    if (cv.clientWidth < 50 || !zm || !etat.modele) return;
    const { ctx, W, H } = preparer(cv), g = geoCarte(cv), site = etat.r.site, etroit = W < 520, ref = zm.reference;
    const lon = x => ref.lon + x / zm.kx, lat = y => ref.lat + y / zm.ky, Xlon = l => g.X((l - ref.lon) * zm.kx), Ylat = l => g.Y((l - ref.lat) * zm.ky);
    // graticule : pas rond, lignes à 64 px au moins
    const pasG = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30].find(p => p * zm.kx * g.s >= 64 && p * zm.ky * g.s >= 40) || 30;
    const dec = pasG >= 1 ? 0 : pasG === 0.25 ? 2 : 1;
    const meridiens = [], paralleles = [];
    for (let i = Math.ceil(lon(g.x(0)) / pasG); i * pasG <= lon(g.x(W)); i++) meridiens.push(i * pasG);
    for (let i = Math.ceil(lat(g.y(H)) / pasG); i * pasG <= lat(g.y(0)); i++) if (Math.abs(i * pasG) <= 90) paralleles.push(i * pasG);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (const l of meridiens) { const X = Math.round(Xlon(l)) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
    for (const l of paralleles) { const Y = Math.round(Ylat(l)) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
    ctx.stroke();
    if (etat.carte) dessinerCarteAlea(ctx, g, W, H);
    // côtes (trait plein) et frontières (tirets)
    if (zm.fond) {
      for (const [cle, larg, alpha, tirets] of [['frontieres', 0.9, 0.45, [3, 3]], ['cotes', 1.2, 0.9, []]]) {
        ctx.strokeStyle = COUL.muted; ctx.lineWidth = larg; ctx.globalAlpha = alpha; ctx.setLineDash(tirets); ctx.beginPath();
        for (const l of zm.fond[cle]) for (let i = 0; i < l.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(l[i]), g.Y(l[i + 1]));
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    // zones : surface, contour, points de calcul (plus petits quand ils se serrent)
    const rPt = Math.min(1.5, Math.max(0.6, 0.15 * zm.pas * g.s));
    etat.modele.zones.forEach((z, i) => {
      const c = couleurZone(i);
      ctx.beginPath(); z.polygone.forEach(([x, y], j) => (j ? ctx.lineTo(g.X(x), g.Y(y)) : ctx.moveTo(g.X(x), g.Y(y)))); ctx.closePath();
      ctx.globalAlpha = 0.12; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = c; ctx.globalAlpha = 0.5;
      for (const p of z.points) { ctx.beginPath(); ctx.arc(g.X(p.x), g.Y(p.y), rPt, 0, 2 * Math.PI); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    dessinerFailles(ctx, g);
    dessinerGnss(ctx, g, W, H);
    // cercles de distance autour du site
    for (const R of cercles()) {
      ctx.strokeStyle = COUL.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(g.X(site.x), g.Y(site.y), R * g.s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      texte(ctx, `${R} km`, g.X(site.x), g.Y(site.y) + R * g.s + 3, COUL.muted, `10.5px ${MONO}`, 'center', 'top');
    }
    // site et son étiquette (à gauche du site quand il est près du bord droit)
    const Xs = g.X(site.x), Ys = g.Y(site.y), places = [];
    ctx.fillStyle = COUL['pick-p']; ctx.strokeStyle = COUL.paper; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Xs, Ys - 9); ctx.lineTo(Xs + 8, Ys + 6); ctx.lineTo(Xs - 8, Ys + 6); ctx.closePath(); ctx.stroke(); ctx.fill();
    const lignesSite = [`Site · Vs30 ${milliers(site.vs30)} m/s`, latLon(site.lat, site.lon)];
    const policeSite = `800 ${etroit ? 11.5 : 12}px ${POLICE}`;
    ctx.font = policeSite;
    const lS = Math.max(...lignesSite.map(t => ctx.measureText(t).width)), gauche = Xs + 12 + lS > W - 4;
    const xS = gauche ? Xs - 12 : Xs + 12, yS = Ys + 2 - (lignesSite.length - 1) * 7;
    lignesSite.forEach((t, k) => texte(ctx, t, xS, yS + 14 * k, COUL['pick-p'], policeSite, gauche ? 'right' : 'left'));
    places.push({ x0: gauche ? xS - lS : xS, x1: gauche ? xS : xS + lS, y0: yS - 8, y1: yS + 14 * (lignesSite.length - 1) + 8 });
    dessinerAxes(ctx, g, W, places);
    places.push({ x0: Xs - 9, x1: Xs + 9, y0: Ys - 10, y1: Ys + 7 });
    // étiquettes des zones, au centre de leurs points : nom et statistiques (nom seul sur téléphone, ou faute de place),
    // décalées d'une ligne au plus pour ne rien chevaucher
    const libre = b => b.x0 >= 2 && b.x1 <= W - 2 && b.y0 >= 2 && b.y1 <= H - 2 && places.every(p => b.x1 < p.x0 || b.x0 > p.x1 || b.y1 < p.y0 || b.y0 > p.y1);
    etat.modele.zones.forEach((z, i) => {
      const c = couleurZone(i), p = etat.r.zones[i], q = zm.modele.zones[i], pts = z.points;
      const xc = g.X(pts.reduce((s, u) => s + u.x, 0) / pts.length), yc = g.Y(pts.reduce((s, u) => s + u.y, 0) / pts.length);
      const pNom = `800 ${etroit ? 11 : 12}px ${POLICE}`, pStat = `700 10.5px ${MONO}`;
      const nom = raccourcir(ctx, z.nom, etroit ? 120 : 200, pNom), stat = `λ(≥ ${virg(q.mc, 1)}) ${tauxTexte(p.lam)}/an · b ${virg(p.b, 2)} · Mmax ${virg(p.mmax, 1)}`;
      ctx.font = pNom; const lN = ctx.measureText(nom).width; ctx.font = pStat; const lT = ctx.measureText(stat).width;
      const boite = (avec, y) => {
        const h = avec ? 28 : 14, l = avec ? Math.max(lN, lT) : lN, x = Math.min(Math.max(xc, 4 + l / 2), W - 4 - l / 2);
        return { avec, x, y, x0: x - l / 2, x1: x + l / 2, y0: y - h / 2, y1: y + h / 2 };
      };
      const essais = [...(etroit ? [] : [0, -30, 30, -46, 46].map(dy => boite(true, yc + dy))), ...[0, -16, 16, -30, 30, -44, 44].map(dy => boite(false, yc + dy))];
      const b = essais.find(libre) || boite(false, yc);
      places.push(b);
      if (b.avec) { texte(ctx, nom, b.x, b.y - 7, c, pNom, 'center'); texte(ctx, stat, b.x, b.y + 7, c, pStat, 'center'); }
      else texte(ctx, nom, b.x, b.y, c, pNom, 'center');
    });
    // étiquettes du graticule : longitudes en haut, latitudes à gauche (la légende de la carte d'aléa occupe le bas)
    for (const l of meridiens) { const X = Xlon(l); if (X > 26 && X < W - 26) texte(ctx, geoTexte(lonPres(l), 'E', 'O', dec), X, 4, COUL.muted, `10px ${MONO}`, 'center', 'top'); }
    for (const l of paralleles) { const Y = Ylat(l); if (Y > 30 && Y < H - 26) texte(ctx, geoTexte(l, 'N', 'S', dec), 4, Y - 1, COUL.muted, `10px ${MONO}`, 'left', 'bottom'); }
    // échelle en bas à droite
    const lkm = [25, 50, 100, 200, 500].find(v => v * g.s >= 50) || 500, x1 = W - 12, x0 = x1 - lkm * g.s, yb = H - 12;
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, yb - 4); ctx.lineTo(x0, yb); ctx.lineTo(x1, yb); ctx.lineTo(x1, yb - 4); ctx.stroke();
    texte(ctx, `${lkm} km`, (x0 + x1) / 2, yb - 4, COUL.ink, `700 10.5px ${MONO}`, 'center', 'bottom');
  }

  // Flèche de (x0, y0) à (x1, y1), pointe de `t` px
  function fleche(ctx, x0, y0, x1, y1, t = 5) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), tt = Math.min(t, 0.6 * L);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (tt < 1.5) return;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - tt * Math.cos(a - 0.45), y1 - tt * Math.sin(a - 0.45)); ctx.lineTo(x1 - tt * Math.cos(a + 0.45), y1 - tt * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }
  // Failles du jeu chargé : trait épais pour celles du calcul, fin pour les autres ; c'est la trace cartographiée, le calcul
  // la ramène à la droite de ses extrémités.
  function dessinerFailles(ctx, g) {
    const zm = etat.zm;
    if (!zm || !zm.traces) return;
    const ret = new Set(etat.modele.failles.map(f => f.id));
    const chemin = xy => { for (let k = 0; k < xy.length; k += 2) (k ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(xy[k]), g.Y(xy[k + 1])); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = COUL.ink;
    ctx.globalAlpha = 0.4; ctx.lineWidth = 0.9; ctx.beginPath();
    for (const t of zm.traces) if (!ret.has('f' + t.i)) chemin(t.xy);
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 2.4; ctx.beginPath();
    for (const t of zm.traces) if (ret.has('f' + t.i)) chemin(t.xy);
    ctx.stroke();
    ctx.restore();
  }
  // Vitesses GNSS (moyenne des stations de la carte retirée) et axes principaux de la déformation de chaque zone : flèches
  // vers le centre pour un raccourcissement, vers l'extérieur pour un allongement. Les méridiens sont verticaux sur la carte :
  // les composantes est et nord s'y dessinent telles quelles.
  function dessinerGnss(ctx, g, W, H) {
    const zm = etat.zm;
    if (!zm || !zm.gnss) return;
    const f = zm.gnss.fleches.filter(a => g.X(a.x) > -20 && g.X(a.x) < W + 20 && g.Y(a.y) > -20 && g.Y(a.y) < H + 20);
    const v = f.map(a => Math.hypot(a.de, a.dn)).sort((a, b) => a - b), v95 = v.length ? v[Math.min(v.length - 1, Math.floor(0.95 * v.length))] : 0;
    const k = v95 > 0 ? Math.max(16, Math.min(34, 0.05 * W)) / v95 : 0;
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = COUL.blue; ctx.lineWidth = 1.2;
    for (const a of f) {
      const X = g.X(a.x), Y = g.Y(a.y);
      ctx.globalAlpha = a.utile ? 1 : 0.45;
      ctx.beginPath(); ctx.arc(X, Y, 1.8, 0, 2 * Math.PI); ctx.fill();
      if (k) fleche(ctx, X, Y, X + k * a.de, Y - k * a.dn, 5);
    }
    ctx.globalAlpha = 1;
    // échelle des flèches, au-dessus de l'échelle des distances
    if (k) {
      const vr = [0.2, 0.5, 1, 2, 5, 10, 20].find(x => x * k >= 25) || 20, x1 = W - 12, x0 = x1 - vr * k, y = H - 34;
      fleche(ctx, x0, y, x1, y, 5);
      texte(ctx, `${virg(vr, vr < 1 ? 1 : 0)} mm/an`, (x0 + x1) / 2, y - 4, COUL.blue, `700 10.5px ${MONO}`, 'center', 'bottom');
    }
    ctx.restore();
  }
  // Axes principaux de la déformation au centre de chaque zone qui a un tenseur (liseré du fond) ; leurs boîtes rejoignent
  // `places` pour que les étiquettes des zones s'en écartent.
  function dessinerAxes(ctx, g, W, places) {
    const zm = etat.zm;
    if (!zm || !zm.gnss) return;
    const ts = zm.gnss.zones.filter(t => t.principales), emax = Math.max(0, ...ts.flatMap(t => [Math.abs(t.principales.e1h), Math.abs(t.principales.e2h)]));
    if (!(emax > 0)) return;
    const Lmax = Math.max(12, Math.min(30, 0.045 * W));
    for (const t of ts) {
      const [x, y] = zm.pr.versKm([t.centre.lon, t.centre.lat]), X = g.X(x), Y = g.Y(y), r = Lmax + 6;
      places.push({ x0: X - r, x1: X + r, y0: Y - r, y1: Y + r });
    }
    ctx.save();
    for (const [coul, larg] of [[COUL.paper, 6], [COUL.blue, 2.8]]) {
      ctx.strokeStyle = ctx.fillStyle = coul; ctx.lineWidth = larg;
      for (const t of ts) {
        const [x, y] = zm.pr.versKm([t.centre.lon, t.centre.lat]), X = g.X(x), Y = g.Y(y), az = t.principales.azimutRaccourcissement * Math.PI / 180;
        for (const [e, ux, uy] of [[t.principales.e1h, Math.sin(az), Math.cos(az)], [t.principales.e2h, Math.cos(az), -Math.sin(az)]]) {
          const L = (Lmax * Math.abs(e)) / emax, d = 4;
          if (L < 3) continue;
          for (const s of [1, -1]) {
            const xa = X + s * ux * d, ya = Y - s * uy * d, xb = X + s * ux * (d + L), yb = Y - s * uy * (d + L);
            if (e < 0) fleche(ctx, xb, yb, xa, ya, 8); else fleche(ctx, xa, ya, xb, yb, 8);
          }
        }
      }
    }
    ctx.restore();
  }

  // Courbe d'aléa : probabilité en 50 ans en fonction du niveau, échelles logarithmiques
  const X_MIN = -3, X_MAX = Math.log10(3), Y_MIN = -5;
  function geoCourbe(cv) {
    const W = cv.clientWidth, H = cv.clientHeight, m = { g: 52, d: 84, h: 14, b: 30 };
    return { W, H, m, X: x => m.g + ((Math.log10(x) - X_MIN) / (X_MAX - X_MIN)) * (W - m.g - m.d), x: X => Math.pow(10, X_MIN + ((X - m.g) / (W - m.g - m.d)) * (X_MAX - X_MIN)),
      Y: p => H - m.b - ((Math.log10(Math.max(p, 1e-12)) - Y_MIN) / -Y_MIN) * (H - m.h - m.b) };
  }
  function trace(ctx, g, niveaux, poe) {
    ctx.beginPath();
    let premier = true;
    niveaux.forEach((x, l) => { if (poe[l] < 1e-7) return; if (premier) { ctx.moveTo(g.X(x), g.Y(poe[l])); premier = false; } else ctx.lineTo(g.X(x), g.Y(poe[l])); });
    ctx.stroke();
  }
  function dessinerCourbe() {
    const cv = $('#al-courbe');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), g = geoCourbe(cv), res = etat.res, k = etat.k;
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let e = X_MIN; e <= 0; e++) for (const f of [1, 2, 5]) {
      const x = f * Math.pow(10, e); if (Math.log10(x) > X_MAX + 1e-9) continue;
      const X = Math.round(g.X(x)) + 0.5; ctx.strokeStyle = f === 1 ? COUL['grid-strong'] : COUL.grid;
      ctx.beginPath(); ctx.moveTo(X, g.m.h); ctx.lineTo(X, H - g.m.b); ctx.stroke();
      if (f === 1 || W > 560) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(x).replace('.', ','), X, H - g.m.b + 5); }
    }
    for (let e = Y_MIN; e <= 0; e++) {
      const Y = Math.round(g.Y(Math.pow(10, e))) + 0.5; ctx.strokeStyle = COUL['grid-strong'];
      ctx.beginPath(); ctx.moveTo(g.m.g, Y); ctx.lineTo(W - g.m.d, Y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(e === 0 ? '1' : puissance(e), g.m.g - 6, Y);
    }
    // Axe de droite : périodes de retour
    ctx.textAlign = 'left';
    for (const T of [50, 100, 475, 2475, 10000, 100000]) {
      const p = 1 - Math.exp(-BASE.dureeVie / T), Y = g.Y(p);
      ctx.beginPath(); ctx.strokeStyle = COUL.muted; ctx.moveTo(W - g.m.d, Y); ctx.lineTo(W - g.m.d + 4, Y); ctx.stroke();
      ctx.fillText(`${milliers(T)} ans`, W - g.m.d + 7, Y);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`${nomImt(k)} (g)`, W - g.m.d - 6, g.m.h + 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('probabilité de dépassement en 50 ans', g.m.g + 6, H - g.m.b - 4);
    ctx.save(); ctx.beginPath(); ctx.rect(g.m.g, g.m.h, W - g.m.g - g.m.d, H - g.m.h - g.m.b); ctx.clip();
    // Réalisations, fractiles, moyenne
    ctx.lineWidth = 1; ctx.strokeStyle = COUL.muted; ctx.globalAlpha = Math.max(0.12, Math.min(0.45, 6 / res.realisations.length));
    for (const r of res.realisations) trace(ctx, g, res.niveaux, r.poe[k]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COUL.blue; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    trace(ctx, g, res.niveaux, res.fractiles[0.16][k]); trace(ctx, g, res.niveaux, res.fractiles[0.84][k]);
    ctx.setLineDash([]); ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.6;
    trace(ctx, g, res.niveaux, res.moyenne[k]);
    // Probabilité visée et lecture
    const pc = poeCible(), Yc = g.Y(pc), x = etat.uhs.moy[k];
    ctx.strokeStyle = COUL.teal; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(g.m.g, Yc); ctx.lineTo(W - g.m.d, Yc); ctx.stroke();
    if (!enExercice() && x > 0) { ctx.beginPath(); ctx.moveTo(g.X(x), Yc); ctx.lineTo(g.X(x), H - g.m.b); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, `Tr = ${milliers(periodeRetour())} ans`, g.m.g + 8, Yc - 9, COUL.teal, `800 11px ${POLICE}`);
    if (!enExercice() && x > 0) {
      ctx.fillStyle = COUL['pick-p']; ctx.beginPath(); ctx.arc(g.X(x), Yc, 4, 0, 2 * Math.PI); ctx.fill();
      texte(ctx, `${g3(x)} g`, g.X(x) + 7, Yc + 12, COUL['pick-p'], `800 12px ${MONO}`);
    }
  }

  // UHS et spectres de l'EN 1998-1:2004 calés sur le PGA de l'UHS (sol déduit de Vs30)
  const classeSol = vs30 => (vs30 >= 800 ? 'A' : vs30 >= 360 ? 'B' : vs30 >= 180 ? 'C' : 'D');
  function dessinerUHS() {
    const cv = $('#al-uhs');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: 52, d: 14, h: 14, b: 30 }, Tmax = 3;
    const sol = classeSol(etat.r.site.vs30), pga = etat.uhs.moy[K_PGA], ag = pga / Sp.EC8_2004[1][sol].S;
    const ec8 = (T, type) => Sp.ec8(T, { type, sol, ag: pga / Sp.EC8_2004[type][sol].S });
    let ymax = Math.max(...etat.uhs.q84, ...[0.15, 0.3, 0.6, 1].map(T => Math.max(ec8(T, 1), ec8(T, 2))));
    ymax = ymax > 0 ? ymax * 1.12 : 0.1;
    const pas = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find(p => ymax / p <= 6) || 1;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (v / ymax) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    for (let T = 0; T <= Tmax + 1e-9; T += 0.5) { const x = Math.round(X(T)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(T, T % 1 ? 1 : 0), x, H - m.b + 5); }
    for (let v = 0; v <= ymax + 1e-9; v += pas) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, pas < 0.1 ? 2 : 1), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('période T (s)', W - m.d - 4, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('Sa (g), ξ = 5 %', m.g + 6, m.h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    if (pga > 0) {
      for (const [type, c] of [[1, 'teal'], [2, 'amp']]) {
        ctx.strokeStyle = COUL[c]; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]); ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const T = (Tmax * i) / 300; if (i) ctx.lineTo(X(T), Y(ec8(T, type))); else ctx.moveTo(X(T), Y(ec8(T, type))); }
        ctx.stroke();
      }
    }
    ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.16; ctx.beginPath();
    BASE.imts.forEach((_, k) => { if (k) ctx.lineTo(X(periode(k)), Y(etat.uhs.q84[k])); else ctx.moveTo(X(periode(k)), Y(etat.uhs.q84[k])); });
    for (let k = BASE.imts.length - 1; k >= 0; k--) ctx.lineTo(X(periode(k)), Y(etat.uhs.q16[k]));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    if (!enExercice()) {
      ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2.6; ctx.beginPath();
      BASE.imts.forEach((_, k) => { if (k) ctx.lineTo(X(periode(k)), Y(etat.uhs.moy[k])); else ctx.moveTo(X(periode(k)), Y(etat.uhs.moy[k])); });
      ctx.stroke();
      ctx.fillStyle = COUL['pick-p'];
      BASE.imts.forEach((_, k) => { ctx.beginPath(); ctx.arc(X(periode(k)), Y(etat.uhs.moy[k]), 3, 0, 2 * Math.PI); ctx.fill(); });
    }
    ctx.restore();
    $('#al-legende-ec8').textContent = pga > 0 ? `sol ${sol} (Vs30 ${milliers(etat.r.site.vs30)} m/s)${enExercice() ? '' : `, ag = ${g3(ag)} g`}` : '';
  }

  // Spectre moyen conditionnel (CMS) face à l'UHS : il touche l'UHS à T* et passe dessous ailleurs
  function dessinerCMS() {
    const cv = $('#al-cms');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), etroit = cv.clientWidth < 600, m = { g: 52, d: 14, h: etroit ? 46 : 30, b: 30 }, Tmax = 3, c = etat.cms;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    // en exercice, CMS(T*) = x et le scénario M̄, R̄ donneraient les réponses
    const absent = enExercice() ? 'spectre conditionnel affiché après la vérification' : !c ? 'probabilité visée non atteinte' : '';
    if (absent) { ctx.textAlign = 'center'; ctx.fillText(absent, W / 2, H / 2); return; }
    const haut = c.moyenne.map((v, k) => v * Math.exp(c.ecart[k])), bas = c.moyenne.map((v, k) => v * Math.exp(-c.ecart[k]));
    let ymax = Math.max(...etat.uhs.moy, ...haut) * 1.08;
    const pas = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find(p => ymax / p <= 6) || 1;
    const X = T => m.g + (T / Tmax) * (W - m.g - m.d), Y = v => H - m.b - (Math.min(v, ymax) / ymax) * (H - m.h - m.b);
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    for (let T = 0; T <= Tmax + 1e-9; T += 0.5) { const x = Math.round(X(T)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(T, T % 1 ? 1 : 0), x, H - m.b + 5); }
    for (let v = 0; v <= ymax + 1e-9; v += pas) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(v, pas < 0.1 ? 2 : 1), m.g - 6, y); }
    // au-dessus des courbes, qui descendent vers les longues périodes
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('période T (s)', W - m.d - 4, m.h + 2);
    ctx.textAlign = 'left'; ctx.fillText('Sa (g), ξ = 5 %', m.g + 6, m.h + 2);
    const ligne = (vals, coul, w, tirets) => {
      ctx.strokeStyle = coul; ctx.lineWidth = w; ctx.setLineDash(tirets || []); ctx.beginPath();
      BASE.imts.forEach((_, k) => (k ? ctx.lineTo(X(periode(k)), Y(vals[k])) : ctx.moveTo(X(periode(k)), Y(vals[k]))));
      ctx.stroke(); ctx.setLineDash([]);
    };
    ctx.save(); ctx.beginPath(); ctx.rect(m.g, m.h, W - m.g - m.d, H - m.h - m.b); ctx.clip();
    // bande ± σ du spectre conditionnel
    ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.14; ctx.beginPath();
    BASE.imts.forEach((_, k) => (k ? ctx.lineTo(X(periode(k)), Y(haut[k])) : ctx.moveTo(X(periode(k)), Y(haut[k]))));
    for (let k = BASE.imts.length - 1; k >= 0; k--) ctx.lineTo(X(periode(k)), Y(bas[k]));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ligne(etat.uhs.moy, COUL['pick-p'], 2, [6, 4]);
    ligne(c.moyenne, COUL.blue, 2.8);
    ctx.fillStyle = COUL.blue;
    BASE.imts.forEach((_, k) => { ctx.beginPath(); ctx.arc(X(periode(k)), Y(c.moyenne[k]), 3, 0, 2 * Math.PI); ctx.fill(); });
    // période de conditionnement
    const Ts = periode(etat.k);
    ctx.strokeStyle = COUL.ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(Ts), m.h + 16); ctx.lineTo(X(Ts), H - m.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    texte(ctx, `T* = ${nomImt(etat.k)} · ${g3(etat.uhs.moy[etat.k])} g à Tr ${milliers(periodeRetour())} ans`, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    texte(ctx, `scénario : M̄ ${virg(c.mMoy, 1)} · R̄ ${virg(c.rMoy, 0)} km · ε̄ ${virg(c.epsMoy, 2)}`, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
  }

  // Désagrégation : carte de chaleur magnitude × distance épicentrale
  function dessinerDesag() {
    const cv = $('#al-desag');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), etroit = cv.clientWidth < 600, m = { g: 48, d: 14, h: etroit ? 46 : 30, b: 30 }, d = etat.desag;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted;
    if (!d) { ctx.textAlign = 'center'; ctx.fillText('probabilité visée non atteinte', W / 2, H / 2); return; }
    const Rmax = Math.max(100, Math.ceil(Math.max(...d.cases.filter(c => c.part > 1e-3).map(c => c.r1)) / 20) * 20);
    const M0 = 4, M1 = Math.max(8, Math.ceil(Math.max(...d.cases.map(c => c.m1)))), X = R => m.g + (R / Rmax) * (W - m.g - m.d), Y = M => H - m.b - ((M - M0) / (M1 - M0)) * (H - m.h - m.b);
    const pmax = Math.max(...d.cases.map(c => c.part));
    for (const c of d.cases) {
      if (c.r0 >= Rmax) continue;
      const a = Math.pow(c.part / pmax, 0.6);
      ctx.globalAlpha = 0.08 + 0.92 * a; ctx.fillStyle = COUL['pick-p'];
      ctx.fillRect(X(c.r0) + 1, Y(c.m1) + 1, X(c.r1) - X(c.r0) - 2, Y(c.m0) - Y(c.m1) - 2);
      ctx.globalAlpha = 1;
      if (c.part >= 0.01 && X(c.r1) - X(c.r0) > 26) texte(ctx, virg(100 * c.part, 0), (X(c.r0) + X(c.r1)) / 2, (Y(c.m0) + Y(c.m1)) / 2, COUL.ink, `700 10.5px ${MONO}`, 'center');
    }
    ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1; ctx.fillStyle = COUL.muted; ctx.font = `10.5px ${MONO}`;
    for (let R = 0; R <= Rmax; R += 20) { const x = Math.round(X(R)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); if (R % (Rmax > 160 ? 40 : 20) === 0) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(R), x, H - m.b + 5); } }
    for (let M = M0; M <= M1; M += 0.5) { const y = Math.round(Y(M)) + 0.5; ctx.beginPath(); ctx.moveTo(m.g, y); ctx.lineTo(W - m.d, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(virg(M, 1), m.g - 6, y); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('distance Rjb (km) : épicentrale pour les zones', W - m.d - 4, H - m.b - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('M', m.g + 4, m.h + 2);
    const titre = `${nomImt(etat.k)} ≥ ${enExercice() ? 'UHS moyen' : g3(etat.uhs.moy[etat.k]) + ' g'} · Tr ${milliers(periodeRetour())} ans · parts en %`;
    texte(ctx, titre, m.g, 14, COUL.ink, `800 12px ${POLICE}`);
    if (!enExercice()) {
      const xm = X(d.rMoy), ym = Y(d.mMoy);
      ctx.strokeStyle = COUL.blue; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(xm - 7, ym); ctx.lineTo(xm + 7, ym); ctx.moveTo(xm, ym - 7); ctx.lineTo(xm, ym + 7); ctx.stroke();
      let parts = [...d.zones.map((p, i) => [etat.modele.zones[i].nom.split(' (')[0], p]), ...d.failles.map((p, i) => [etat.modele.failles[i].nom, p])];
      let lib = `M̄ ${virg(d.mMoy, 1)} · R̄ ${virg(d.rMoy, 0)} km · ${parts.map(([n, p]) => `${n} ${virg(100 * p, 0)} %`).join(' · ')}`;
      if (enZones()) {
        // zones réelles : les plus contributives d'abord, autant qu'en tient la ligne
        ctx.font = `800 12px ${POLICE}`;
        const place = etroit ? W - m.d - m.g : W - m.d - m.g - ctx.measureText(titre).width - 24;
        parts = parts.filter(([, p]) => p >= 0.005).sort((a, b) => b[1] - a[1]);
        for (let k = parts.length; k >= 0; k--) {
          lib = `M̄ ${virg(d.mMoy, 1)} · R̄ ${virg(d.rMoy, 0)} km${parts.slice(0, k).map(([n, p]) => ` · ${n} ${virg(100 * p, 0)} %`).join('')}${k < parts.length ? ' · …' : ''}`;
          if (ctx.measureText(lib).width <= place) break;
        }
      }
      texte(ctx, lib, etroit ? m.g : W - m.d, etroit ? 31 : 14, COUL.blue, `800 12px ${POLICE}`, etroit ? 'left' : 'right');
    }
  }

  // Sensibilité : une ligne par ensemble de branches, triées par étendue
  function dessinerTornade() {
    const cv = $('#al-tornade');
    if (cv.clientWidth < 50) return;
    const { ctx, W, H } = preparer(cv), m = { g: Math.min(150, W * 0.3), d: 18, h: 22, b: 44 };
    const xMoy = etat.uhs.moy[etat.k];
    if (!(xMoy > 0)) return;
    const court = t => t.replace(/ \((proche|lointaine)\)/, '').replace('Akkar, Sandıkkaya et Bommer', 'Akkar et al.')
      .replace('Loi d\'atténuation', W < 520 ? 'Loi' : 'Loi d\'atténuation').replace('Modèle de taux', W < 520 ? 'Taux' : 'Modèle de taux');
    const lignes = etat.sens.map(e => ({ ...e, nom: court(e.nom), branches: e.branches.map(b => ({ ...b, libelle: court(b.libelle) })), min: Math.min(...e.branches.map(b => b.niveau)), max: Math.max(...e.branches.map(b => b.niveau)) }))
      .sort((p, q) => (q.max - q.min) - (p.max - p.min));
    if (enZones()) { ctx.font = `700 12px ${POLICE}`; m.g = Math.min(Math.max(m.g, Math.max(...lignes.map(l => ctx.measureText(l.nom).width)) + 16), W * 0.45); }
    const lo = Math.min(xMoy, ...lignes.map(l => l.min)) * 0.92, hi = Math.max(xMoy, ...lignes.map(l => l.max)) * 1.08;
    const X = x => m.g + ((x - lo) / (hi - lo)) * (W - m.g - m.d), hL = (H - m.h - m.b) / lignes.length;
    ctx.font = `10.5px ${MONO}`; ctx.fillStyle = COUL.muted; ctx.strokeStyle = COUL.grid; ctx.lineWidth = 1;
    const pas = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2].find(p => (hi - lo) / p <= 6) || 0.5;
    for (let v = Math.ceil(lo / pas) * pas; v <= hi; v += pas) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.h); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(virg(v, pas < 0.01 ? 3 : 2), x, H - m.b + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`${nomImt(etat.k)} (g) à Tr = ${milliers(periodeRetour())} ans`, W - m.d, H - 5);
    // trait de la moyenne de l'arbre, sous les libellés ; en exercice, il donnerait le niveau demandé
    if (!enExercice()) { ctx.strokeStyle = COUL['pick-p']; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(xMoy), m.h - 6); ctx.lineTo(X(xMoy), H - m.b); ctx.stroke(); }
    lignes.forEach((l, i) => {
      const y = m.h + hL * (i + 0.5);
      texte(ctx, raccourcir(ctx, l.nom, m.g - 14, `700 12px ${POLICE}`), m.g - 10, y, COUL.ink, `700 12px ${POLICE}`, 'right');
      if (l.branches.length < 2) { texte(ctx, 'branche unique', X(xMoy) + 8, y, COUL.muted, `11px ${POLICE}`); return; }
      ctx.fillStyle = COUL.blue; ctx.globalAlpha = 0.22; ctx.fillRect(X(l.min), y - hL * 0.28, X(l.max) - X(l.min), hL * 0.56); ctx.globalAlpha = 1;
      l.branches.forEach(b => { ctx.fillStyle = COUL.blue; ctx.beginPath(); ctx.arc(X(b.niveau), y, 3.5, 0, 2 * Math.PI); ctx.fill(); });
      const bmin = l.branches.find(b => b.niveau === l.min), bmax = l.branches.find(b => b.niveau === l.max);
      if (hL > 30) {
        // libellés des branches extrêmes au-dessus de la barre (aucun ne descend sur la ligne suivante) ;
        // barre trop courte : de part et d'autre, sur la ligne
        const police = `10.5px ${POLICE}`;
        ctx.font = police;
        const wa = ctx.measureText(bmin.libelle).width, wb = ctx.measureText(bmax.libelle).width;
        const yh = y - hL * 0.28 - 7;
        if (X(l.max) - X(l.min) >= wa + wb + 12) {
          texte(ctx, bmin.libelle, X(l.min), yh, COUL.muted, police, 'left');
          texte(ctx, bmax.libelle, X(l.max), yh, COUL.muted, police, 'right');
        } else if (X(l.min) - 8 - wa >= m.g + 4 && X(l.max) + 8 + wb <= W - m.d) {
          texte(ctx, bmin.libelle, X(l.min) - 8, y, COUL.muted, police, 'right');
          texte(ctx, bmax.libelle, X(l.max) + 8, y, COUL.muted, police, 'left');
        } else {
          // place insuffisante (téléphone) : un seul libellé au-dessus, la branche basse à gauche
          const t = `${bmin.libelle} · ${bmax.libelle}`, w = ctx.measureText(t).width;
          const xc = Math.min(Math.max((X(l.min) + X(l.max)) / 2, m.g + 4 + w / 2), W - m.d - w / 2);
          texte(ctx, t, xc, yh, COUL.muted, police, 'center');
        }
      }
    });
  }

  // ── Panneaux ────────────────────────────────────────────────────────────
  function afficheur(titre, valeur, detail) {
    return `<div class="afficheur${valeur === '—' ? ' vide' : ''}"><span>${titre}</span><strong>${valeur}</strong><small>${detail || '&nbsp;'}</small></div>`;
  }
  function majAfficheurs() {
    const u = etat.uhs, cache = enExercice(), d = etat.desag, n = etat.res.realisations.length;
    const val = (k, suff = ' g') => (cache || !(u.moy[k] > 0) ? '—' : g3(u.moy[k]) + suff);
    const frac = k => (cache || !(u.moy[k] > 0) ? 'fractiles masqués' : `16–84 % : ${g3(u.q16[k])} – ${g3(u.q84[k])}`);
    const v = etat.res.variantes, nCat = v.filter(x => x.id[0] === 'c').length, nGeo = v.length - nCat;
    const tailles = [nGeo ? `(${nCat} + ${nGeo})` : String(nCat), etat.modele.dMmax.length, etat.modele.gmpe.length];
    $('#al-afficheurs').innerHTML = [
      afficheur('PGA moyen', val(K_PGA), frac(K_PGA)),
      afficheur('Période de retour', milliers(periodeRetour()) + ' ans', `${virg(100 * etat.proba[0], 0)} % en ${etat.proba[1]} ans`),
      afficheur('Sa(0,2 s) moyen', val(K_SA02), frac(K_SA02)),
      afficheur('Sa(1 s) moyen', val(K_SA1), frac(K_SA1)),
      afficheur('Scénario dominant', cache || !d ? '—' : `M ${virg(d.mMoy, 1)}`, cache || !d ? nomImt(etat.k) : `R̄ = ${virg(d.rMoy, 0)} km, ${nomImt(etat.k)}`),
      afficheur('Réalisations', String(n), tailles.join(' × ')),
    ].join('');
    const zm = enZones() ? etat.zm : null;
    if (zm) {
      // zones réelles : branches (a, b), points de calcul à portée du site, durée prévisible de la carte d'aléa
      const mod = etat.modele, k = etat.r.incAB && zm.abPossible ? zm.nSigma : 0;
      const proches = mod.zones.reduce((s, z) => s + z.points.filter(q => Math.hypot(q.x - mod.site.x, q.y - mod.site.y) <= mod.distanceMax).length, 0);
      const geo = mod.taux.find(t => t.id === 'geodesie'), nF = mod.failles.length;
      const taux = geo ? `taux du catalogue (poids ${virg(1 - geo.poids, 2)}) et de la géodésie (${nGeo} couplages χ, poids ${virg(geo.poids, 2)})` : 'taux du catalogue seul';
      $('#al-arbre').textContent = `${n} réalisations = ${tailles.join(' × ')} : variantes (a, b) des zones (${k ? `3${exposant(k)}, b ± 1,645 σ dans ${k} zone${k > 1 ? 's' : ''}` : 'b central'}), Mmax, loi d'atténuation ; ${taux}`
        + `${nF ? ` ; ${nF} faille${nF > 1 ? 's' : ''} active${nF > 1 ? 's' : ''}` : ''}. `
        + `${milliers(proches)} points de calcul sur ${milliers(zm.n)} à moins de ${mod.distanceMax} km du site. Courbes calculées en ${milliers(etat.duree)} ms.`;
      const nS = zm.grille.sites.length, tCarte = Math.max(5, Math.round((nS * etat.duree) / 12 / 5000) * 5);
      $('#al-carte-aide').textContent = `niveau moyen de la grandeur choisie à la probabilité visée, tous les ${zm.grille.pas} km (${milliers(nS)} sites, de l'ordre de ${tCarte} s)`;
      return;
    }
    $('#al-arbre').textContent = `${n} réalisations = ${tailles.join(' × ')} : variantes de taux${nGeo ? ` (${nCat} du catalogue, ${nGeo} couplages géodésiques)` : ' du catalogue'}, Mmax, loi d'atténuation. Courbes calculées en ${milliers(etat.duree)} ms.`;
    const g = etat.r.geo;
    $('#al-geo-source').textContent = `Moments géodésiques : zone A ${sci(g.moments[0])}, zone B ${sci(g.moments[1])} N·m/an (${g.source}).`;
  }
  const exposant = n => String(n).split('').map(c => SUP[c]).join('');
  function majControles() {
    const r = etat.r, z = r.zones[etat.zone], zm = enZones() ? etat.zm : null;
    $('#al-vs30').value = r.site.vs30; $('#al-vs30-v').textContent = `${milliers(r.site.vs30)} m/s · sol ${classeSol(r.site.vs30)}`;
    $$('[data-al-zone]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.alZone === etat.zone)));
    // bornes des curseurs : celles du modèle d'école, ou autour des valeurs du fichier pour une zone réelle (λ de ÷ 10 à
    // × 10, b ± 0,3, Mmax d'au moins Mmin du calcul + 0,5 à 8 au moins)
    const q = zm ? zm.modele.zones[etat.zone] : null, mmin = q ? Math.max(q.mc, Zones.MMIN_CALCUL) : 0;
    const bornes = q ? [[Math.log10(q.lam) - 1, Math.log10(q.lam) + 1], [Math.round(Math.min(0.7, q.b - 0.3) * 100) / 100, Math.round(Math.max(1.3, q.b + 0.3) * 100) / 100],
      [Math.min(q.mmax, Math.ceil((mmin + 0.5) * 10 - 1e-9) / 10), Math.max(8, q.mmax)]] : [[-1.5, 0.6], [0.7, 1.3], [5.5, 7.6]];
    ['#al-lam', '#al-b', '#al-mmax'].forEach((id, i) => { $(id).min = bornes[i][0]; $(id).max = bornes[i][1]; });
    $('#al-lam-lib').textContent = q ? `Taux annuel λ(M ≥ ${virg(q.mc, 1)})` : 'Taux annuel λ(M ≥ 4)';
    $('#al-lam').value = Math.log10(z.lam); $('#al-lam-v').textContent = (q ? tauxTexte(z.lam) : virg(z.lam, 2)) + ' /an';
    $('#al-b').value = z.b; $('#al-b-v').textContent = virg(z.b, 2);
    $('#al-mmax').value = z.mmax; $('#al-mmax-v').textContent = virg(z.mmax, 1);
    $('#al-inc-ab').disabled = !!zm && !zm.abPossible; $('#al-ab-info').hidden = !zm || zm.abPossible;
    if (q) {
      $('#al-zone-stats').textContent = `${q.nom} : ${q.n ?? '—'} séismes de M ≥ ${virg(q.mc, 1)} au catalogue ; fichier : λ ${tauxTexte(q.lam)} /an, b ${virg(q.b, 2)} ± ${virg(q.sigmaB, 2)}`
        + `${q.bPropre ? '' : ' (b régional)'}, Mmax ${virg(q.mmax, 1)}${q.mmaxObs !== null ? ` (observée ${virg(q.mmaxObs, 1)})` : ''} ; foyers à ${virg(q.profondeur, 0)} km, rake ${virg(q.rake, 0)}° ; séismes calculés de M ${virg(mmin, 1)} à Mmax.`;
      $('#al-site-geo').textContent = `Site : ${latLon(r.site.lat, r.site.lon)}. Un clic sur la carte le déplace.`;
      $('#al-ab-info').textContent = zm.nSigma === 0 ? 'σ(b) nul dans toutes les zones : une seule branche (a, b) par zone.'
        : `${zm.nSigma} zones à σ(b) > 0 : 3${exposant(zm.nSigma)} = ${milliers(3 ** zm.nSigma)} variantes (a, b), ${milliers(9 * 3 ** zm.nSigma)} réalisations ; l'énumération complète s'arrête à quatre zones, chaque zone garde son b central.`;
    }
    $('#al-inc-ab').checked = r.incAB && (!zm || zm.abPossible); $('#al-inc-mmax').checked = r.incMmax; $('#al-inc-geo').checked = r.geo.actif;
    $('#al-poids-geo').value = r.geo.poids; $('#al-poids-geo-v').textContent = `${virg(r.geo.poids, 2)} / ${virg(1 - r.geo.poids, 2)}`;
    const sansGeo = !!zm && !(momentsGeo(zm) || []).some(Number.isFinite);
    $('#al-inc-geo').disabled = sansGeo; $('#al-poids-geo').disabled = !r.geo.actif || sansGeo;
    if (sansGeo) $('#al-inc-geo').checked = false;
    if (zm) majPanneauxReels();
    $('#al-faille').checked = r.faille.actif; $('#al-glissement').value = r.faille.glissement; $('#al-glissement').disabled = !r.faille.actif;
    const mF = Psha.momentFaille(BASE, { ...BASE.failles[0], glissement: r.faille.glissement });
    $('#al-glissement-v').textContent = `${virg(r.faille.glissement, 2)} mm/an · Ṁ0 ${sci(mF)} N·m/an`;
    $$('[data-al-loi]').forEach(c => { c.checked = r.lois[c.dataset.alLoi]; });
    const nL = Object.values(r.lois).filter(Boolean).length;
    $('#al-lois-v').textContent = nL > 1 ? `${nL} lois, poids 1/${nL} chacune` : 'une seule loi : pas d\'incertitude épistémique sur le mouvement du sol';
    $$('[data-al-proba]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.alProba === etat.proba.join('|'))));
    $$('[data-al-imt]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.alImt === etat.k)));
  }
  // Panneaux « Failles actives » et « Géodésie » du mode « Zones du catalogue »
  let AIDE_GNSS = '';
  const sciTxt = x => (Number.isFinite(x) && x > 0 ? sci(x) : '—');
  function majPanneauxReels() {
    const zm = etat.zm, r = etat.r, m = zm.modele, F = reel.failles, fz = zm.failles;
    // failles
    $('#al-failles-reel').checked = r.failles.actif; $('#al-failles-reel').disabled = !fz || !fz.retenues.length;
    $('#al-glissement-defaut').value = r.failles.glissementDefaut;
    $('#al-glissement-defaut-v').textContent = r.failles.glissementDefaut > 0 ? `${virg(r.failles.glissementDefaut, 2)} mm/an` : '0 : ces failles sont écartées';
    if (!F) {
      $('#al-failles-info').textContent = reel.erreurFailles ? `Failles indisponibles : ${reel.erreurFailles}.` : 'Lecture de l\'extrait de la base GEM…';
      $('#al-failles-table').innerHTML = '';
    } else {
      const e = fz.ecartees, n = fz.retenues.length, nomZ = i => m.zones[i].nom;
      const dMin = r.incMmax ? Math.min(...BASE.dMmax.map(d => d.d)) : 0, sansEffet = fz.retenues.filter(f => f.mmax <= r.zones[f.zone].mmax + dMin + 1e-9).length;
      const ecarts = [e.horsZones && `${milliers(e.horsZones)} hors des zones`, e.sansVitesse && `${milliers(e.sansVitesse)} sans vitesse de glissement`,
        e.tropCourtes && `${milliers(e.tropCourtes)} de moins de 5 km`].filter(Boolean);
      $('#al-failles-info').textContent = (n ? `${n} faille${n > 1 ? 's' : ''} retenue${n > 1 ? 's' : ''} dans les zones` : 'Aucune faille retenue dans les zones')
        + ` sur ${milliers(F.failles.length)} du jeu${ecarts.length ? ` ; écartées : ${ecarts.join(', ')}` : ''}.`
        + (sansEffet ? ` ${sansEffet} n'agi${sansEffet > 1 ? 'ssent' : 't'} dans aucune branche (Mmax de la faille au plus Mmax de sa zone${dMin ? ` − ${virg(-dMin, 1)}` : ''}) : hors du calcul.` : '')
        + (n && zm.maillage ? ` Traces ramenées à la droite de leurs extrémités, maillées tous les ${zm.maillage.pas} km (${milliers(zm.maillage.n)} ruptures flottantes).` : '')
        + (!n && F.defaut ? ' L\'extrait livré ne couvre que la Méditerranée : pour une autre région, chargez le GeoJSON de la base GEM.' : '');
      const moment = f => 3e10 * f.L * 1e3 * f.W * 1e3 * f.glissement * 1e-3, tri = fz.retenues.slice().sort((a, b) => moment(b) - moment(a)), N = 10;
      $('#al-failles-table').innerHTML = n ? `<div class="table-defile"><table class="resultats"><thead><tr><th>Faille</th><th>Zone</th><th>L km</th><th>s mm/an</th><th>Mmax</th></tr></thead><tbody>${
        tri.slice(0, N).map(f => `<tr><td>${echapper(f.nom)}${f.defauts.length ? '<sup>*</sup>' : ''}</td><td>${echapper(nomZ(f.zone))}</td><td class="n">${virg(f.L, 0)}</td>`
          + `<td class="n">${virg(f.glissement, 2)}</td><td class="n">${virg(f.mmax, 1)}</td></tr>`).join('')}</tbody></table></div>`
        + `<p class="aide" style="margin:0">${n > N ? `Les ${N} plus grands taux de moment μ·L·W·s sur ${n}. ` : ''}* valeurs par défaut du type de glissement (pendage, rake, profondeurs 0–15 km ou vitesse).</p>` : '';
    }
    $('#al-failles-source').textContent = !F ? '' : F.defaut
      ? 'Base GEM des failles actives (Styron et Pagani, 2020), extrait méditerranéen, licence CC BY-SA 4.0. Pour une autre région : GeoJSON gem_active_faults_harmonized.geojson du dépôt GEMScienceTools/gem-global-active-faults.'
      : `Fichier « ${F.nom} » : ${milliers(F.failles.length)} failles lues${F.ecartees.type + F.ecartees.plaques ? ` (${milliers(F.ecartees.type + F.ecartees.plaques)} écartées : frontières de plaques, subductions, plis ou type absent)` : ''}.`;
    // GNSS
    const G = reel.gnss, gz = zm.gnss;
    $('#al-gnss-marge').value = r.geo.marge; $('#al-gnss-marge-v').textContent = r.geo.marge ? `zone et ${r.geo.marge} km autour` : 'dans la zone';
    if (!G) { $('#al-gnss-info').textContent = AIDE_GNSS; $('#al-gnss-table').innerHTML = ''; $('#al-geo-source').textContent = 'Chargez un champ de vitesses GNSS pour ajouter le modèle géodésique à l\'arbre.'; return; }
    $('#al-gnss-info').textContent = `Fichier « ${G.nom} » (${G.format === 'psvelo' ? 'psvelo' : 'tableau'}, ${G.unite}) : ${milliers(G.stations.length)} stations${G.rejetees ? `, ${milliers(G.rejetees)} lignes rejetées` : ''}. `
      + 'Déformation uniforme de chaque zone par moindres carrés, moment de Kostrov (μ = 30 GPa, H = 15 km).';
    $('#al-gnss-table').innerHTML = `<div class="table-defile"><table class="resultats"><thead><tr><th>Zone</th><th>N</th><th>ε̇1h · ε̇2h</th><th>Ṁ0 géod.</th><th>Ṁ0 cat.</th><th>cat./géod.</th></tr></thead><tbody>${
      m.zones.map((q, i) => {
        const t = gz.zones[i], mc = Gnss.momentCatalogue({ ...q, ...r.zones[i] });
        return `<tr><td>${echapper(q.nom)}</td><td class="n">${t.n}</td><td class="n">${t.principales ? `${virg(t.principales.e1h, 0)} · ${virg(t.principales.e2h, 0)}` : `<small>${echapper(t.raison)}</small>`}</td>`
          + `<td class="n">${sciTxt(t.moment)}</td><td class="n">${sciTxt(mc)}</td><td class="n">${t.moment > 0 ? virg(mc / t.moment, 2) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="aide" style="margin:0">N : stations retenues ; ε̇1h et ε̇2h : taux de déformation principaux (ns/an, négatif en raccourcissement) ;
      Ṁ0 en N·m/an, du catalogue pour la loi de la zone de max(Mc ; 4) à Mmax. Leur rapport est le couplage apparent : faible, il signale un moment
      que le catalogue ne voit pas (grands séismes rares, failles) ou une déformation asismique.</p>`;
    const sans = gz.zones.filter(t => !Number.isFinite(t.moment)).length;
    $('#al-geo-source').textContent = sans === gz.zones.length ? 'Aucune zone n\'a assez de stations (trois au moins) : élargissez la marge.'
      : `Moments géodésiques des zones : ${m.zones.map((q, i) => `${q.nom} ${sciTxt(gz.zones[i].moment)}`).join(', ')} N·m/an.`
        + (sans ? ` ${sans} zone${sans > 1 ? 's' : ''} sans tenseur garde${sans > 1 ? 'nt' : ''} la loi du catalogue dans les variantes géodésiques.` : '');
  }
  // Légende de la carte des zones réelles : zones, failles et vitesses GNSS quand elles sont chargées
  function majLegendeZones() {
    const zm = etat.zm, coul = i => `var(--${PALETTE_ZONES[i % PALETTE_ZONES.length]})`;
    const h = zm.modele.zones.map((q, i) => `<span><i style="background:${coul(i)}"></i>${echapper(q.nom)}</span>`).join('')
      + (zm.traces ? '<span><i style="background:var(--ink)"></i>failles actives (trait épais : dans le calcul)</span>' : '')
      + (zm.gnss ? '<span><i style="background:var(--blue)"></i>vitesses GNSS (moyenne retirée), axes de la déformation</span>' : '');
    if (h !== etat.legendeZones) { etat.legendeZones = h; $('#al-legende-sources').innerHTML = h; }
  }
  // Vue selon le mode : panneaux, réglages sans objet (faille et géodésie pour des zones réelles), sélecteur de zones,
  // légende et titre de la carte. Les libellés du modèle d'école sont ceux de la page (lus par brancher).
  let ECOLE = null;
  function majVue() {
    const z = enZones(), zm = z ? etat.zm : null;
    $('#banc-alea').classList.toggle('sans-zones', z && !zm);
    for (const id of ['explorer', 'exercice', 'zones']) $(`#al-mode-${id}`).setAttribute('aria-pressed', String(etat.mode === id));
    $('#al-panneau-explorer').hidden = etat.mode === 'exercice';
    $('#al-panneau-exercice').hidden = etat.mode !== 'exercice';
    $('#al-panneau-zones').hidden = !z;
    $('#al-bloc-faille').hidden = z;
    for (const id of ['#al-site-geo', '#al-zone-stats', '#al-bloc-failles-reel', '#al-bloc-gnss']) $(id).hidden = !z;
    if (zm) majLegendeZones();
    $('#al-zones-vide').hidden = !!zm;
    $('#al-defaut').textContent = z ? 'Revenir aux valeurs du catalogue' : 'Revenir au modèle d\'école';
    if (etat.vue === (zm || 'ecole')) return;
    etat.vue = zm || 'ecole';
    const R = cercles();
    $('#al-legende-cercles').textContent = `${R.slice(0, -1).join(', ')} et ${R[R.length - 1]} km du site${R.includes(300) ? ' (portée du calcul)' : ''}`;
    if (!zm) {
      $('#al-zones-choix').innerHTML = ECOLE.choix; $('#al-legende-sources').innerHTML = ECOLE.legende;
      $('#al-carte-titre').textContent = ECOLE.titre; $('#al-carte-aide').textContent = ECOLE.aide; $('#al-zones-resume').innerHTML = '';
      return;
    }
    const m = zm.modele, coul = i => `var(--${PALETTE_ZONES[i % PALETTE_ZONES.length]})`;
    $('#al-zones-choix').innerHTML = m.zones.map((q, i) => `<button type="button" data-al-zone="${i}">${echapper(q.nom)}</button>`).join('');
    etat.legendeZones = null; majLegendeZones();
    $('#al-carte-titre').textContent = `Zones discrétisées en points tous les ${zm.pas} km (${milliers(zm.n)} points) ; un clic déplace le site`;
    $('#al-carte-aide').textContent = `niveau moyen de la grandeur choisie à la probabilité visée, tous les ${zm.grille.pas} km (${milliers(zm.grille.sites.length)} sites)`;
    // ce qu'est le modèle : catalogue, période, Mc, nombre de zones, b régional, puis les zones une à une
    const s = m.source || {}, fini = Number.isFinite, an = x => String(Math.floor(x + 1e-6)), duree = fini(s.debut) && fini(s.fin) ? s.fin - s.debut : null;
    const lignes = m.zones.map((q, i) => `<tr><td><i style="background:${coul(i)}"></i>${echapper(q.nom)}</td><td class="n">${q.n ?? '—'}</td><td class="n">${tauxTexte(q.lam)}</td>`
      + `<td class="n">${virg(q.b, 2)}${q.bPropre ? '' : '*'}</td><td class="n">${virg(q.mmax, 1)}${q.mmaxObs !== null ? ` <small>(${virg(q.mmaxObs, 1)})</small>` : ''}</td></tr>`).join('');
    $('#al-zones-resume').innerHTML = `<p class="aide" style="margin:0 0 8px">Catalogue : <b>${echapper(s.catalogue || 'sans nom')}</b>. Site du fichier : ${latLon(m.site.lat, m.site.lon)}, Vs30 ${milliers(m.site.vs30)} m/s.</p>
      <div class="afficheurs deux">${[
        afficheur('Zones', String(m.zones.length), `${milliers(zm.n)} points, pas ${zm.pas} km`),
        afficheur('Période', duree !== null ? `${an(s.debut)}–${an(s.fin)}` : '—', duree !== null ? `${virg(duree, duree < 15 ? 1 : 0)} ans` : ''),
        afficheur('Mc', fini(s.mc) ? virg(s.mc, 1) : '—', 'complétude du catalogue'),
        afficheur('b régional', fini(s.b) ? virg(s.b, 2) : '—', fini(s.sigmaB) ? `σ = ${virg(s.sigmaB, 2)}` : ''),
      ].join('')}</div>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Zone</th><th>N</th><th>λ /an</th><th>b</th><th>Mmax (obs.)</th></tr></thead><tbody>${lignes}</tbody></table></div>
      <p class="aide" style="margin:0">N : séismes déclusterés de M ≥ Mc dans la zone ; λ : leur taux annuel${m.zones.some(q => !q.bPropre) ? ' ; * b régional (trop peu de séismes pour un b propre)' : ''}.</p>`;
  }
  const CANEVAS = ['#al-carte', '#al-courbe', '#al-uhs', '#al-cms', '#al-desag', '#al-tornade'];
  function effacer() { lireCouleurs(); for (const id of CANEVAS) if ($(id).clientWidth >= 50) preparer($(id)); }
  function dessiner() { lireCouleurs(); dessinerCarte(); dessinerCourbe(); dessinerUHS(); dessinerCMS(); dessinerDesag(); dessinerTornade(); }
  function tout() {
    majVue();
    if (enZones() && (!etat.zm || !etat.res)) { if (etat.zm) majControles(); return; }
    majControles(); dessiner(); majAfficheurs();
  }
  function recalculerMaintenant() {
    const t0 = performance.now();
    calculer();
    etat.duree = performance.now() - t0;
    tout();
  }
  // Mode « Zones du catalogue » : un calcul dure une à deux secondes ; il part après un rafraîchissement de l'écran, qui
  // montre le témoin « Calcul de l'aléa… » et grise les graphiques. Seul le dernier demandé s'exécute ; un calcul en
  // attente refait aussi l'analyse (grandeur, probabilité).
  let tache = 0, enAttente = null, attente = 0;
  function occupe(oui) { $('#banc-alea').classList.toggle('al-calcul', oui); $('#al-etat').hidden = !oui; }
  function annulerCalcul() { tache++; enAttente = null; clearTimeout(attente); occupe(false); }
  function plusTard(genre) {
    if (genre === 'analyse' && enAttente === 'calcul') return;
    const j = ++tache;
    enAttente = genre; occupe(true);
    setTimeout(() => {
      if (j !== tache) return;
      enAttente = null;
      try {
        if (genre === 'calcul') recalculerMaintenant(); else { analyser(); tout(); }
        if (etat.erreur) { etat.erreur = false; $('#al-zones-info').textContent = ''; }
      } catch (err) {
        etat.res = null; etat.erreur = true; arreterCarte(); effacer();
        $('#al-zones-info').textContent = `Calcul impossible : ${err.message || err}.`;
        tout();
      }
      occupe(false);
    }, 40);
  }
  function recalculer() {
    if (!enZones()) { recalculerMaintenant(); return; }
    if (etat.zm) plusTard('calcul');
  }
  function reanalyser() {
    if (!enZones()) { analyser(); tout(); }
    else if (etat.res) plusTard('analyse');
    else tout();
  }
  // Lit le modèle publié (src/zones-reel.js) et repart de ses valeurs ; sans modèle, le banc n'affiche que l'explication
  // et le chargement d'un fichier.
  function lireZones() {
    const m = ZonesReel.courant();
    etat.zonesVersion = ZonesReel.version();
    annulerCalcul(); arreterCarte();
    const zm = etat.zm = m ? preparerZones(m) : null;
    etat.res = null; etat.modele = null; etat.zone = 0;
    if (!zm) { effacer(); tout(); return; }
    etat.r = reglagesZones();
    majFaillesZones(); majGnssZones();
    effacer(); tout();
    // premier calcul quand l'extrait des failles est lu (sans lui s'il est introuvable)
    if (reel.failles) { recalculer(); return; }
    occupe(true);
    chargerFaillesDefaut().then(() => {
      if (etat.zm !== zm || !enZones()) return;
      majFaillesZones(); tout(); recalculer();
    });
  }

  // ── Exercice ────────────────────────────────────────────────────────────
  function nouvelExercice() {
    const numero = 1000 + Math.floor(Math.random() * 9000), u = SM.aleatoire(numero * 7919 + 3);
    etat.exo = { numero };
    etat.r = {
      site: { x: Math.round(u.entre(-40, 85) / 5) * 5, y: Math.round(u.entre(-40, 40) / 5) * 5, vs30: 800 },
      zones: [
        { lam: Math.round(u.entre(0.1, 0.5) * 100) / 100, b: Math.round(u.entre(0.9, 1.1) * 100) / 100, mmax: Math.round(u.entre(6, 6.8) * 10) / 10 },
        { lam: Math.round(u.entre(0.6, 3) * 10) / 10, b: Math.round(u.entre(0.8, 1) * 100) / 100, mmax: Math.round(u.entre(7, 7.6) * 10) / 10 },
      ],
      incAB: true, incMmax: true, lois: reglagesDefaut().lois, geo: { ...reglagesDefaut().geo, actif: false }, faille: { ...reglagesDefaut().faille, actif: false },
    };
    etat.proba = [0.1, 50]; etat.verifie = false; etat.dom = null;
    $('#al-exo-num').textContent = 'Exercice n° ' + numero;
    $('#al-r-pga').value = ''; $('#al-r-sa1').value = '';
    $$('[data-al-dom]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#al-corrige').innerHTML = '';
    recalculer();
  }
  function verifier() {
    const P = Psha.niveauPourProba, res = etat.res, poe = 1 - Math.exp(-BASE.dureeVie / Psha.periodeRetour(0.1, 50));
    const pga = P(res.niveaux, res.moyenne[K_PGA], poe), sa1 = P(res.niveaux, res.moyenne[K_SA1], poe);
    const zones = Psha.desagregation(etat.modele, 1, sa1).zones, dom = zones[0] >= zones[1] ? 0 : 1;
    const lu = id => parseFloat(String($(id).value).replace(',', '.'));
    const vPga = lu('#al-r-pga'), vSa1 = lu('#al-r-sa1');
    const okP = Math.abs(vPga / pga - 1) <= 0.1, okS = Math.abs(vSa1 / sa1 - 1) <= 0.1, okD = etat.dom === dom;
    etat.verifie = true;
    const nomZone = i => (i === null ? '—' : etat.modele.zones[i].nom);
    const lignes = [
      ['PGA à 475 ans', Number.isFinite(vPga) ? g3(vPga) + ' g' : '—', g3(pga) + ' g', okP, '± 10 %, sur la courbe moyenne'],
      ['Sa(1 s) à 475 ans', Number.isFinite(vSa1) ? g3(vSa1) + ' g' : '—', g3(sa1) + ' g', okS, '± 10 %, sur l\'UHS moyen'],
      ['Zone qui domine Sa(1 s)', nomZone(etat.dom), `${nomZone(dom)} (${virg(100 * zones[dom], 0)} %)`, okD, 'désagrégation du taux de dépassement'],
    ];
    $('#al-corrige').innerHTML = `<div class="separateur"></div><p class="sous-titre">Corrigé</p>
      <div class="table-defile"><table class="resultats"><thead><tr><th>Lecture</th><th>Vous</th><th>Moteur</th></tr></thead><tbody>
      ${lignes.map(([n, a, b, ok, tol]) => `<tr class="${ok ? 'ok' : 'ko'}"><td><span class="verdict ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${n}<br><small style="color:var(--muted)">${tol}</small></td><td class="n">${a}</td><td class="n">${b}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="score">${lignes.filter(l => l[3]).length} / 3 justes</p>
      <p class="verite">Aux courtes périodes, les petits séismes proches suffisent ; à 1 s, seuls les grands séismes rayonnent assez d'énergie en
      longue période, et ils sont plus fréquents dans la zone la plus active même si elle est plus loin. Choisissez la grandeur Sa(1 s), sous la probabilité visée, pour le voir.</p>`;
    tout();
  }

  // ── Événements ──────────────────────────────────────────────────────────
  const planifier = () => {
    clearTimeout(attente);
    if (enZones()) occupe(true);
    attente = setTimeout(recalculer, enZones() ? 350 : 120);
  };
  function brancher() {
    ECOLE = { choix: $('#al-zones-choix').innerHTML, legende: $('#al-legende-sources').innerHTML, titre: $('#al-carte-titre').textContent, aide: $('#al-carte-aide').textContent };
    $('#al-imts').innerHTML = CHOIX_IMTS.map(k => `<button type="button" data-al-imt="${k}">${nomImt(k)}</button>`).join('');
    $$('[data-al-imt]').forEach(b => b.addEventListener('click', () => { etat.k = +b.dataset.alImt; reanalyser(); }));
    $$('[data-al-proba]').forEach(b => b.addEventListener('click', () => { etat.proba = b.dataset.alProba.split('|').map(Number); reanalyser(); }));
    // boutons des zones : ceux du modèle d'école, ou un par zone réelle (recréés à chaque modèle)
    $('#al-zones-choix').addEventListener('click', e => { const b = e.target.closest('[data-al-zone]'); if (b) { etat.zone = +b.dataset.alZone; majControles(); } });
    $('#al-vs30').addEventListener('input', e => { etat.r.site.vs30 = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-lam').addEventListener('input', e => {
      const lam = Math.pow(10, parseFloat(e.target.value));
      etat.r.zones[etat.zone].lam = enZones() ? Number(lam.toPrecision(3)) : Math.round(lam * 100) / 100;
      majControles(); planifier();
    });
    $('#al-b').addEventListener('input', e => { etat.r.zones[etat.zone].b = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-mmax').addEventListener('input', e => { etat.r.zones[etat.zone].mmax = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-carte-alea').addEventListener('click', lancerCarte);
    $('#al-inc-ab').addEventListener('change', e => { etat.r.incAB = e.target.checked; recalculer(); });
    $('#al-inc-mmax').addEventListener('change', e => { etat.r.incMmax = e.target.checked; recalculer(); });
    $('#al-inc-geo').addEventListener('change', e => { etat.r.geo.actif = e.target.checked; recalculer(); });
    $('#al-faille').addEventListener('change', e => { etat.r.faille.actif = e.target.checked; recalculer(); });
    $('#al-glissement').addEventListener('input', e => { etat.r.faille.glissement = parseFloat(e.target.value); majControles(); planifier(); });
    $('#al-poids-geo').addEventListener('input', e => { etat.r.geo.poids = parseFloat(e.target.value); majControles(); planifier(); });
    $$('[data-al-loi]').forEach(c => c.addEventListener('change', () => {
      etat.r.lois[c.dataset.alLoi] = c.checked;
      if (!Object.values(etat.r.lois).some(Boolean)) { etat.r.lois[c.dataset.alLoi] = true; c.checked = true; return; } // au moins une loi
      recalculer();
    }));
    $('#al-defaut').addEventListener('click', () => {
      if (enZones()) { if (etat.zm) { etat.r = reglagesZones(); majFaillesZones(); majGnssZones(); recalculer(); } return; }
      etat.r = reglagesDefaut(); etat.geoRecu = null; recalculer();
    });
    $$('[data-al-dom]').forEach(b => b.addEventListener('click', () => { etat.dom = +b.dataset.alDom; $$('[data-al-dom]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $('#al-mode-explorer').addEventListener('click', () => changerMode('explorer'));
    $('#al-mode-exercice').addEventListener('click', () => changerMode('exercice'));
    $('#al-mode-zones').addEventListener('click', () => changerMode('zones'));
    $('#al-verifier').addEventListener('click', verifier);
    $('#al-nouvel-exo').addEventListener('click', nouvelExercice);
    // Fichier de zones (format « sismo-zones ») : validé, publié comme le ferait le banc « sismicité », puis calculé
    $('#al-zones-fichier').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0], info = $('#al-zones-info');
      e.target.value = '';
      if (!f) return;
      try {
        if (f.size > 20 * 1024 * 1024) throw new Error('fichier trop gros (20 Mo au plus)');
        const texte = await f.text();
        Zones.lire(texte); // erreur lisible si le fichier n'est pas un modèle de zones valable
        ZonesReel.publier(texte);
        info.textContent = `Fichier « ${f.name} » chargé.`;
        window.dispatchEvent(new CustomEvent('alea:zones', { detail: { source: 'fichier' } }));
      } catch (err) {
        info.textContent = `Fichier refusé : ${err.message || err}.`;
      }
    });
    // Failles et géodésie du mode « Zones du catalogue »
    AIDE_GNSS = $('#al-gnss-info').textContent.replace(/\s+/g, ' ').trim();
    $('#al-failles-reel').addEventListener('change', e => { etat.r.failles.actif = e.target.checked; recalculer(); });
    $('#al-glissement-defaut').addEventListener('input', e => {
      etat.r.failles.glissementDefaut = parseFloat(e.target.value);
      majFaillesZones(); majControles(); dessinerCarte(); planifier();
    });
    $('#al-gnss-marge').addEventListener('input', e => {
      etat.r.geo.marge = parseFloat(e.target.value);
      majGnssZones(); majControles(); dessinerCarte(); planifier();
    });
    const lireFichier = async (e, taille, lecture, apres) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        if (f.size > taille * 1024 * 1024) throw new Error(`fichier trop gros (${taille} Mo au plus)`);
        lecture(await f.text(), f.name);
        apres(null);
      } catch (err) { apres(err); }
    };
    $('#al-failles-fichier').addEventListener('change', e => lireFichier(e, 40, (t, nom) => { reel.failles = { ...Failles.lire(t), nom }; reel.erreurFailles = null; }, err => {
      if (err) { $('#al-failles-info').textContent = `Fichier de failles refusé : ${err.message || err}.`; return; }
      if (!etat.zm) return;
      etat.r.failles.actif = true; majFaillesZones(); etat.legendeZones = null; tout(); recalculer();
    }));
    $('#al-gnss-fichier').addEventListener('change', e => lireFichier(e, 20, (t, nom) => { reel.gnss = { ...Gnss.lire(t), nom }; }, err => {
      if (err) { $('#al-gnss-info').textContent = `Fichier de vitesses refusé : ${err.message || err}.`; return; }
      if (!etat.zm) return;
      etat.r.geo.actif = true; majGnssZones(); tout(); recalculer();
    }));
    // Carte : un clic déplace le site (pas de 5 km ; zones réelles : au centième de degré) ; le survol donne la position
    // et les distances aux zones
    const cv = $('#al-carte');
    const position = e => { const g = geoCarte(cv); return { x: g.x(e.offsetX), y: g.y(e.offsetY) }; };
    cv.addEventListener('click', e => {
      if (etat.mode === 'exercice') return;
      const p = position(e);
      if (enZones()) {
        const zm = etat.zm;
        if (!zm) return;
        const [lon, lat] = zm.pr.versGeo([p.x, p.y]), la = Math.round(lat * 100) / 100, lo = Math.round(lon * 100) / 100, [x, y] = zm.pr.versKm([lo, la]);
        etat.r.site = { ...etat.r.site, lat: la, lon: lo, x, y };
        majControles(); dessinerCarte(); recalculer();
        return;
      }
      if (p.x < DOMAINE.x0 || p.x > DOMAINE.x1 || p.y < DOMAINE.y0 || p.y > DOMAINE.y1) return;
      etat.r.site.x = Math.round(p.x / 5) * 5; etat.r.site.y = Math.round(p.y / 5) * 5;
      recalculer();
    });
    cv.addEventListener('pointermove', e => {
      const p = position(e);
      if (enZones()) {
        const zm = etat.zm;
        if (!zm) return;
        const [lon, lat] = zm.pr.versGeo([p.x, p.y]);
        const dz = zm.points.map((pts, i) => `${zm.modele.zones[i].nom} ${virg(Math.min(...pts.map(q => Math.hypot(q.x - p.x, q.y - p.y))), 0)} km`);
        $('#al-curseur').textContent = `${latLon(lat, lon)} · ${objetProche(p) || `point le plus proche : ${dz.join(', ')}`} — cliquer pour y placer le site`;
        return;
      }
      if (p.x < DOMAINE.x0 || p.x > DOMAINE.x1 || p.y < DOMAINE.y0 || p.y > DOMAINE.y1) { $('#al-curseur').textContent = '—'; return; }
      const dz = etat.modele.zones.map(z => Math.min(...z.points.map(q => Math.hypot(q.x - p.x, q.y - p.y))));
      $('#al-curseur').textContent = `x ${virg(p.x, 0)} km, y ${virg(p.y, 0)} km · point le plus proche : zone A ${virg(dz[0], 0)} km, zone B ${virg(dz[1], 0)} km`
        + (etat.mode === 'exercice' ? '' : ' — cliquer pour y placer le site');
    });
    const redessiner = () => { if (etat.res && !$('#banc-alea').hidden) dessiner(); };
    const ro = new ResizeObserver(redessiner);
    for (const id of CANEVAS) ro.observe($(id));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redessiner);
    new MutationObserver(redessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  // Faille retenue ou station GNSS sous le pointeur (à 8 px près) : son nom et ses valeurs
  function objetProche(p) {
    const zm = etat.zm, g = geoCarte($('#al-carte')), tol = 8 / g.s;
    let best = null, dmin = tol;
    if (zm.gnss) for (const a of zm.gnss.fleches) { const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < dmin) { dmin = d; best = `station ${a.id} : ${virg(a.e, 1)} mm/an vers l'est, ${virg(a.n, 1)} vers le nord`; } }
    if (best) return best;
    if (zm.traces && zm.failles) for (const t of zm.traces) {
      const f = zm.failles.parIndice.get(t.i);
      if (!f) continue;
      for (let k = 2; k < t.xy.length; k += 2) {
        const ax = t.xy[k - 2], ay = t.xy[k - 1], vx = t.xy[k] - ax, vy = t.xy[k + 1] - ay, l2 = vx * vx + vy * vy;
        const u = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / l2)) : 0, d = Math.hypot(p.x - ax - u * vx, p.y - ay - u * vy);
        if (d < dmin) { dmin = d; best = `faille ${f.nom} (${zm.modele.zones[f.zone].nom}) : ${Failles.TYPES[f.type].nom}, pendage ${virg(f.pendage, 0)}°, ${virg(f.glissement, 2)} mm/an, Mmax ${virg(f.mmax, 1)}`; }
      }
    }
    return best;
  }
  // Explorer, Exercice ou Zones du catalogue. Les réglages d'Explorer sont mis de côté en le quittant et retrouvés au
  // retour des zones réelles ; au retour d'un exercice, le modèle d'école repart de ses valeurs (comme avant).
  function changerMode(m) {
    if (etat.mode === m) return;
    const avant = etat.mode;
    if (avant === 'explorer') etat.sauvegarde = { r: etat.r, zone: etat.zone };
    if (avant === 'zones') { annulerCalcul(); etat.zone = etat.sauvegarde ? etat.sauvegarde.zone : 0; }
    etat.mode = m;
    arreterCarte();
    majVue();
    if (m === 'exercice') nouvelExercice();
    else if (m === 'zones') lireZones();
    else {
      if (avant === 'zones' && etat.sauvegarde) etat.r = etat.sauvegarde.r;
      else { etat.r = reglagesDefaut(); if (etat.geoRecu) etat.r.geo = etat.geoRecu; }
      etat.verifie = false; recalculer();
    }
  }

  // Moments estimés au banc « géodésie » : ils remplacent ceux du modèle d'école (hors exercice).
  window.addEventListener('geodesie:moments', e => {
    etat.geoRecu = { ...reglagesDefaut().geo, moments: e.detail.moments.slice(), source: e.detail.source };
    if (etat.mode !== 'explorer') { // appliqué au retour en exploration
      if (etat.mode === 'zones' && etat.sauvegarde) etat.sauvegarde.r.geo = { ...etat.sauvegarde.r.geo, ...etat.geoRecu, actif: true, poids: etat.sauvegarde.r.geo.poids };
      return;
    }
    etat.r.geo = { ...etat.r.geo, ...etat.geoRecu, actif: true, poids: etat.r.geo.poids };
    if (etat.pret) recalculer();
  });
  // Zones publiées par le banc « sismicité » (ou un fichier) : le banc passe en mode « Zones du catalogue » et les calcule,
  // tout de suite s'il est construit, sinon à sa première ouverture.
  window.addEventListener('alea:zones', e => {
    if (!(e.detail && e.detail.source === 'fichier')) $('#al-zones-info').textContent = 'Zones reçues du banc « sismicité ».';
    if (!etat.pret) { etat.modeDepart = 'zones'; return; }
    if (!enZones()) changerMode('zones'); else lireZones();
  });
  window.addEventListener('banc:ouvert', e => {
    if (e.detail !== 'alea') return;
    if (!etat.pret) {
      etat.pret = true; brancher();
      if (etat.modeDepart === 'zones') changerMode('zones'); else recalculer();
    } else if (enZones() && ZonesReel.version() !== etat.zonesVersion) lireZones();
    else tout();
  });
})();
