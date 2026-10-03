import Parcours from './parcours.js';

// src/onglets.js — onglets des bancs et fil du parcours. Chaque banc écoute l'événement « banc:ouvert » et se
// construit à sa première ouverture ; l'ancre de l'adresse (Parcours.ANCRES : #localisation, #accelerogrammes,
// #effets-de-site, #poussee-progressive…) ouvre le banc voulu. Le bandeau rappelle le chapitre et propose les
// bancs précédent et suivant dans l'ordre du cours, et la leçon du banc (cours/) quand elle existe.
const ANCRES = Parcours.ANCRES;
const nomBanc = b => document.querySelector(`[data-onglet="${b}"]`).textContent.trim();

function majParcours(banc) {
  const p = Parcours.situer(banc), n = Parcours.CHAPITRES.length;
  document.getElementById('parcours-chapitre').textContent = `Chapitre ${p.chapitre + 1} sur ${n} · ${p.titre} · banc ${p.position + 1} sur ${p.taille}`;
  // la leçon de cours du banc, quand elle est écrite
  const l = Parcours.LECONS[banc], lien = document.getElementById('parcours-lecon');
  lien.hidden = !l.fichier;
  if (l.fichier) { lien.href = 'cours/' + l.fichier; lien.textContent = `Lire la leçon : ${l.titre}`; }
  for (const [id, cible, fleche] of [['parcours-prec', p.precedent, '←'], ['parcours-suiv', p.suivant, '→']]) {
    const b = document.getElementById(id);
    b.hidden = !cible;
    if (cible) { b.dataset.cible = cible; b.textContent = fleche === '←' ? `← ${nomBanc(cible)}` : `${nomBanc(cible)} →`; }
  }
}

function ouvrir(banc) {
  for (const b of Parcours.ordre) {
    document.getElementById('banc-' + b).hidden = b !== banc;
    document.getElementById('chapeau-' + b).hidden = b !== banc;
    document.querySelector(`[data-onglet="${b}"]`).setAttribute('aria-pressed', String(b === banc));
  }
  document.getElementById('reperes').hidden = banc !== 'station' && banc !== 'reseau';
  majParcours(banc);
  try { history.replaceState(null, '', '#' + ANCRES[banc]); } catch (e) { /* adresse figée : sans conséquence */ }
  window.dispatchEvent(new CustomEvent('banc:ouvert', { detail: banc }));
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
else majParcours('station');
