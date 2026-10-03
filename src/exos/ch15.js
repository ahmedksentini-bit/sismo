// Exercices du chapitre 15 : analyse modale d'un bâtiment. Modes, forces latérales, analyse spectrale et
// vérifications par le module Batiment (vérifié contre OpenSeesPy).
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Batiment from "../sismo/batiment.js";
import Spectre from "../sismo/spectre.js";

const G = Spectre.G;

export default [
  {
    id: "ch15-deux", titre: "Modes d'un bâtiment de deux étages", difficulte: 2,
    generer(a) {
      const m = a.entier(10, 40) * 10, k = a.entier(10, 50) * 10 * 1000, bat = { m: [m, m], k: [k, k], h: [3, 3] }, md = Batiment.modes(bat);
      // valeurs propres exactes : ω² = (k/m)·(3 ∓ √5)/2
      return {
        enonce: `Un bâtiment de deux étages porte ${m} t à chaque plancher ; chaque étage a une raideur de ${fr(k / 1000, 3)} MN/m.`,
        donnees: [donnee("m₁ = m₂", `${m} t`), donnee("k₁ = k₂", `${fr(k / 1000, 3)} MN/m`)],
        questions: [
          nombre("Période du premier mode ?", md[0].T, "s", `det(K − ω²M) = 0 donne ω² = (k/m)·(3 ∓ √5)/2 ; ω₁ = √(${fr(k, 4)} / ${m} × 0,382) = ${fr(md[0].w, 3)} rad/s ; T₁ = ${fr(md[0].T, 3)} s.`, { rel: 0.01 }),
          nombre("Période du deuxième mode ?", md[1].T, "s", `ω₂² = (k/m)·(3 + √5)/2 ; T₂ = ${fr(md[1].T, 3)} s, soit T₁/2,62.`, { rel: 0.01 }),
          nombre("Part de la masse totale dans le premier mode (en %) ?", 100 * md[0].part, "%", `Déformée φ₁ = (0,618 ; 1) ; m_eff = (Σmφ)²/Σmφ² = ${fr(md[0].meff, 4)} t, soit ${frd(100 * md[0].part, 1)} %.`, { rel: 0.01 }),
          choixMelange(a, "Faut-il combiner les deux modes par CQC ?", ["non : T₂ ≤ 0,9·T₁, la SRSS suffit", "oui : les périodes sont voisines", "oui : toujours avec deux modes", "non : un seul mode suffit toujours"],
            `T₂/T₁ = ${frd(md[1].T / md[0].T, 3)} ≤ 0,9 : réponses indépendantes au sens du § 4.3.3.3.2.`),
        ],
      };
    },
  },
  {
    id: "ch15-forces", titre: "Méthode des forces latérales", difficulte: 1,
    generer(a) {
      const n = a.entier(3, 8), masse = a.entier(15, 40) * 10, bat = { m: Array(n).fill(masse), k: Array(n).fill(2e5), h: Array(n).fill(3) };
      const sol = a.choix(["B", "C", "D"]), ag = a.entre(0.1, 0.3, 0.01), q = a.choix([2, 3, 3.9]), T1 = +(Batiment.modes(bat)[0].T).toFixed(2);
      const p = Spectre.EC8_2004[1][sol], sd = Spectre.ec8Calcul(T1, { type: 1, sol, ag, q }), lam = T1 <= 2 * p.TC && n > 2 ? 0.85 : 1;
      const M = n * masse, Fb = sd * G * M * lam, z = Batiment.cotes(bat.h), Fn = (Fb * z[n - 1]) / z.reduce((s, x) => s + x, 0);
      return {
        enonce: `Un bâtiment régulier de ${n} étages de 3 m porte ${masse} t par plancher ; sa période fondamentale vaut T₁ = ${fr(T1, 2)} s. Sol ${sol} (type 1, TC = ${frd(p.TC, 2)} s), a_g = ${frd(ag, 2)} g, q = ${fr(q, 2)}, d'où Sd(T₁) = ${fr(sd, 3)} g.`,
        donnees: [donnee("Étages", `${n} × 3 m, ${masse} t`), donnee("T₁", `${fr(T1, 2)} s`), donnee("Sd(T₁)", `${fr(sd, 3)} g`), donnee("TC", `${frd(p.TC, 2)} s`)],
        questions: [
          nombre("Coefficient λ ?", lam, "", `T₁ ${T1 <= 2 * p.TC ? "≤" : ">"} 2·TC = ${frd(2 * p.TC, 2)} s et ${n} étages : λ = ${frd(lam, 2)}.`, { abs: 0.005 }),
          nombre("Effort tranchant à la base Fb ?", Fb, "kN", `Fb = Sd·m·λ = ${fr(sd, 3)} × 9,81 × ${fr(M, 4)} × ${frd(lam, 2)} = ${fr(Fb, 4)} kN.`, { rel: 0.02 }),
          nombre("Force au dernier plancher (répartition selon z·m) ?", Fn, "kN", `Fₙ = Fb·zₙ/Σz = ${fr(Fb, 4)} × ${z[n - 1]} / ${z.reduce((s, x) => s + x, 0)} = ${fr(Fn, 4)} kN.`, { rel: 0.02 }),
          choixMelange(a, "La méthode est-elle applicable ?", T1 <= Math.min(4 * p.TC, 2) ? ["oui : T₁ ≤ min(4·TC ; 2 s) et bâtiment régulier", "non : T₁ dépasse la borne"] : ["non : T₁ dépasse min(4·TC ; 2 s)", "oui : bâtiment régulier"],
            `Il faut T₁ ≤ min(4 × ${frd(p.TC, 2)} ; 2) = ${frd(Math.min(4 * p.TC, 2), 2)} s et la régularité en élévation.`),
        ],
      };
    },
  },
  {
    id: "ch15-combinaison", titre: "Combiner deux modes", difficulte: 1,
    generer(a) {
      const V1 = a.entier(40, 150) * 10, V2 = a.entier(5, 40) * 10, T1 = a.entre(0.5, 1.5, 0.05), r = a.choix([0.3, 0.5, 0.95]), T2 = +(T1 * r).toFixed(3);
      const srss = Math.hypot(V1, V2), rho = Batiment.rhoCQC((2 * Math.PI) / T1, (2 * Math.PI) / T2), cqc = Math.sqrt(V1 * V1 + V2 * V2 + 2 * rho * V1 * V2);
      return {
        enonce: `L'analyse modale d'un bâtiment donne à la base un effort de ${V1} kN dans le mode 1 (T₁ = ${frd(T1, 2)} s) et de ${V2} kN dans le mode 2 (T₂ = ${fr(T2, 3)} s), amortissement 5 %.`,
        donnees: [donnee("Mode 1", `${V1} kN, ${frd(T1, 2)} s`), donnee("Mode 2", `${V2} kN, ${fr(T2, 3)} s`)],
        questions: [
          nombre("Combinaison SRSS ?", srss, "kN", `√(${V1}² + ${V2}²) = ${fr(srss, 4)} kN.`, { rel: 0.01 }),
          nombre("Coefficient de corrélation CQC ρ₁₂ ?", rho, "", `r = T₂/T₁ = ${frd(T2 / T1, 3)} ; ρ = 8ξ²(1 + r)r^1,5 / ((1 − r²)² + 4ξ²r(1 + r)²) = ${frd(rho, 4)}.`, { abs: 0.005 }),
          nombre("Combinaison CQC ?", cqc, "kN", `√(V₁² + V₂² + 2ρV₁V₂) = ${fr(cqc, 4)} kN${r > 0.9 ? " : les modes sont corrélés, la SRSS sous-estime" : " : presque la SRSS"}.`, { rel: 0.01 }),
        ],
      };
    },
  },
  {
    id: "ch15-verifs", titre: "Limitation des dommages et coefficient θ", difficulte: 2,
    generer(a) {
      const de = a.entre(2, 9, 0.1), q = a.choix([2, 3, 3.9]), h = 3, P = a.entier(20, 80) * 100, V = a.entier(5, 25) * 100, nu = 0.5;
      const dr = q * de, ratio = (dr * nu) / (h * 1000), theta = (P * dr / 1000) / (V * h);
      return {
        enonce: `Au premier étage (h = 3 m) d'un bâtiment, l'analyse sous le spectre de calcul (q = ${fr(q, 2)}) donne un déplacement relatif d'étage dₑ = ${frd(de, 1)} mm et un effort tranchant V = ${fr(V, 4)} kN ; le poids total au-dessus vaut ${fr(P, 4)} kN.`,
        donnees: [donnee("dₑ", `${frd(de, 1)} mm`), donnee("q", fr(q, 2)), donnee("V, P", `${fr(V, 4)} kN, ${fr(P, 4)} kN`)],
        questions: [
          nombre("Déplacement relatif réel d_r = q·dₑ ?", dr, "mm", `${fr(q, 2)} × ${frd(de, 1)} = ${fr(dr, 3)} mm.`, { rel: 0.01 }),
          choixMelange(a, "Limitation des dommages pour des cloisons fragiles (d_r·ν ≤ 0,005·h, ν = 0,5) ?", ratio <= 0.005 ? ["vérifiée", "non vérifiée"] : ["non vérifiée", "vérifiée"], `d_r·ν = ${fr(dr * nu, 3)} mm contre 0,005 × 3 000 = 15 mm.`),
          nombre("Coefficient θ = P·d_r/(V·h) ?", theta, "", `θ = ${fr(P, 4)} × ${fr(dr / 1000, 3)} / (${fr(V, 4)} × 3) = ${frd(theta, 3)}${theta <= 0.1 ? " ≤ 0,10 : second ordre négligeable" : theta <= 0.2 ? " : majorer les effets par 1/(1 − θ)" : ""}.`, { rel: 0.02 }),
        ],
      };
    },
  },
];
