import Parcours from '../parcours.js';

// src/cours/sommaire.js — sommaire du cours : les chapitres et leurs leçons, tirés du plan (src/parcours.js) ; chaque
// leçon renvoie à son TP (le banc du même nom).
(() => {
  'use strict';
  const NOMS = {
    station: 'Station', reseau: 'Réseau', mecanisme: 'Mécanisme', source: 'Source', sismometre: 'Sismomètre', profil: 'Profil',
    spectre: 'Spectre', sismicite: 'Sismicité', geodesie: 'Géodésie', alea: 'Aléa', selection: 'Accélérogrammes', site: 'Site',
    liquefaction: 'Liquéfaction', ductilite: 'Ductilité', batiment: 'Bâtiment', poussee: 'Poussée', isolation: 'Isolation',
  };
  function monter() {
    let rang = 0;
    document.getElementById('chapitres').innerHTML = Parcours.CHAPITRES.map((c, i) => `
      <section class="chapitre">
        <h2><small>Chapitre ${i + 1}</small>${c.titre}</h2>
        <ol class="lecons">${c.bancs.map(b => {
          const l = Parcours.LECONS[b]; rang++;
          const titre = l.fichier ? `<a href="${l.fichier}">${l.titre}</a><span class="etat">disponible</span>` : `<span>${l.titre}</span>`;
          return `<li class="${l.fichier ? 'disponible' : ''}"><span class="rang">${rang}</span><span class="titre">${titre}<small>${l.duree} min${l.fichier ? '' : ' · leçon à venir'}</small></span>`
            + `<a class="tp" href="../index.html#${Parcours.ANCRES[b]}">TP : ${NOMS[b]} →</a></li>`;
        }).join('')}</ol>
      </section>`).join('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter); else monter();
})();
