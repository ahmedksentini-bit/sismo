// Exercices du chapitre 10 : calcul probabiliste de l'aléa. Médianes et écarts types des lois du cours
// (coefficients d'OpenQuake), probabilités de la loi normale du moteur PSHA, courbes d'aléa de
// Psha.modeleSimple.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Gmpe from "../sismo/gmpe.js";
import Psha from "../sismo/psha.js";

const NOMS = { akkar2014: "Akkar et al. (2014)", bindi2014: "Bindi et al. (2014)", boore2014: "Boore et al. (2014)" };

export default [
  {
    id: "ch10-gmpe", titre: "Probabilité de dépasser un seuil lors d'un séisme", difficulte: 1,
    generer(a) {
      const id = a.choix(Object.keys(NOMS)), M = a.entre(5, 7, 0.1), R = a.entier(3, 60), c = Gmpe.LOIS[id].calculer({ M, Rjb: R, vs30: 800, rake: 0 }, "PGA");
      const med = +Math.exp(c.ln).toPrecision(3), sig = +c.sigma.toFixed(2), y = +(med * a.choix([1.5, 2, 2.5, 3])).toPrecision(2);
      const z = (Math.log(y) - Math.log(med)) / sig;
      return {
        enonce: `Pour un séisme de magnitude ${frd(M, 1)} à ${R} km, au rocher, la loi de ${NOMS[id]} donne une accélération maximale médiane de ${fr(med, 3)} g, avec un écart type σ = ${frd(sig, 2)} sur ln PGA.`,
        donnees: [donnee("Médiane", `${fr(med, 3)} g`), donnee("σ (ln)", frd(sig, 2)), donnee("Seuil", `${fr(y, 2)} g`)],
        questions: [
          nombre("Accélération dépassée une fois sur six (médiane × e^σ) ?", med * Math.exp(sig), "g", `${fr(med, 3)} × e^${frd(sig, 2)} = ${fr(med * Math.exp(sig), 3)} g (84ᵉ centile).`),
          nombre(`Écart normalisé ε du seuil ${fr(y, 2)} g ?`, z, "", `ε = (ln ${fr(y, 2)} − ln ${fr(med, 3)}) / ${frd(sig, 2)} = ${frd(z, 2)}.`, { abs: 0.03 }),
          nombre(`Probabilité que ce séisme dépasse ${fr(y, 2)} g (en %) ?`, 100 * (1 - Psha.Phi(z)), "%", `P = 1 − Φ(${frd(z, 2)}) = ${frd(100 * (1 - Psha.Phi(z)), 1)} % (loi normale, sans troncature).`, { abs: 1 }),
        ],
      };
    },
  },
  {
    id: "ch10-cornell", titre: "L'intégrale de Cornell à la main", difficulte: 2,
    generer(a) {
      const y = a.choix([0.1, 0.15, 0.2]);
      const sc = [{ M: a.entre(4.8, 5.4, 0.1), R: a.entier(5, 15), lam: a.choix([0.02, 0.03, 0.05]) }, { M: a.entre(6.2, 7, 0.1), R: a.entier(30, 60), lam: a.choix([0.002, 0.003, 0.004]) }];
      const p = sc.map((s) => {
        const c = Gmpe.LOIS.boore2014.calculer({ M: s.M, Rjb: s.R, vs30: 800, rake: 0 }, "PGA");
        const med = +Math.exp(c.ln).toPrecision(3), sig = +c.sigma.toFixed(2);
        return { med, sig, P: 1 - Psha.Phi((Math.log(y) - Math.log(med)) / sig) };
      });
      const lam = sc.reduce((s, x, i) => s + x.lam * p[i].P, 0);
      return {
        enonce: `Un site n'est menacé que par deux scénarios : un séisme de magnitude ${frd(sc[0].M, 1)} à ${sc[0].R} km, au taux de ${fr(sc[0].lam, 2)} par an (PGA médiane ${fr(p[0].med, 3)} g, σ = ${frd(p[0].sig, 2)}), et un séisme de magnitude ${frd(sc[1].M, 1)} à ${sc[1].R} km, au taux de ${fr(sc[1].lam, 2)} par an (PGA médiane ${fr(p[1].med, 3)} g, σ = ${frd(p[1].sig, 2)}). On cherche l'aléa pour PGA > ${fr(y, 2)} g.`,
        donnees: sc.map((s, i) => donnee(`Scénario ${i + 1}`, `M ${frd(s.M, 1)}, ${s.R} km, ${fr(s.lam, 2)}/an, médiane ${fr(p[i].med, 3)} g, σ ${frd(p[i].sig, 2)}`)),
        questions: [
          nombre("Probabilité que le scénario 1 dépasse le seuil (en %) ?", 100 * p[0].P, "%", `ε = (ln ${fr(y, 2)} − ln ${fr(p[0].med, 3)})/${frd(p[0].sig, 2)} = ${frd((Math.log(y) - Math.log(p[0].med)) / p[0].sig, 2)} ; P = ${frd(100 * p[0].P, 1)} %.`, { abs: 1 }),
          nombre("Taux annuel de dépassement du seuil (somme des deux scénarios) ?", lam, "/ an", `λ = ${fr(sc[0].lam, 2)} × ${frd(p[0].P, 3)} + ${fr(sc[1].lam, 2)} × ${frd(p[1].P, 3)} = ${fr(lam, 3)} / an.`, { rel: 0.05 }),
          nombre("Période de retour du dépassement ?", 1 / lam, "ans", `1/λ = ${fr(1 / lam, 3)} ans.`, { rel: 0.05 }),
          nombre("Probabilité de dépassement en 50 ans (en %) ?", 100 * (1 - Math.exp(-50 * lam)), "%", `1 − e^(−50λ) = ${frd(100 * (1 - Math.exp(-50 * lam)), 1)} %.`, { rel: 0.05 }),
        ],
      };
    },
  },
  {
    id: "ch10-courbe", titre: "Lire une courbe d'aléa", difficulte: 2,
    generer(a) {
      const m = Psha.modeleSimple({ taux4: a.choix([0.3, 0.5, 1, 2]), b: a.choix([0.9, 1, 1.1]), mmax: a.choix([6, 6.5, 7]), imts: ["PGA"] });
      const r = Psha.calculer(m), N = r.niveaux, poe = r.moyenne[0];
      const cible = -Math.log(0.9) / 50, lam = (p) => -Math.log(1 - p) / 50;
      let l = 1;
      while (l < N.length - 1 && lam(poe[l]) > cible) l++;
      const x0 = +N[l - 1].toPrecision(3), x1 = +N[l].toPrecision(3), l0 = +lam(poe[l - 1]).toPrecision(3), l1 = +lam(poe[l]).toPrecision(3);
      const x = Math.exp(Math.log(x0) + ((Math.log(cible) - Math.log(l0)) * (Math.log(x1) - Math.log(x0))) / (Math.log(l1) - Math.log(l0)));
      return {
        enonce: `La courbe d'aléa d'un site donne un taux annuel de dépassement de ${fr(l0, 3)} pour PGA = ${fr(x0, 3)} g et de ${fr(l1, 3)} pour PGA = ${fr(x1, 3)} g. On interpole en log-log entre ces deux points.`,
        donnees: [donnee(`PGA ${fr(x0, 3)} g`, `λ = ${fr(l0, 3)} / an`), donnee(`PGA ${fr(x1, 3)} g`, `λ = ${fr(l1, 3)} / an`)],
        questions: [
          nombre("Taux annuel correspondant à 10 % en 50 ans ?", cible, "/ an", `λ = −ln(0,9)/50 = 1/474,6 = ${fr(-Math.log(0.9) / 50, 4)} / an.`, { rel: 0.01 }),
          nombre("PGA à 475 ans ?", x, "g", `ln PGA = ln ${fr(x0, 3)} + (ln λ475 − ln ${fr(l0, 3)})·(ln ${fr(x1, 3)} − ln ${fr(x0, 3)})/(ln ${fr(l1, 3)} − ln ${fr(l0, 3)}) → PGA = ${fr(x, 3)} g.`, { rel: 0.03 }),
          choixMelange(a, "Le PGA à 475 ans correspond…",
            ["à un niveau auquel contribuent de nombreux scénarios, pas à un séisme particulier", "au plus fort séisme possible de la région", "au séisme de magnitude Mmax à la distance minimale", "à la médiane du séisme le plus probable"],
            "La courbe d'aléa intègre tous les scénarios ; la désagrégation dit lesquels pèsent le plus."),
        ],
      };
    },
  },
  {
    id: "ch10-notions", titre: "Incertitudes, arbre logique et désagrégation", difficulte: 1,
    generer(a) {
      const pool = [
        ["L'écart type σ d'une loi d'atténuation traduit…", ["la variabilité aléatoire du mouvement d'un séisme et d'un site à l'autre", "l'incertitude sur le choix de la loi", "l'erreur de mesure des sismomètres", "l'incertitude sur la valeur b"],
          "σ est une variabilité naturelle, intégrée dans le calcul ; le choix de la loi relève de l'incertitude épistémique, traitée par l'arbre logique."],
        ["Dans un arbre logique, chaque chemin de la racine aux feuilles…", ["est une réalisation du modèle, avec sa courbe d'aléa et son poids", "est un séisme possible", "est une station du réseau", "est un niveau d'accélération"],
          "Les branches portent les choix incertains (loi, b, Mmax, modèle de taux) et leurs poids ; on publie la moyenne et les fractiles des courbes."],
        ["La désagrégation sert à…", ["identifier les couples (M, R) qui font l'aléa, pour choisir les accélérogrammes", "retirer les répliques du catalogue", "calculer la valeur b", "corriger le spectre de l'amortissement"],
          "Le scénario moyen (M̄, R̄) guide la sélection des accélérogrammes et le type de spectre de l'Eurocode 8."],
        ["Le spectre à probabilité uniforme (UHS) est…", ["l'ensemble des Sa(T) de même probabilité de dépassement, période par période", "le spectre du séisme le plus probable", "le spectre de l'Eurocode 8 au rocher", "la moyenne des spectres des accélérogrammes"],
          "Chaque ordonnée vient d'un calcul d'aléa séparé ; aucun séisme n'a nécessairement ce spectre en entier, d'où le spectre conditionnel (chapitre 11)."],
        ["La référence des études d'aléa est…", ["la courbe moyenne de l'arbre logique", "la médiane de l'arbre", "la branche de plus fort poids", "le fractile 84 %"],
          "La moyenne porte sur les probabilités (ou les taux) des réalisations ; les fractiles mesurent l'incertitude épistémique."],
        ["Aux longues périodes, la désagrégation fait en général ressortir…", ["des séismes plus grands et plus lointains qu'aux courtes périodes", "les mêmes séismes qu'aux courtes périodes", "uniquement des séismes de magnitude 4", "uniquement la source la plus proche"],
          "Les grands séismes rayonnent davantage en basses fréquences et leur mouvement s'atténue moins vite avec la distance aux longues périodes."],
      ];
      return { enonce: "Questions sur le calcul probabiliste de l'aléa.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
