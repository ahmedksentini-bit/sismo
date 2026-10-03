// Un tableau plus large que l'écran doit défiler DANS sa boîte, jamais pousser
// la page entière. Les tableaux des figures étant réécrits à chaque saisie, un
// simple balayage au chargement ne suffit pas : on observe les insertions.
//
// Une seule règle, appliquée partout, y compris aux chapitres à venir.

const envelopper = (t) => {
  if (t.parentElement?.classList.contains("table-large")) return;
  const boite = document.createElement("div");
  boite.className = "table-large";
  t.replaceWith(boite);
  boite.appendChild(t);
};

const balayer = (racine) => {
  if (racine.tagName === "TABLE") envelopper(racine);
  else racine.querySelectorAll?.("table").forEach(envelopper);
};

balayer(document.body);

new MutationObserver((mutations) => {
  for (const m of mutations)
    for (const n of m.addedNodes) if (n.nodeType === 1) balayer(n);
}).observe(document.body, { childList: true, subtree: true });
