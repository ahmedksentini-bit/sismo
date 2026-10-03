// Exercices du chapitre 12 : effets de site. Fonctions de transfert et classes par le module Site (ondes SH,
// vérifié contre pystrata) ; courbes de Darendeli du même module.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Site from "../sismo/site.js";

export default [
  {
    id: "ch12-couche", titre: "Fréquence et amplification d'une couche", difficulte: 1,
    generer(a) {
      const H = a.entier(5, 60), vs = a.entier(10, 40) * 10, vr = a.entier(8, 25) * 100, xi = a.choix([0.02, 0.03, 0.05]);
      const I = (17.5 * vs) / (22 * vr), col = Site.colonne([{ h: H, vs, ip: 0, poids: 17.5 }], { vs: vr, poids: 22, xi: 0.01 });
      const etat = { G: col.couches.map((c) => c.G0), xi: col.couches.map(() => xi) }, f0 = vs / (4 * H);
      let pic = 0;
      for (let k = 0; k <= 400; k++) pic = Math.max(pic, Site.cabs(Site.transfert(col, etat, f0 * (0.7 + (0.6 * k) / 400))));
      return {
        enonce: `Une couche de sol de ${H} m (Vs = ${vs} m/s, 17,5 kN/m³, amortissement ${frd(100 * xi, 0)} %) repose sur un rocher à Vs = ${vr} m/s (22 kN/m³).`,
        donnees: [donnee("H, Vs", `${H} m, ${vs} m/s`), donnee("Rocher", `${vr} m/s`), donnee("ξ", `${frd(100 * xi, 0)} %`)],
        questions: [
          nombre("Fréquence fondamentale f₀ ?", f0, "Hz", `f₀ = Vs/(4H) = ${vs}/(4 × ${H}) = ${fr(f0, 3)} Hz.`),
          nombre("Fréquence de la première harmonique ?", 3 * f0, "Hz", `f₁ = 3·f₀ = ${fr(3 * f0, 3)} Hz (harmoniques impaires).`),
          nombre("Contraste d'impédance I = ρs·Vs/(ρr·Vr) ?", I, "", `I = (17,5 × ${vs})/(22 × ${vr}) = ${frd(I, 3)}.`, { rel: 0.02 }),
          nombre("Amplification approchée à f₀, 1/(I + πξ/2) ?", 1 / (I + (Math.PI * xi) / 2), "", `1/(${frd(I, 3)} + π × ${frd(xi, 2)}/2) = ${fr(1 / (I + (Math.PI * xi) / 2), 3)} (calcul exact des ondes SH : ${fr(pic, 3)}).`, { rel: 0.03 }),
        ],
      };
    },
  },
  {
    id: "ch12-vs30", titre: "Vs30 et classe de sol", difficulte: 1,
    generer(a) {
      const n = a.entier(2, 4), couches = Array.from({ length: n }, (_, i) => ({ h: a.entier(2, 12), vs: a.entier(12 + 6 * i, 22 + 10 * i) * 10 }));
      const rocher = { vs: a.choix([700, 900, 1200, 1500]) }, cls = Site.classeEC8(couches, rocher), H = couches.reduce((s, c) => s + c.h, 0);
      const termes = couches.map((c) => `${c.h}/${c.vs}`).concat(H < 30 ? [`${30 - H}/${rocher.vs}`] : []);
      const Hc = Math.min(H, 30), f0 = Site.frequenceQuartOnde(couches);
      return {
        enonce: `Un profil compte ${couches.map((c, i) => `${c.h} m à ${c.vs} m/s`).join(", puis ")}, sur un substratum à ${rocher.vs} m/s.`,
        donnees: couches.map((c, i) => donnee(`Couche ${i + 1}`, `${c.h} m, ${c.vs} m/s`)).concat([donnee("Substratum", `${rocher.vs} m/s`)]),
        questions: [
          nombre("Vs30 ?", cls.vs30, "m/s", `Vs30 = 30 / Σ hᵢ/Vᵢ sur 30 m = 30 / (${termes.join(" + ")}) = ${fr(cls.vs30, 3)} m/s${H > 30 ? " (on s'arrête à 30 m)" : ` (les ${30 - Hc} derniers mètres dans le substratum)`}.`),
          choixMelange(a, "Classe de sol de l'EN 1998-1:2004 ?", [cls.classe, ...["A", "B", "C", "D", "E"].filter((x) => x !== cls.classe).slice(0, 3)],
            cls.classe === "E" ? `${H} m de sol à Vs moyen ${fr(H / couches.reduce((s, c) => s + c.h / c.vs, 0), 3)} m/s (< 360) sur un rocher à plus de 800 m/s : classe E.` : `Vs30 = ${fr(cls.vs30, 3)} m/s : A au-dessus de 800, B de 360 à 800, C de 180 à 360, D en dessous ; classe ${cls.classe}.`),
          nombre("Fréquence fondamentale approchée du dépôt 1/(4·Σh/V) ?", f0, "Hz", `Σh/V = ${couches.map((c) => `${c.h}/${c.vs}`).join(" + ")} = ${frd(1 / (4 * f0), 4)} s ; f₀ = ${fr(f0, 3)} Hz.`),
        ],
      };
    },
  },
  {
    id: "ch12-darendeli", titre: "Le sol perd sa rigidité", difficulte: 2,
    generer(a) {
      const ip = a.choix([0, 15, 30, 50]), sigma = a.choix([50, 100, 200, 400]), D = Site.darendeli({ ip, sigmaM: sigma });
      const k = a.entier(9, 14), g = D.gamma[k], gg = D.GG0[k], xi = D.xi[k];
      const vs0 = a.entier(15, 35) * 10;
      return {
        enonce: `Un sol d'indice de plasticité ${ip} %, sous une contrainte moyenne effective de ${sigma} kPa, subit une distorsion effective de ${fr(100 * g, 3)} %. Les courbes de Darendeli (2001) donnent à cette distorsion G/G₀ = ${frd(gg, 3)} et ξ = ${frd(100 * xi, 1)} %. Sa vitesse en petites déformations vaut ${vs0} m/s.`,
        donnees: [donnee("IP, σ'm", `${ip} %, ${sigma} kPa`), donnee("γ", `${fr(100 * g, 3)} %`), donnee("G/G₀, ξ", `${frd(gg, 3)} ; ${frd(100 * xi, 1)} %`)],
        questions: [
          nombre("Vitesse Vs compatible avec la déformation ?", vs0 * Math.sqrt(gg), "m/s", `G ∝ Vs² : Vs = ${vs0} × √${frd(gg, 3)} = ${fr(vs0 * Math.sqrt(gg), 3)} m/s.`, { rel: 0.02 }),
          nombre("De combien la fréquence de résonance d'une couche de ce sol diminue-t-elle (rapport f/f₀) ?", Math.sqrt(gg), "", `f₀ ∝ Vs ∝ √G : rapport √${frd(gg, 3)} = ${frd(Math.sqrt(gg), 3)}.`, { rel: 0.02 }),
          choixMelange(a, "À distorsion égale, un sol plus plastique (IP plus grand)…",
            ["garde une plus grande part de sa rigidité", "perd davantage sa rigidité", "se comporte comme un sable sec", "n'a plus d'amortissement"],
            "La distorsion de référence croît avec IP et avec la contrainte : les argiles plastiques restent linéaires plus longtemps que les sables."),
        ],
      };
    },
  },
  {
    id: "ch12-notions", titre: "Effets de site et Eurocode 8", difficulte: 1,
    generer(a) {
      const pool = [
        ["Sous un mouvement de plus en plus fort, l'amplification d'un sol mou…", ["diminue et sa fréquence de résonance baisse", "augmente indéfiniment", "ne change pas", "augmente et sa fréquence monte"],
          "La rigidité chute et l'amortissement croît avec la distorsion : moins d'amplification, résonance plus basse."],
        ["La méthode linéaire équivalente retient comme distorsion effective…", ["0,65 fois la distorsion maximale de chaque couche", "la distorsion maximale", "la distorsion à la surface", "une distorsion fixée à 10⁻⁶"],
          "C'est la convention de SHAKE et de pystrata ; on itère jusqu'à ce que G et ξ soient compatibles avec cette distorsion."],
        ["Une couche de 10 m de sol mou sur un rocher à 1 500 m/s est classée…", ["E", "A", "B", "S1"],
          "5 à 20 m de sol de type C ou D sur un rocher à plus de 800 m/s : classe E."],
        ["Le rapport spectral H/V du bruit de fond sert à estimer…", ["la fréquence fondamentale f₀ du site", "la magnitude des séismes locaux", "l'intensité d'Arias", "la valeur b"],
          "Le pic de H/V coïncide en général avec f₀ quand le contraste d'impédance est marqué."],
        ["Les classes S1 et S2 de l'Eurocode 8 (argiles molles épaisses, sols liquéfiables)…", ["demandent une étude particulière", "ont un paramètre S tabulé", "se déduisent du seul Vs30", "sont assimilées à la classe A"],
          "Le règlement ne fournit pas de spectre pour ces sols : il faut une étude de site."],
        ["Pourquoi le séisme de Mexico (1985) a-t-il tant détruit à 350 km de son épicentre ?", ["les argiles lacustres ont fortement amplifié les longues périodes, en résonance avec les immeubles moyens", "le séisme était peu profond sous la ville", "la ville est sur un rocher très dur", "les ondes P y étaient focalisées"],
          "Les argiles très molles du lac résonnaient vers 2 s, comme les immeubles de 10 à 20 étages."],
      ];
      return { enonce: "Questions sur les effets de site.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
