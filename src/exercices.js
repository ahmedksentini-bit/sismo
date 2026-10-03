// Moteur d'exercices : une banque par chapitre, trois modes de travail.
//   apprentissage — la méthode se déplie question par question, à la demande ;
//   entraînement  — correction et explication dès qu'une réponse est donnée ;
//   examen        — chronomètre, aucune correction avant la remise, puis le score.
// Deux types de question : « choix » (une bonne réponse) et « nombre » (avec
// tolérance absolue ou relative). Un exercice peut porter des données
// résumées (donnees) et une figure SVG (figure) produite par src/figures.js.

import { chargerJson } from "./donnees.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function chargerBanque(chapitreId) {
  // Une banque absente n'est pas une panne : le chapitre annonce alors
  // « en cours de rédaction ». On distingue quand même les deux dans la
  // console, pour qu'un fichier réellement manquant se voie.
  try {
    return await chargerJson(`data/exercices-${chapitreId}.json`);
  } catch (e) {
    console.warn("Banque d'exercices :", e.message);
    return null;
  }
}

export function rendreListe(banque) {
  if (!banque || !banque.exercices.length)
    return `<p class="method-note">Exercices de ce chapitre : en cours de rédaction.</p>`;
  return `<section class="exercise-list">${banque.exercices.map((e, i) => `
    <button class="exercise-card" data-exo="${esc(e.id)}">
      <span class="exercise-index">${i + 1}</span>
      <span><strong>${esc(e.titre)}</strong>
        <small>Niveau ${e.difficulte} · ${e.questions.length} question${e.questions.length > 1 ? "s" : ""}</small></span>
      <span class="arrow">→</span></button>`).join("")}</section>`;
}

export const MODES = [["apprentissage", "Apprentissage"], ["entrainement", "Entraînement"], ["examen", "Examen"]];
const MINUTES_PAR_QUESTION = 4;

/**
 * Affiche un exercice dans conteneur.
 * options.retour : libellé et action du bouton de retour ;
 * options.nouveau : si fourni, bouton « nouvelles données » (exerciseur) ;
 * options.mode : mode initial.
 */
export function rendreExercice(exo, conteneur, onRetour, options = {}) {
  let mode = options.mode ?? "entrainement";
  let minuterie = null;

  function arreterMinuterie() { if (minuterie) { clearInterval(minuterie); minuterie = null; } }

  function dessiner() {
    arreterMinuterie();
    conteneur.innerHTML = `
      <button class="back" id="retourExos">← ${esc(options.libelleRetour ?? "Exercices du chapitre")}</button>
      <section class="chapter-banner"><span class="num">${exo.difficulte}</span>
        <div><h1>${esc(exo.titre)}</h1><p>Niveau ${exo.difficulte}${options.sousTitre ? " · " + esc(options.sousTitre) : ""}</p></div></section>
      <div class="exo-barre">
        <div class="exo-modes">${MODES.map(([v, t]) =>
          `<button data-mode="${v}"${v === mode ? ' class="active"' : ""}>${t}</button>`).join("")}</div>
        ${options.nouveau ? `<button class="secondary" id="nouvellesDonnees">Nouvelles données</button>` : ""}
        ${mode === "examen" ? `<span class="exam-clock" id="horloge"></span>` : ""}
      </div>
      <div class="card"><h2>Énoncé</h2><p class="statement">${esc(exo.enonce)}</p>
        ${exo.donnees?.length ? `<div class="enonce-donnees">${exo.donnees.map((d) =>
          `<span><small>${esc(d.label)}</small><strong>${esc(d.valeur)}</strong></span>`).join("")}</div>` : ""}
        ${exo.figure ? `<figure class="figure-cours">${exo.figure}</figure>` : ""}
      </div>
      <div class="card">
        <h2>Questions</h2>
        ${exo.questions.map((q, i) => bloc(q, i)).join("")}
        ${mode === "examen"
          ? `<div class="actions"><button class="primary" id="remettre">Remettre la copie</button></div>`
          : `<div class="actions"><button class="ghost" id="bilan">Faire le point</button></div>`}
        <div id="score"></div>
      </div>`;

    conteneur.querySelector("#retourExos").addEventListener("click", () => { arreterMinuterie(); onRetour(); });
    conteneur.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => { mode = b.dataset.mode; options.onMode?.(mode); dessiner(); }));
    const nd = conteneur.querySelector("#nouvellesDonnees");
    if (nd) nd.addEventListener("click", () => { arreterMinuterie(); options.nouveau(mode); });

    if (mode !== "examen") {
      exo.questions.forEach((q, i) => {
        conteneur.querySelectorAll(`[name="q${i}"]`).forEach((input) =>
          input.addEventListener("change", () => corriger(q, i, mode === "entrainement")));
        const champ = conteneur.querySelector(`#n${i}`);
        if (champ) champ.addEventListener("change", () => corriger(q, i, mode === "entrainement"));
        const voir = conteneur.querySelector(`#v${i}`);
        if (voir) voir.addEventListener("click", () => {
          conteneur.querySelector(`#e${i}`).hidden = false;
          voir.hidden = true;
        });
      });
      conteneur.querySelector("#bilan").addEventListener("click", () => noter(false));
    } else {
      const remise = conteneur.querySelector("#remettre");
      remise.addEventListener("click", () => noter(true));
      let reste = MINUTES_PAR_QUESTION * 60 * exo.questions.length;
      const horloge = conteneur.querySelector("#horloge");
      const afficher = () => { horloge.textContent = `${Math.floor(reste / 60)} min ${String(reste % 60).padStart(2, "0")} s`; };
      afficher();
      minuterie = setInterval(() => {
        if (!conteneur.isConnected) return arreterMinuterie();
        reste--;
        afficher();
        if (reste <= 0) { horloge.textContent = "Temps écoulé"; noter(true); }
      }, 1000);
    }
  }

  function bloc(q, i) {
    const corps = q.type === "choix"
      ? `<div class="exo-choix" id="c${i}">${q.options.map((o, k) => `
          <label data-opt="${k}"><input type="radio" name="q${i}" value="${k}"> ${esc(o)}</label>`).join("")}</div>`
      : `<div class="answer-row"><div class="input-wrap">
           <input id="n${i}" type="text" inputmode="decimal" placeholder="votre réponse" aria-label="Réponse à la question ${i + 1}">
           ${q.unite ? `<span class="unit">${esc(q.unite)}</span>` : ""}</div></div>`;
    return `<div class="exo-question">
      <p class="question-title">${i + 1}. ${esc(q.texte)}</p>
      ${corps}
      <p class="feedback" id="f${i}"></p>
      ${mode === "apprentissage" ? `<button class="ghost exo-voir" id="v${i}">Voir la méthode</button>` : ""}
      <div class="exo-explication" id="e${i}" hidden>${esc(q.explication)}</div>
    </div>`;
  }

  /** Corrige une question ; montrer : afficher l'explication aussitôt. */
  function corriger(q, i, montrer = true) {
    const feedback = conteneur.querySelector(`#f${i}`);
    let juste = false;
    if (q.type === "choix") {
      const choisi = conteneur.querySelector(`[name="q${i}"]:checked`);
      if (!choisi) { feedback.textContent = "Pas de réponse."; feedback.className = "feedback bad"; }
      else {
        juste = Number(choisi.value) === q.reponse;
        conteneur.querySelectorAll(`#c${i} label`).forEach((l) => {
          const k = Number(l.dataset.opt);
          l.classList.toggle("juste", k === q.reponse && (juste || montrer));
          l.classList.toggle("faux", k === Number(choisi.value) && !juste);
        });
        feedback.textContent = juste ? "Exact." : "Ce n'est pas la bonne réponse.";
        feedback.className = `feedback ${juste ? "good" : "bad"}`;
      }
    } else {
      const v = parseFloat((conteneur.querySelector(`#n${i}`).value || "").replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(v)) { feedback.textContent = "Pas de réponse."; feedback.className = "feedback bad"; }
      else {
        // Tolérance absolue (« tolerance ») ou relative (« toleranceRel », en
        // fraction) : 2 % sur une portance, pas ± 0,05 kN.
        const tol = q.toleranceRel != null ? Math.abs(q.reponse) * q.toleranceRel : (q.tolerance ?? 0);
        juste = Math.abs(v - q.reponse) <= tol + 1e-12;
        const fr = (x) => x.toLocaleString("fr-FR", { maximumSignificantDigits: 4 });
        feedback.textContent = juste
          ? "Exact."
          : montrer
            ? `Attendu : ${fr(q.reponse)}${q.unite ? " " + q.unite : ""}${tol ? ` (± ${fr(tol)})` : ""}.`
            : "Pas encore : revoyez la méthode.";
        feedback.className = `feedback ${juste ? "good" : "bad"}`;
      }
    }
    if (montrer) conteneur.querySelector(`#e${i}`).hidden = false;
    return juste;
  }

  /** Bilan : en examen, tout est corrigé et révélé ; sinon, simple décompte. */
  function noter(definitif) {
    arreterMinuterie();
    let bons = 0;
    exo.questions.forEach((q, i) => { if (corriger(q, i, definitif || mode === "entrainement")) bons++; });
    const part = bons / exo.questions.length;
    conteneur.querySelector("#score").innerHTML =
      `<div class="exo-score${part < 0.5 ? " faible" : ""}">${bons} / ${exo.questions.length}
       — ${part >= 0.8 ? "maîtrisé" : part >= 0.5 ? "à consolider" : "à revoir"}</div>`;
    if (definitif) {
      const remise = conteneur.querySelector("#remettre");
      if (remise) remise.disabled = true;
      conteneur.querySelectorAll(".exo-question input").forEach((x) => { x.disabled = true; });
    }
  }

  dessiner();
}
