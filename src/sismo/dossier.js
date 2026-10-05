// src/sismo/dossier.js — fichier d'un séisme réel (format « sismo-seisme », version 1), écrit par la page « En
// direct » (bouton « Enregistrer pour le TP ») et relu par le banc « réseau » (mode « Séisme réel ») : le séisme du
// catalogue (la référence), la fenêtre lue, les stations (position, sensibilité, bande de la voie) et leurs
// enregistrements miniSEED tels que les centres les ont livrés (base64), trois composantes par station, avec la
// sensibilité et l'orientation de chacune (composantes, facultatif : sans elles, la sensibilité de la verticale sert aux
// trois et les amplitudes des horizontales ne sont qu'indicatives). La lecture assemble chaque composante sur une grille
// commune (trous à zéro, valeur moyenne retirée), convertit les coups en m/s par sa sensibilité, remet la verticale vers
// le haut (pendage −90°), tourne les horizontales vers le nord et l'est quand leurs azimuts sont connus, et rééchantillonne
// toutes les stations à la plus petite cadence. Solveurs purs.
import MiniSeed from './miniseed.js';

const Dossier = (() => {
  'use strict';
  const FORMAT = 'sismo-seisme', VERSION = 1, MAX_STATIONS = 24;

  function versBase64(octets) {
    let s = '';
    for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function depuisBase64(b64) {
    const s = atob(b64), o = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
  }
  const iso = ms => new Date(ms).toISOString();

  // Texte du fichier. seisme : { id, temps (ms), lat, lon, h, mag, typeMag, region } ; debut, fin (ms) ; stations :
  // [{ reseau, station, emplacement, voie (verticale, dont la bande sert aux trois composantes), lat, lon, altitude,
  // sensibilite, centre, pays }] ; enregistrements : octets miniSEED (Uint8Array), dans n'importe quel ordre.
  function ecrire({ seisme, debut, fin, stations, enregistrements, source = 'sismo.ksr-infra.org, page « En direct » : archives FDSN des centres' }) {
    const total = enregistrements.reduce((n, e) => n + e.length, 0), tout = new Uint8Array(total);
    let o = 0;
    for (const e of enregistrements) { tout.set(e, o); o += e.length; }
    const e = seisme;
    return JSON.stringify({
      format: FORMAT, version: VERSION, source,
      seisme: { id: e.id, temps: iso(e.temps), lat: e.lat, lon: e.lon, h: e.h, mag: e.mag, typeMag: e.typeMag || '', region: e.region || '', catalogue: e.catalogue || 'GEOFON' },
      debut: iso(debut), fin: iso(fin),
      stations: stations.map(s => ({
        reseau: s.reseau, station: s.station, emplacement: s.emplacement || '', bande: s.voie.slice(0, 2), lat: s.lat, lon: s.lon, altitude: s.altitude ?? null,
        sensibilite: s.sensibilite, centre: s.centre || '', pays: s.pays ? s.pays.nom || s.pays : '',
        ...(s.composantes ? { composantes: s.composantes } : {}),
      })),
      miniseed: versBase64(tout),
    });
  }

  // Rééchantillonnage de fs à fsCible ≤ fs : moyenne glissante sur le rapport (anti-repliement sommaire), puis
  // prélèvement (rapport entier) ou interpolation linéaire.
  function reechantillonner(x, fs, fsCible) {
    if (Math.abs(fs - fsCible) < 1e-9) return Float64Array.from(x);
    const r = fs / fsCible, m = Math.max(1, Math.round(r)), lisse = new Float64Array(x.length);
    let s = 0;
    for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= m) s -= x[i - m]; lisse[i] = s / Math.min(m, i + 1); }
    const n = Math.floor(x.length / r), out = new Float64Array(n), decale = (m - 1) / 2;
    for (let j = 0; j < n; j++) {
      const t = j * r + decale, i = Math.floor(t), w = t - i;
      out[j] = i + 1 < x.length ? (1 - w) * lisse[i] + w * lisse[i + 1] : lisse[Math.min(i, x.length - 1)];
    }
    return out;
  }

  const composante = voie => ({ Z: 0, N: 1, 1: 1, E: 2, 2: 2 }[voie[2]]);

  // Lecture d'un fichier : { seisme (temps en ms), debut, fin, dt, n, stations: [{ …, voies: [Z, N, E] (codes ou null),
  // series: [Z, N, E] (Float64Array, m/s, n échantillons à dt) }], ecartees: [stations sans verticale] }. Lève une
  // erreur au message lisible si le fichier n'est pas un fichier de séisme.
  function lire(texte) {
    let j;
    try { j = typeof texte === 'string' ? JSON.parse(texte) : texte; } catch { throw new Error('ce fichier n\'est pas un fichier de séisme (JSON illisible)'); }
    if (!j || j.format !== FORMAT) throw new Error('ce fichier n\'est pas un fichier de séisme enregistré par la page « En direct »');
    if (j.version !== VERSION) throw new Error(`version ${j.version} du fichier non prise en charge (attendue : ${VERSION})`);
    if (!Array.isArray(j.stations) || !j.stations.length || j.stations.length > MAX_STATIONS) throw new Error('le fichier ne contient aucune station lisible');
    const debut = Date.parse(j.debut), fin = Date.parse(j.fin), e = j.seisme || {};
    if (!(fin > debut) || fin - debut > 3 * 3600 * 1000) throw new Error('fenêtre de temps du fichier invalide');
    const enr = MiniSeed.lire(depuisBase64(String(j.miniseed || '')));
    if (!enr.length) throw new Error('le fichier ne contient aucun enregistrement');
    // enregistrements par station et composante
    const parCle = new Map();
    for (const r of enr) {
      const c = composante(r.voie || '');
      if (c === undefined || !r.cadence) continue;
      const cle = `${r.reseau}.${r.station}.${r.emplacement}`;
      if (!parCle.has(cle)) parCle.set(cle, [[], [], []]);
      parCle.get(cle)[c].push(r);
    }
    const assembler = recs => {
      const fs = recs[0].cadence, n = Math.round(((fin - debut) * fs) / 1000), x = new Float64Array(n).fill(NaN);
      for (const r of recs) {
        if (r.cadence !== fs) continue;
        const i0 = Math.round(((r.debut - debut) * fs) / 1000);
        for (let k = Math.max(0, -i0); k < r.echantillons.length && i0 + k < n; k++) x[i0 + k] = r.echantillons[k];
      }
      return { fs, x, voie: recs[0].voie };
    };
    const stations = [], ecartees = [], RAD = Math.PI / 180;
    for (const s of j.stations) {
      const comps = parCle.get(`${s.reseau}.${s.station}.${s.emplacement || ''}`), bande = String(s.bande || '');
      const garder = l => l.filter(r => r.voie.startsWith(bande));
      if (!comps || !garder(comps[0]).length || !(s.sensibilite > 0)) { ecartees.push(`${s.reseau}.${s.station}`); continue; }
      stations.push({ ...s, brut: comps.map(l => (garder(l).length ? assembler(garder(l)) : null)) });
    }
    if (!stations.length) throw new Error('aucune station du fichier n\'a de composante verticale');
    const fsc = Math.min(...stations.map(s => s.brut[0].fs)), dt = 1 / fsc, n = Math.round(((fin - debut) / 1000) * fsc);
    for (const s of stations) {
      const meta = v => (s.composantes && v && s.composantes[v]) || {};
      s.voies = s.brut.map(b => (b ? b.voie : null));
      // sensibilité propre à chaque composante, sinon celle de la verticale (amplitudes approchées)
      s.sensibilites = s.voies.map(v => (meta(v).sensibilite > 0 ? meta(v).sensibilite : null));
      s.approchee = s.voies.some((v, c) => v && s.sensibilites[c] === null);
      s.series = s.brut.map((b, c) => {
        const out = new Float64Array(n);
        if (!b) return out;
        // moyenne retirée sur les échantillons présents, trous à zéro, coups → m/s
        let m = 0, k = 0;
        for (const v of b.x) if (!Number.isNaN(v)) { m += v; k++; }
        m = k ? m / k : 0;
        const sens = s.sensibilites[c] || s.sensibilite;
        const y = reechantillonner(Float64Array.from(b.x, v => (Number.isNaN(v) ? 0 : (v - m) / sens)), b.fs, fsc);
        out.set(y.subarray(0, n));
        return out;
      });
      // verticale orientée vers le bas (pendage +90°) : remise vers le haut, pour que la polarité se lise directement
      const pz = meta(s.voies[0]).pendage;
      s.retournee = Number.isFinite(pz) && pz > 0;
      if (s.retournee) s.series[0] = s.series[0].map(v => -v);
      // horizontales d'azimuts connus (1 et 2, ou N et E décalés) : rotation vers le nord et l'est
      const a1 = meta(s.voies[1]).azimut, a2 = meta(s.voies[2]).azimut;
      s.tournee = false;
      if (s.voies[1] && s.voies[2] && Number.isFinite(a1) && Number.isFinite(a2) && (a1 % 360 !== 0 || a2 % 360 !== 90)) {
        const ecart = (((a2 - a1) % 360) + 360) % 360;
        if (Math.abs(ecart - 90) < 5 || Math.abs(ecart - 270) < 5) {
          const [h1, h2] = [s.series[1], s.series[2]], N = new Float64Array(n), E = new Float64Array(n);
          for (let i = 0; i < n; i++) { N[i] = h1[i] * Math.cos(a1 * RAD) + h2[i] * Math.cos(a2 * RAD); E[i] = h1[i] * Math.sin(a1 * RAD) + h2[i] * Math.sin(a2 * RAD); }
          s.series[1] = N; s.series[2] = E; s.tournee = true;
          s.voies = [s.voies[0], `${s.voies[1].slice(0, 2)}N`, `${s.voies[2].slice(0, 2)}E`];
        }
      }
      delete s.brut;
    }
    return {
      seisme: { ...e, temps: Date.parse(e.temps) }, debut, fin, dt, n, stations, ecartees, source: j.source || '',
    };
  }

  return { FORMAT, VERSION, MAX_STATIONS, ecrire, lire, reechantillonner, versBase64, depuisBase64 };
})();
export default Dossier;
