// src/parcours.js — plan du cours : chapitres et bancs dans l'ordre de lecture, ancres d'adresse. Données pures,
// utilisées par src/onglets.js (barre des bancs, fil du parcours) et vérifiées contre index.html par les tests.
const Parcours = (() => {
  'use strict';
  const CHAPITRES = [
    { titre: 'Lire les sismogrammes', bancs: ['station', 'reseau', 'mecanisme', 'source', 'sismometre', 'profil'] },
    { titre: 'Mouvement du sol et aléa', bancs: ['spectre', 'sismicite', 'geodesie', 'alea'] },
    { titre: 'Du site au mouvement de projet', bancs: ['selection', 'site', 'liquefaction'] },
    { titre: 'Réponse des ouvrages', bancs: ['ductilite', 'batiment', 'poussee', 'isolation'] },
  ];
  // ancre de l'adresse de chaque banc (#localisation ouvre le banc « réseau », etc.)
  const ANCRES = {
    station: 'station', reseau: 'localisation', mecanisme: 'mecanisme', source: 'source', sismometre: 'sismometre', profil: 'profil',
    spectre: 'spectre', sismicite: 'sismicite', geodesie: 'geodesie', alea: 'alea',
    selection: 'accelerogrammes', site: 'effets-de-site', liquefaction: 'liquefaction',
    ductilite: 'ductilite', batiment: 'batiment', poussee: 'poussee-progressive', isolation: 'isolation',
  };
  const ordre = CHAPITRES.flatMap(c => c.bancs);
  // Place d'un banc dans le cours : chapitre, rang dans le chapitre, bancs précédent et suivant.
  function situer(banc) {
    const i = ordre.indexOf(banc), c = CHAPITRES.findIndex(ch => ch.bancs.includes(banc));
    if (i < 0) return null;
    return { rang: i, chapitre: c, titre: CHAPITRES[c].titre, position: CHAPITRES[c].bancs.indexOf(banc), taille: CHAPITRES[c].bancs.length, precedent: ordre[i - 1] || null, suivant: ordre[i + 1] || null };
  }
  const depuisAncre = hash => ordre.find(b => '#' + ANCRES[b] === hash) || null;
  const debutsDeChapitre = CHAPITRES.map(c => c.bancs[0]);
  return { CHAPITRES, ANCRES, ordre, situer, depuisAncre, debutsDeChapitre };
})();
export default Parcours;
