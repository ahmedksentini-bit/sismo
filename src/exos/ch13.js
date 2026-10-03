// Exercices du chapitre 13 : liquéfaction. CSR, CRR et FS par la méthode de Boulanger et Idriss (2014) du
// module Liquefaction (conventions de liquepy) ; LPI d'Iwasaki du même module.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import L from "../sismo/liquefaction.js";

export default [
  {
    id: "ch13-csr", titre: "Sollicitation cyclique d'une couche de sable", difficulte: 1,
    generer(a) {
      const z = a.entre(3, 12, 0.5), gwl = a.entre(0.5, Math.min(4, z - 1), 0.5), amax = a.entre(0.1, 0.4, 0.01), M = a.entre(5.5, 7.5, 0.1);
      const sv = 18 * z, u = 9.8 * (z - gwl), sve = sv - u, rd = +L.rd(z, M).toFixed(3), csr = 0.65 * (sv / sve) * amax * rd;
      return {
        enonce: `Une couche de sable saturé est étudiée à ${frd(z, 1)} m de profondeur ; la nappe est à ${frd(gwl, 1)} m, le poids volumique vaut 18 kN/m³ (γw = 9,8 kN/m³). Le séisme de projet donne a_max = ${frd(amax, 2)} g en surface, pour une magnitude ${frd(M, 1)} ; à cette profondeur, r_d = ${frd(rd, 3)}.`,
        donnees: [donnee("z, nappe", `${frd(z, 1)} m, ${frd(gwl, 1)} m`), donnee("a_max", `${frd(amax, 2)} g`), donnee("r_d", frd(rd, 3))],
        questions: [
          nombre("Contrainte verticale totale σv ?", sv, "kPa", `σv = 18 × ${frd(z, 1)} = ${fr(sv, 4)} kPa.`, { rel: 0.01 }),
          nombre("Contrainte verticale effective σ'v ?", sve, "kPa", `u = 9,8 × (${frd(z, 1)} − ${frd(gwl, 1)}) = ${fr(u, 3)} kPa ; σ'v = ${fr(sv, 4)} − ${fr(u, 3)} = ${fr(sve, 3)} kPa.`, { rel: 0.01 }),
          nombre("Rapport de contrainte cyclique CSR ?", csr, "", `CSR = 0,65 × (${fr(sv, 4)}/${fr(sve, 3)}) × ${frd(amax, 2)} × ${frd(rd, 3)} = ${frd(csr, 3)}.`, { rel: 0.02 }),
        ],
      };
    },
  },
  {
    id: "ch13-spt", titre: "Coefficient de sécurité au SPT", difficulte: 2,
    generer(a) {
      const z = a.entre(3, 10, 0.5), gwl = a.entre(1, 3, 0.5), n60 = a.entier(6, 22), fc = a.choix([5, 10, 15, 25]), amax = a.entre(0.15, 0.35, 0.01), M = a.entre(6, 7.5, 0.1);
      const sv = 18 * z, sve = sv - 9.8 * (z - gwl), p = L.pointSPT(n60, fc, sv, sve, amax, M, z);
      return {
        enonce: `À ${frd(z, 1)} m (nappe à ${frd(gwl, 1)} m, γ = 18 kN/m³), un sable à ${fc} % de fines donne N60 = ${n60}. Pour a_max = ${frd(amax, 2)} g et M = ${frd(M, 1)}, la méthode de Boulanger et Idriss (2014) donne : CSR = ${frd(p.csr, 3)}, (N1)60cs = ${frd(p.n1cs, 1)}, CRR7,5 = ${frd(p.crr75, 3)}, MSF = ${frd(p.msf, 3)}, Kσ = ${frd(p.ks, 3)}.`,
        donnees: [donnee("CSR", frd(p.csr, 3)), donnee("CRR7,5", frd(p.crr75, 3)), donnee("MSF, Kσ", `${frd(p.msf, 3)} ; ${frd(p.ks, 3)}`)],
        questions: [
          nombre("Rapport de résistance cyclique CRR ?", p.crr75 * p.msf * p.ks, "", `CRR = ${frd(p.crr75, 3)} × ${frd(p.msf, 3)} × ${frd(p.ks, 3)} = ${frd(p.crr, 3)}.`, { rel: 0.02 }),
          nombre("Coefficient de sécurité FS (non plafonné) ?", (p.crr75 * p.msf * p.ks) / p.csr, "", `FS = ${frd(p.crr, 3)} / ${frd(p.csr, 3)} = ${frd(p.crr / p.csr, 2)}.`, { rel: 0.03 }),
          choixMelange(a, "Conclusion selon l'EN 1998-5 (valeur recommandée λ = 0,8) ?",
            p.crr / p.csr >= 1.25 ? ["la marge est tenue (FS ≥ 1,25)", "la couche se liquéfie (FS < 1)", "la couche ne se liquéfie pas mais la marge n'est pas tenue"]
              : p.crr / p.csr >= 1 ? ["la couche ne se liquéfie pas mais la marge n'est pas tenue", "la marge est tenue (FS ≥ 1,25)", "la couche se liquéfie (FS < 1)"]
                : ["la couche se liquéfie (FS < 1)", "la marge est tenue (FS ≥ 1,25)", "la couche ne se liquéfie pas mais la marge n'est pas tenue"],
            `FS = ${frd(p.crr / p.csr, 2)} ; il faut FS ≥ 1/λ = 1,25.`),
        ],
      };
    },
  },
  {
    id: "ch13-lpi", titre: "Indice de potentiel de liquéfaction", difficulte: 2,
    generer(a) {
      const couches = Array.from({ length: 3 }, () => ({ e: a.entre(1, 4, 0.5), fs: a.entre(0.4, 1.4, 0.05) }));
      let z = a.entre(1, 4, 0.5);
      const z0 = z, lignes = couches.map((c) => { const zm = z + c.e / 2; z += c.e; return { ...c, zm, contrib: c.fs < 1 ? (1 - c.fs) * (10 - 0.5 * zm) * c.e : 0 }; });
      const lpi = lignes.reduce((s, c) => s + c.contrib, 0);
      return {
        enonce: `Sous la nappe, à partir de ${frd(z0, 1)} m, un sondage traverse trois couches homogènes de sable : ${lignes.map((c) => `${frd(c.e, 1)} m à FS = ${frd(c.fs, 2)}`).join(", puis ")}.`,
        donnees: lignes.map((c, i) => donnee(`Couche ${i + 1}`, `${frd(c.e, 1)} m, FS ${frd(c.fs, 2)}, milieu à ${frd(c.zm, 2)} m`)),
        questions: [
          nombre("Poids de profondeur w = 10 − 0,5·z au milieu de la première couche ?", 10 - 0.5 * lignes[0].zm, "", `z = ${frd(z0, 1)} + ${frd(lignes[0].e, 1)}/2 = ${frd(lignes[0].zm, 2)} m ; w = 10 − 0,5 × ${frd(lignes[0].zm, 2)} = ${frd(10 - 0.5 * lignes[0].zm, 3)}.`, { abs: 0.02 }),
          nombre("LPI = Σ (1 − FS)·(10 − 0,5·z)·Δz, sur les couches à FS < 1 ?", lpi, "", lignes.map((c, i) => `couche ${i + 1} : ${c.fs < 1 ? `(1 − ${frd(c.fs, 2)}) × (10 − 0,5 × ${frd(c.zm, 2)}) × ${frd(c.e, 1)} = ${frd(c.contrib, 2)}` : "FS ≥ 1, rien"}`).join(" ; ") + ` ; LPI = ${frd(lpi, 2)} (z au milieu de chaque couche).`, { rel: 0.03, abs: lpi < 0.5 ? 0.2 : null }),
          choixMelange(a, "Classe du LPI (Iwasaki et al., 1982) ?", [L.classeLPI(lpi), ...["nul", "faible", "élevé", "très élevé"].filter((x) => x !== L.classeLPI(lpi))],
            "0 : nul ; jusqu'à 5 : faible ; jusqu'à 15 : élevé ; au-delà : très élevé."),
        ],
      };
    },
  },
  {
    id: "ch13-notions", titre: "Liquéfaction : mécanisme et parades", difficulte: 1,
    generer(a) {
      const pool = [
        ["La liquéfaction résulte…", ["de la montée de la pression interstitielle qui annule la contrainte effective", "de la fusion des grains par frottement", "de l'arrivée de l'onde P", "d'un séchage brutal du sable"],
          "Le sable lâche tend à se tasser sous les cycles ; l'eau ne s'échappe pas à temps, sa pression monte."],
        ["Quels sols sont les plus sensibles ?", ["les sables lâches, jeunes, saturés, peu profonds", "les argiles raides surconsolidées", "les graves cimentées", "les roches fracturées"],
          "Les sols fins plastiques (Ic > 2,6) relèvent d'un autre comportement."],
        ["Pour le calcul, l'accélération a_max est…", ["a_g·S, l'accélération en surface", "a_g au rocher", "la PGA de 2 475 ans quel que soit l'ouvrage", "la moitié de a_g"],
          "La méthode simplifiée part de l'accélération maximale en surface."],
        ["Le facteur MSF corrige…", ["le nombre de cycles, plus faible pour un petit séisme", "le confinement", "la teneur en fines", "la profondeur de la nappe"],
          "CRR7,5 est donnée pour M = 7,5 ; un séisme plus petit fait moins de cycles, d'où MSF > 1."],
        ["Parmi ces parades, laquelle ne traite pas la liquéfaction ?", ["augmenter l'amortissement de la superstructure", "vibrocompactage du sable", "colonnes ballastées et drains", "fonder sous la couche liquéfiable"],
          "L'amortissement de la structure ne change rien à la pression interstitielle du sol."],
        ["Après liquéfaction, des pieux traversant la couche subissent…", ["du frottement négatif quand la couche se reconsolide et tasse", "un frottement positif accru", "aucun effet", "une poussée verticale vers le haut permanente"],
          "La couche reconsolidée tasse et entraîne les pieux vers le bas."],
      ];
      return { enonce: "Questions sur la liquéfaction.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
