// Exercices du chapitre 9 : déformation de la croûte et taux de séismes. Axes principaux, moments et lois
// équilibrées par le module Geodesie (conventions vérifiées contre OpenQuake).
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Geodesie from "../sismo/geodesie.js";

const sci = (x, c = 3) => { const e = Math.floor(Math.log10(Math.abs(x))); return `${fr(x / 10 ** e, c)}·10^${e}`; };

export default [
  {
    id: "ch9-faille", titre: "Moment d'une faille et période de retour", difficulte: 1,
    generer(a) {
      const s = a.entre(0.5, 10, 0.1), D = a.entier(8, 18), L = a.entier(3, 30) * 5, M = a.entre(6, 7.3, 0.1);
      const M0 = Geodesie.momentFaille({ L, W: D, s }), Mc = Geodesie.moment(M);
      return {
        enonce: `Une faille décrochante de ${L} km de long, bloquée jusqu'à ${D} km de profondeur, glisse en moyenne de ${frd(s, 1)} mm/an (μ = 30 GPa). On suppose que tout son moment est libéré par des séismes de magnitude ${frd(M, 1)}.`,
        donnees: [donnee("L, D", `${L} km, ${D} km`), donnee("s", `${frd(s, 1)} mm/an`), donnee("Mw", frd(M, 1))],
        questions: [
          nombre("Taux de moment Ṁ₀ (en 10¹⁶ N·m/an) ?", M0 / 1e16, "10¹⁶ N·m/an", `Ṁ₀ = μ·L·D·s = 3·10¹⁰ × ${fr(L * 1e3, 4)} × ${fr(D * 1e3, 4)} × ${fr(s / 1000, 3)} = ${sci(M0)} N·m/an.`),
          nombre(`Moment d'un séisme de magnitude ${frd(M, 1)} (en 10¹⁸ N·m) ?`, Mc / 1e18, "10¹⁸ N·m", `M₀ = 10^(1,5 × ${frd(M, 1)} + 9,05) = ${sci(Mc)} N·m.`),
          nombre("Intervalle moyen entre deux séismes ?", Mc / M0, "ans", `${sci(Mc)} / ${sci(M0)} = ${fr(Mc / M0, 3)} ans.`),
          nombre("Taux de déformation maximal en surface, sur la faille ?", (1000 * s) / (Math.PI * D), "ns/an", `s/(πD) = ${frd(s, 1)} / (π × ${D}) = ${fr(s / (Math.PI * D), 3)} mm/an/km = ${fr((1000 * s) / (Math.PI * D), 3)} ns/an.`),
        ],
      };
    },
  },
  {
    id: "ch9-kostrov", titre: "Moment de Kostrov d'une zone", difficulte: 2,
    generer(a) {
      const t = { exx: a.entier(-40, -3), eyy: a.entier(-10, 15), exy: a.entier(-10, 10) }, A = a.entier(2, 30) * 1000;
      const P = Geodesie.principales(t), M0 = Geodesie.momentKostrov(t, { A, H: 15 });
      const m = Math.max(Math.abs(P.e1h), Math.abs(P.e2h), Math.abs(P.e1h + P.e2h));
      return {
        enonce: `Une zone de ${fr(A, 4)} km² se déforme au taux moyen ε̇xx = ${t.exx}, ε̇yy = ${t.eyy}, ε̇xy = ${t.exy} ns/an (x vers l'est, y vers le nord). Couche sismogène de 15 km, μ = 30 GPa.`,
        donnees: [donnee("Tenseur (ns/an)", `${t.exx} ; ${t.eyy} ; ${t.exy}`), donnee("A", `${fr(A, 4)} km²`)],
        questions: [
          nombre("Taux principal de raccourcissement ε̇₁ ?", P.e1h, "ns/an", `ε̇₁,₂ = (ε̇xx + ε̇yy)/2 ∓ √(((ε̇xx − ε̇yy)/2)² + ε̇xy²) = ${frd((t.exx + t.eyy) / 2, 1)} ∓ ${frd(P.cisaillementMax, 2)} : ε̇₁ = ${frd(P.e1h, 2)} ns/an.`, { rel: 0.02 }),
          nombre("Taux principal d'allongement ε̇₂ ?", P.e2h, "ns/an", `ε̇₂ = ${frd(P.e2h, 2)} ns/an.`, { abs: 0.3 }),
          nombre("Taux de moment de Kostrov (en 10¹⁶ N·m/an) ?", M0 / 1e16, "10¹⁶ N·m/an", `max(|ε̇₁|, |ε̇₂|, |ε̇₁ + ε̇₂|) = ${frd(m, 2)} ns/an ; Ṁ₀ = 2 × 3·10¹⁰ × 15 000 × ${fr(A * 1e6, 3)} × ${frd(m, 2)}·10⁻⁹ = ${sci(M0)} N·m/an.`, { rel: 0.03 }),
        ],
      };
    },
  },
  {
    id: "ch9-equilibre", titre: "Loi de Gutenberg-Richter équilibrée en moment", difficulte: 2,
    generer(a) {
      const mom = a.entre(1, 30, 0.5) * 1e16, chi = a.choix([0.3, 0.5, 0.7, 1]), b = a.choix([0.9, 1, 1.1]), mmax = a.choix([6.5, 7, 7.5]);
      const ms = chi * mom, A = Geodesie.aDepuisMoment({ moment: ms, b, mmin: 4, mmax }), taux = (M) => Geodesie.tauxGR({ a: A, b, mmax }, M);
      return {
        enonce: `Le taux de moment géodésique d'une zone vaut ${sci(mom)} N·m/an ; on retient un couplage sismique χ = ${frd(chi, 1)}, b = ${frd(b, 1)} et une loi de Gutenberg-Richter tronquée entre 4 et ${frd(mmax, 1)}. L'équilibre en moment donne a = ${frd(A, 3)} (λ(≥ M) = 10^(a − bM) − 10^(a − b·Mmax)).`,
        donnees: [donnee("Ṁ₀ géodésique", `${sci(mom)} N·m/an`), donnee("χ, b, Mmax", `${frd(chi, 1)} ; ${frd(b, 1)} ; ${frd(mmax, 1)}`), donnee("a", frd(A, 3))],
        questions: [
          nombre("Taux de moment à libérer en séismes (en 10¹⁶ N·m/an) ?", ms / 1e16, "10¹⁶ N·m/an", `χ·Ṁ₀ = ${frd(chi, 1)} × ${sci(mom)} = ${sci(ms)} N·m/an.`),
          nombre("Période de retour des séismes de magnitude ≥ 6 ?", 1 / taux(6), "ans", `λ(≥ 6) = 10^(${frd(A, 3)} − ${frd(6 * b, 1)}) − 10^(${frd(A, 3)} − ${frd(b * mmax, 2)}) = ${fr(taux(6), 3)} / an, soit une fois tous les ${fr(1 / taux(6), 3)} ans.`, { rel: 0.03 }),
          choixMelange(a, "À moment égal, si l'on abaisse Mmax d'une demi-unité, le taux des séismes de magnitude 5…",
            ["augmente : le même moment doit être libéré par des séismes plus petits", "diminue", "ne change pas", "devient nul"],
            "L'équilibre en moment fixe a pour b et Mmax donnés ; une Mmax plus faible relève a et donc le taux de toutes les magnitudes inférieures."),
        ],
      };
    },
  },
  {
    id: "ch9-notions", titre: "Géodésie et sismicité", difficulte: 1,
    generer(a) {
      const pool = [
        ["1 mm/an de différence de vitesse entre deux stations distantes de 10 km correspond à…", ["100 ns/an", "1 000 ns/an", "10 ns/an", "1 ns/an"],
          "1 mm/an/km = 10⁻⁶/an = 1 000 ns/an ; sur 10 km, 0,1 mm/an/km = 100 ns/an."],
        ["Le couplage sismique χ est…", ["la part du moment géodésique libérée par des séismes", "le rapport entre ML et Mw", "la profondeur de blocage d'une faille", "la valeur b de la région"],
          "Le reste se libère par glissement lent, plis ou déformation diffuse."],
        ["Dans une région lente (quelques ns/an), le taux de moment géodésique estimé est…", ["incertain et biaisé vers le haut, car il dépend de la valeur absolue de la déformation", "plus précis que dans une région rapide", "toujours nul", "indépendant du bruit des stations"],
          "Le bruit ajoute toujours de l'amplitude : max(|ε̇1|, |ε̇2|, |ε̇1 + ε̇2|) est en moyenne surestimé."],
        ["Pour une faille bloquée jusqu'à D, la moitié du glissement s'accumule…", ["dans une bande de ± D autour de la faille", "à plus de 10 D de la faille", "uniquement sur la faille", "uniformément sur toute la région"],
          "arctan(±1) = ±π/4 : à ± D, la vitesse vaut ± s/4, la moitié de l'écart total s."],
        ["Le catalogue et la géodésie se complètent car…", ["le catalogue contraint les petits et moyens séismes, la géodésie le taux des grands", "la géodésie mesure directement les magnitudes", "le catalogue mesure la déformation", "ils donnent toujours le même résultat"],
          "Les grands séismes d'une faille lente reviennent trop rarement pour qu'un catalogue de quelques siècles les compte ; la déformation, elle, s'accumule en continu."],
        ["Kostrov relie…", ["la déformation moyenne d'un volume au moment des séismes qu'il contient", "la magnitude à l'intensité", "la vitesse des ondes P à celle des ondes S", "le moment à la fréquence coin"],
          "Sous la forme de Savage et Simpson : Ṁ₀ = 2μHA·max(|ε̇1|, |ε̇2|, |ε̇1 + ε̇2|)."],
      ];
      return { enonce: "Questions sur la géodésie et le bilan de moment.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
