// Outils communs aux modèles d'exercices.
//
// Un « modèle » d'exercice est un objet { id, titre, difficulte, generer(a) }
// où a est un générateur pseudo-aléatoire à graine. generer renvoie
// { enonce, donnees?, figure?, questions }, les réponses étant calculées par
// les solveurs de src/sismo : l'exerciseur tire des données au hasard, et
// tools/generer-exercices.mjs fige une graine par exercice pour produire les
// banques data/exercices-chN.json. Aucune réponse n'est donc écrite à la main.

/** Nombre au format français, chiffres significatifs. */
export const fr = (x, chiffres = 3) => (Number.isFinite(x)
  ? Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: chiffres }) : "—");
/** Nombre au format français, décimales fixes. */
export const frd = (x, decimales = 2) => (Number.isFinite(x)
  ? Number(x).toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) : "—");

/** Générateur mulberry32 : rapide, reproductible, suffisant pour tirer des données. */
export function creerAlea(graine = (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0) {
  let s = (graine >>> 0) || 1;
  const suivant = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    graine,
    reel: suivant,
    /** Valeur de [a ; b] sur une grille de pas donné (bornes comprises). */
    entre(a, b, pas = 0.1) {
      const n = Math.round((b - a) / pas);
      return +(a + pas * Math.floor(suivant() * (n + 1))).toFixed(10);
    },
    entier(a, b) { return a + Math.floor(suivant() * (b - a + 1)); },
    choix(t) { return t[Math.floor(suivant() * t.length)]; },
    /** k éléments distincts d'un tableau, dans un ordre tiré au hasard. */
    tirage(t, k = t.length) {
      const c = [...t];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(suivant() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c.slice(0, k);
    },
  };
}

/**
 * Question numérique. Tolérance relative par défaut (2 %) : on juge un calcul
 * mené avec des valeurs intermédiaires arrondies, pas la dernière décimale.
 */
export function nombre(texte, reponse, unite, explication, { rel = 0.02, abs = null } = {}) {
  const q = { texte, type: "nombre", unite, reponse: +reponse.toPrecision(6), explication };
  if (abs !== null) q.tolerance = abs;
  else q.toleranceRel = rel;
  return q;
}

/** Question à choix unique ; reponse est l'indice de la bonne option. */
export const choix = (texte, options, reponse, explication) => ({ texte, type: "choix", options, reponse, explication });

/**
 * Question à choix dont les options sont mélangées par l'aléa ; la bonne
 * réponse est la première de la liste fournie.
 */
export function choixMelange(a, texte, [bonne, ...fausses], explication) {
  const options = a.tirage([bonne, ...fausses]);
  return choix(texte, options, options.indexOf(bonne), explication);
}

/** Ligne de données de l'énoncé. */
export const donnee = (label, valeur) => ({ label, valeur });
