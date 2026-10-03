// Exercices du chapitre 11 : choisir et caler des accélérogrammes. Spectres des accélérogrammes synthétiques
// du banc ; facteurs d'échelle et règles de l'EN 1998-1:2004 par le module Selection.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Spectre from "../sismo/spectre.js";
import Selection from "../sismo/selection.js";

export default [
  {
    id: "ch11-regles", titre: "Un jeu d'accélérogrammes respecte-t-il l'Eurocode 8 ?", difficulte: 2,
    generer(a) {
      const sol = a.choix(["A", "B", "C"]), ag = a.entre(0.1, 0.3, 0.01), p = Spectre.EC8_2004[1][sol], T1 = a.choix([0.3, 0.5, 0.8]);
      const n = a.choix([3, 5, 7]), pga = +(ag * p.S * a.entre(0.85, 1.3, 0.01)).toFixed(3), rmin = a.entre(0.8, 1.15, 0.01);
      const k = Math.max((ag * p.S) / pga, 1 / rmin);
      return {
        enonce: `${n} accélérogrammes ont été calés pour un ouvrage de période T₁ = ${fr(T1, 2)} s, sur un site de classe ${sol} (type 1, S = ${frd(p.S, 2)}), a_g = ${frd(ag, 2)} g. Leur PGA moyen vaut ${fr(pga, 3)} g ; sur la plage de contrôle, leur spectre moyen descend au plus bas à ${frd(100 * 0.9 * rmin, 0)} % du spectre élastique.`,
        donnees: [donnee("Nombre", `${n}`), donnee("a_g·S", `${frd(ag, 2)} × ${frd(p.S, 2)}`), donnee("PGA moyen", `${fr(pga, 3)} g`), donnee("Minimum du spectre moyen", `${frd(100 * 0.9 * rmin, 0)} % de Se`)],
        questions: [
          nombre("Bornes de la plage de contrôle : borne supérieure 2·T₁ ?", 2 * T1, "s", `La moyenne est contrôlée de 0,2·T₁ = ${fr(0.2 * T1, 2)} s à 2·T₁ = ${fr(2 * T1, 2)} s.`, { rel: 0.01 }),
          choixMelange(a, "La règle du PGA moyen est-elle respectée ?", pga >= ag * p.S - 1e-9 ? ["oui", "non"] : ["non", "oui"], `Il faut PGA moyen ≥ ag·S = ${fr(ag * p.S, 3)} g ; ici ${fr(pga, 3)} g.`),
          choixMelange(a, "La règle des 90 % est-elle respectée ?", rmin >= 1 - 1e-9 ? ["oui", "non"] : ["non", "oui"], `La moyenne doit rester ≥ 90 % de Se sur la plage ; elle descend à ${frd(100 * 0.9 * rmin, 0)} %.`),
          nombre("Plus petit facteur commun qui rend le jeu conforme (1 s'il l'est déjà) ?", Math.max(1, k), "", `Facteur = max(ag·S / PGA moyen ; 90 % / minimum) = max(${frd((ag * p.S) / pga, 3)} ; ${frd(1 / rmin, 3)})${k <= 1 ? " ≤ 1 : le jeu est déjà conforme" : ` = ${frd(k, 3)}`}.`, { rel: 0.01 }),
          choixMelange(a, `Avec ${n} calculs temporels, la réponse à retenir est…`, n >= 7 ? ["la moyenne des réponses", "la réponse la plus défavorable"] : ["la réponse la plus défavorable", "la moyenne des réponses"],
            "§ 4.3.3.4.3 (3) : la moyenne dès 7 calculs, sinon la plus défavorable."),
        ],
      };
    },
  },
  {
    id: "ch11-facteur", titre: "Facteur d'échelle sur une plage de périodes", difficulte: 2,
    generer(a) {
      const T = [0.2, 0.3, 0.5, 0.7, 1.0], cible = T.map((t) => Spectre.ec8(t, { type: 1, sol: "B", ag: 0.2 }));
      const Sa = cible.map((c) => +(c * a.entre(0.25, 0.7, 0.01)).toFixed(3)), ln = cible.map(Math.log), idx = T.map((_, k) => k);
      const s = Selection.facteur(Sa, ln, idx), k = a.entier(0, 4);
      return {
        enonce: `Un enregistrement a pour pseudo-accélérations ${T.map((t, i) => `${fr(Sa[i], 3)} g à ${fr(t, 2)} s`).join(", ")}. La cible (spectre de l'EN 1998-1:2004, sol B, a_g = 0,2 g) vaut ${T.map((t, i) => `${fr(cible[i], 3)} g`).join(", ")} aux mêmes périodes.`,
        donnees: T.map((t, i) => donnee(`T = ${fr(t, 2)} s`, `Sa ${fr(Sa[i], 3)} g · cible ${fr(cible[i], 3)} g`)),
        questions: [
          nombre("Facteur qui égale la cible à T* = " + fr(T[k], 2) + " s ?", cible[k] / Sa[k], "", `s = ${fr(cible[k], 3)} / ${fr(Sa[k], 3)} = ${fr(cible[k] / Sa[k], 3)}.`),
          nombre("Facteur par moindres carrés en ln sur les cinq périodes ?", s, "", `ln s = moyenne de ln(cible/Sa) = (${T.map((_, i) => frd(Math.log(cible[i] / Sa[i]), 3)).join(" + ")})/5 = ${frd(Math.log(s), 3)} → s = ${fr(s, 3)}.`, { rel: 0.02 }),
          choixMelange(a, "Pourquoi éviter les facteurs d'échelle très grands (au-delà de 4) ?",
            ["un séisme faible mis à l'échelle n'a ni la durée ni le contenu fréquentiel d'un fort séisme", "ils rendent le calcul instable", "l'Eurocode les interdit au-delà de 1,2", "ils changent la période de l'ouvrage"],
            "Le facteur multiplie l'amplitude sans changer la durée ni la forme du spectre, qui dépendent de la magnitude."),
        ],
      };
    },
  },
  {
    id: "ch11-arias", titre: "Intensité d'Arias et durée", difficulte: 1,
    generer(a) {
      const A = a.entre(0.05, 0.4, 0.01), D = a.entier(2, 20), ia = (Math.PI * (A * 9.81) ** 2 * D) / (4 * 9.81);
      return {
        enonce: `Un mouvement idéalisé est une sinusoïde d'amplitude ${frd(A, 2)} g qui dure ${D} s (un nombre entier de cycles).`,
        donnees: [donnee("Amplitude", `${frd(A, 2)} g`), donnee("Durée", `${D} s`)],
        questions: [
          nombre("Intensité d'Arias Ia = π/(2g)·∫a²dt ?", ia, "m/s", `∫a²dt = A²·D/2 pour une sinusoïde : Ia = π·A²·D/(4g) = π × ${fr(A * 9.81, 3)}² × ${D} / (4 × 9,81) = ${fr(ia, 3)} m/s.`),
          nombre("Et si la même amplitude durait deux fois plus longtemps ?", 2 * ia, "m/s", "Ia est proportionnelle à la durée : elle double."),
          nombre("Et si l'amplitude doublait pour la même durée ?", 4 * ia, "m/s", "Ia est proportionnelle au carré de l'amplitude : elle quadruple."),
          choixMelange(a, "La durée significative D5–95 est…",
            ["le temps entre 5 % et 95 % de l'intensité d'Arias", "la durée totale de l'enregistrement", "le temps entre l'arrivée P et l'arrivée S", "la période du pic du spectre"],
            "Trifunac et Brady (1975) : elle s'allonge avec la magnitude et la distance."),
        ],
      };
    },
  },
  {
    id: "ch11-cible", titre: "Quelle cible pour les accélérogrammes ?", difficulte: 1,
    generer(a) {
      const pool = [
        ["Pourquoi l'UHS est-il une cible conservatrice ?", ["aucun séisme n'atteint en même temps le niveau de 475 ans à toutes les périodes", "il est calculé sans dispersion", "il néglige les petits séismes", "il est toujours inférieur au spectre de l'Eurocode 8"],
          "Chaque ordonnée de l'UHS est dominée par des scénarios différents ; le spectre conditionnel ne prend le niveau de l'UHS qu'à une période T*."],
        ["Le spectre moyen conditionnel (CMS) est conditionné…", ["à une période T*, souvent la période fondamentale de l'ouvrage", "au PGA uniquement", "à la magnitude maximale", "à la durée significative"],
          "À T*, il égale l'UHS ; ailleurs, il donne la moyenne attendue sachant ce niveau (Baker, 2011)."],
        ["On choisit de préférence des enregistrements…", ["proches du scénario de la désagrégation (magnitude, distance, sol)", "de la plus forte magnitude disponible", "tous issus du même séisme", "de PGA égal à ag"],
          "Le scénario de contrôle (M̄, R̄) fixe la forme du spectre et la durée attendues."],
        ["La plage de contrôle 0,2·T₁ à 2·T₁ couvre…", ["les modes supérieurs (courtes périodes) et l'allongement de la période par la plastification", "seulement la période fondamentale", "les périodes du sol", "les périodes de l'instrument"],
          "La plastification allonge la période effective ; les modes supérieurs se trouvent sous T₁."],
        ["Les accélérogrammes artificiels, fabriqués pour épouser un spectre, ont souvent…", ["un contenu énergétique et une durée irréalistes", "un spectre trop dentelé", "un PGA trop faible", "une durée trop courte par construction"],
          "Ajuster toutes les périodes à la fois produit des signaux trop riches en énergie : on préfère des enregistrements réels ou simulés quand le comportement non linéaire dépend des cycles."],
      ];
      return { enonce: "Questions sur la cible et la sélection des accélérogrammes.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
