import Sismicite from './sismicite.js';
import Fdsn from './fdsn.js';

// src/sismo/catalogue.js — catalogue de séismes réel, pour le banc « sismicité » (mode « Catalogue réel ») : lecture du
// format texte FDSN (fdsnws/event, champs séparés par « | » : GEOFON, EMSC, INGV, USGS…), du CSV et du GeoJSON de l'USGS
// et de tout tableau CSV, TSV ou à points-virgules dont l'en-tête nomme les colonnes, en français ou en anglais (date et
// heure ISO, ou année, mois, jour, heure, minute, seconde ; latitude ; longitude ; profondeur ; magnitude et son type ;
// virgule décimale admise avec « ; » ou la tabulation). Heures en ms UTC ; lignes illisibles comptées, tirs de carrière
// et explosions écartés. Pour l'analyse : années décimales, magnitudes ramenées aux classes de 0,1, déclusterage de
// Gardner et Knopoff sur la sphère aux conventions d'HMTK (année décimale au jour près, haversine). Cadre de la carte des
// épicentres (antiméridien compris). Requêtes du service event par le relais du site (functions/api/fdsn.js) : pages de
// 500 séismes au plus. Solveurs purs, sans DOM ni réseau.
const Catalogue = (() => {
  'use strict';
  const PAGE = 500, PAGES_MAX = 20, MAX_EVENEMENTS = 200000;
  // Centres de la liste blanche (src/sismo/centres.js) qui publient leur catalogue par le service FDSN event.
  const CENTRES_EVENT = [
    { id: 'geofon', couverture: 'monde, surtout M ≥ 4' },
    { id: 'ingv', couverture: 'Italie et Méditerranée centrale' },
    { id: 'eth', couverture: 'Suisse et Alpes' },
  ];
  const FORMATS = { fdsn: 'texte FDSN (fdsnws/event)', usgs: 'CSV de l\'USGS', geojson: 'GeoJSON (USGS, EMSC)', tableau: 'tableau à en-tête' };

  // ── Dates ───────────────────────────────────────────────────────────────
  const MARQUES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const bissextile = an => (an % 4 === 0 && an % 100 !== 0) || an % 400 === 0;
  const joursDuMois = (an, mois) => [31, bissextile(an) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
  // Instant UTC en ms (années de 0 à 99 comprises : Date.UTC les prendrait pour 1900 à 1999).
  function utc(an, mois = 1, jour = 1, h = 0, mi = 0, s = 0) {
    const d = new Date(0);
    d.setUTCFullYear(an, mois - 1, jour);
    d.setUTCHours(h, mi, 0, 0);
    return d.getTime() + s * 1000;
  }
  const valide = (an, mo, j, h, mi, s) => Number.isInteger(an) && an >= 0 && an <= 3000 && Number.isInteger(mo) && mo >= 1 && mo <= 12
    && Number.isInteger(j) && j >= 1 && j <= joursDuMois(an, mo) && h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s < 61;
  // Année décimale du calendrier (année + fraction écoulée de cette année) et sa réciproque.
  function anneeDecimale(ms) { const an = new Date(ms).getUTCFullYear(), a0 = utc(an), a1 = utc(an + 1); return an + (ms - a0) / (a1 - a0); }
  function depuisAnnee(a) { const an = Math.floor(a), a0 = utc(an), a1 = utc(an + 1); return a0 + (a - an) * (a1 - a0); }
  // Année décimale d'HMTK (decimal_year) : année + (jour de l'année − 1)/365, au jour près, février toujours de 28 jours.
  function anneeHMTK(ms) { const d = new Date(ms); return d.getUTCFullYear() + (MARQUES[d.getUTCMonth()] + d.getUTCDate() - 1) / 365; }

  const HMS = '(?:[T\\s]+(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}(?:[.,]\\d*)?))?)?\\s*(Z|UTC|GMT|[+-]\\d{2}(?::?\\d{2})?)?';
  const RE_AMJ = new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${HMS}$`, 'i');
  const RE_JMA = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})${HMS}$`, 'i');
  const RE_HEURE = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:[.,]\d*)?))?$/;
  function decouperDate(texte) {
    const s = String(texte ?? '').trim();
    let m = RE_AMJ.exec(s);
    if (m) return { m, an: +m[1], mo: +m[2], j: +m[3] };
    if ((m = RE_JMA.exec(s))) {
      let j = +m[1], mo = +m[2];
      if (mo > 12 && j <= 12) [j, mo] = [mo, j]; // mm/jj/aaaa, quand le jour ne peut pas être un mois
      return { m, an: +m[3], mo, j };
    }
    return null;
  }
  // Date et heure (ms UTC) d'un texte : aaaa-mm-jj[Thh:mm[:ss[.sss]]][Z | UTC | ±hh:mm], séparateurs « - », « / » ou « . »,
  // ou jj/mm/aaaa (ordre français). NaN si illisible.
  function dateHeure(texte) {
    const d = decouperDate(texte);
    if (!d) return NaN;
    const { m } = d, h = m[4] === undefined ? 0 : +m[4], mi = m[5] === undefined ? 0 : +m[5], s = m[6] === undefined ? 0 : +m[6].replace(',', '.');
    if (!valide(d.an, d.mo, d.j, h, mi, s)) return NaN;
    let t = utc(d.an, d.mo, d.j, h, mi, s);
    if (m[7] && /^[+-]/.test(m[7])) { const z = m[7].replace(':', ''), sg = z[0] === '-' ? -1 : 1; t -= sg * (+z.slice(1, 3) * 60 + (+z.slice(3, 5) || 0)) * 60000; }
    return t;
  }
  const avecHeure = texte => { const d = decouperDate(texte); return !!d && d.m[4] !== undefined; };

  // ── Nombres, champs, colonnes ───────────────────────────────────────────
  function nombre(s, virgule = false) {
    let t = String(s ?? '').trim().replace(/−/g, '-');
    if (virgule) t = t.replace(',', '.');
    return /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  // Latitude ou longitude, signée ou suivie de N, S, E, W ou O (ouest).
  function coordonnee(s, virgule) {
    let t = String(s ?? '').trim().replace(/°/g, ''), signe = 1;
    const m = /^(.*\d)\s*([NSEWO])$/i.exec(t);
    if (m) { t = m[1]; if (/[SWO]/i.test(m[2])) signe = -1; }
    return signe * nombre(t, virgule);
  }
  // Séparateur d'une ligne d'en-tête : le plus fréquent hors guillemets parmi « | », tabulation, « ; », « , » ; espaces sinon.
  function separateur(ligne) {
    const n = { '|': 0, '\t': 0, ';': 0, ',': 0 };
    let g = false;
    for (const c of ligne) { if (c === '"') g = !g; else if (!g && c in n) n[c]++; }
    let sep = ' ', nb = 0;
    for (const c of ['|', '\t', ';', ',']) if (n[c] > nb) { sep = c; nb = n[c]; }
    return sep;
  }
  // Champs d'une ligne (guillemets doubles à la manière du CSV : « "" » vaut un guillemet).
  function decouper(ligne, sep) {
    if (sep === ' ') return ligne.trim().split(/\s+/);
    if (!ligne.includes('"')) return ligne.split(sep);
    const out = [];
    let cur = '', g = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (g) { if (c === '"') { if (ligne[i + 1] === '"') { cur += '"'; i++; } else g = false; } else cur += c; }
      else if (c === '"' && !cur.trim()) { g = true; cur = ''; }
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  // Nom de colonne ramené à l'essentiel : minuscules sans accents, sans « # » de tête ni unité entre parenthèses.
  const normer = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^\s*#\s*/, '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[^a-z0-9/]+/g, ' ').trim();
  const NOMS = {
    id: ['eventid', 'event id', 'id', 'evid', 'identifiant', 'numero', 'num', 'no', 'n', 'code', 'publicid'],
    temps: ['time', 'datetime', 'date time', 'origin time', 'origintime', 'otime', 'date heure', 'date et heure', 'dateheure', 'temps', 'origine',
      'heure origine', 'heure d origine', 'time utc', 'datetime utc', 'utc time', 'utc', 'date', 'date utc', 'date origine'],
    heureTexte: ['time', 'heure', 'hour', 'temps', 'heure origine', 'heure d origine', 'origin time', 'otime', 'time utc', 'heure utc', 'hh mm ss'],
    annee: ['year', 'annee', 'an', 'yr', 'yyyy', 'aaaa'],
    mois: ['month', 'mois', 'mo', 'mon'],
    jour: ['day', 'jour', 'jj', 'dd', 'dy'],
    heure: ['hour', 'heure', 'hh', 'hr'],
    minute: ['minute', 'minutes', 'min', 'mn', 'mi'],
    seconde: ['second', 'seconds', 'seconde', 'secondes', 'sec', 'ss', 's'],
    lat: ['latitude', 'lat', 'lat n', 'latitude n', 'lat deg', 'latitude deg'],
    lon: ['longitude', 'lon', 'long', 'lng', 'lon e', 'longitude e', 'lon deg', 'longitude deg'],
    h: ['depth', 'depth/km', 'depth km', 'profondeur', 'prof', 'profondeur km', 'prof km', 'dep', 'z', 'h km'],
    mag: ['magnitude', 'mag', 'm', 'mag value', 'magnitude value', 'preferred magnitude', 'magnitude preferee', 'valeur magnitude'],
    typeMag: ['magtype', 'mag type', 'magnitude type', 'magnitudetype', 'type mag', 'typemag', 'type magnitude', 'type de magnitude', 'type de la magnitude'],
    typeEv: ['eventtype', 'event type', 'type evenement', 'type d evenement', 'type de l evenement', 'nature'],
    // mécanisme au foyer (facultatif) : un plan nodal, azimut, pendage et glissement (strike, dip, rake)
    azimut: ['strike', 'strike1', 'strike 1', 'azimut', 'azimut 1', 'direction', 'azimut du plan'],
    pendage: ['dip', 'dip1', 'dip 1', 'pendage', 'pendage 1'],
    glissement: ['rake', 'rake1', 'rake 1', 'glissement', 'glissement 1', 'slip', 'angle de glissement'],
  };
  // Colonne nommée d'après une échelle (Mw, ML, mb, Ms, Md…) : ses valeurs sont des magnitudes de ce type.
  const NOM_ECHELLE = /^(mw[a-z]*|ml[a-z]*|mb[a-z]*|ms[a-z]*|md[a-z]*|mc|mjma)$/;
  const PRIORITE_ECHELLE = ['mw', 'ms', 'mb', 'ml', 'md'];
  // Types d'événement gardés : séismes (QuakeML, USGS ; « ke », « se », « fe » de l'EMSC) ou type non précisé ; les autres
  // (tirs de carrière, explosions, glissements, événements induits…) sont écartés et comptés.
  const SEISME = /earthquake|s[eé]isme|tremblement|^(-*|null|none|unknown|inconnu|not reported|ke|se|fe|uk|eq)$/i;

  function colonnes(noms) {
    const n = noms.map(normer), c = { echelles: [], temps: [] }, pris = new Set();
    const prendre = (cle, liste) => {
      for (const nom of liste) { const i = n.indexOf(nom); if (i >= 0 && !pris.has(i)) { c[cle] = i; pris.add(i); return; } }
    };
    for (const cle of ['id', 'lat', 'lon', 'h', 'mag', 'typeMag', 'typeEv', 'annee', 'mois', 'jour', 'heure', 'minute', 'seconde', 'azimut', 'pendage', 'glissement']) prendre(cle, NOMS[cle]);
    // noms ambigus : « mm » (mois ou minutes), « h » (heure ou profondeur), « type » (de magnitude ou d'événement)
    if (c.mois === undefined) prendre('mois', ['mm']); else prendre('minute', ['mm']);
    if (c.minute !== undefined && c.heure === undefined && c.annee !== undefined) prendre('heure', ['h']);
    else if (c.h === undefined) prendre('h', ['h']);
    const it = n.indexOf('type');
    if (it >= 0 && !pris.has(it)) c.type = it;
    for (const nom of NOMS.temps) { const i = n.indexOf(nom); if (i >= 0 && !pris.has(i)) c.temps.push(i); }
    if (c.mag === undefined) n.forEach((nom, i) => { if (!pris.has(i) && NOM_ECHELLE.test(nom.replace(/[\s/]/g, ''))) c.echelles.push(i); });
    c.score = (c.lat !== undefined) + (c.lon !== undefined) + (c.mag !== undefined || c.echelles.length > 0) + (c.temps.length > 0 || c.annee !== undefined);
    return c;
  }
  function messageEntete(meilleur) {
    if (!meilleur || meilleur.c.score < 2) {
      return 'en-tête introuvable : la première ligne doit nommer les colonnes (date et heure, ou année, mois et jour ; latitude ; longitude ; magnitude), '
        + 'séparées par « | », des virgules, des points-virgules ou des tabulations';
    }
    const c = meilleur.c, manque = [];
    if (c.temps.length === 0 && c.annee === undefined) manque.push('date (time, date, datetime… ou year, month, day / année, mois, jour)');
    if (c.lat === undefined) manque.push('latitude (latitude, lat)');
    if (c.lon === undefined) manque.push('longitude (longitude, lon, long)');
    if (c.mag === undefined && !c.echelles.length) manque.push('magnitude (magnitude, mag, Mw, ML, mb…)');
    return `ligne ${meilleur.k + 1} : colonne${manque.length > 1 ? 's' : ''} introuvable${manque.length > 1 ? 's' : ''} : ${manque.join(' ; ')}`;
  }

  // ── Lecture ─────────────────────────────────────────────────────────────
  // Texte d'un fichier : UTF-8, sinon Windows-1252 (exports des tableurs en français).
  function texte(octets) {
    const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(o); } catch { return new TextDecoder('windows-1252').decode(o); }
  }
  // Catalogue lu : { format, separateur, colonnes (noms du fichier), evenements [{ t (ms UTC), lat, lon, h (km ou null),
  // mag, typeMag, id }] rangés dans le temps, lignes (de données), rejetees, rejets (les premiers : { ligne, raison }),
  // ecartes { type: nombre } (non-séismes), doublons (même identifiant), tMin (plus ancienne date lue) }.
  // Lève une erreur au message clair si le fichier n'est pas un catalogue.
  function lire(entree) {
    let s = typeof entree === 'string' ? entree : texte(entree);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    if (!s.trim()) throw new Error('fichier vide');
    if (/^\s*[{[]/.test(s)) {
      let j;
      try { j = JSON.parse(s); } catch { throw new Error('JSON illisible'); }
      return lireGeoJSON(j);
    }
    const lignes = s.split(/\r\n|\n|\r/);
    // En-tête : parmi les 40 premières lignes non vides, la première qui nomme une date, la position et la magnitude.
    let entete = null, meilleur = null;
    for (let k = 0, vues = 0; k < lignes.length && vues < 40; k++) {
      if (!lignes[k].trim()) continue;
      vues++;
      const sep = separateur(lignes[k]), noms = decouper(lignes[k], sep).map(x => x.trim()), c = colonnes(noms);
      if (!meilleur || c.score > meilleur.c.score) meilleur = { k, sep, noms, c };
      if (c.score === 4) { entete = meilleur; break; }
    }
    if (!entete) throw new Error(messageEntete(meilleur));
    const { sep, noms, c } = entete, virgule = sep === ';' || sep === '\t';
    const donnees = [];
    for (let k = entete.k + 1; k < lignes.length; k++) {
      const l = lignes[k];
      if (!l.trim() || /^\s*#/.test(l)) continue;
      donnees.push([k + 1, decouper(l, sep)]);
    }
    // Plan de lecture, décidé sur un échantillon des premières lignes de données.
    const ech = donnees.slice(0, 60).map(d => d[1]), val = (v, i) => (i === undefined ? '' : String(v[i] ?? '').trim());
    const part = (i, test) => { const vs = ech.map(v => val(v, i)).filter(Boolean); return vs.length ? vs.filter(test).length / vs.length : 0; };
    const plan = {};
    let best = -1;
    for (const i of c.temps) { const p = part(i, x => Number.isFinite(dateHeure(x))); if (p > Math.max(0.5, best)) { best = p; plan.date = i; } }
    if (plan.date !== undefined && part(plan.date, avecHeure) < 0.5) {
      const n = noms.map(normer);
      for (const nom of NOMS.heureTexte) {
        const i = n.indexOf(nom);
        if (i >= 0 && i !== plan.date && part(i, x => RE_HEURE.test(x)) >= 0.5) { plan.heureTexte = i; break; }
      }
      if (plan.heureTexte === undefined && c.heure !== undefined) plan.hms = true;
    }
    if (plan.date === undefined) {
      if (c.annee === undefined) throw new Error(`ligne ${entete.k + 1} : aucune date lisible dans les colonnes ${c.temps.map(i => `« ${noms[i]} »`).join(', ') || 'de date'} (attendu : aaaa-mm-jj hh:mm:ss ou jj/mm/aaaa)`);
      plan.hms = true;
    }
    if (c.type !== undefined) {
      if (part(c.type, x => /^m[a-z_]{0,6}$/i.test(x)) >= 0.5) { if (c.typeMag === undefined) c.typeMag = c.type; } else if (c.typeEv === undefined) c.typeEv = c.type;
    }
    // Magnitude : colonne « magnitude » ou « mag », sinon l'échelle la plus remplie (Mw de préférence).
    let nomEchelle = '';
    if (c.mag === undefined) {
      const rang = i => { const k = PRIORITE_ECHELLE.findIndex(p => normer(noms[i]).startsWith(p)); return k < 0 ? 9 : k; };
      const tri = c.echelles.map(i => [i, part(i, x => Number.isFinite(nombre(x, virgule)))]).sort((a, b) => b[1] - a[1] || rang(a[0]) - rang(b[0]));
      c.mag = tri[0][0]; nomEchelle = noms[c.mag];
    }
    const metres = c.h !== undefined && /\(\s*m\s*\)|\[\s*m\s*\]|metres|meters/i.test(noms[c.h]);
    const format = sep === '|' && c.id !== undefined && normer(noms[c.id]) === 'eventid' ? 'fdsn'
      : sep === ',' && ['time', 'latitude', 'longitude', 'depth', 'mag', 'magtype'].every(x => noms.map(normer).includes(x)) && noms.some(x => /^(place|net|locationsource)$/i.test(x.trim())) ? 'usgs' : 'tableau';
    const nombreDe = (v, i) => nombre(val(v, i), virgule), entierOu = (v, i, d) => (val(v, i) === '' ? d : nombreDe(v, i));
    function temps(v) {
      if (plan.date !== undefined) {
        if (plan.heureTexte !== undefined) return dateHeure(`${val(v, plan.date)} ${val(v, plan.heureTexte)}`);
        const t = dateHeure(val(v, plan.date));
        if (!plan.hms) return t;
        const h = entierOu(v, c.heure, 0), mi = entierOu(v, c.minute, 0), sec = entierOu(v, c.seconde, 0);
        return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && sec >= 0 && sec < 61 ? t + ((h * 60 + mi) * 60 + sec) * 1000 : NaN;
      }
      const an = nombreDe(v, c.annee), mo = entierOu(v, c.mois, 1), j = entierOu(v, c.jour, 1);
      const h = entierOu(v, c.heure, 0), mi = entierOu(v, c.minute, 0), sec = entierOu(v, c.seconde, 0);
      return valide(an, mo, j, h, mi, sec) ? utc(an, mo, j, h, mi, sec) : NaN;
    }
    const lus = [], rejets = [], ecartes = {};
    let rejetees = 0, tMin = Infinity;
    const rejeter = (ligne, raison) => { rejetees++; if (rejets.length < 5) rejets.push({ ligne, raison }); };
    const nCol = Math.max(c.lat, c.lon, c.mag, plan.date ?? c.annee) + 1;
    for (const [ligne, v] of donnees) {
      if (v.length < nCol) { rejeter(ligne, 'colonnes manquantes'); continue; }
      const t = temps(v);
      if (!Number.isFinite(t)) { rejeter(ligne, 'date illisible'); continue; }
      if (t < tMin) tMin = t;
      const lat = coordonnee(val(v, c.lat), virgule), lon = coordonnee(val(v, c.lon), virgule);
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 360)) { rejeter(ligne, 'position illisible'); continue; }
      const mag = nombreDe(v, c.mag);
      if (!Number.isFinite(mag)) { rejeter(ligne, 'magnitude manquante'); continue; }
      const type = val(v, c.typeEv);
      if (!SEISME.test(type)) { ecartes[type] = (ecartes[type] || 0) + 1; continue; }
      const h = nombreDe(v, c.h), e = { t, lat, lon: lon > 180 ? lon - 360 : lon, h: Number.isFinite(h) ? (metres ? h / 1000 : h) : null, mag, typeMag: c.typeMag !== undefined ? val(v, c.typeMag) : nomEchelle, id: val(v, c.id) };
      // mécanisme au foyer, quand le tableau en donne un plan nodal
      if (c.azimut !== undefined && c.pendage !== undefined && c.glissement !== undefined) {
        const az = nombreDe(v, c.azimut), pd = nombreDe(v, c.pendage), gl = nombreDe(v, c.glissement);
        if ([az, pd, gl].every(Number.isFinite) && pd >= 0 && pd <= 90 && Math.abs(gl) <= 360) e.mec = { azimut: ((az % 360) + 360) % 360, pendage: pd, glissement: ((((gl + 180) % 360) + 360) % 360) - 180 };
      }
      lus.push(e);
    }
    // colonnes lues, dans l'ordre date, position, profondeur, magnitude (noms du fichier, sans « # » de tête)
    const lues = {}, nom = i => noms[i].replace(/^#\s*/, '');
    if (plan.date !== undefined) lues.date = nom(plan.date);
    if (plan.heureTexte !== undefined) lues.heure = nom(plan.heureTexte);
    if (plan.hms) for (const cle of ['annee', 'mois', 'jour', 'heure', 'minute', 'seconde']) if (c[cle] !== undefined && !(plan.date !== undefined && cle === 'annee')) lues[cle] = nom(c[cle]);
    for (const cle of ['lat', 'lon', 'h', 'mag', 'typeMag', 'id', 'typeEv', 'azimut', 'pendage', 'glissement']) if (c[cle] !== undefined) lues[cle] = nom(c[cle]);
    return finir({ format, separateur: sep, colonnes: lues, lignes: donnees.length, rejetees, rejets, ecartes, tMin }, lus);
  }
  // GeoJSON de l'USGS (properties.time en ms, coordonnées [lon, lat, profondeur]) ou de l'EMSC (heure ISO, lat, lon, depth).
  function lireGeoJSON(j) {
    if (!j || !Array.isArray(j.features)) throw new Error('fichier JSON sans liste « features » : seuls le GeoJSON (USGS, EMSC) et les tableaux de texte sont lus');
    const lus = [], rejets = [], ecartes = {};
    let rejetees = 0, tMin = Infinity;
    const rejeter = (ligne, raison) => { rejetees++; if (rejets.length < 5) rejets.push({ ligne, raison }); };
    j.features.forEach((f, k) => {
      const p = (f && f.properties) || {}, g = (f && f.geometry && f.geometry.coordinates) || [];
      const t = typeof p.time === 'number' ? p.time : dateHeure(p.time);
      if (!Number.isFinite(t)) { rejeter(k + 1, 'date illisible'); return; }
      if (t < tMin) tMin = t;
      const lat = +(p.lat ?? g[1]), lon = +(p.lon ?? g[0]), h = p.depth ?? g[2], mag = p.mag;
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { rejeter(k + 1, 'position illisible'); return; }
      if (typeof mag !== 'number' || !Number.isFinite(mag)) { rejeter(k + 1, 'magnitude manquante'); return; }
      const type = String(p.type ?? p.evtype ?? '').trim();
      if (!SEISME.test(type)) { ecartes[type] = (ecartes[type] || 0) + 1; return; }
      lus.push({ t, lat, lon, h: Number.isFinite(+h) && h !== null ? +h : null, mag, typeMag: String(p.magType ?? p.magtype ?? '').trim(), id: String(f.id ?? p.unid ?? '') });
    });
    return finir({ format: 'geojson', separateur: null, colonnes: {}, lignes: j.features.length, rejetees, rejets, ecartes, tMin }, lus);
  }
  function finir(r, lus) {
    const vus = new Set(), evenements = [];
    let doublons = 0;
    for (const e of lus) {
      if (e.id) { if (vus.has(e.id)) { doublons++; continue; } vus.add(e.id); }
      evenements.push(e);
    }
    if (!evenements.length) {
      const motif = r.rejets.length ? ` (ligne ${r.rejets[0].ligne} : ${r.rejets[0].raison})` : Object.keys(r.ecartes).length ? ' (aucun séisme : seulement des tirs ou des explosions)' : '';
      throw new Error(`aucun séisme lisible${motif}`);
    }
    if (evenements.length > MAX_EVENEMENTS) throw new Error(`catalogue trop gros : ${MAX_EVENEMENTS} séismes au plus ; filtrez-le par magnitude, période ou région`);
    evenements.sort((a, b) => a.t - b.t);
    return { ...r, nom: FORMATS[r.format], evenements, doublons };
  }

  // ── Résumé et préparation de l'analyse ──────────────────────────────────
  // Famille d'échelle d'un type de magnitude : Mw (Mww, Mwr, Mwp…), ML (MLv…), mb (mB), mbLg, Ms, Md (durée, coda), M
  // (non précisé), « ? » si le type manque ; tout autre type est sa propre famille.
  function familleMag(type) {
    const n = String(type ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (!n) return '?';
    if (n.startsWith('mw')) return 'Mw';
    if (/^(mblg|mlg)/.test(n)) return 'mbLg';
    if (n.startsWith('mb')) return 'mb';
    if (n.startsWith('ml')) return 'ML';
    if (n.startsWith('ms')) return 'Ms';
    if (/^m[dc]/.test(n)) return 'Md';
    if (n === 'm') return 'M';
    return String(type).trim();
  }
  // Nombre, période, région, profondeurs, magnitudes, types (bruts et par famille) ; mélange de familles signalé.
  function resume(evts) {
    const r = { n: evts.length, debut: Infinity, fin: -Infinity, lat: [Infinity, -Infinity], lon: [Infinity, -Infinity], mag: [Infinity, -Infinity], h: null, sansH: 0 };
    const types = new Map(), fam = new Map();
    let h0 = Infinity, h1 = -Infinity;
    for (const e of evts) {
      r.debut = Math.min(r.debut, e.t); r.fin = Math.max(r.fin, e.t);
      r.lat = [Math.min(r.lat[0], e.lat), Math.max(r.lat[1], e.lat)]; r.lon = [Math.min(r.lon[0], e.lon), Math.max(r.lon[1], e.lon)];
      r.mag = [Math.min(r.mag[0], e.mag), Math.max(r.mag[1], e.mag)];
      if (e.h === null) r.sansH++; else { h0 = Math.min(h0, e.h); h1 = Math.max(h1, e.h); }
      types.set(e.typeMag, (types.get(e.typeMag) || 0) + 1);
      const f = familleMag(e.typeMag), o = fam.get(f) || { n: 0, types: new Set() };
      o.n++; o.types.add(e.typeMag); fam.set(f, o);
    }
    if (h1 >= h0) r.h = [h0, h1];
    r.types = [...types].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
    r.familles = [...fam].map(([famille, o]) => ({ famille, n: o.n, types: [...o.types].sort() })).sort((a, b) => b.n - a.n || a.famille.localeCompare(b.famille));
    r.melange = r.familles.length > 1;
    return r;
  }
  // Période d'observation d'un fichier (années décimales) : du premier séisme à une seconde après le dernier.
  function periode(evts) {
    let t0 = Infinity, t1 = -Infinity;
    for (const e of evts) { t0 = Math.min(t0, e.t); t1 = Math.max(t1, e.t); }
    return { debut: anneeDecimale(t0), fin: anneeDecimale(t1 + 1000) };
  }
  // Séismes du banc : t en années décimales, M ramenée à la classe de 0,1 (Aki-Utsu suppose ΔM = 0,1), mag telle que lue.
  const pourAnalyse = evts => evts.map(e => ({ t: anneeDecimale(e.t), M: Math.round(e.mag * 10) / 10, mag: e.mag, ms: e.t, lat: e.lat, lon: e.lon, h: e.h, typeMag: e.typeMag, id: e.id }));
  // Déclusterage de Gardner et Knopoff (Sismicite.amasGK) d'un catalogue réel, aux conventions d'HMTK (GardnerKnopoffType1) :
  // année décimale d'HMTK, au jour près (un précurseur du même jour rejoint l'amas comme une réplique), distance haversine,
  // magnitudes telles que lues. À magnitudes égales, le plus ancien ouvre l'amas (HMTK : ordre de son tri par tas).
  // Renvoie l'amas et le drapeau de chaque séisme (0 gardé, 1 réplique, −1 précurseur) et les séismes gardés.
  function decluster(evts) {
    const { amas, drapeau } = Sismicite.amasGK(evts.map(e => ({ t: anneeHMTK(e.t), M: e.mag, lat: e.lat, lon: e.lon })), { distance: Sismicite.haversine });
    return { amas, drapeau, garde: Array.from(drapeau, d => d === 0) };
  }

  // ── Carte des épicentres ────────────────────────────────────────────────
  // Cadre d'une carte qui montre tous les points { lat, lon } avec une marge : latitudes [s, n] ; longitudes [o, e] sur le
  // plus petit arc qui les contient (complément du plus grand vide entre longitudes voisines), donc e peut dépasser 180°
  // quand le catalogue chevauche l'antiméridien (Fidji, Aléoutiennes…) ; monde entier, centré sur Greenwich, au-delà de 200°.
  function cadre(points, { marge = 0.08, etendueMin = 2 } = {}) {
    const lons = points.map(p => ((((p.lon + 180) % 360) + 360) % 360) - 180).sort((a, b) => a - b);
    let s = Infinity, n = -Infinity;
    for (const p of points) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
    if (!lons.length) return { lon: [-180, 180], lat: [-90, 90] };
    let vide = lons[0] + 360 - lons[lons.length - 1], o = lons[0], e = lons[lons.length - 1];
    for (let i = 0; i + 1 < lons.length; i++) if (lons[i + 1] - lons[i] > vide) { vide = lons[i + 1] - lons[i]; o = lons[i + 1]; e = lons[i] + 360; }
    const dl = Math.max(etendueMin, (e - o) * (1 + 2 * marge)), dp = Math.max(etendueMin, (n - s) * (1 + 2 * marge));
    let lon = [(o + e) / 2 - dl / 2, (o + e) / 2 + dl / 2];
    if (dl >= 200) lon = [-180, 180]; // plus de la moitié du globe : la carte du monde habituelle
    else if (lon[0] >= 180) lon = [lon[0] - 360, lon[1] - 360];
    const lat = [Math.max(-90, (s + n) / 2 - dp / 2), Math.min(90, (s + n) / 2 + dp / 2)];
    return { lon, lat };
  }
  // Longitude ramenée dans la fenêtre d'un cadre (à 360° près) : [o, o + 360[.
  const lonDans = (lon, o) => o + ((((lon - o) % 360) + 360) % 360);

  // ── Téléchargement par le relais FDSN ───────────────────────────────────
  // Première page : séismes du cadre, de la période (ms) et au-dessus de mmin, du plus récent au plus ancien, 500 au plus
  // (limite du relais, format texte). { params } ou { erreur }.
  function requete({ lat0, lat1, lon0, lon1, debut, fin, mmin }) {
    if (![lat0, lat1, lon0, lon1, debut, fin, mmin].every(Number.isFinite)) return { erreur: 'un champ est vide ou illisible' };
    if (!(lat0 >= -90 && lat1 <= 90 && lat0 < lat1)) return { erreur: 'latitudes de −90 à 90°, la minimale sous la maximale' };
    if (!(lon0 >= -180 && lon1 <= 180 && lon0 < lon1)) return { erreur: 'longitudes de −180 à 180°, la minimale sous la maximale' };
    if (!(debut < fin)) return { erreur: 'période vide' };
    if (!(mmin >= -2 && mmin <= 9)) return { erreur: 'magnitude minimale hors de −2 à 9' };
    const params = {
      format: 'text', orderby: 'time', limit: String(PAGE), starttime: Fdsn.heure(debut), endtime: Fdsn.heure(fin),
      minlatitude: String(lat0), maxlatitude: String(lat1), minlongitude: String(lon0), maxlongitude: String(lon1), minmagnitude: String(mmin),
    };
    const r = Fdsn.requete('event', params);
    return r.erreur ? { erreur: r.erreur } : { params };
  }
  // Page suivante : séismes antérieurs à la plus ancienne date de la page lue (fin à la seconde suivante ; les doublons
  // s'écartent par leur identifiant), ou null quand la page n'était pas pleine.
  function pageSuivante(params, lu) {
    if (!lu || lu.lignes < PAGE || !Number.isFinite(lu.tMin)) return null;
    const endtime = Fdsn.heure(lu.tMin + 1000);
    return endtime === params.endtime ? null : { ...params, endtime };
  }

  return {
    PAGE, PAGES_MAX, MAX_EVENEMENTS, CENTRES_EVENT, FORMATS, utc, anneeDecimale, depuisAnnee, anneeHMTK, dateHeure, nombre, texte, lire,
    familleMag, resume, periode, pourAnalyse, decluster, cadre, lonDans, requete, pageSuivante,
  };
})();
export default Catalogue;
