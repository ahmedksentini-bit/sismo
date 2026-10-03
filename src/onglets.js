// src/onglets.js — onglets des bancs. Chaque banc écoute l'événement « banc:ouvert » et se construit
// à sa première ouverture ; l'ancre de l'adresse (#localisation, #sismometre, #profil) ouvre le banc voulu.
const ANCRES = { station: 'station', reseau: 'localisation', sismometre: 'sismometre', profil: 'profil' };

function ouvrir(banc) {
  for (const b of Object.keys(ANCRES)) {
    document.getElementById('banc-' + b).hidden = b !== banc;
    document.getElementById('chapeau-' + b).hidden = b !== banc;
    document.querySelector(`[data-onglet="${b}"]`).setAttribute('aria-pressed', String(b === banc));
  }
  document.getElementById('reperes').hidden = banc === 'sismometre' || banc === 'profil';
  try { history.replaceState(null, '', '#' + ANCRES[banc]); } catch (e) { /* adresse figée : sans conséquence */ }
  window.dispatchEvent(new CustomEvent('banc:ouvert', { detail: banc }));
}

document.querySelectorAll('[data-onglet]').forEach(b => b.addEventListener('click', () => ouvrir(b.dataset.onglet)));
const depart = Object.keys(ANCRES).find(b => '#' + ANCRES[b] === location.hash);
if (depart && depart !== 'station') ouvrir(depart);
