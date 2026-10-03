// Exerciseur : les modèles de src/exos, tirés avec une graine aléatoire.
// Adresse : exerciseur.html#ch6 (chapitre), #ch6/ch6-ple (modèle), et
// #ch6/ch6-ple/123456 (tirage précis, pour le partager ou le corriger en séance).

import { chargerJson } from "./donnees.js";
import { creerAlea } from "./exos/alea.js";
import { MODELES, controler } from "./exos/index.js";
import { rendreExercice } from "./exercices.js";

const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nouvelleGraine = () => (Math.random() * 2 ** 31) >>> 0;

let CHAPITRES = [];
let modeCourant = "apprentissage";

async function modelesDe(id) {
  return (await MODELES[id]()).default;
}

function toast(texte) {
  const t = document.getElementById("toast");
  t.textContent = texte;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

async function accueil(idChapitre) {
  const disponibles = CHAPITRES.filter((c) => MODELES[c.id]);
  const courant = disponibles.find((c) => c.id === idChapitre) ?? disponibles[0];
  const modeles = await modelesDe(courant.id);
  app.innerHTML = `
    <section class="chapter-banner"><span class="num">∑</span>
      <div><h1>Exerciseur</h1>
      <p>Chaque exercice est tiré avec des données nouvelles et corrigé par les mêmes solveurs que le
         cours et les bancs de travaux pratiques. Trois modes : apprentissage (la méthode se déplie à la demande),
         entraînement (correction immédiate), examen (chronométré, corrigé à la remise).</p></div></section>
    <div class="card" style="margin-top:17px">
      <h2>Chapitre</h2>
      <div class="filtres">${disponibles.map((c) =>
        `<button data-ch="${c.id}"${c.id === courant.id ? ' class="active"' : ""}>${c.number} · ${esc(c.title)}</button>`).join("")}</div>
      <div class="actions" style="margin-top:0">
        <button class="primary" id="hasard">Un exercice au hasard dans ce chapitre</button>
        <a class="secondary" href="cours.html#${courant.id}">Relire le cours du chapitre ${courant.number}</a>
      </div>
    </div>
    <div class="card">
      <h2>${esc(courant.title)} — ${modeles.length} modèles d'exercice</h2>
      <section class="exercise-list">${modeles.map((m, i) => `
        <button class="exercise-card" data-modele="${esc(m.id)}">
          <span class="exercise-index">${i + 1}</span>
          <span><strong>${esc(m.titre)}</strong><small>Niveau ${m.difficulte} · données tirées au hasard</small></span>
          <span class="arrow">→</span></button>`).join("")}</section>
    </div>`;
  app.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.ch; }));
  app.querySelectorAll("[data-modele]").forEach((b) => b.addEventListener("click", () => {
    location.hash = `${courant.id}/${b.dataset.modele}/${nouvelleGraine()}`;
  }));
  app.querySelector("#hasard").addEventListener("click", () => {
    const m = modeles[Math.floor(Math.random() * modeles.length)];
    location.hash = `${courant.id}/${m.id}/${nouvelleGraine()}`;
  });
}

async function ouvrir(idChapitre, idModele, graine) {
  const ch = CHAPITRES.find((c) => c.id === idChapitre);
  const modeles = await modelesDe(idChapitre);
  const m = modeles.find((x) => x.id === idModele);
  if (!m) return accueil(idChapitre);
  let exo;
  try {
    exo = { id: m.id, titre: m.titre, difficulte: m.difficulte, ...m.generer(creerAlea(graine)) };
  } catch (e) {
    console.error(e);
    toast("Tirage impossible, nouvel essai.");
    location.hash = `${idChapitre}/${idModele}/${nouvelleGraine()}`;
    return;
  }
  const pb = controler(exo);
  if (pb.length) console.warn(`Tirage ${graine} de ${m.id} :`, pb);
  rendreExercice(exo, app, () => { location.hash = idChapitre; }, {
    mode: modeCourant,
    libelleRetour: `Exercices du chapitre ${ch.number}`,
    sousTitre: `chapitre ${ch.number} · tirage n° ${graine}`,
    nouveau: (mode) => { modeCourant = mode; location.hash = `${idChapitre}/${idModele}/${nouvelleGraine()}`; },
    onMode: (mode) => { modeCourant = mode; },
  });
  app.focus();
  window.scrollTo(0, 0);
}

function router() {
  const [idChapitre, idModele, graine] = location.hash.replace("#", "").split("/");
  if (idChapitre && MODELES[idChapitre] && idModele) {
    const g = Number(graine);
    if (!Number.isFinite(g) || g <= 0) { location.replace(`#${idChapitre}/${idModele}/${nouvelleGraine()}`); return; }
    ouvrir(idChapitre, idModele, g);
  } else accueil(idChapitre);
}

chargerJson("data/chapitres.json").then((d) => {
  CHAPITRES = d.chapitres;
  router();
  window.addEventListener("hashchange", router);
}).catch((e) => {
  app.innerHTML = `<div class="card"><h2>Chargement impossible</h2><p>${esc(e.message)}</p></div>`;
});
