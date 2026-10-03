// Exercices du chapitre 17 : isolation à la base. Isolateur bilinéaire, linéarisation équivalente et point fixe
// par le module Isolation ; spectre de l'EN 1998-1:2004 avec η par le module Spectre.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Isolation from "../sismo/isolation.js";
import Spectre from "../sismo/spectre.js";

const G = Spectre.G;

export default [
  {
    id: "ch17-isolateur", titre: "Caractéristiques d'un isolateur bilinéaire", difficulte: 1,
    generer(a) {
      const M = a.entier(4, 40) * 100, Tiso = a.entre(2, 3.5, 0.1), q = a.entre(0.03, 0.1, 0.005), dy = a.entier(5, 25) / 1000;
      const iso = Isolation.isolateur({ M, Tiso, q, dy });
      return {
        enonce: `Un bâtiment de ${fr(M, 4)} t repose sur des isolateurs dont la période post-élastique vaut ${frd(Tiso, 1)} s ; la force caractéristique Q vaut ${frd(100 * q, 1)} % du poids et le déplacement de plastification ${frd(dy * 1000, 0)} mm.`,
        donnees: [donnee("M", `${fr(M, 4)} t`), donnee("Tiso", `${frd(Tiso, 1)} s`), donnee("Q/W", `${frd(100 * q, 1)} %`), donnee("dy", `${frd(dy * 1000, 0)} mm`)],
        questions: [
          nombre("Raideur post-élastique K₂ = M·(2π/Tiso)² ?", iso.K2, "kN/m", `${fr(M, 4)} × (2π/${frd(Tiso, 1)})² = ${fr(iso.K2, 4)} kN/m.`, { rel: 0.01 }),
          nombre("Force caractéristique Q ?", iso.Q, "kN", `Q = ${frd(q, 3)} × ${fr(M, 4)} × 9,81 = ${fr(iso.Q, 4)} kN.`, { rel: 0.01 }),
          nombre("Raideur initiale K₁ = K₂ + Q/dy ?", iso.K1, "kN/m", `${fr(iso.K2, 4)} + ${fr(iso.Q, 4)}/${frd(dy, 3)} = ${fr(iso.K1, 4)} kN/m.`, { rel: 0.01 }),
          nombre("Énergie dissipée par un cycle d'amplitude 100 mm, ED = 4Q(d − dy) ?", 4 * iso.Q * (0.1 - dy), "kJ", `4 × ${fr(iso.Q, 4)} × (0,100 − ${frd(dy, 3)}) = ${fr(4 * iso.Q * (0.1 - dy), 4)} kJ.`, { rel: 0.01 }),
        ],
      };
    },
  },
  {
    id: "ch17-equivalent", titre: "Une itération de la linéarisation équivalente", difficulte: 2,
    generer(a) {
      const M = a.entier(5, 30) * 100, iso = Isolation.isolateur({ M, Tiso: a.entre(2, 3, 0.1), q: a.entre(0.03, 0.08, 0.005), dy: a.entier(5, 15) / 1000 });
      const d = a.entier(8, 25) * 10 / 1000, e = Isolation.equivalent(iso, d);
      return {
        enonce: `Un isolateur (masse portée ${fr(M, 4)} t) a pour raideur post-élastique K₂ = ${fr(iso.K2, 4)} kN/m, pour force caractéristique Q = ${fr(iso.Q, 4)} kN et pour déplacement de plastification dy = ${frd(iso.dy * 1000, 0)} mm. On essaie un déplacement d = ${frd(d * 1000, 0)} mm.`,
        donnees: [donnee("K₂", `${fr(iso.K2, 4)} kN/m`), donnee("Q", `${fr(iso.Q, 4)} kN`), donnee("dy", `${frd(iso.dy * 1000, 0)} mm`), donnee("d", `${frd(d * 1000, 0)} mm`)],
        questions: [
          nombre("Force à ce déplacement F = Q + K₂·d ?", e.F, "kN", `${fr(iso.Q, 4)} + ${fr(iso.K2, 4)} × ${frd(d, 3)} = ${fr(e.F, 4)} kN.`, { rel: 0.01 }),
          nombre("Raideur effective Keff = F/d ?", e.Keff, "kN/m", `${fr(e.F, 4)} / ${frd(d, 3)} = ${fr(e.Keff, 4)} kN/m.`, { rel: 0.01 }),
          nombre("Période effective Teff = 2π√(M/Keff) ?", e.Teff, "s", `2π × √(${fr(M, 4)} / ${fr(e.Keff, 4)}) = ${fr(e.Teff, 3)} s.`, { rel: 0.01 }),
          nombre("Amortissement effectif ξeff = ED/(2π·Keff·d²) (sans viscosité) ?", 100 * e.xi, "%", `ED = 4Q(d − dy) = ${fr(e.ED, 4)} kJ ; ξ = ${fr(e.ED, 4)} / (2π × ${fr(e.Keff, 4)} × ${frd(d, 3)}²) = ${frd(100 * e.xi, 1)} %.`, { rel: 0.02 }),
        ],
      };
    },
  },
  {
    id: "ch17-gain", titre: "Ce que gagne l'isolation", difficulte: 2,
    generer(a) {
      const sol = a.choix(["A", "B", "C"]), ag = a.entre(0.15, 0.35, 0.01), Teff = a.entre(1.8, 3, 0.1), xi = a.choix([0.1, 0.15, 0.2, 0.25]), T0 = a.choix([0.3, 0.4, 0.5]);
      const p = Spectre.EC8_2004[1][sol], eta = Spectre.eta(xi), seIso = Spectre.ec8(Teff, { type: 1, sol, ag, xi }), seFixe = Spectre.ec8(T0, { type: 1, sol, ag });
      const d = seIso * G * (Teff / (2 * Math.PI)) ** 2;
      return {
        enonce: `Un bâtiment de période ${frd(T0, 1)} s sur base fixe est isolé : période effective ${frd(Teff, 1)} s, amortissement effectif ${frd(100 * xi, 0)} %. Sol ${sol} (type 1 : S = ${frd(p.S, 2)}, TC = ${frd(p.TC, 2)} s, TD = ${frd(p.TD, 1)} s), a_g = ${frd(ag, 2)} g.`,
        donnees: [donnee("Base fixe", `T = ${frd(T0, 1)} s`), donnee("Isolé", `Teff = ${frd(Teff, 1)} s, ξ = ${frd(100 * xi, 0)} %`), donnee("Sol, a_g", `${sol}, ${frd(ag, 2)} g`)],
        questions: [
          nombre("Coefficient η ?", eta, "", `η = √(10/(5 + ${frd(100 * xi, 0)})) = ${frd(Math.sqrt(10 / (5 + 100 * xi)), 3)}${eta === 0.55 ? ", borné à 0,55" : ""}.`, { abs: 0.005 }),
          nombre("Accélération spectrale du bâtiment isolé Se(Teff, ξ) ?", seIso, "g", `${Teff <= p.TD ? `a_g·S·η·2,5·TC/T = ${frd(ag, 2)} × ${frd(p.S, 2)} × ${frd(eta, 3)} × 2,5 × ${frd(p.TC, 2)}/${frd(Teff, 1)}` : `a_g·S·η·2,5·TC·TD/T²`} = ${fr(seIso, 3)} g.`, { rel: 0.02 }),
          nombre("Rapport entre l'accélération sur base fixe et celle du bâtiment isolé ?", seFixe / seIso, "", `Base fixe : Se(${frd(T0, 1)} s) = ${fr(seFixe, 3)} g ; rapport ${fr(seFixe / seIso, 3)}.`, { rel: 0.03 }),
          nombre("Déplacement de calcul de l'isolation Se·(Teff/2π)² ?", d * 1000, "mm", `${fr(seIso, 3)} × 9,81 × (${frd(Teff, 1)}/2π)² = ${fr(d * 1000, 3)} mm.`, { rel: 0.03 }),
        ],
      };
    },
  },
  {
    id: "ch17-notions", titre: "Concevoir un ouvrage isolé", difficulte: 1,
    generer(a) {
      const pool = [
        ["L'isolation à la base réduit les accélérations parce qu'elle…", ["allonge la période de l'ouvrage vers la partie faible du spectre", "rend l'ouvrage plus raide", "supprime les ondes S", "augmente la masse de l'ouvrage"],
          "Les isolateurs, souples horizontalement, portent la période à 2–3 s, où le spectre est faible."],
        ["En contrepartie, l'isolation…", ["concentre de grands déplacements dans les isolateurs", "augmente les efforts dans la superstructure", "rend les fondations inutiles", "empêche tout déplacement"],
          "On échange de l'accélération contre du déplacement : joint libre et raccordements souples sont indispensables."],
        ["Un sol mou rend l'isolation…", ["moins efficace : le spectre reste fort aux longues périodes", "plus efficace", "sans objet, car le sol isole déjà", "obligatoire"],
          "Sur sol de classe D, les périodes de coin sont longues et le gain diminue."],
        ["Le noyau de plomb d'un appui en élastomère fretté sert…", ["à dissiper de l'énergie en se plastifiant (force caractéristique Q)", "à rigidifier verticalement l'appui", "à protéger l'élastomère du feu", "à alourdir l'appui"],
          "Le plomb donne la force caractéristique et l'amortissement hystérétique ; l'élastomère donne la raideur post-élastique."],
        ["Pour quel ouvrage l'isolation est-elle la moins intéressante ?", ["une structure déjà souple, de période supérieure à 1 s", "un hôpital rigide de quatre étages", "un bâtiment patrimonial en maçonnerie", "un centre de secours"],
          "Isoler une structure souple allonge peu sa période relative et ne réduit guère sa demande."],
        ["La linéarisation équivalente se résout par itérations parce que…", ["Teff et ξeff dépendent du déplacement cherché", "le spectre change à chaque itération de calcul", "l'isolateur vieillit", "la masse varie avec le déplacement"],
          "On part d'un déplacement, on en tire Keff, Teff, ξeff, puis un nouveau déplacement, jusqu'à stabilité."],
      ];
      return { enonce: "Questions sur la conception des ouvrages isolés.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
