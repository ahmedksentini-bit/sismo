import Dossier from './sismo/dossier.js';
import Localisation from './sismo/localisation.js';

// src/seisme-reel.js — séisme réel partagé par les bancs « réseau », « mécanisme » et « source » : le fichier lu
// (Dossier.lire), la table des temps de la localisation, les pointés P et S et les polarités (en secondes depuis le début
// du fichier), et la solution du TP de localisation. Un fichier chargé dans un banc sert aux trois ; chaque modification
// augmente `version`, et un banc qui s'ouvre reprend l'état partagé si la version a changé depuis sa dernière lecture.
// Sans accès au DOM.
const SeismeReel = (() => {
  'use strict';
  let courant = null, table = null;

  async function lireTable() {
    if (!table) {
      const r = await fetch('data/temps-localisation.json');
      if (!r.ok) throw new Error(`table des temps de trajet illisible (${r.status})`);
      table = await r.json();
    }
    return table;
  }
  // Lecture d'un fichier choisi par l'étudiant (File) : erreurs au message lisible.
  async function charger(fichier) {
    if (fichier.size > 40 * 1024 * 1024) throw new Error('fichier trop gros (40 Mo au plus)');
    const [dossier, t] = await Promise.all([fichier.text().then(x => Dossier.lire(x)), lireTable()]);
    courant = {
      dossier, table: t, nom: fichier.name || '', version: (courant ? courant.version : 0) + 1,
      pointes: dossier.stations.map(() => ({ P: null, S: null })), polarites: dossier.stations.map(() => 0), solution: null,
    };
    return courant;
  }
  // Mise à jour par un banc : { pointes, polarites, solution } (champs facultatifs) ; renvoie la nouvelle version.
  function publier({ pointes, polarites, solution } = {}) {
    if (!courant) return 0;
    if (pointes) courant.pointes = pointes.map(p => ({ P: p.P ?? null, S: p.S ?? null }));
    if (polarites) courant.polarites = polarites.slice();
    if (solution !== undefined) courant.solution = solution ? { lat: solution.lat, lon: solution.lon, h: solution.h, t0: solution.t0 } : null;
    return ++courant.version;
  }
  // Foyer retenu : la solution du TP de localisation si elle existe (sauf choix 'geofon'), sinon celle du catalogue de
  // GEOFON, profondeur ramenée dans la table (0 à 40 km) ; t0 en s depuis le début du fichier.
  function foyer(choix = 'localisation') {
    if (!courant) return null;
    const s = courant.solution, e = courant.dossier.seisme;
    if (choix !== 'geofon' && s) return { ...s, source: 'localisation' };
    const h = Number.isFinite(e.h) ? e.h : 10;
    return { lat: e.lat, lon: e.lon, h: Math.max(0, Math.min(40, h)), hCatalogue: h, t0: (e.temps - courant.dossier.debut) / 1000, source: 'geofon' };
  }
  // Rais du foyer vers chaque station du fichier.
  const rais = f => courant.dossier.stations.map(st => Localisation.rai(courant.table, f, st));

  return { lireTable, charger, publier, foyer, rais, courant: () => courant };
})();
export default SeismeReel;
