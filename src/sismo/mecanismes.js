import Catalogue from './catalogue.js';
import Mecanisme from './mecanisme.js';

// src/sismo/mecanismes.js — mécanismes au foyer d'un catalogue (banc « sismicité », mode « Catalogue réel ») pour guider le
// tracé des zones sismogènes : lecture des fichiers ndk du Global CMT, du QuakeML (focalMechanism, nodalPlane1) et des
// tableaux à colonnes azimut, pendage et glissement (strike, dip, rake : CSV du bulletin de l'ISC, tableaux à en-tête lus par
// Catalogue.lire) ; régime tectonique d'après les plongements des axes P, B et T (Zoback 1992, World Stress Map) ; bilan
// des mécanismes d'une zone et mécanisme proposé pour les lois d'atténuation ; extrait compact « sismo-mecanismes » du Global
// CMT (data/mecanismes-mediterranee.json, produit par tools/gcmt/extrait.mjs) et sa sélection sur la région et la période
// d'un catalogue. Solveurs purs.
const Mecanismes = (() => {
  'use strict';
  // Régimes de Zoback (1992) et mécanisme retenu pour les lois d'atténuation (normale, inverse, décrochement).
  const REGIMES = {
    NF: { nom: 'faille normale', type: 'normale' }, NS: { nom: 'normale à composante décrochante', type: 'normale' },
    SS: { nom: 'décrochement', type: 'decrochement' }, TS: { nom: 'inverse à composante décrochante', type: 'inverse' },
    TF: { nom: 'faille inverse', type: 'inverse' }, U: { nom: 'indéterminé', type: null },
  };
  const RAKE = { normale: -90, inverse: 90, decrochement: 0 };
  const angle = (x, a, b) => Number.isFinite(x) && x >= a && x <= b;
  const normer = ({ azimut, pendage, glissement }) => ({ azimut: ((azimut % 360) + 360) % 360, pendage, glissement: ((((glissement + 180) % 360) + 360) % 360) - 180 });

  // Régime d'un mécanisme (plan nodal azimut, pendage, glissement) par les plongements de P, B (axe nul) et T.
  function regime({ azimut, pendage, glissement }) {
    const ax = Mecanisme.axes(Mecanisme.tenseur(azimut, pendage, glissement)), p = ax.P.plongement, b = ax.N.plongement, t = ax.T.plongement;
    if (p >= 52 && t <= 35) return 'NF';
    if (p >= 40 && p < 52 && t <= 20) return 'NS';
    if ((p < 40 && b >= 45 && t <= 20) || (p <= 20 && b >= 45 && t < 40)) return 'SS';
    if (p <= 20 && t >= 40 && t < 52) return 'TS';
    if (p <= 35 && t >= 52) return 'TF';
    return 'U';
  }

  // ── Lecture ─────────────────────────────────────────────────────────────
  // Global CMT, format ndk : cinq lignes par séisme. Ligne 1 : catalogue de l'hypocentre, date, heure, latitude, longitude,
  // profondeur, mb, Ms, région ; ligne 2 : nom du séisme ; ligne 4 : exposant du tenseur ; ligne 5 : version, valeurs et
  // axes propres, moment scalaire, deux plans nodaux. Mw = 2/3 (log10 M0 − 16,1), M0 en dyn·cm.
  function lireNdk(lignes) {
    const mecanismes = [];
    let rejetees = 0;
    for (let k = 0; k + 4 < lignes.length; k += 5) {
      const l1 = lignes[k], l2 = lignes[k + 1] || '', l4 = lignes[k + 3] || '', l5 = lignes[k + 4] || '';
      if (!l1 || !l1.trim()) continue;
      const a = l1.trim().split(/\s+/), d = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(a[1] || ''), h = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d*)?)$/.exec(a[2] || '');
      const e5 = l5.trim().split(/\s+/).map(Number), expo = Number(l4.trim().split(/\s+/)[0]);
      const lat = Number(a[3]), lon = Number(a[4]), prof = Number(a[5]), [az, pd, gl] = e5.slice(11, 14);
      if (!d || !h || !angle(lat, -90, 90) || !angle(lon, -180, 360) || !angle(az, 0, 360) || !angle(pd, 0, 90) || !angle(gl, -180, 180) || !(e5[10] > 0) || !Number.isFinite(expo)) { rejetees++; continue; }
      const t = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]) + Math.round(+h[3] * 1000);
      mecanismes.push({ t, lat, lon: lon > 180 ? lon - 360 : lon, h: Number.isFinite(prof) ? prof : null, mag: Math.round(((2 / 3) * (Math.log10(e5[10]) + expo - 16.1)) * 100) / 100, typeMag: 'Mw',
        id: (l2.trim().split(/\s+/)[0]) || '', ...normer({ azimut: az, pendage: pd, glissement: gl }) });
    }
    return { format: 'ndk', mecanismes, rejetees };
  }
  // QuakeML : pour chaque <event>, la première origine (heure, position, profondeur en m), la première magnitude et le
  // premier plan nodal du premier mécanisme. Lecture par expressions régulières (pas d'analyseur XML dans un solveur).
  function lireQuakeML(texte) {
    const mecanismes = [];
    let rejetees = 0;
    const bloc = (s, nom) => { const m = new RegExp(`<(?:\\w+:)?${nom}[\\s>][\\s\\S]*?</(?:\\w+:)?${nom}>`).exec(s); return m ? m[0] : ''; };
    const valeur = (s, nom) => { const m = new RegExp(`<(?:\\w+:)?${nom}>\\s*<(?:\\w+:)?value>\\s*([^<\\s]+)\\s*</`).exec(s); return m ? m[1] : null; };
    for (const m of texte.matchAll(/<(?:\w+:)?event[\s>][\s\S]*?<\/(?:\w+:)?event>/g)) {
      const ev = m[0], o = bloc(ev, 'origin'), mg = bloc(ev, 'magnitude'), np = bloc(bloc(ev, 'focalMechanism'), 'nodalPlane1');
      const t = Catalogue.dateHeure(valeur(o, 'time') || ''), lat = Number(valeur(o, 'latitude')), lon = Number(valeur(o, 'longitude')), prof = Number(valeur(o, 'depth'));
      const az = Number(valeur(np, 'strike')), pd = Number(valeur(np, 'dip')), gl = Number(valeur(np, 'rake'));
      if (!np || !Number.isFinite(t) || !angle(lat, -90, 90) || !angle(lon, -180, 360) || !angle(az, 0, 360) || !angle(pd, 0, 90) || !angle(gl, -180, 180)) { rejetees++; continue; }
      const id = (/publicID="([^"]+)"/.exec(ev) || [])[1] || '', type = (/<(?:\w+:)?type>\s*([^<]+?)\s*</.exec(mg) || [])[1] || '';
      mecanismes.push({ t, lat, lon: lon > 180 ? lon - 360 : lon, h: Number.isFinite(prof) ? prof / 1000 : null, mag: Number(valeur(mg, 'mag')), typeMag: type, id, ...normer({ azimut: az, pendage: pd, glissement: gl }) });
    }
    return { format: 'quakeml', mecanismes, rejetees };
  }
  // ── Extrait compact « sismo-mecanismes » ────────────────────────────────
  // Une ligne par séisme : date ISO (UTC), lat, lon, h (km), Mw, plan nodal 1 (azimut, pendage, glissement), identifiant.
  const FORMAT = 'sismo-mecanismes', VERSION = 1, COLONNES = ['date', 'lat', 'lon', 'h', 'Mw', 'azimut', 'pendage', 'glissement', 'id'];
  const DOMAINE = { lon: [-20, 50], lat: [22, 53] }; // fond « Méditerranée » des cartes, comme l'extrait des failles GEM
  const dansBornes = (lon, lat, d) => lon >= d.lon[0] && lon <= d.lon[1] && lat >= d.lat[0] && lat <= d.lat[1];
  // Extrait d'une ou plusieurs lectures ndk (catalogue complet d'abord, puis fichiers mensuels et rapides) : séismes du
  // domaine, un seul par identifiant ou par séisme (moins de 30 s et 1° d'écart : le premier lu l'emporte), dans l'ordre du temps.
  function extraire(listes, domaine = DOMAINE) {
    const gardes = [], ids = new Set();
    for (const liste of listes) for (const m of liste) {
      if (!dansBornes(m.lon, m.lat, domaine) || ids.has(m.id)) continue;
      if (gardes.some(g => Math.abs(g.t - m.t) < 30000 && Math.abs(g.lat - m.lat) < 1 && Math.abs(g.lon - m.lon) < 1)) continue;
      ids.add(m.id); gardes.push(m);
    }
    return gardes.sort((a, b) => a.t - b.t);
  }
  function ecrire({ source = {}, mecanismes }) {
    const r = x => (x === null ? null : Math.round(x * 100) / 100);
    const lignes = mecanismes.map(m => JSON.stringify([new Date(m.t).toISOString(), r(m.lat), r(m.lon), r(m.h), r(m.mag), Math.round(m.azimut), Math.round(m.pendage), Math.round(m.glissement), m.id]));
    return `{"format":${JSON.stringify(FORMAT)},"version":${VERSION},"source":${JSON.stringify(source)},"colonnes":${JSON.stringify(COLONNES)},"mecanismes":[\n${lignes.join(',\n')}\n]}`;
  }
  function lireCompact(j) {
    if (!j || j.format !== FORMAT) throw new Error(`pas un fichier « ${FORMAT} »`);
    if (j.version !== VERSION) throw new Error(`version ${j.version} du format « ${FORMAT} » inconnue (${VERSION} attendue)`);
    const mecanismes = [];
    let rejetees = 0;
    for (const l of j.mecanismes || []) {
      const [date, lat, lon, h, mag, az, pd, gl, id] = Array.isArray(l) ? l : [];
      const t = Date.parse(date);
      if (!Number.isFinite(t) || !angle(lat, -90, 90) || !angle(lon, -180, 360) || !angle(az, 0, 360) || !angle(pd, 0, 90) || !angle(gl, -180, 180)) { rejetees++; continue; }
      mecanismes.push({ t, lat, lon: lon > 180 ? lon - 360 : lon, h: Number.isFinite(h) ? h : null, mag, typeMag: 'Mw', id: String(id || ''), ...normer({ azimut: az, pendage: pd, glissement: gl }) });
    }
    return { format: FORMAT, source: j.source || {}, mecanismes: mecanismes.sort((a, b) => a.t - b.t), rejetees };
  }
  // Un catalogue est « dans le domaine » de l'extrait quand toute l'étendue de ses épicentres y tient
  // (bornes { lat: [s, n], lon: [o, e] }, longitudes de −180 à 180).
  const couvre = (bornes, domaine = DOMAINE) => !!bornes && dansBornes(bornes.lon[0], bornes.lat[0], domaine) && dansBornes(bornes.lon[1], bornes.lat[1], domaine);
  // Mécanismes de la région (cadre { lon, lat }, antiméridien compris) et de la période [debut, fin] (ms UTC) d'un catalogue.
  function selectionner(mecs, { cadre, debut = -Infinity, fin = Infinity }) {
    return mecs.filter(m => {
      const lon = Catalogue.lonDans(m.lon, cadre.lon[0]);
      return m.t >= debut && m.t <= fin && lon <= cadre.lon[1] && m.lat >= cadre.lat[0] && m.lat <= cadre.lat[1];
    });
  }

  // Fichier de mécanismes : extrait « sismo-mecanismes », QuakeML, ndk, sinon tableau à en-tête (Catalogue.lire) dont les lignes portent un plan nodal.
  // { format, mecanismes: [{ t, lat, lon, h, mag, typeMag, id, azimut, pendage, glissement }], rejetees }. Erreur lisible.
  function lire(entree) {
    let s = typeof entree === 'string' ? entree : Catalogue.texte(entree);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    if (!s.trim()) throw new Error('fichier vide');
    let r;
    if (/^\s*\{/.test(s)) {
      let j;
      try { j = JSON.parse(s); } catch (e) { throw new Error('JSON illisible'); }
      r = lireCompact(j);
    } else if (/<(?:\w+:)?(quakeml|eventParameters)[\s>]/.test(s)) r = lireQuakeML(s);
    else {
      const lignes = s.split(/\r\n|\n|\r/).filter(l => l.trim());
      if (lignes.length >= 5 && /^\S{2,5}\s+\d{4}\/\d{2}\/\d{2}\s+\d{1,2}:\d{2}:/.test(lignes[0]) && /^[A-Z]\d{6,}/.test(lignes[1].trim())) r = lireNdk(lignes);
      else {
        const lu = Catalogue.lire(s), avec = lu.evenements.filter(e => e.mec);
        if (!avec.length) throw new Error('aucun mécanisme : ni fichier ndk du Global CMT, ni QuakeML avec focalMechanism, ni colonnes azimut, pendage et glissement (strike, dip, rake)');
        r = { format: lu.format === 'tableau' ? 'tableau' : lu.format, mecanismes: avec.map(e => ({ t: e.t, lat: e.lat, lon: e.lon, h: e.h, mag: e.mag, typeMag: e.typeMag, id: e.id, ...e.mec })), rejetees: lu.rejetees + lu.evenements.length - avec.length };
      }
    }
    if (!r.mecanismes.length) throw new Error(`aucun mécanisme lisible dans ce fichier ${{ ndk: 'ndk', quakeml: 'QuakeML' }[r.format] || `« ${FORMAT} »`}`);
    r.mecanismes.sort((a, b) => a.t - b.t);
    return r;
  }

  // Bilan des mécanismes d'une zone : effectifs par mécanisme (normale, inverse, décrochement, indéterminé), mécanisme
  // dominant parmi les déterminés et son glissement pour les lois d'atténuation (−90, 90 ou 0).
  function bilan(mecs) {
    const n = { normale: 0, inverse: 0, decrochement: 0, indetermine: 0 };
    for (const m of mecs) { const t = REGIMES[m.regime || regime(m)].type; n[t || 'indetermine']++; }
    const dominant = ['inverse', 'normale', 'decrochement'].reduce((a, t) => (n[t] > (a ? n[a] : 0) ? t : a), null);
    return { n: mecs.length, parType: n, dominant, rake: dominant ? RAKE[dominant] : null };
  }

  return { REGIMES, RAKE, FORMAT, VERSION, DOMAINE, regime, lire, lireNdk, lireQuakeML, extraire, ecrire, lireCompact, couvre, selectionner, bilan };
})();
export default Mecanismes;
