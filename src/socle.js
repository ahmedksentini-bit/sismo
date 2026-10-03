// Socle commun aux pages du cours (repris du site de fondations) : dire quand ça casse.
//
// Un module qui jette à son niveau supérieur laisse la page en place et ses figures vides.
// Rien ne s'affiche, rien ne se dit, et la console n'est pas ouvrable sur un téléphone :
// d'où la bannière ci-dessous. Le site n'a pas encore de service worker (pas de mode hors
// ligne) ; le diagnostic en tient compte.

const VERSION_ATTENDUE = "sismo-v1";

function banniere(titre, detail) {
  let boite = document.getElementById("bandeau-panne");
  if (!boite) {
    boite = document.createElement("div");
    boite.id = "bandeau-panne";
    boite.setAttribute("role", "alert");
    boite.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:100;"
      + "padding:12px 14px;border-radius:12px;background:#7f1d1d;color:#fff;"
      + "font:14px/1.45 Inter,-apple-system,system-ui,sans-serif;"
      + "box-shadow:0 10px 30px #0006;max-height:45vh;overflow:auto";
    boite.addEventListener("click", () => boite.remove());
    document.body.appendChild(boite);
  }
  const ligne = document.createElement("div");
  ligne.style.marginTop = boite.childElementCount ? "8px" : "0";
  ligne.innerHTML = `<strong>${titre}</strong><br>
    <span style="font-size:13px;opacity:.95">${detail}</span>`;
  boite.appendChild(ligne);
}

const echappe = (s) => String(s).replace(/[&<>]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// La version RÉELLEMENT en service, demandée au worker qui sert la page. Sans
// elle, impossible de savoir à distance si un téléphone tourne encore sur une
// version périmée — et c'est la première question à poser.
let versionServie = null;
if (navigator.serviceWorker?.controller) {
  const canal = new MessageChannel();
  canal.port1.onmessage = (e) => { versionServie = e.data?.version ?? null; };
  try {
    navigator.serviceWorker.controller.postMessage({ type: "version" }, [canal.port2]);
  } catch { /* un worker trop ancien ne répondra pas : c'est déjà une réponse */ }
}

/** Ce qu'il faut savoir pour diagnostiquer à distance, en une ligne. */
export function diagnostic() {
  const sw = navigator.serviceWorker?.controller;
  return [
    `page ${location.pathname.split("/").pop() || "index.html"}`,
    `écran ${window.innerWidth}×${window.innerHeight}`,
    sw ? `service worker ${versionServie ?? "version inconnue (ancienne)"}` : "sans service worker",
    `attendu ${VERSION_ATTENDUE}`,
  ].join(" · ");
}

/** Vrai pour une adresse d'un autre site : extension du navigateur, mesure d'audience… */
function etranger(adresse) {
  if (!adresse || typeof adresse !== "string") return false;
  try { return new URL(adresse, location.href).origin !== location.origin; } catch { return false; }
}

window.addEventListener("error", (e) => {
  // Les erreurs de chargement de ressource portent un `target` et pas de message.
  if (e.target && e.target !== window && e.target.tagName) {
    const adresse = e.target.src || e.target.href || "";
    // Seules les ressources du site disent quelque chose du cours. La mesure
    // d'audience que Cloudflare ajoute aux pages, par exemple, est arrêtée par
    // les bloqueurs de publicité : ce n'est pas une panne.
    if (etranger(adresse)) return;
    return banniere("Une ressource n'a pas pu être chargée",
      `${echappe(e.target.tagName.toLowerCase())} — ${echappe(adresse)}
       <br><small>${echappe(diagnostic())}</small>`);
  }
  // Même chose pour un script étranger qui plante : le navigateur n'en livre
  // que « Script error. », sans fichier.
  if (etranger(e.filename) || (!e.filename && e.message === "Script error.")) return;
  banniere("Une partie de la page n'a pas pu s'exécuter",
    `${echappe(e.message || "erreur inconnue")}<br><small>${echappe(diagnostic())}</small>`);
}, true);

window.addEventListener("unhandledrejection", (e) => {
  banniere("Un chargement a échoué",
    `${echappe(e.reason?.message || e.reason || "raison inconnue")}
     <br><small>${echappe(diagnostic())}</small>`);
});
