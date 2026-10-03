// Exercices du chapitre 7 : spectre de réponse et spectre élastique de l'EN 1998-1:2004. Les paramètres
// (S, TB, TC, TD) viennent du module Spectre ; les réponses d'oscillateur, de Newmark sur un accélérogramme
// synthétique du banc.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Spectre from "../sismo/spectre.js";
import Oscillateur from "../sismo/oscillateur.js";
import Accelero from "../sismo/accelerogramme.js";

const G = Spectre.G;
const branche = (T, p) => (T <= p.TB ? "montée" : T <= p.TC ? "plateau" : T <= p.TD ? "branche en 1/T" : "branche en 1/T²");
const formule = (T, p, ag, eta = 1) => {
  const e = eta === 1 ? "" : `${frd(eta, 3)} × `;
  if (T <= p.TB) return `ag·S·[1 + (T/TB)(2,5η − 1)] = ${frd(ag, 2)} × ${frd(p.S, 2)} × [1 + (${fr(T, 3)}/${frd(p.TB, 2)}) × (2,5 × ${frd(eta, 3)} − 1)]`;
  if (T <= p.TC) return `ag·S·η·2,5 = ${frd(ag, 2)} × ${frd(p.S, 2)} × ${e}2,5`;
  if (T <= p.TD) return `ag·S·η·2,5·TC/T = ${frd(ag, 2)} × ${frd(p.S, 2)} × ${e}2,5 × ${frd(p.TC, 2)}/${fr(T, 3)}`;
  return `ag·S·η·2,5·TC·TD/T² = ${frd(ag, 2)} × ${frd(p.S, 2)} × ${e}2,5 × ${frd(p.TC, 2)} × ${frd(p.TD, 1)}/${fr(T, 3)}²`;
};

export default [
  {
    id: "ch7-ec8", titre: "Lire le spectre élastique de l'Eurocode 8", difficulte: 1,
    generer(a) {
      const type = a.choix([1, 2]), sol = a.choix(["A", "B", "C", "D", "E"]), ag = a.entre(0.08, 0.35, 0.01);
      const p = Spectre.EC8_2004[type][sol];
      const T1 = a.choix([0.1, 0.3, 0.5, 0.8, 1.2, 1.6, 2.5, 3]), T2 = a.choix([0.05, 0.4, 1, 2, 3.5].filter((t) => t !== T1));
      const se = (T) => Spectre.ec8(T, { type, sol, ag });
      return {
        enonce: `Site de classe de sol ${sol}, spectre de type ${type}, a_g = ${frd(ag, 2)} g. Valeurs recommandées de l'EN 1998-1:2004 : S = ${frd(p.S, 2)}, TB = ${frd(p.TB, 2)} s, TC = ${frd(p.TC, 2)} s, TD = ${frd(p.TD, 1)} s ; ξ = 5 %.`,
        donnees: [donnee("Sol, type", `${sol}, type ${type}`), donnee("a_g", `${frd(ag, 2)} g`), donnee("S, TB, TC, TD", `${frd(p.S, 2)} ; ${frd(p.TB, 2)} ; ${frd(p.TC, 2)} ; ${frd(p.TD, 1)} s`)],
        questions: [
          nombre("Accélération spectrale du plateau ?", ag * p.S * 2.5, "g", `ag·S·2,5 = ${frd(ag, 2)} × ${frd(p.S, 2)} × 2,5 = ${fr(ag * p.S * 2.5, 3)} g.`),
          nombre(`Se pour T = ${fr(T1, 3)} s ?`, se(T1), "g", `${fr(T1, 3)} s est sur la ${branche(T1, p)} : Se = ${formule(T1, p, ag)} = ${fr(se(T1), 3)} g.`),
          nombre(`Se pour T = ${fr(T2, 3)} s ?`, se(T2), "g", `${fr(T2, 3)} s est sur la ${branche(T2, p)} : Se = ${formule(T2, p, ag)} = ${fr(se(T2), 3)} g.`),
          nombre("Accélération maximale du sol en surface (Se pour T = 0) ?", ag * p.S, "g", `Se(0) = ag·S = ${fr(ag * p.S, 3)} g : un oscillateur infiniment raide suit le sol.`),
        ],
      };
    },
  },
  {
    id: "ch7-batiment", titre: "Période d'un bâtiment et demande spectrale", difficulte: 2,
    generer(a) {
      const sys = a.choix(["beton", "acier", "autres"]), H = a.entier(2, 13) * 3, sol = a.choix(["B", "C", "D"]), ag = a.entre(0.1, 0.3, 0.01);
      const nom = { beton: "un portique en béton armé", acier: "un portique en acier", autres: "un bâtiment à voiles" }[sys];
      const p = Spectre.EC8_2004[1][sol], T1 = Spectre.periodeApprochee(H, sys), se = Spectre.ec8(T1, { type: 1, sol, ag });
      const sd = se * G * (T1 / (2 * Math.PI)) ** 2 * 1000;
      return {
        enonce: `${nom[0].toUpperCase()}${nom.slice(1)} de ${H} m de haut est construit sur un sol de classe ${sol} (type 1 : S = ${frd(p.S, 2)}, TB = ${frd(p.TB, 2)} s, TC = ${frd(p.TC, 2)} s, TD = ${frd(p.TD, 1)} s) ; a_g = ${frd(ag, 2)} g.`,
        donnees: [donnee("Structure", `${nom}, H = ${H} m`), donnee("Sol", `${sol}, type 1`), donnee("a_g", `${frd(ag, 2)} g`)],
        questions: [
          nombre("Période fondamentale approchée T₁ = Ct·H^(3/4) ?", T1, "s", `Ct = ${frd(Spectre.CT[sys], 3)} : T₁ = ${frd(Spectre.CT[sys], 3)} × ${H}^0,75 = ${fr(T1, 3)} s.`),
          nombre("Accélération spectrale élastique Se(T₁) ?", se, "g", `T₁ sur la ${branche(T1, p)} : Se = ${formule(T1, p, ag)} = ${fr(se, 3)} g.`),
          nombre("Déplacement spectral Se·(T₁/2π)² ?", sd, "mm", `${fr(se, 3)} × 9,81 × (${fr(T1, 3)}/2π)² = ${fr(sd, 3)} mm.`, { rel: 0.03 }),
        ],
      };
    },
  },
  {
    id: "ch7-amortissement", titre: "Effet de l'amortissement sur le spectre", difficulte: 1,
    generer(a) {
      const xi = a.choix([2, 3, 7, 10, 15, 20, 30]), sol = a.choix(["A", "B", "C"]), ag = a.entre(0.1, 0.3, 0.01), p = Spectre.EC8_2004[1][sol];
      const eta = Spectre.eta(xi / 100), brut = Math.sqrt(10 / (5 + xi));
      return {
        enonce: `Un ouvrage est amorti à ξ = ${xi} % ; site de classe ${sol}, type 1 (S = ${frd(p.S, 2)}), a_g = ${frd(ag, 2)} g.`,
        donnees: [donnee("ξ", `${xi} %`), donnee("Sol", `${sol} (S = ${frd(p.S, 2)})`), donnee("a_g", `${frd(ag, 2)} g`)],
        questions: [
          nombre("Coefficient de correction η ?", eta, "", `η = √(10/(5 + ${xi})) = ${frd(brut, 3)}${brut < 0.55 ? ", borné à 0,55" : ""}.`, { abs: 0.01 }),
          nombre("Accélération du plateau Se pour cet amortissement ?", ag * p.S * eta * 2.5, "g", `ag·S·η·2,5 = ${frd(ag, 2)} × ${frd(p.S, 2)} × ${frd(eta, 3)} × 2,5 = ${fr(ag * p.S * eta * 2.5, 3)} g.`),
          choixMelange(a, "L'amortissement modifie-t-il Se pour T = 0 ?",
            ["non : Se(0) = ag·S, l'oscillateur rigide suit le sol", "oui : Se(0) est multiplié par η", "oui : Se(0) est divisé par η", "oui : Se(0) devient nul"],
            "La branche de montée part de ag·S quel que soit ξ : un oscillateur infiniment raide ne se déforme pas, son amortissement ne joue pas."),
        ],
      };
    },
  },
  {
    id: "ch7-reponse", titre: "Du déplacement de l'oscillateur au spectre", difficulte: 2,
    generer(a) {
      const M = a.entre(5.5, 7, 0.1), R = a.entier(5, 40), T = a.choix([0.2, 0.3, 0.5, 0.8, 1, 1.5]);
      const rec = Accelero.simuler({ M, R, graine: a.entier(1, 1e6) });
      const k = Spectre.sousPas(rec.dt, T), { x } = Oscillateur.integrer(Spectre.surEchantillonner(rec.acc, k), rec.dt / k, 1 / T, 0.05);
      let sd = 0;
      for (const v of x) sd = Math.max(sd, Math.abs(v));
      const sdmm = +(sd * 1000).toPrecision(3), w = (2 * Math.PI) / T;
      let pga = 0;
      for (const v of rec.acc) pga = Math.max(pga, Math.abs(v));
      return {
        enonce: `Soumis à un accélérogramme (Mw ${frd(M, 1)} à ${R} km, PGA ${fr(pga / G, 2)} g), un oscillateur de période ${fr(T, 2)} s amorti à 5 % atteint un déplacement relatif maximal de ${fr(sdmm, 3)} mm.`,
        donnees: [donnee("T", `${fr(T, 2)} s`), donnee("Sd", `${fr(sdmm, 3)} mm`), donnee("PGA", `${fr(pga / G, 2)} g`)],
        questions: [
          nombre("Pseudo-vitesse Sv = ω·Sd ?", (w * sdmm) / 1000, "m/s", `ω = 2π/${fr(T, 2)} = ${fr(w, 3)} rad/s ; Sv = ${fr(w, 3)} × ${fr(sdmm / 1000, 3)} = ${fr((w * sdmm) / 1000, 3)} m/s.`),
          nombre("Pseudo-accélération Sa = ω²·Sd, en g ?", (w * w * sdmm) / 1000 / G, "g", `Sa = ${fr(w, 3)}² × ${fr(sdmm / 1000, 3)} = ${fr((w * w * sdmm) / 1000, 3)} m/s², soit ${fr((w * w * sdmm) / 1000 / G, 3)} g (${fr((w * w * sdmm) / 1000 / pga, 2)} fois le PGA).`),
          choixMelange(a, "Pour une période tendant vers zéro, Sa tend vers…",
            ["l'accélération maximale du sol (PGA)", "zéro", "2,5 fois le PGA", "le déplacement maximal du sol"],
            "Un oscillateur infiniment raide suit le sol : sa pseudo-accélération est l'accélération du sol. Aux très longues périodes, c'est Sd qui tend vers le déplacement maximal du sol."),
        ],
      };
    },
  },
];
