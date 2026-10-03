// Registre des modèles d'exercices, chapitre par chapitre. Chargement à la
// demande : l'exerciseur n'importe que le chapitre ouvert.
export const MODELES = {
  ch1: () => import("./ch01.js"),
  ch2: () => import("./ch02.js"),
  ch3: () => import("./ch03.js"),
  ch4: () => import("./ch04.js"),
  ch5: () => import("./ch05.js"),
  ch6: () => import("./ch06.js"),
  ch7: () => import("./ch07.js"),
  ch8: () => import("./ch08.js"),
  ch9: () => import("./ch09.js"),
  ch10: () => import("./ch10.js"),
  ch11: () => import("./ch11.js"),
  ch12: () => import("./ch12.js"),
  ch13: () => import("./ch13.js"),
  ch14: () => import("./ch14.js"),
  ch15: () => import("./ch15.js"),
  ch16: () => import("./ch16.js"),
  ch17: () => import("./ch17.js"),
};

/** Graine stable d'un exercice de banque (FNV-1a sur l'identifiant). */
export function graineDe(texte) {
  let h = 0x811c9dc5;
  for (const c of texte) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Contrôle d'un exercice généré : réponses finies, indices de choix valides,
 * aucune valeur « NaN », « undefined » ou « Infinity » dans les textes.
 * Renvoie la liste des anomalies (vide si tout va bien).
 */
export function controler(exo) {
  const pb = [];
  const textes = [exo.enonce, ...(exo.donnees ?? []).map((d) => `${d.label} ${d.valeur}`)];
  exo.questions.forEach((q, i) => {
    textes.push(q.texte, q.explication, ...(q.options ?? []));
    if (q.type === "nombre" && !Number.isFinite(q.reponse)) pb.push(`question ${i + 1} : réponse non finie`);
    if (q.type === "choix" && !(q.reponse >= 0 && q.reponse < q.options.length)) pb.push(`question ${i + 1} : indice de réponse invalide`);
    if (q.type === "choix" && new Set(q.options).size !== q.options.length) pb.push(`question ${i + 1} : options en double`);
  });
  for (const t of textes) if (/NaN|undefined|Infinity|\[object/.test(String(t))) pb.push(`texte suspect : « ${String(t).slice(0, 80)} »`);
  return pb;
}
