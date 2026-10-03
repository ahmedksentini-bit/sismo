// Curseurs de calcul en direct. Un champ numérique marqué
// data-curseur="min max pas" reçoit une réglette sous sa case : la faire
// glisser réécrit la case et relance le calcul à chaque cran ; une valeur
// tapée au clavier replace la réglette. La case reste la référence — on peut
// y saisir une valeur hors de la plage de la réglette, qui se grise alors.

const decimales = (pas) => Math.max(0, Math.min(6, Math.ceil(-Math.log10(pas) - 1e-9)));

/** Pose les réglettes manquantes sous `racine` (à rappeler après un rendu dynamique). */
export function poserCurseurs(racine = document) {
  for (const champ of racine.querySelectorAll("input[data-curseur]:not([data-curseur-pose])")) {
    const [min, max, pas] = champ.dataset.curseur.trim().split(/\s+/).map(Number);
    if (!(max > min && pas > 0)) continue;
    const r = document.createElement("input");
    r.type = "range";
    r.className = "curseur";
    r.min = String(min); r.max = String(max); r.step = String(pas);
    // La case reste l'entrée au clavier et pour les lecteurs d'écran ; la
    // réglette sert à la souris et au doigt.
    r.tabIndex = -1;
    r.setAttribute("aria-hidden", "true");
    const lire = () => parseFloat(String(champ.value).replace(/\s/g, "").replace(",", "."));
    const caler = () => {
      const v = lire();
      if (Number.isFinite(v)) r.value = String(Math.min(max, Math.max(min, v)));
      r.classList.toggle("hors-plage", !Number.isFinite(v) || v < min || v > max);
    };
    r.addEventListener("input", () => {
      champ.value = Number(r.value).toFixed(decimales(pas));
      champ.dispatchEvent(new Event("input", { bubbles: true }));
    });
    r.addEventListener("change", () => champ.dispatchEvent(new Event("change", { bubbles: true })));
    champ.addEventListener("input", caler);
    champ.addEventListener("change", caler);
    caler();
    (champ.closest(".input-wrap") ?? champ).insertAdjacentElement("afterend", r);
    champ.dataset.curseurPose = "";
  }
}

poserCurseurs();
