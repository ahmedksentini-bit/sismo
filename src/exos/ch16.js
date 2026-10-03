// Exercices du chapitre 16 : poussée progressive et méthode N2. Courbes de capacité et système équivalent par le
// module Poussee, déplacement cible par Inelastique.n2 (annexe B de l'EN 1998-1:2004).
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Poussee from "../sismo/poussee.js";
import Inelastique from "../sismo/inelastique.js";
import Spectre from "../sismo/spectre.js";

const G = Spectre.G;

export default [
  {
    id: "ch16-equivalent", titre: "Système équivalent à un degré de liberté", difficulte: 1,
    generer(a) {
      const n = a.entier(3, 5), m = Array.from({ length: n }, () => a.entier(15, 40) * 10), phi = Array.from({ length: n }, (_, i) => +(((i + 1) / n) ** a.choix([0.8, 1, 1.2])).toFixed(3));
      phi[n - 1] = 1;
      const { mEtoile, gamma } = Poussee.equivalent(m, phi), mphi2 = m.reduce((s, x, i) => s + x * phi[i] * phi[i], 0);
      const Fb = a.entier(8, 30) * 100, dn = a.entre(40, 150, 1);
      return {
        enonce: `Un bâtiment de ${n} étages a pour masses ${m.map((x) => `${x} t`).join(", ")} (du bas vers le haut) et pour déformée du premier mode, normée au sommet, Φ = ${phi.map((x) => frd(x, 3)).join(" ; ")}. La poussée modale donne un effort à la base de ${Fb} kN pour ${frd(dn, 0)} mm en tête.`,
        donnees: [donnee("Masses (t)", m.join(" ; ")), donnee("Φ", phi.map((x) => frd(x, 3)).join(" ; ")), donnee("Point de la courbe", `${Fb} kN, ${frd(dn, 0)} mm`)],
        questions: [
          nombre("Masse du système équivalent m* = Σ mᵢΦᵢ ?", mEtoile, "t", `m* = ${m.map((x, i) => `${x} × ${frd(phi[i], 3)}`).join(" + ")} = ${fr(mEtoile, 4)} t.`, { rel: 0.01 }),
          nombre("Facteur de transformation Γ = m*/Σ mᵢΦᵢ² ?", gamma, "", `Σ mᵢΦᵢ² = ${fr(mphi2, 4)} t ; Γ = ${fr(mEtoile, 4)} / ${fr(mphi2, 4)} = ${frd(gamma, 3)}.`, { rel: 0.01 }),
          nombre("Point correspondant du système équivalent : F* = Fb/Γ ?", Fb / gamma, "kN", `F* = ${Fb} / ${frd(gamma, 3)} = ${fr(Fb / gamma, 4)} kN.`, { rel: 0.01 }),
          nombre("et d* = dₙ/Γ ?", dn / gamma, "mm", `d* = ${frd(dn, 0)} / ${frd(gamma, 3)} = ${fr(dn / gamma, 3)} mm.`, { rel: 0.01 }),
        ],
      };
    },
  },
  {
    id: "ch16-cible", titre: "Déplacement cible de la méthode N2", difficulte: 2,
    generer(a) {
      const mE = a.entier(30, 120) * 10, gamma = a.entre(1.2, 1.4, 0.01), Fy = a.entier(6, 30) * 100, dy = a.entre(10, 40, 0.5) / 1000;
      const T = 2 * Math.PI * Math.sqrt((mE * dy) / Fy), sol = a.choix(["B", "C"]), ag = a.entre(0.15, 0.35, 0.01), p = Spectre.EC8_2004[1][sol];
      const se = Spectre.ec8(T, { type: 1, sol, ag });
      const r = Inelastique.n2({ T, saY: Fy / mE, se: se * G, TC: p.TC }), de = r.de, qu = r.qu, dt = r.dt;
      const regle = r.regle === "périodes courtes" ? `T* < TC et qu > 1 : d*t = (d*et/qu)·(1 + (qu − 1)·TC/T*) = ${fr(dt * 1000, 3)} mm`
        : r.regle === "élastique" ? "T* < TC mais F*y/m* ≥ Se(T*) : réponse élastique, d*t = d*et" : "T* ≥ TC : égaux déplacements, d*t = d*et";
      return {
        enonce: `Le système équivalent d'un bâtiment a pour masse m* = ${mE} t, pour résistance F*y = ${Fy} kN et pour déplacement élastique limite d*y = ${frd(dy * 1000, 1)} mm ; Γ = ${frd(gamma, 2)}. Spectre élastique de type 1, sol ${sol} (S = ${frd(p.S, 2)}, TB = ${frd(p.TB, 2)} s, TC = ${frd(p.TC, 2)} s, TD = ${frd(p.TD, 1)} s), a_g = ${frd(ag, 2)} g.`,
        donnees: [donnee("m*, Γ", `${mE} t ; ${frd(gamma, 2)}`), donnee("F*y, d*y", `${Fy} kN ; ${frd(dy * 1000, 1)} mm`), donnee("Spectre", `sol ${sol}, a_g = ${frd(ag, 2)} g`)],
        questions: [
          nombre("Période T* = 2π√(m*·d*y/F*y) ?", T, "s", `T* = 2π × √(${mE} × ${frd(dy, 4)} / ${Fy}) = ${fr(T, 3)} s (t, m, kN).`, { rel: 0.01 }),
          nombre("Accélération spectrale Se(T*) ?", se, "g", `T* = ${fr(T, 3)} s, sol ${sol} : Se = ${fr(se, 3)} g.`, { rel: 0.02 }),
          nombre("Déplacement cible du système équivalent d*t ?", dt * 1000, "mm", `d*et = Se·(T*/2π)² = ${fr(de * 1000, 3)} mm ; qu = Se·m*/F*y = ${frd(qu, 2)} ; ${regle}.`, { rel: 0.03 }),
          nombre("Déplacement cible en tête du bâtiment dt = Γ·d*t ?", gamma * dt * 1000, "mm", `${frd(gamma, 2)} × ${fr(dt * 1000, 3)} = ${fr(gamma * dt * 1000, 3)} mm.`, { rel: 0.03 }),
        ],
      };
    },
  },
  {
    id: "ch16-mecanisme", titre: "Quel étage cède le premier ?", difficulte: 2,
    generer(a) {
      const n = 4, m = Array(n).fill(a.entier(15, 30) * 10), k = Array(n).fill(2e5), Vy = [a.entier(14, 22) * 100, a.entier(12, 20) * 100, a.entier(9, 15) * 100, a.entier(5, 9) * 100];
      const phi = [0.35, 0.65, 0.88, 1], profil = a.choix(["modal", "uniforme"]), p = Poussee.profil(m, profil === "modal" ? phi : null);
      const cap = Poussee.capacite({ k, Vy }, p), S = cap.S;
      return {
        enonce: `Un bâtiment de 4 étages, de masses égales (${m[0]} t), a pour résistances d'étage ${Vy.map((v) => `${v} kN`).join(", ")} (du bas vers le haut). On le pousse sous la répartition ${profil === "modal" ? `modale Fᵢ ∝ mᵢΦᵢ, Φ = ${phi.map((x) => frd(x, 2)).join(" ; ")}` : "uniforme Fᵢ ∝ mᵢ"}.`,
        donnees: [donnee("Vy (kN)", Vy.join(" ; ")), donnee("Répartition", profil)],
        questions: [
          choixMelange(a, "Quel étage forme le mécanisme ?", ["1", "2", "3", "4"].map((x, i) => `étage ${x}`).sort((u, v) => (u === `étage ${cap.critique + 1}` ? -1 : v === `étage ${cap.critique + 1}` ? 1 : 0)),
            `Efforts tranchants par unité du multiplicateur : S = ${S.map((x) => fr(x, 4)).join(" ; ")} ; rapports Vy/S = ${Vy.map((v, i) => fr(v / S[i], 3)).join(" ; ")} : le plus petit (${fr(cap.lambda, 3)}) désigne l'étage ${cap.critique + 1}.`),
          nombre("Effort à la base au moment du mécanisme ?", cap.Fb, "kN", `Fb = λ*·S₁ = ${fr(cap.lambda, 4)} × ${fr(S[0], 4)} = ${fr(cap.Fb, 4)} kN.`, { rel: 0.01 }),
          choixMelange(a, "Pourquoi l'Eurocode impose-t-il deux répartitions de forces ?",
            ["chacune peut révéler un mécanisme différent : la modale charge le haut, l'uniforme la base", "pour faire la moyenne des deux", "parce que la modale n'existe que pour les bâtiments réguliers", "pour calculer Γ deux fois"],
            "On retient le cas le plus défavorable des deux répartitions."),
        ],
      };
    },
  },
  {
    id: "ch16-notions", titre: "Poussée progressive : lecture", difficulte: 1,
    generer(a) {
      const pool = [
        ["La courbe de capacité porte…", ["l'effort tranchant à la base en fonction du déplacement en tête", "l'accélération spectrale en fonction de la période", "la ductilité en fonction de R", "le moment en fonction de la rotation d'une rotule"],
          "On pousse la structure sous des forces de forme fixée et l'on suit l'effort à la base."],
        ["Le déplacement cible du bâtiment s'obtient…", ["en multipliant celui du système équivalent par Γ", "en divisant celui du système équivalent par Γ", "directement sur le spectre élastique, sans transformation", "par le coefficient q"],
          "dₜ = Γ·d*ₜ (annexe B, B.6)."],
        ["Pour T* ≥ TC, la méthode N2 applique…", ["la règle des égaux déplacements : d*t = d*et", "la règle des égales énergies", "un déplacement nul", "le déplacement de plastification"],
          "Au-delà de TC, le système plastique se déplace en moyenne comme l'élastique de même période."],
        ["Un mécanisme d'étage signifie…", ["que toute la déformation plastique se concentre dans un seul niveau", "que tous les étages plastifient ensemble", "que la structure reste élastique", "que les fondations cèdent"],
          "C'est le mode de ruine des rez-de-chaussée transparents ; le dimensionnement en capacité cherche à l'éviter."],
        ["La méthode N2 est d'autant moins fiable que…", ["les modes supérieurs comptent (bâtiments hauts, irréguliers)", "le bâtiment est bas et régulier", "le sol est rocheux", "l'amortissement vaut 5 %"],
          "Elle ne garde qu'une forme de déformation ; les calculs temporels non linéaires prennent le relais."],
      ];
      return { enonce: "Questions sur la poussée progressive.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
