import Parcours from './parcours.js';
import { carteConsigne } from './consignes.js';

// src/onglets.js — onglets des bancs et fil du parcours. Chaque banc écoute l'événement « banc:ouvert » et se
// construit à sa première ouverture ; l'ancre de l'adresse (Parcours.ANCRES : #localisation, #accelerogrammes,
// #effets-de-site, #poussee-progressive…) ouvre le banc voulu. Le bandeau rappelle la partie du cours et propose
// les bancs précédent et suivant dans l'ordre du cours, et le chapitre du cours (cours.html#chN) quand il est rédigé.
// Chaque banc commence par sa consigne (src/consignes.js) ; le titre de la page suit le banc ouvert.
const ANCRES = Parcours.ANCRES;
const nomBanc = b => document.querySelector(`[data-onglet="${b}"]`).textContent.trim();

function majParcours(banc) {
  const p = Parcours.situer(banc);
  document.getElementById('parcours-chapitre').textContent = `Partie ${String.fromCharCode(65 + p.chapitre)} · ${p.titre} · banc ${p.position + 1} sur ${p.taille}`;
  // le chapitre du cours dont le banc est le TP, quand il est rédigé
  const l = Parcours.LECONS[banc], lien = document.getElementById('parcours-lecon');
  lien.hidden = !l.fichier;
  if (l.fichier) { lien.href = l.fichier; lien.textContent = `Lire le cours : ${l.titre}`; }
  for (const [id, cible, fleche] of [['parcours-prec', p.precedent, '←'], ['parcours-suiv', p.suivant, '→']]) {
    const b = document.getElementById(id);
    b.hidden = !cible;
    if (cible) { b.dataset.cible = cible; b.textContent = fleche === '←' ? `← ${nomBanc(cible)}` : `${nomBanc(cible)} →`; }
  }
}

// bancs qui annoncent un calcul de signal dans le badge de la bannière
const AVEC_SIGNAL = ['station', 'reseau', 'profil', 'spectre'];

function ouvrir(banc) {
  for (const b of Parcours.ordre) {
    document.getElementById('banc-' + b).hidden = b !== banc;
    document.getElementById('chapeau-' + b).hidden = b !== banc;
    document.querySelector(`[data-onglet="${b}"]`).setAttribute('aria-pressed', String(b === banc));
  }
  document.getElementById('reperes').hidden = banc !== 'station' && banc !== 'reseau';
  document.getElementById('etat-calcul').hidden = !AVEC_SIGNAL.includes(banc);
  const titre = Parcours.LECONS[banc].titre;
  document.getElementById('titre-banc').textContent = titre;
  document.title = `${titre} — Travaux pratiques — Sismologie`;
  majParcours(banc);
  try { history.replaceState(null, '', '#' + ANCRES[banc]); } catch (e) { /* adresse figée : sans conséquence */ }
  window.dispatchEvent(new CustomEvent('banc:ouvert', { detail: banc }));
}

// consigne en tête de chaque banc : objectif, étapes, ce qu'il faut rendre, durée et chapitre du cours
for (const b of Parcours.ordre) {
  const c = document.getElementById('consigne-' + b);
  if (c) c.innerHTML = carteConsigne(b, Parcours.LECONS[b]);
}

// séparation visuelle des chapitres dans la barre des bancs : un écart, et un retour à la ligne sur téléphone
for (const b of Parcours.debutsDeChapitre.slice(1)) {
  const bouton = document.querySelector(`[data-onglet="${b}"]`), saut = document.createElement('span');
  bouton.dataset.debutChapitre = '';
  saut.className = 'saut'; saut.setAttribute('aria-hidden', 'true');
  bouton.before(saut);
}
document.querySelectorAll('[data-onglet]').forEach(b => b.addEventListener('click', () => ouvrir(b.dataset.onglet)));
for (const id of ['parcours-prec', 'parcours-suiv']) {
  document.getElementById(id).addEventListener('click', e => {
    ouvrir(e.currentTarget.dataset.cible);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
const depart = Parcours.depuisAncre(location.hash);
if (depart && depart !== 'station') ouvrir(depart);
else { majParcours('station'); document.getElementById('titre-banc').textContent = Parcours.LECONS.station.titre; }
