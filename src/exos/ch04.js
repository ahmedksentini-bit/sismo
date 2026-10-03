// Exercices du chapitre 4 : moment sismique, magnitude de moment, spectre de Brune, lois d'échelle. Les
// valeurs « mesurées » (plateau et fréquence coin) sortent de l'analyse d'un enregistrement du générateur.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Sismo from "../sismo/signal.js";
import Source from "../sismo/source.js";
import Faille from "../sismo/faille.js";

const BETA = Sismo.MODELE.vs1 * 1000;
const moment = (Mw) => 10 ** (1.5 * Mw + 9.05);
const mw = (M0) => (Math.log10(M0) - 9.05) / 1.5;
const sci = (x, c = 3) => { const e = Math.floor(Math.log10(x)); return `${fr(x / 10 ** e, c)}·10^${e}`; };

export default [
  {
    id: "ch4-moment", titre: "Moment sismique et magnitude d'une rupture", difficulte: 1,
    generer(a) {
      const L = a.entier(4, 60), W = Math.min(a.entier(3, 20), L), D = a.entre(0.1, 3, 0.05), mu = a.choix([30, 32, 33]);
      const M0 = mu * 1e9 * L * 1e3 * W * 1e3 * D, Mw = mw(M0);
      return {
        enonce: `Une rupture de ${L} km de long sur ${W} km de large a glissé en moyenne de ${frd(D, 2)} m, dans une croûte de rigidité μ = ${mu} GPa.`,
        donnees: [donnee("L × W", `${L} km × ${W} km`), donnee("D", `${frd(D, 2)} m`), donnee("μ", `${mu} GPa`)],
        questions: [
          nombre("Moment sismique M₀ (en 10¹⁸ N·m) ?", M0 / 1e18, "10¹⁸ N·m", `M₀ = μ·L·W·D = ${mu}·10⁹ × ${fr(L * 1e3, 4)} × ${fr(W * 1e3, 4)} × ${frd(D, 2)} = ${sci(M0)} N·m.`),
          nombre("Magnitude de moment Mw ?", Mw, "", `Mw = (log₁₀ M₀ − 9,05)/1,5 = (${frd(Math.log10(M0), 2)} − 9,05)/1,5 = ${frd(Mw, 2)}.`, { abs: 0.05 }),
          nombre("Moment d'un séisme de magnitude Mw + 1 (en 10¹⁸ N·m) ?", (M0 * 10 ** 1.5) / 1e18, "10¹⁸ N·m", `Une unité de Mw multiplie M₀ par 10^1,5 ≈ 31,6 : ${sci(M0 * 10 ** 1.5)} N·m.`, { rel: 0.03 }),
          choixMelange(a, "Pourquoi préfère-t-on Mw à ML pour les grands séismes ?",
            ["Mw mesure la taille physique de la rupture et ne sature pas", "Mw se lit directement sur le Wood-Anderson", "ML dépend de la profondeur, Mw non", "Mw est toujours plus grande que ML"],
            "ML lit une amplitude autour de 1,25 Hz ; au-delà de 6 à 6,5, la fréquence coin passe sous cette fréquence et ML sature. Mw vient du moment, lu sur les basses fréquences."),
        ],
      };
    },
  },
  {
    id: "ch4-brune", titre: "Magnitude et chute de contrainte par le spectre de Brune", difficulte: 2,
    generer(a) {
      const Mw = a.entre(3.5, 5.5, 0.1), ds = a.entre(2, 15, 0.5), d = a.entier(4, 13) * 10;
      const ev = Sismo.generer({ Mw, delta: d, h: 10, baz: a.entier(0, 359), graine: a.entier(1, 1e6), modele: { dsigma: 10 * ds } });
      const r = Source.analyser(ev);
      const C = Source.constante(), O = +r.omega0.toPrecision(3), fc = +r.fc.toPrecision(2);
      const M0 = O / C, Mwe = mw(M0), dse = (M0 * (fc / (0.4906 * BETA)) ** 3) / 1e6;
      return {
        enonce: `Le spectre de déplacement des ondes S d'un séisme, corrigé du trajet, du filtre κ et du site, est ajusté par un modèle de Brune : plateau Ω₀ = ${sci(O)} m·s (spectre ramené à R₀ = 1 km du foyer), fréquence coin fc = ${fr(fc, 2)} Hz. On prend ρ = ${fr(Sismo.MODELE.rho, 4)} kg/m³, β = ${fr(BETA, 4)} m/s, Rθφ = 0,63 et F = 2.`,
        donnees: [donnee("Ω₀", `${sci(O)} m·s`), donnee("fc", `${fr(fc, 2)} Hz`), donnee("ρ, β", `${fr(Sismo.MODELE.rho, 4)} kg/m³, ${fr(BETA, 4)} m/s`)],
        questions: [
          nombre("Moment sismique M₀ (en 10¹⁵ N·m) ?", M0 / 1e15, "10¹⁵ N·m",
            `M₀ = Ω₀·4πρβ³·R₀/(Rθφ·F) = ${sci(O)} × 4π × ${fr(Sismo.MODELE.rho, 4)} × ${fr(BETA, 4)}³ × 1 000 / 1,26 = ${sci(M0)} N·m.`, { rel: 0.04 }),
          nombre("Magnitude de moment Mw ?", Mwe, "", `Mw = (log₁₀ ${sci(M0)} − 9,05)/1,5 = ${frd(Mwe, 2)} (séisme simulé : Mw ${frd(Mw, 1)}).`, { abs: 0.06 }),
          nombre("Chute de contrainte Δσ (MPa) ?", dse, "MPa",
            `De fc = 0,49·β·(Δσ/M₀)^(1/3) : Δσ = M₀·(fc/(0,49·β))³ = ${sci(M0)} × (${fr(fc, 2)} / ${fr(0.4906 * BETA, 4)})³ = ${fr(dse, 2)} MPa (séisme simulé : ${fr(ds, 3)} MPa ; Δσ dépend du cube de fc, d'où sa faible précision).`, { rel: 0.1 }),
          choixMelange(a, "Si l'on oubliait de corriger le spectre du filtre κ, la fréquence coin ajustée serait…",
            ["trop basse : κ abaisse les hautes fréquences, comme une rupture plus grande", "trop haute", "inchangée", "nulle"],
            "κ coupe les hautes fréquences : le spectre non corrigé décroît plus tôt, ce que l'ajustement attribue à une fréquence coin plus basse (et Δσ trop faible)."),
        ],
      };
    },
  },
  {
    id: "ch4-echelle", titre: "Taille de rupture et glissement moyen", difficulte: 1,
    generer(a) {
      const Mw = a.entre(5.5, 7.5, 0.1), forme = a.choix([2, 3, 4]);
      const A = Faille.aireWC1994(Mw), W = Math.sqrt(A / forme), L = forme * W, M0 = moment(Mw), D = M0 / (3e10 * A * 1e6);
      return {
        enonce: `Un séisme de magnitude Mw ${frd(Mw, 1)} rompt une faille dont la longueur vaut ${forme} fois la largeur. On prend μ = 30 GPa et la loi médiane de Wells et Coppersmith (1994), toutes failles confondues : log₁₀ A = −3,49 + 0,91·Mw (A en km²).`,
        donnees: [donnee("Mw", frd(Mw, 1)), donnee("L / W", `${forme}`), donnee("μ", "30 GPa")],
        questions: [
          nombre("Surface de rupture médiane A ?", A, "km²", `log₁₀ A = −3,49 + 0,91 × ${frd(Mw, 1)} = ${frd(Math.log10(A), 3)}, A = ${fr(A, 3)} km².`, { rel: 0.03 }),
          nombre("Longueur de la rupture L ?", L, "km", `W = √(A/${forme}) = ${fr(W, 3)} km, L = ${forme}·W = ${fr(L, 3)} km.`, { rel: 0.03 }),
          nombre("Glissement moyen D ?", D, "m", `M₀ = 10^(1,5 × ${frd(Mw, 1)} + 9,05) = ${sci(M0)} N·m ; D = M₀/(μA) = ${sci(M0)} / (3·10¹⁰ × ${fr(A * 1e6, 3)}) = ${fr(D, 3)} m.`, { rel: 0.04 }),
          choixMelange(a, "Une unité de magnitude de plus multiplie la surface de rupture médiane par environ…",
            ["8", "32", "2", "1 000"],
            "10^0,91 ≈ 8 : la surface est multipliée par 8, le glissement moyen par 4 environ (32 / 8), le moment par 32."),
        ],
      };
    },
  },
  {
    id: "ch4-saturation", titre: "Fréquence coin et saturation de ML", difficulte: 2,
    generer(a) {
      const ds = a.entre(2, 10, 0.5), M1 = a.choix([4, 4.5, 5, 5.5, 6, 6.5]), M2 = M1 + 1;
      const fc = (M) => 0.4906 * BETA * Math.cbrt((ds * 1e6) / moment(M));
      const s = (M, f) => moment(M) / (1 + (f / fc(M)) ** 2);
      const ratio = s(M2, 1.25) / s(M1, 1.25);
      return {
        enonce: `Deux séismes de même chute de contrainte Δσ = ${frd(ds, 1)} MPa ont pour magnitudes Mw ${frd(M1, 1)} et Mw ${frd(M2, 1)} (β = ${fr(BETA, 4)} m/s, modèle de Brune).`,
        donnees: [donnee("Δσ", `${frd(ds, 1)} MPa`), donnee("Magnitudes", `${frd(M1, 1)} et ${frd(M2, 1)}`)],
        questions: [
          nombre(`Fréquence coin du séisme de magnitude ${frd(M1, 1)} ?`, fc(M1), "Hz",
            `M₀ = 10^(1,5 × ${frd(M1, 1)} + 9,05) = ${sci(moment(M1))} N·m ; fc = 0,49 × ${fr(BETA, 4)} × (${frd(ds, 1)}·10⁶ / M₀)^(1/3) = ${fr(fc(M1), 3)} Hz.`, { rel: 0.03 }),
          nombre(`Fréquence coin du séisme de magnitude ${frd(M2, 1)} ?`, fc(M2), "Hz", `fc varie comme M₀^(−1/3) : divisée par 10^0,5 ≈ 3,16, soit ${fr(fc(M2), 3)} Hz.`, { rel: 0.03 }),
          nombre("Rapport des spectres à 1,25 Hz (fréquence du Wood-Anderson), du plus grand au plus petit ?", ratio, "",
            `Ω ∝ M₀/(1 + (f/fc)²) : ${fr(s(M2, 1.25) / 1e15, 3)} / ${fr(s(M1, 1.25) / 1e15, 3)} (en 10¹⁵ N·m) = ${fr(ratio, 3)}, au lieu de 31,6 sur le plateau${ratio < 10 ? " : ML sature" : ""}.`, { rel: 0.04 }),
          choixMelange(a, "ML commence à saturer quand…",
            ["la fréquence coin passe sous 1,25 Hz", "la fréquence coin dépasse 10 Hz", "la chute de contrainte dépasse 10 MPa", "la station est à plus de 100 km"],
            "Au-delà de fc, le Wood-Anderson lit la pente en 1/f², où l'amplitude ne croît plus que comme M₀^(1/3)."),
        ],
      };
    },
  },
];
