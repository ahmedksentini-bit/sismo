// Exercices du chapitre 5 : le sismomètre, oscillateur à un degré de liberté. Les oscillations libres sont
// intégrées par Newmark (Oscillateur.integrer) : les maxima « lus » sortent du calcul, pas d'une formule.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Oscillateur from "../sismo/oscillateur.js";

export default [
  {
    id: "ch5-proprietes", titre: "Fréquence propre et amortissement d'un instrument", difficulte: 1,
    generer(a) {
      const m = a.entre(0.5, 5, 0.1), f0 = a.choix([0.5, 1, 2, 4.5, 10]), xi = a.choix([0.6, 0.7, 0.8]);
      const k = +(m * (2 * Math.PI * f0) ** 2).toPrecision(3), w = Math.sqrt(k / m), c = +(2 * xi * m * w).toPrecision(3);
      return {
        enonce: `La masse d'un sismomètre vaut ${frd(m, 1)} kg ; son ressort a une raideur de ${fr(k, 3)} N/m et son amortisseur un coefficient de ${fr(c, 3)} N·s/m.`,
        donnees: [donnee("m", `${frd(m, 1)} kg`), donnee("k", `${fr(k, 3)} N/m`), donnee("c", `${fr(c, 3)} N·s/m`)],
        questions: [
          nombre("Fréquence propre f₀ ?", w / (2 * Math.PI), "Hz", `ω₀ = √(k/m) = √(${fr(k, 3)} / ${frd(m, 1)}) = ${fr(w, 3)} rad/s ; f₀ = ω₀/2π = ${fr(w / (2 * Math.PI), 3)} Hz.`),
          nombre("Taux d'amortissement ξ ?", c / (2 * m * w), "", `ξ = c/(2mω₀) = ${fr(c, 3)} / (2 × ${frd(m, 1)} × ${fr(w, 3)}) = ${frd(c / (2 * m * w), 3)}.`, { abs: 0.02 }),
          nombre("Au-dessus de quelle fréquence l'instrument lit-il le déplacement du sol (r = f/f₀ ≥ 3) ?", 3 * w / (2 * Math.PI), "Hz", `3·f₀ = ${fr(3 * w / (2 * Math.PI), 3)} Hz : la masse y reste immobile, X ≈ −Ug.`),
          choixMelange(a, "Pourquoi amortir un sismomètre vers ξ = 0,7 ?",
            ["pour une réponse plate, sans pic de résonance autour de f₀", "pour augmenter sa sensibilité à f₀", "pour supprimer les ondes S", "pour qu'il lise l'accélération à toutes les fréquences"],
            "À ξ ≈ 0,7, la réponse en fréquence passe d'un régime à l'autre sans pic ; peu amorti, l'instrument amplifierait d'un facteur 1/(2ξ) le mouvement à f₀."),
        ],
      };
    },
  },
  {
    id: "ch5-decrement", titre: "Amortissement par le décrément logarithmique", difficulte: 2,
    generer(a) {
      const T0 = a.entre(0.2, 3, 0.05), xi = a.entre(0.02, 0.12, 0.005), x0 = a.choix([5, 10, 20]);
      const dt = T0 / 400, n = Math.round((4 * T0) / dt);
      const { x } = Oscillateur.integrer(new Float64Array(n), dt, 1 / T0, xi, x0, 0);
      const pics = [];
      for (let i = 1; i < n - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1]) pics.push([i * dt, +x[i].toFixed(2)]);
      const [p1, p2] = pics, delta = Math.log(p1[1] / p2[1]), Td = +(p2[0] - p1[0]).toFixed(3);
      return {
        enonce: `Un oscillateur écarté de ${x0} mm puis lâché passe par deux maxima successifs de ${frd(p1[1], 2)} mm et ${frd(p2[1], 2)} mm, séparés de ${frd(Td, 3)} s.`,
        donnees: [donnee("Maxima successifs", `${frd(p1[1], 2)} et ${frd(p2[1], 2)} mm`), donnee("Intervalle", `${frd(Td, 3)} s`)],
        questions: [
          nombre("Décrément logarithmique δ ?", delta, "", `δ = ln(${frd(p1[1], 2)} / ${frd(p2[1], 2)}) = ${frd(delta, 4)}.`, { rel: 0.03 }),
          nombre("Taux d'amortissement ξ ?", delta / Math.sqrt(4 * Math.PI ** 2 + delta ** 2), "", `ξ = δ/√(4π² + δ²) ≈ δ/2π = ${frd(delta / (2 * Math.PI), 4)} (amortissement de l'oscillateur simulé : ${frd(xi, 3)}).`, { rel: 0.05 }),
          nombre("Période propre non amortie T₀ ?", Td * Math.sqrt(1 - (delta / (2 * Math.PI)) ** 2), "s", `T₀ = Td·√(1 − ξ²) = ${frd(Td, 3)} × √(1 − ${frd(delta / (2 * Math.PI), 3)}²) ≈ ${frd(Td * Math.sqrt(1 - (delta / (2 * Math.PI)) ** 2), 3)} s : pour un faible amortissement, Td et T₀ se confondent.`, { rel: 0.01 }),
          nombre("Combien de cycles faut-il pour diviser l'amplitude par deux ?", Math.log(2) / delta, "cycles", `Chaque cycle divise l'amplitude par e^δ : n = ln 2/δ = ${frd(Math.log(2) / delta, 2)} cycles.`, { rel: 0.05 }),
        ],
      };
    },
  },
  {
    id: "ch5-reponse", titre: "Ce que lit un instrument", difficulte: 2,
    generer(a) {
      const [cle, inst] = a.choix(Object.entries(Oscillateur.INSTRUMENTS));
      const r = a.choix([0.1, 0.2, 1, 5, 10]), fs = +(r * inst.f0).toPrecision(3), A = a.choix([0.5, 1, 2]);
      const q = Oscillateur.reponse(fs, inst.f0, inst.xi), reg = Oscillateur.regime(fs, inst.f0);
      const w = 2 * Math.PI * fs, w0 = 2 * Math.PI * inst.f0, acc = A * w * w;
      const lit = reg === "sismometre" ? "le déplacement du sol" : reg === "accelerometre" ? "l'accélération du sol" : "un mélange : il faut corriger de la réponse de l'instrument";
      return {
        enonce: `Un instrument ${inst.nom} (f₀ = ${fr(inst.f0, 3)} Hz, ξ = ${frd(inst.xi, 1)}) est posé sur un sol qui oscille à ${fr(fs, 3)} Hz avec une amplitude de ${frd(A, 1)} mm.`,
        donnees: [donnee("Instrument", `f₀ = ${fr(inst.f0, 3)} Hz, ξ = ${frd(inst.xi, 1)}`), donnee("Sol", `${fr(fs, 3)} Hz, ${frd(A, 1)} mm`)],
        questions: [
          nombre("Rapport r = f/f₀ ?", fs / inst.f0, "", `r = ${fr(fs, 3)} / ${fr(inst.f0, 3)} = ${fr(fs / inst.f0, 3)}.`),
          nombre("Amplitude du déplacement de la masse par rapport au bâti ?", A * q.deplacement, "mm",
            `|X/Ug| = r²/√((1 − r²)² + (2ξr)²) = ${fr(q.deplacement, 3)} ; X = ${fr(A * q.deplacement, 3)} mm.`, { rel: 0.03 }),
          choixMelange(a, "À cette fréquence, l'instrument lit…",
            [lit, ...["le déplacement du sol", "l'accélération du sol", "un mélange : il faut corriger de la réponse de l'instrument", "la vitesse de propagation des ondes"].filter((x) => x !== lit)],
            reg === "sismometre" ? `r ≥ 3 : la masse reste immobile, X ≈ −Ug (${fr(q.deplacement, 3)}).` : reg === "accelerometre" ? `r ≤ 0,3 : X ≈ −üg/ω₀² ; ici üg = ${fr(acc, 3)} mm/s² et üg/ω₀² = ${fr(acc / (w0 * w0), 3)} mm, contre X = ${fr(A * q.deplacement, 3)} mm.` : "Près de la résonance, X n'est proportionnel ni au déplacement ni à l'accélération du sol."),
        ],
      };
    },
  },
  {
    id: "ch5-ouvrage", titre: "Du sismomètre à l'ouvrage", difficulte: 1,
    generer(a) {
      const pool = [
        ["Un bâtiment d'un étage (dalle sur poteaux) se modélise comme…", ["un sismomètre : masse, ressort (les poteaux) et amortisseur", "une masse libre sans ressort", "un accéléromètre de fréquence infinie", "deux masses indépendantes"],
          "La dalle est la masse, les poteaux le ressort, l'amortissement vient des matériaux et des assemblages : même équation ẍ + 2ξω₀ẋ + ω₀²x = −üg."],
        ["Dans l'équation de l'oscillateur, le mouvement du sol intervient par…", ["son accélération üg", "son déplacement ug", "sa vitesse", "sa fréquence seule"],
          "Dans le repère du bâti, le sol n'apparaît que par la force d'inertie −m·üg."],
        ["Un accéléromètre a une fréquence propre…", ["élevée, au-dessus des fréquences à mesurer", "très basse, sous 0,1 Hz", "égale à celle du sol", "nulle"],
          "Pour f ≪ f₀, x ≈ −üg/ω₀² : la lecture est proportionnelle à l'accélération du sol."],
        ["L'amortissement conventionnel des structures en béton armé, utilisé par le spectre de l'Eurocode 8, vaut…", ["5 %", "70 %", "0,5 %", "50 %"],
          "Les spectres réglementaires sont donnés pour ξ = 5 % ; un sismomètre est amorti à 70 % environ."],
        ["Le spectre de réponse d'un accélérogramme est…", ["la plus grande réponse d'une famille d'oscillateurs de toutes périodes", "le spectre de Fourier de l'accélérogramme", "l'enveloppe de l'accélérogramme", "la réponse d'un sismomètre de 1 Hz"],
          "On soumet à l'accélérogramme des oscillateurs de périodes variées, au même amortissement, et l'on porte leur réponse maximale : c'est le chapitre 7."],
        ["Un ouvrage est dangereusement sollicité quand…", ["sa période propre tombe dans les périodes fortes du mouvement du sol", "il est très amorti", "sa période est très différente de celle du sol", "le sol est très raide"],
          "C'est la résonance : l'amplification vaut 1/(2ξ), soit 10 pour ξ = 5 %, en régime établi."],
      ];
      return { enonce: "Questions sur l'oscillateur, du sismomètre à l'ouvrage.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
