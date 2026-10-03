// Exercices du chapitre 1 : lire un sismogramme. Les lectures (temps d'arrivée, amplitudes du
// Wood-Anderson) sortent du générateur des bancs ; les réponses appliquent les règles du cours à ces
// lectures arrondies, comme le ferait un analyste, et les explications rappellent la vérité du générateur.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Sismo from "../sismo/signal.js";
import Accelero from "../sismo/accelerogramme.js";

const VP = Sismo.MODELE.vp1, K = Sismo.kmS;
const arrondi = (x, d = 1) => +x.toFixed(d);
// Heure d'un instant compté en secondes après 10 h 14 min 00 s.
const heure = (t) => `10 h ${14 + Math.floor(t / 60)} min ${frd(t % 60, 1)} s`;

// Distance épicentrale tirée parmi celles où l'onde Pg arrive la première (la règle S − P est alors exacte).
function tirerTrajet(a, dmin, dmax) {
  for (;;) {
    const delta = a.entier(dmin, dmax), h = a.entier(5, 20), tt = Sismo.temps(delta, h);
    if (tt.tPn === null || tt.tPn >= tt.tPg) return { delta, h, tt };
  }
}

export default [
  {
    id: "ch1-distance", titre: "Distance et heure d'origine par l'écart S − P", difficulte: 1,
    generer(a) {
      const { delta, h, tt } = tirerTrajet(a, 15, 110);
      const origine = 60 + a.entre(2, 20, 0.1);                 // origine après 10 h 15 min : P et S restent dans la même minute
      const tP = arrondi(origine + tt.tP), tS = arrondi(origine + tt.tSg);
      const sp = arrondi(tS - tP), R = K * sp, epi = Math.sqrt(Math.max(R * R - h * h, 0)), t0 = tP - R / VP;
      return {
        enonce: `Une station enregistre un séisme local. L'onde P arrive à ${heure(tP)}, l'onde S à ${heure(tS)}. Le foyer est supposé à ${h} km de profondeur (Vp = ${frd(VP, 1)} km/s, Vs = ${frd(Sismo.MODELE.vs1, 1)} km/s).`,
        donnees: [donnee("Arrivée P", heure(tP)), donnee("Arrivée S", heure(tS)), donnee("Profondeur h", `${h} km`)],
        questions: [
          nombre("Écart S − P ?", sp, "s", `${frd(tS - 60, 1)} − ${frd(tP - 60, 1)} = ${frd(sp, 1)} s (les minutes sont les mêmes).`, { abs: 0.05 }),
          nombre("Distance hypocentrale R ?", R, "km",
            `R ≈ 8,4 × (S − P) = 8,4 × ${frd(sp, 1)} = ${fr(R, 3)} km — le facteur vient de Vp·Vs/(Vp − Vs) = ${frd(VP, 1)} × ${frd(Sismo.MODELE.vs1, 1)} / ${frd(VP - Sismo.MODELE.vs1, 1)} = ${frd(K, 2)} km/s. Distance vraie du générateur : ${fr(tt.R, 3)} km.`),
          nombre("Distance épicentrale Δ ?", epi, "km",
            `Δ = √(R² − h²) = √(${fr(R, 3)}² − ${h}²) = ${fr(epi, 3)} km (épicentre vrai : ${delta} km).`, { rel: 0.03 }),
          nombre("Heure d'origine : combien de secondes après 10 h 15 min 00 s ?", t0 - 60, "s",
            `t₀ = tP − R/Vp = ${frd(tP - 60, 1)} − ${fr(R, 3)} / ${frd(VP, 1)} = ${frd(tP - 60, 1)} − ${frd(R / VP, 1)} = ${frd(t0 - 60, 1)} s, soit ${heure(t0)} (origine vraie : ${heure(origine)}).`, { abs: 0.3 }),
        ],
      };
    },
  },
  {
    id: "ch1-magnitude", titre: "Magnitude locale à partir d'un enregistrement", difficulte: 2,
    generer(a) {
      const { delta, h, tt } = tirerTrajet(a, 20, 120);
      const Mw = a.entre(2.5, 4.5, 0.1);
      const ev = Sismo.generer({ Mw, delta, h, baz: a.entier(0, 359), graine: a.entier(1, 1e6) });
      const vrai = Sismo.mlVraie(ev);
      const sp = arrondi(tt.tSg - tt.tP), R = K * sp;
      const AN = +vrai.N.A.toPrecision(3), AE = +vrai.E.A.toPrecision(3);
      const mN = Sismo.ML(AN, R), mE = Sismo.ML(AE, R), ml = (mN + mE) / 2;
      const corr = 1.11 * Math.log10(R) + 0.00189 * R - 2.09;
      return {
        enonce: `Sur l'enregistrement d'un séisme, l'écart S − P vaut ${frd(sp, 1)} s. Le Wood-Anderson simulé (grandissement 1) donne une amplitude maximale de ${fr(AN, 3)} nm sur la composante nord et de ${fr(AE, 3)} nm sur la composante est.`,
        donnees: [donnee("S − P", `${frd(sp, 1)} s`), donnee("A nord", `${fr(AN, 3)} nm`), donnee("A est", `${fr(AE, 3)} nm`)],
        questions: [
          nombre("Distance hypocentrale R ?", R, "km", `R ≈ 8,4 × ${frd(sp, 1)} = ${fr(R, 3)} km.`),
          nombre("Correction de distance 1,11·log₁₀ R + 0,00189·R − 2,09 ?", corr, "",
            `1,11 × log₁₀ ${fr(R, 3)} + 0,00189 × ${fr(R, 3)} − 2,09 = ${frd(1.11 * Math.log10(R), 2)} + ${frd(0.00189 * R, 2)} − 2,09 = ${frd(corr, 2)}.`, { abs: 0.03 }),
          nombre("Magnitude locale ML (moyenne des deux composantes) ?", ml, "",
            `Nord : log₁₀ ${fr(AN, 3)} + ${frd(corr, 2)} = ${frd(mN, 2)} ; est : log₁₀ ${fr(AE, 3)} + ${frd(corr, 2)} = ${frd(mE, 2)} ; moyenne ML = ${frd(ml, 1)}. Le générateur, à la distance vraie, mesure ML = ${frd(vrai.ML, 1)}.`, { abs: 0.1 }),
          nombre("À la même distance, quelle amplitude moyenne donnerait un séisme d'une magnitude plus grande ?", 10 * Math.sqrt(AN * AE), "nm",
            `Une unité de magnitude multiplie l'amplitude par 10 : 10 × √(${fr(AN, 3)} × ${fr(AE, 3)}) ≈ ${fr(10 * Math.sqrt(AN * AE), 3)} nm (la moyenne des magnitudes correspond à la moyenne géométrique des amplitudes).`, { rel: 0.05 }),
        ],
      };
    },
  },
  {
    id: "ch1-ondes", titre: "Reconnaître les ondes", difficulte: 1,
    generer(a) {
      const pool = [
        ["Sur un sismogramme, quelle onde arrive la première ?", ["l'onde P", "l'onde S", "l'onde de Rayleigh", "l'onde de Love"],
          "L'onde P, de compression, est la plus rapide (≈ 6 km/s dans la croûte) : elle arrive toujours la première."],
        ["Sur quelle composante l'onde P se voit-elle le mieux, pour un séisme proche ?", ["la verticale", "la nord–sud", "l'est–ouest", "les trois également"],
          "Les couches lentes de surface redressent les rais : l'onde P remonte presque verticalement et fait surtout bouger le sol verticalement."],
        ["Quelle onde sollicite le plus les bâtiments, dans le champ proche ?", ["l'onde S, forte sur les horizontales", "l'onde P, la première arrivée", "l'onde P, forte sur la verticale", "aucune : seules les ondes de surface comptent"],
          "L'onde S porte l'essentiel de l'énergie à haute fréquence sur les composantes horizontales : c'est elle qui fait le pic d'accélération d'un séisme proche."],
        ["Vp ≈ 6 km/s et Vs ≈ 3,5 km/s : que vaut le rapport Vp/Vs ?", ["environ 1,7", "environ 1,2", "environ 2,5", "environ 3,5"],
          "6,0 / 3,5 ≈ 1,71 ; ce rapport varie peu dans la croûte, c'est pourquoi la règle d ≈ 8,4 × (S − P) voyage bien."],
        ["L'écart S − P double. La distance au foyer…", ["double", "est multipliée par √2", "est multipliée par 4", "ne change pas"],
          "S − P = d (1/Vs − 1/Vp) : l'écart est proportionnel à la distance."],
        ["À 120 km, les ondes de surface…", ["arrivent après S et se détachent, avec des oscillations de plus longue période", "arrivent avant l'onde S", "ne s'enregistrent qu'à la verticale", "ont disparu, absorbées par la croûte"],
          "Plus lentes que S (≈ 3 km/s), elles se séparent d'autant plus que la distance grandit ; leur période est plus longue."],
        ["Pourquoi l'ingénieur préfère-t-il l'accéléromètre au vélocimètre près d'un fort séisme ?", ["le vélocimètre, très sensible, sature quand le sol bouge fort", "l'accéléromètre est plus sensible aux petits séismes", "le vélocimètre ne date pas les arrivées", "l'accéléromètre enregistre seulement les ondes P"],
          "Le vélocimètre voit des séismes minuscules mais sature dans le mouvement fort ; l'accéléromètre, moins sensible, reste juste là où le mouvement intéresse l'ingénieur."],
        ["L'onde P compresse la roche…", ["dans sa direction de propagation", "perpendiculairement à sa propagation", "seulement en surface", "seulement à la verticale du foyer"],
          "L'onde P est longitudinale, comme le son ; l'onde S cisaille perpendiculairement à la propagation."],
      ];
      return {
        enonce: "Quatre questions sur les ondes et les capteurs, à traiter sans calcul.",
        questions: a.tirage(pool, 4).map(([q, opts, ex]) => choixMelange(a, q, opts, ex)),
      };
    },
  },
  {
    id: "ch1-mouvement", titre: "Magnitude, intensité et mouvement au site", difficulte: 2,
    generer(a) {
      const M1 = a.entre(5.8, 6.8, 0.1), R1 = a.entier(60, 120);   // fort et lointain
      const M2 = a.entre(4.8, 5.4, 0.1), R2 = a.entier(3, 10);     // modéré et proche
      const pga = (M, R) => Math.exp(Accelero.medianeLois(M, R, "PGA"));
      const p1 = pga(M1, R1), p2 = pga(M2, R2);
      const fort = p2 > p1 ? `le séisme de magnitude ${frd(M2, 1)} à ${R2} km` : `le séisme de magnitude ${frd(M1, 1)} à ${R1} km`;
      const autre = p2 > p1 ? `le séisme de magnitude ${frd(M1, 1)} à ${R1} km` : `le séisme de magnitude ${frd(M2, 1)} à ${R2} km`;
      const dM = arrondi(M1 - M2);
      return {
        enonce: `Un site au rocher peut être secoué par deux séismes : l'un de magnitude Mw ${frd(M1, 1)} à ${R1} km, l'autre de magnitude Mw ${frd(M2, 1)} à ${R2} km (distances Rjb).`,
        donnees: [donnee("Séisme 1", `Mw ${frd(M1, 1)} à ${R1} km`), donnee("Séisme 2", `Mw ${frd(M2, 1)} à ${R2} km`)],
        questions: [
          nombre(`Combien de fois plus d'énergie le séisme 1 libère-t-il (écart de ${frd(dM, 1)} en magnitude) ?`, 10 ** (1.5 * dM), "",
            `L'énergie varie comme 10^(1,5·M) : 10^(1,5 × ${frd(dM, 1)}) ≈ ${fr(10 ** (1.5 * dM), 3)}. Un point de magnitude ≈ 32 fois plus d'énergie.`, { rel: 0.05 }),
          choixMelange(a, "Lequel produit au site la plus forte accélération maximale médiane ?", [fort, autre],
            `Médiane des trois lois du cours au rocher : ${fr(p1, 2)} g pour le séisme 1, ${fr(p2, 2)} g pour le séisme 2. La distance compte autant que la magnitude : ${p2 > p1 ? "le séisme modéré et proche l'emporte" : "ici le séisme fort l'emporte malgré la distance"}.`),
          choixMelange(a, "Pour le séisme 1, l'intensité observée…",
            ["varie d'un lieu à l'autre : elle décrit les effets en un lieu", "est la même partout, comme la magnitude", "se déduit de la seule magnitude", "ne dépend que de la profondeur du foyer"],
            "La magnitude est une valeur par séisme ; l'intensité (EMS-98, de I à XII) décrit les effets observés en un lieu et diminue en général avec la distance."),
          choixMelange(a, "Pour décrire un séisme de magnitude 7 ou plus, on emploie…",
            ["la magnitude de moment Mw : ML sature vers 6,5", "ML, valable à toutes les tailles", "l'intensité maximale", "l'accélération maximale à la station la plus proche"],
            "Le Wood-Anderson, réglé sur 0,8 s, ne voit plus grandir les grands séismes qui rayonnent en longue période : ML sature. Mw, tirée du moment sismique, ne sature pas."),
        ],
      };
    },
  },
];
