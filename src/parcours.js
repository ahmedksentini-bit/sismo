// src/parcours.js — plan des travaux pratiques : parties du cours (CHAPITRES, A à D) et bancs dans l'ordre de lecture,
// ancres d'adresse, chapitre du cours associé à chaque banc (LECONS ; le banc de rang n est le TP du chapitre n).
// Données pures, utilisées par src/onglets.js (barre des bancs, fil du parcours) et src/app.js (redirection des
// anciennes ancres) ; vérifiées par les tests contre labo.html et data/chapitres.json.
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
  // Chapitre du cours associé à chaque banc (le banc en est le TP) ; fichier null : chapitre en préparation.
  const LECONS = {
    station: { titre: 'Lire un sismogramme', fichier: 'cours.html#ch1', duree: 20 },
    reseau: { titre: 'Localiser un séisme avec un réseau', fichier: 'cours.html#ch2', duree: 20 },
    mecanisme: { titre: 'Le mécanisme au foyer', fichier: 'cours.html#ch3', duree: 25 },
    source: { titre: 'La taille de la source : moment et Mw', fichier: 'cours.html#ch4', duree: 25 },
    sismometre: { titre: 'Comment fonctionne un sismomètre', fichier: 'cours.html#ch5', duree: 20 },
    profil: { titre: 'La structure de la croûte', fichier: 'cours.html#ch6', duree: 20 },
    spectre: { titre: 'Le spectre de réponse et l\'Eurocode 8', fichier: 'cours.html#ch7', duree: 30 },
    sismicite: { titre: 'Catalogue et loi de Gutenberg-Richter', fichier: 'cours.html#ch8', duree: 25 },
    geodesie: { titre: 'Déformation de la croûte et taux de séismes', fichier: 'cours.html#ch9', duree: 25 },
    alea: { titre: 'Le calcul probabiliste de l\'aléa', fichier: 'cours.html#ch10', duree: 35 },
    selection: { titre: 'Choisir et caler des accélérogrammes', fichier: 'cours.html#ch11', duree: 30 },
    site: { titre: 'Les effets de site', fichier: 'cours.html#ch12', duree: 30 },
    liquefaction: { titre: 'La liquéfaction des sols', fichier: 'cours.html#ch13', duree: 25 },
    ductilite: { titre: 'Ductilité et coefficient de comportement', fichier: 'cours.html#ch14', duree: 25 },
    batiment: { titre: 'Analyse modale d\'un bâtiment', fichier: 'cours.html#ch15', duree: 30 },
    poussee: { titre: 'Poussée progressive et méthode N2', fichier: 'cours.html#ch16', duree: 30 },
    isolation: { titre: 'L\'isolation à la base', fichier: 'cours.html#ch17', duree: 25 },
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
  return { CHAPITRES, ANCRES, LECONS, ordre, situer, depuisAncre, debutsDeChapitre };
})();
export default Parcours;
