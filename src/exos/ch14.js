// Exercices du chapitre 14 : ductilité et coefficient de comportement. Réponses inélastiques par Newmark et
// Newton (Inelastique.integrer, vérifié contre OpenSeesPy) ; règles R–μ–T, N2 et spectre de calcul des
// modules Inelastique et Spectre.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Inelastique from "../sismo/inelastique.js";
import Spectre from "../sismo/spectre.js";
import Accelero from "../sismo/accelerogramme.js";

const G = Spectre.G;

export default [
  {
    id: "ch14-regles", titre: "Ductilité demandée par les règles R–μ–T", difficulte: 1,
    generer(a) {
      const R = a.choix([2, 3, 4, 5]), TC = a.choix([0.4, 0.5, 0.6]), T1 = +(TC * a.choix([0.4, 0.5, 0.6])).toFixed(2), T2 = +(TC * a.choix([1.5, 2, 3])).toFixed(2);
      return {
        enonce: `Une structure est dimensionnée pour la force élastique divisée par R = ${R}. Le spectre a pour période de coin TC = ${frd(TC, 2)} s.`,
        donnees: [donnee("R", `${R}`), donnee("TC", `${frd(TC, 2)} s`)],
        questions: [
          nombre(`Ductilité demandée à T = ${fr(T2, 3)} s (règle des égaux déplacements) ?`, R, "", `T > TC : μ = R = ${R}.`, { abs: 0.05 }),
          nombre(`Ductilité demandée à T = ${fr(T1, 3)} s (règle de la méthode N2) ?`, Inelastique.regles.n2(R, T1, TC), "", `T < TC : μ = 1 + (R − 1)·TC/T = 1 + ${R - 1} × ${frd(TC, 2)}/${fr(T1, 3)} = ${frd(Inelastique.regles.n2(R, T1, TC), 2)}.`, { rel: 0.02 }),
          nombre("Ductilité selon la règle des égales énergies ?", (R * R + 1) / 2, "", `μ = (R² + 1)/2 = (${R * R} + 1)/2 = ${frd((R * R + 1) / 2, 1)}.`, { rel: 0.01 }),
          choixMelange(a, "Pour une même réduction R, quels ouvrages demandent la plus grande ductilité ?",
            ["les ouvrages raides, de courte période", "les ouvrages souples, de longue période", "tous demandent μ = R", "aucun : la ductilité ne dépend que du matériau"],
            "Sous TC, le déplacement plastique dépasse nettement le déplacement élastique : μ croît quand T diminue."),
        ],
      };
    },
  },
  {
    id: "ch14-oscillateur", titre: "Un oscillateur élastoplastique", difficulte: 2,
    generer(a) {
      const T = a.choix([0.6, 0.8, 1, 1.5]), R = a.choix([2, 3, 4]);
      const rec = Accelero.simuler({ M: a.entre(6, 7, 0.1), R: a.entier(5, 30), graine: a.entier(1, 1e6) });
      const sae = Inelastique.saElastique(rec.acc, rec.dt, T), r = Inelastique.integrer(rec.acc, rec.dt, { T, fy: sae / R });
      const sa = +(sae / G).toPrecision(3), umax = +(r.umax * 1000).toPrecision(3), w = (2 * Math.PI) / T, uy = (sa * G) / R / (w * w) * 1000;
      return {
        enonce: `Un oscillateur de période ${fr(T, 2)} s (ξ = 5 %) aurait, s'il restait élastique, une pseudo-accélération maximale de ${fr(sa, 3)} g sous un accélérogramme. On lui donne une résistance égale à cette force divisée par R = ${R}, sans écrouissage ; le calcul pas à pas donne un déplacement maximal de ${fr(umax, 3)} mm.`,
        donnees: [donnee("T", `${fr(T, 2)} s`), donnee("Sa élastique", `${fr(sa, 3)} g`), donnee("R", `${R}`), donnee("u_max", `${fr(umax, 3)} mm`)],
        questions: [
          nombre("Déplacement élastique limite u_y = (Sa/R)/ω² ?", uy, "mm", `ω = 2π/${fr(T, 2)} = ${fr(w, 3)} rad/s ; u_y = ${fr(sa, 3)} × 9,81 / ${R} / ${fr(w, 3)}² = ${fr(uy, 3)} mm.`, { rel: 0.02 }),
          nombre("Ductilité μ ?", umax / uy, "", `μ = ${fr(umax, 3)} / ${fr(uy, 3)} = ${frd(umax / uy, 2)}.`, { rel: 0.03 }),
          nombre("Déplacement de l'oscillateur élastique Sa/ω² ?", ((sa * G) / (w * w)) * 1000, "mm", `${fr(sa, 3)} × 9,81 / ${fr(w, 3)}² = ${fr(((sa * G) / (w * w)) * 1000, 3)} mm : la règle des égaux déplacements le compare à u_max = ${fr(umax, 3)} mm.`, { rel: 0.02 }),
        ],
      };
    },
  },
  {
    id: "ch14-calcul", titre: "Spectre de calcul de l'EN 1998-1:2004", difficulte: 1,
    generer(a) {
      const sol = a.choix(["A", "B", "C", "D"]), ag = a.entre(0.1, 0.3, 0.01), q = a.choix([1.5, 2, 3, 3.9, 4.5]), p = Spectre.EC8_2004[1][sol];
      const T = a.choix([0.3, 0.5, 1, 2, 3]), sd = Spectre.ec8Calcul(T, { type: 1, sol, ag, q }), formule = Math.max(0, T <= p.TC ? ag * p.S * 2.5 / q : T <= p.TD ? ag * p.S * 2.5 / q * p.TC / T : ag * p.S * 2.5 / q * p.TC * p.TD / (T * T));
      return {
        enonce: `Sol ${sol}, type 1 (S = ${frd(p.S, 2)}, TB = ${frd(p.TB, 2)} s, TC = ${frd(p.TC, 2)} s, TD = ${frd(p.TD, 1)} s), a_g = ${frd(ag, 2)} g, coefficient de comportement q = ${fr(q, 2)}, β = 0,2.`,
        donnees: [donnee("Sol", `${sol} (S = ${frd(p.S, 2)})`), donnee("a_g", `${frd(ag, 2)} g`), donnee("q", fr(q, 2))],
        questions: [
          nombre("Plateau du spectre de calcul a_g·S·2,5/q ?", (ag * p.S * 2.5) / q, "g", `${frd(ag, 2)} × ${frd(p.S, 2)} × 2,5 / ${fr(q, 2)} = ${fr((ag * p.S * 2.5) / q, 3)} g.`),
          nombre(`Sd pour T = ${fr(T, 2)} s ?`, sd, "g", `Formule de la branche : ${fr(formule, 3)} g ; plancher β·a_g = ${fr(0.2 * ag, 3)} g ; Sd = ${fr(sd, 3)} g.`),
          nombre("Sd pour T = 0 ?", (2 / 3) * ag * p.S, "g", `Sd(0) = a_g·S·2/3 = ${fr((2 / 3) * ag * p.S, 3)} g (expression 3.13).`),
        ],
      };
    },
  },
  {
    id: "ch14-n2", titre: "Déplacement cible d'un système à courte période", difficulte: 2,
    generer(a) {
      const TC = a.choix([0.5, 0.6]), T = +(TC * a.choix([0.4, 0.5, 0.6, 0.8])).toFixed(2), se = a.entre(0.4, 0.9, 0.05), say = +(se / a.choix([2, 3, 4])).toFixed(3);
      const r = Inelastique.n2({ T, saY: say * G, se: se * G, TC });
      return {
        enonce: `Un système équivalent à un degré de liberté a pour période T* = ${fr(T, 2)} s et pour résistance F*y/m* = ${fr(say, 3)} g. Le spectre élastique donne Se(T*) = ${frd(se, 2)} g ; TC = ${frd(TC, 2)} s.`,
        donnees: [donnee("T*", `${fr(T, 2)} s`), donnee("F*y/m*", `${fr(say, 3)} g`), donnee("Se(T*)", `${frd(se, 2)} g`), donnee("TC", `${frd(TC, 2)} s`)],
        questions: [
          nombre("Déplacement élastique d*e = Se·(T*/2π)² ?", r.de * 1000, "mm", `${frd(se, 2)} × 9,81 × (${fr(T, 2)}/2π)² = ${fr(r.de * 1000, 3)} mm.`, { rel: 0.02 }),
          nombre("qu = Se(T*)·m*/F*y ?", r.qu, "", `qu = ${frd(se, 2)} / ${fr(say, 3)} = ${frd(r.qu, 3)}.`, { rel: 0.01 }),
          nombre("Déplacement cible d*t (EN 1998-1:2004, annexe B) ?", r.dt * 1000, "mm", `T* < TC : d*t = (d*e/qu)·(1 + (qu − 1)·TC/T*) = (${fr(r.de * 1000, 3)}/${frd(r.qu, 3)}) × (1 + ${frd(r.qu - 1, 3)} × ${frd(TC, 2)}/${fr(T, 2)}) = ${fr(r.dt * 1000, 3)} mm, au moins d*e.`, { rel: 0.02 }),
          nombre("Ductilité correspondante d*t/d*y ?", r.mu, "", `d*y = (F*y/m*)·(T*/2π)² = ${fr(r.dy * 1000, 3)} mm ; μ = ${frd(r.mu, 2)}.`, { rel: 0.03 }),
        ],
      };
    },
  },
];
