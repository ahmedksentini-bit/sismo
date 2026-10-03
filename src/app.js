// Accueil et navigation par chapitre (repris du site de fondations). Le contenu vient de
// data/chapitres.json : ajouter un chapitre ou une notion ne demande aucune modification de ce fichier.
// Les anciennes adresses des bancs (#station, #alea…) renvoient vers labo.html.

import { chargerBanque, rendreListe, rendreExercice } from "./exercices.js";
import { chargerJson } from "./donnees.js";
import Parcours from "./parcours.js";

// Ancienne adresse d'un banc (avant que les bancs ne passent dans labo.html) : on y renvoie.
if (Parcours.depuisAncre(location.hash)) location.replace("labo.html" + location.hash);

const app = document.getElementById("app");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let COURS = null;

async function charger() {
  COURS = await chargerJson("data/chapitres.json");
}

function accueil() {
  const { cours, parties, chapitres } = COURS;
  const parPartie = parties.map((p) => {
    const liste = chapitres.filter((c) => c.partie === p.id);
    if (!liste.length) return "";
    return `<div class="section-title"><div><h2>Partie ${esc(p.id)} — ${esc(p.titre)}</h2>
      <p>${esc(p.resume)}</p></div></div>
      <section class="chapter-grid">${liste.map(carteChapitre).join("")}</section>`;
  }).join("");

  app.innerHTML = `
  <section class="hero">
    <p class="eyebrow">${esc(cours.sous_titre)}</p>
    <h1>${esc(cours.titre)}</h1>
    <p>Du sismogramme au calcul des ouvrages : lire un enregistrement, localiser et mesurer un
       séisme, en tirer l'aléa d'un site, choisir le mouvement de projet, puis dimensionner selon
       l'Eurocode 8 — avec, à chaque chapitre, un banc de travaux pratiques.</p>
    <div class="signature">${esc(cours.etablissement)}<br><strong>${esc(cours.enseignant)}</strong></div>
  </section>

  <div class="section-title"><div><h2>Ressources du cours</h2>
    <p>Le polycopié, le cours interactif, l'exerciseur et les travaux pratiques.</p></div></div>
  <section class="resource-grid ressources-4">
    <a class="resource" href="polycopie/sismologie-polycopie.pdf" rel="noopener"><span class="resource-mark">PDF</span>
      <h3>Polycopié</h3><p>Le cours complet, imprimable : notions, formules, exemples chiffrés et
      ce que l'ingénieur en retient.</p></a>
    <a class="resource" href="cours.html"><span class="resource-mark">§</span>
      <h3>Cours interactif</h3><p>Le même cours à l'écran, avec des figures et des
      calculateurs qu'on manipule au fil du texte.</p></a>
    <a class="resource" href="exerciseur.html"><span class="resource-mark">∑</span>
      <h3>Exerciseur</h3><p>Des exercices à données tirées au hasard, corrigés pas à pas,
      en mode apprentissage, entraînement ou examen.</p></a>
    <a class="resource" href="labo.html"><span class="resource-mark">≈</span>
      <h3>Travaux pratiques</h3><p>Dix-sept bancs interactifs : pointer un sismogramme, localiser un
      séisme, calculer l'aléa, caler des accélérogrammes, pousser un bâtiment — avec un exercice noté.</p></a>
  </section>

  ${parPartie}`;

  app.querySelectorAll("[data-chapitre]").forEach((b) =>
    b.addEventListener("click", () => ouvrirChapitre(b.dataset.chapitre)));
}

function carteChapitre(ch) {
  const n = Number(ch.exercices || 0);
  const etat = n > 0 ? `${n} exercice${n > 1 ? "s" : ""} →`
             : ch.cours ? "cours disponible →"
             : "en préparation";
  return `<button class="chapter" data-chapitre="${esc(ch.id)}">
    <span class="num">${ch.number}</span>
    <h3>${esc(ch.title)}</h3>
    <p>${esc(ch.description)}</p>
    <span class="count">${etat}</span>
  </button>`;
}

async function ouvrirChapitre(id) {
  const ch = COURS.chapitres.find((c) => c.id === id);
  if (!ch) return;
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  const banque = ch.exercices ? await chargerBanque(id) : null;
  app.innerHTML = `
    <button class="back" id="retour">← Tous les chapitres</button>
    <section class="chapter-banner"><span class="num">${ch.number}</span>
      <div><h1>${esc(ch.title)}</h1><p>${esc(ch.description)}</p></div></section>
    <div class="card">
      <h2>Notions traitées</h2>
      <ul class="notions">${ch.notions.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <div class="actions">
        <a class="primary" href="cours.html#${esc(ch.id)}">Cours interactif</a>
        <a class="secondary" href="exerciseur.html#${esc(ch.id)}">Exerciseur</a>
        <a class="secondary" href="labo.html#${esc(Parcours.ANCRES[ch.banc] ?? "")}">Travaux pratiques</a>
      </div>
    </div>
    <div class="card" id="zoneExos">
      <h2>Exercices</h2>
      ${ch.cours ? rendreListe(banque, null) : `<p class="en-preparation">Ce chapitre est en préparation.</p>`}
    </div>`;
  if (!ch.cours) {
    const lien = app.querySelector('a.primary[href^="cours.html"]');
    if (lien) { lien.classList.replace("primary", "ghost"); lien.textContent = "Cours en préparation"; }
  }
  document.getElementById("retour").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    accueil();
  });
  app.querySelectorAll("[data-exo]").forEach((b) =>
    b.addEventListener("click", () => {
      const exo = banque.exercices.find((e) => e.id === b.dataset.exo);
      rendreExercice(exo, app, () => ouvrirChapitre(id));
      app.focus();
    }));
  app.focus();
}

function router() {
  const id = location.hash.replace("#", "");
  if (id && COURS.chapitres.some((c) => c.id === id)) ouvrirChapitre(id);
  else accueil();
}

charger().then(() => {
  router();
  window.addEventListener("hashchange", router);
  document.getElementById("homeButton").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    accueil();
  });
}).catch((e) => {
  app.innerHTML = `<div class="card"><h2>Chargement impossible</h2><p>${esc(e.message)}</p></div>`;
});
