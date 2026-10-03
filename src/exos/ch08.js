// Exercices du chapitre 8 : catalogue et loi de Gutenberg-Richter. Les magnitudes d'un catalogue viennent
// du générateur de catalogues du banc « sismicité » ; la valeur b, de l'estimateur d'Aki-Utsu du module.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Sismicite from "../sismo/sismicite.js";

export default [
  {
    id: "ch8-taux", titre: "Taux annuels et périodes de retour", difficulte: 1,
    generer(a) {
      const a0 = a.entre(3, 5, 0.05), b = a.entre(0.8, 1.2, 0.05), M1 = a.choix([5, 5.5]), M2 = a.choix([6, 6.5, 7]);
      const lam = (m) => 10 ** (a0 - b * m), t = a.choix([50, 100]);
      return {
        enonce: `La sismicité d'une région suit la loi de Gutenberg-Richter log₁₀ λ(≥ M) = ${frd(a0, 2)} − ${frd(b, 2)}·M (λ par an, chocs principaux).`,
        donnees: [donnee("a", frd(a0, 2)), donnee("b", frd(b, 2))],
        questions: [
          nombre(`Taux annuel des séismes de magnitude ≥ ${frd(M1, 1)} ?`, lam(M1), "/ an", `λ = 10^(${frd(a0, 2)} − ${frd(b, 2)} × ${frd(M1, 1)}) = ${fr(lam(M1), 3)} / an.`),
          nombre(`Période de retour des séismes de magnitude ≥ ${frd(M2, 1)} ?`, 1 / lam(M2), "ans", `λ = 10^(${frd(a0 - b * M2, 3)}) = ${fr(lam(M2), 3)} / an ; T_R = 1/λ = ${fr(1 / lam(M2), 3)} ans.`),
          nombre(`Probabilité d'au moins un séisme de magnitude ≥ ${frd(M2, 1)} en ${t} ans (en %) ?`, 100 * Sismicite.probabilite(lam(M2), t), "%", `P = 1 − e^(−λt) = 1 − e^(−${fr(lam(M2), 3)} × ${t}) = ${frd(100 * Sismicite.probabilite(lam(M2), t), 1)} %.`, { rel: 0.03 }),
          nombre(`Combien de séismes de magnitude ≥ ${frd(M1, 1)} pour un de magnitude ≥ ${frd(M2, 1)} ?`, 10 ** (b * (M2 - M1)), "", `10^(b·ΔM) = 10^(${frd(b, 2)} × ${frd(M2 - M1, 1)}) = ${fr(10 ** (b * (M2 - M1)), 3)}.`),
        ],
      };
    },
  },
  {
    id: "ch8-b", titre: "Valeur b d'un catalogue", difficulte: 2,
    generer(a) {
      const bv = a.entre(0.8, 1.2, 0.05), cat = Sismicite.genererCatalogue({ b: bv, graine: a.entier(1, 1e6), debut: 1995, fin: 2025, taux4: a.entre(0.5, 3, 0.1) });
      const keep = Sismicite.declusterGK(cat), mags = cat.filter((_, i) => keep[i]).map((e) => e.M);
      const Mc = Sismicite.mcCourbureMax(mags), sel = mags.filter((m) => m >= Mc - 1e-9), N = sel.length;
      const moy = +(sel.reduce((s, m) => s + m, 0) / N).toFixed(3), b = Math.LOG10E / (moy - (Mc - 0.05)), lamMc = N / 30;
      return {
        enonce: `Un catalogue déclustérisé couvre 30 ans (1995–2025), magnitudes rangées par classes de 0,1. Au-dessus de la magnitude de complétude Mc = ${frd(Mc, 1)}, il compte ${N} séismes, de magnitude moyenne ${frd(moy, 3)}.`,
        donnees: [donnee("Mc", frd(Mc, 1)), donnee("N (M ≥ Mc)", `${N}`), donnee("Magnitude moyenne", frd(moy, 3)), donnee("Durée", "30 ans")],
        questions: [
          nombre("Valeur b (Aki-Utsu) ?", b, "", `b = 0,4343 / (M̄ − (Mc − ΔM/2)) = 0,4343 / (${frd(moy, 3)} − ${frd(Mc - 0.05, 2)}) = ${frd(b, 3)} (catalogue simulé avec b = ${frd(bv, 2)}).`, { rel: 0.02 }),
          nombre("Incertitude approchée b/√N ?", b / Math.sqrt(N), "", `${frd(b, 3)} / √${N} = ${frd(b / Math.sqrt(N), 3)}.`, { rel: 0.05 }),
          nombre("Valeur a annuelle (log₁₀ λ(≥ Mc) + b·Mc) ?", Math.log10(lamMc) + b * Mc, "", `λ(≥ Mc) = ${N}/30 = ${fr(lamMc, 3)} / an ; a = log₁₀ ${fr(lamMc, 3)} + ${frd(b, 3)} × ${frd(Mc, 1)} = ${frd(Math.log10(lamMc) + b * Mc, 2)}.`, { abs: 0.05 }),
          choixMelange(a, "Si l'on avait inclus des magnitudes sous la complétude, b serait…",
            ["sous-estimé : les petits séismes manquants aplatissent la distribution", "surestimé", "inchangé", "négatif"],
            "Sous Mc, des séismes manquent : la moyenne des magnitudes monte relativement à la borne choisie, et b = 0,4343/(M̄ − Mc + ΔM/2) diminue."),
        ],
      };
    },
  },
  {
    id: "ch8-poisson", titre: "Probabilités et périodes de retour", difficulte: 1,
    generer(a) {
      const P = a.choix([0.02, 0.05, 0.1, 0.2, 0.39]), t = a.choix([10, 50, 100]), TR = Sismicite.periodeRetour(P, t);
      const vie = a.choix([30, 50, 75, 100]), TR2 = a.choix([95, 225, 475, 975, 2475]);
      return {
        enonce: `Un niveau d'aléa est défini par une probabilité de dépassement de ${frd(100 * P, 0)} % en ${t} ans ; on s'intéresse aussi à un ouvrage de durée de vie ${vie} ans.`,
        donnees: [donnee("Probabilité", `${frd(100 * P, 0)} % en ${t} ans`), donnee("Durée de vie", `${vie} ans`)],
        questions: [
          nombre("Période de retour correspondante ?", TR, "ans", `T_R = −t / ln(1 − P) = −${t} / ln(1 − ${frd(P, 2)}) = ${fr(TR, 4)} ans.`, { rel: 0.01 }),
          nombre(`Probabilité de dépasser le niveau de période de retour ${TR2} ans pendant ${vie} ans (en %) ?`, 100 * Sismicite.probabilite(1 / TR2, vie), "%", `P = 1 − e^(−${vie}/${TR2}) = ${frd(100 * Sismicite.probabilite(1 / TR2, vie), 1)} %.`, { rel: 0.02 }),
          choixMelange(a, "Le niveau de référence de l'EN 1998-1:2004 pour le non-effondrement (valeur recommandée) est…",
            ["10 % en 50 ans, soit 475 ans de période de retour", "2 % en 50 ans, soit 100 ans", "50 % en 50 ans", "10 % en 10 ans, soit 475 ans"],
            "Valeurs recommandées : 10 % en 50 ans (475 ans) pour le non-effondrement, 10 % en 10 ans (95 ans) pour la limitation des dommages."),
        ],
      };
    },
  },
  {
    id: "ch8-repliques", titre: "Répliques et déclusterage", difficulte: 1,
    generer(a) {
      const M = a.choix([5, 5.5, 6, 6.5, 7]), w = Sismicite.fenetreGK(M);
      return {
        enonce: `Un séisme de magnitude ${frd(M, 1)} vient de se produire.`,
        donnees: [donnee("M", frd(M, 1))],
        questions: [
          nombre("Magnitude moyenne attendue de la plus forte réplique (loi de Båth) ?", M - 1.2, "", `M − 1,2 = ${frd(M - 1.2, 1)}.`, { abs: 0.05 }),
          nombre("Rayon de la fenêtre de Gardner et Knopoff, L = 10^(0,1238·M + 0,983) ?", w.L, "km", `L = 10^(0,1238 × ${frd(M, 1)} + 0,983) = ${fr(w.L, 3)} km.`, { rel: 0.02 }),
          nombre("Durée de la fenêtre en jours ?", w.T, "jours", M >= 6.5 ? `Pour M ≥ 6,5 : T = 10^(0,032·M + 2,7389) = ${fr(w.T, 3)} jours.` : `Pour M < 6,5 : T = 10^(0,5409·M − 0,547) = ${fr(w.T, 3)} jours.`, { rel: 0.02 }),
          choixMelange(a, "Pourquoi retirer les répliques avant le calcul de l'aléa ?",
            ["le calcul suppose des séismes indépendants, poissoniens", "les répliques sont toujours plus fortes que le choc principal", "les répliques ne produisent pas de mouvement du sol", "pour augmenter la valeur b"],
            "Le modèle de Poisson suppose des événements indépendants ; les répliques, groupées dans le temps et l'espace, ne le sont pas."),
        ],
      };
    },
  },
];
