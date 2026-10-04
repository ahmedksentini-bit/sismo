// Calculateurs du chapitre 9 : faille bloquée de Savage et Burford (profil des vitesses, moment, période
// de retour) ; du tenseur des taux de déformation à la loi de Gutenberg-Richter équilibrée en moment.
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Geodesie from "./sismo/geodesie.js";
import { failleBloquee, mohrDeformation } from "./schemas-notes.js";

const sci = (x, c = 3) => { const e = Math.floor(Math.log10(Math.abs(x))); return `${f(x / 10 ** e, c)}·10<sup>${String(e).replace("-", "−")}</sup>`; };

// ── Une faille bloquée ───────────────────────────────────────────────────
const majFaille = garde("faOut", () => {
  const s = num("faS"), D = num("faD"), L = num("faL"), M = num("faM");
  if (!(s > 0 && D > 0 && L > 0 && M >= 4)) { el("faOut").textContent = "Saisir des valeurs positives (magnitude ≥ 4)."; el("faFig").innerHTML = ""; return; }
  const v = (x) => (s / Math.PI) * Math.atan(x / D);
  el("faFig").innerHTML = graphe({
    largeur: 560, hauteur: 280, xmin: -100, xmax: 100, ymin: -s / 2, ymax: s / 2,
    xlabel: "distance à la faille x (km)", ylabel: "vitesse parallèle à la faille (mm/an)",
    zones: [{ x0: -D, x1: D, y0: -s / 2, y1: s / 2, couleur: COULEURS.bleu, opacite: 0.08, libelle: "± D" }],
    series: [
      { points: echantillon(v, -100, 100, 200), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: `v(x) = (s/π)·arctan(x/D)` },
      { points: [[-100, -s / 2], [0, -s / 2], [0, s / 2], [100, s / 2]], couleur: COULEURS.discret, epaisseur: 1.4, tirets: "5 4", libelle: "au séisme : saut de s sur la faille" },
    ],
  });
  const M0 = Geodesie.momentFaille({ L, W: D, s }), Mc = Geodesie.moment(M);
  noter("calcFailleNote", {
    donnees: [["s", `${f(s, 3)} mm/an`], ["D (profondeur bloquée)", `${f(D, 3)} km`], ["L", `${f(L, 4)} km`], ["μ", "30 GPa"], ["M", fd(M, 1)]],
    etapes: [
      { titre: "Profil des vitesses (Savage et Burford, 1973)", formule: "v(x) = (s/π)·arctan(x/D)", calcul: `à x = D : v = (${f(s, 3)}/π) × arctan 1 = s/4 = <b>${f(s / 4, 3)} mm/an</b> ; loin : ± s/2 = ± ${f(s / 2, 3)} mm/an` },
      { titre: "Taux de déformation sur la faille", formule: "dv/dx (x = 0) = s/(πD)", calcul: `${f(s, 3)}/(π × ${f(D, 3)}) = ${f(s / (Math.PI * D), 3)} mm/an/km = <b>${f((1000 * s) / (Math.PI * D), 3)} ns/an</b>` },
      { titre: "Taux de moment à libérer", formule: "Ṁ<sub>0</sub> = μ·L·W·s, avec W = D", calcul: `Ṁ<sub>0</sub> = 3·10<sup>10</sup> × ${f(L * 1e3, 4)} × ${f(D * 1e3, 4)} × ${f(s / 1000, 3)} = <b>${sci(M0)} N·m/an</b>`,
        schema: failleBloquee({ s, D, L, M0 }),
        legende: "Modèle de Savage et Burford : sous la profondeur D, la faille glisse sans cesse à la vitesse des plaques ; au-dessus, bloquée, elle accumule un déficit de glissement s par an sur la surface L × D, que les séismes devront rattraper." },
      { titre: "Moment d'un séisme de la magnitude choisie", formule: "M<sub>0</sub> = 10<sup>1,5·M + 9,05</sup>", calcul: `M<sub>0</sub> = 10<sup>1,5 × ${fd(M, 1)} + 9,05</sup> = <b>${sci(Mc)} N·m</b>` },
      { titre: "Période de retour si tout le moment part dans ces séismes", formule: "T<sub>R</sub> = M<sub>0</sub> / Ṁ<sub>0</sub>", calcul: `T<sub>R</sub> = ${sci(Mc)} / ${sci(M0)} = <b>${f(Mc / M0, 3)} ans</b>` },
    ],
  });
  el("faOut").innerHTML = `Ṁ<sub>0</sub> = μ·L·D·s = 3·10<sup>10</sup> × ${f(L * 1e3, 4)} × ${f(D * 1e3, 4)} × ${f(s / 1000, 3)} = <strong>${sci(M0)} N·m/an</strong> ·
    séismes de magnitude ${fd(M, 1)} (M<sub>0</sub> = ${sci(Mc)} N·m) : <strong>un tous les ${f(Mc / M0, 3)} ans</strong>
    <small>Taux de déformation sur la faille s/(πD) = ${f(s / (Math.PI * D), 3)} mm/an/km = ${f((1000 * s) / (Math.PI * D), 3)} ns/an ; à ± D, la vitesse vaut ± s/4 = ${f(s / 4, 3)} mm/an.</small>`;
});
brancher(["faS", "faD", "faL", "faM"], majFaille);

// ── Du taux de déformation à la loi de Gutenberg-Richter ─────────────────
const majKostrov = garde("koOut", () => {
  const t = { exx: num("koXX"), eyy: num("koYY"), exy: num("koXY") }, A = num("koA"), chi = num("koChi"), mmax = num("koMmax");
  if (![t.exx, t.eyy, t.exy].every(Number.isFinite) || !(A > 0 && chi > 0 && chi <= 1 && mmax > 4.5)) { el("koOut").textContent = "Saisir le tenseur, une surface positive, χ entre 0 et 1, Mmax > 4,5."; el("koFig").innerHTML = ""; return; }
  const P = Geodesie.principales(t), M0 = Geodesie.momentKostrov(t, { A, H: 15 });
  if (!(M0 > 0)) { el("koOut").textContent = "Aucune déformation : pas de moment à libérer."; el("koFig").innerHTML = ""; return; }
  const z = Geodesie.bilanZone({ tenseur: t, A, chi, b: 1, mmin: 4, mmax }), z65 = mmax > 6.6 ? Geodesie.bilanZone({ tenseur: t, A, chi, b: 1, mmin: 4, mmax: mmax - 0.5 }) : null;
  const ms = Array.from({ length: Math.round((mmax - 4) / 0.05) }, (_, i) => 4 + i * 0.05);
  el("koFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 4, xmax: Math.ceil(mmax + 0.2), ymin: 1e-5, ymax: 10 ** Math.ceil(Math.log10(Math.max(z.taux(4), z65 ? z65.taux(4) : 0)) + 0.2), logY: true,
    xlabel: "magnitude M", ylabel: "taux annuel λ(≥ M)",
    series: [
      { points: ms.map((m) => [m, z.taux(m)]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: `équilibrée, Mmax = ${fd(mmax, 1)}` },
      z65 && { points: ms.filter((m) => m < mmax - 0.5).map((m) => [m, z65.taux(m)]), couleur: COULEURS.violet, epaisseur: 1.8, tirets: "6 4", libelle: `même moment, Mmax = ${fd(mmax - 0.5, 1)}` },
    ].filter(Boolean),
  });
  const T6 = z.taux(6) > 0 ? 1 / z.taux(6) : Infinity;
  const c0 = (t.exx + t.eyy) / 2, r0 = Math.hypot((t.exx - t.eyy) / 2, t.exy), emax = Math.max(Math.abs(P.e1h), Math.abs(P.e2h), Math.abs(P.e1h + P.e2h)), bi = 0.5;
  noter("calcKostrovNote", {
    donnees: [["ε̇<sub>xx</sub>, ε̇<sub>yy</sub>, ε̇<sub>xy</sub>", `${fd(t.exx, 1)} ; ${fd(t.eyy, 1)} ; ${fd(t.exy, 1)} ns/an`], ["A", `${f(A, 4)} km²`], ["H", "15 km"], ["μ", "30 GPa"], ["χ", fd(chi, 2)], ["b", "1"], ["magnitudes", `de 4 à ${fd(mmax, 1)}`]],
    etapes: [
      { titre: "Taux de déformation principaux", formule: "c = (ε̇<sub>xx</sub> + ε̇<sub>yy</sub>)/2 ; r = √(((ε̇<sub>xx</sub> − ε̇<sub>yy</sub>)/2)² + ε̇<sub>xy</sub>²) ; ε̇<sub>1</sub> = c − r, ε̇<sub>2</sub> = c + r",
        calcul: `c = ${fd(c0, 2)} ; r = ${fd(r0, 2)} → ε̇<sub>1</sub> = <b>${fd(P.e1h, 2)}</b>, ε̇<sub>2</sub> = <b>${fd(P.e2h, 2)} ns/an</b> ; raccourcissement maximal à l'azimut ${fd(P.azimutRaccourcissement, 0)}°`,
        schema: mohrDeformation({ exx: t.exx, eyy: t.eyy, exy: t.exy, e1: P.e1h, e2: P.e2h, az: P.azimutRaccourcissement }),
        legende: "Le cercle de Mohr passe par les deux points du tenseur ; son centre c et son rayon r donnent les taux principaux, aux bouts du diamètre horizontal. À droite, leurs directions sur la carte." },
      { titre: "Taux de moment géodésique (Kostrov, forme de Savage et Simpson 1997)", formule: "Ṁ<sub>0</sub> = 2μ·H·A·max(|ε̇<sub>1</sub>|, |ε̇<sub>2</sub>|, |ε̇<sub>1</sub> + ε̇<sub>2</sub>|)",
        calcul: `max = ${fd(emax, 2)} ns/an ; Ṁ<sub>0</sub> = 2 × 3·10<sup>10</sup> × 15 000 × ${f(A, 4)}·10<sup>6</sup> × ${fd(emax, 2)}·10<sup>−9</sup> = <b>${sci(M0)} N·m/an</b>` },
      { titre: "Part sismique", formule: "Ṁ<sub>s</sub> = χ·Ṁ<sub>0</sub>", calcul: `Ṁ<sub>s</sub> = ${fd(chi, 2)} × ${sci(M0)} = <b>${sci(z.momentSismique)} N·m/an</b>` },
      { titre: "Valeur a qui libère ce moment (loi tronquée, b = 1)", formule: "Ṁ<sub>s</sub> = (10<sup>a + log b + 9,05</sup>/b<sub>i</sub>)·(10<sup>b<sub>i</sub>·Mmax</sup> − 10<sup>b<sub>i</sub>·4</sup>), b<sub>i</sub> = 1,5 − b",
        calcul: `a = log<sub>10</sub>(${sci(z.momentSismique)} × ${fd(bi, 1)} / (10<sup>${fd(bi * mmax, 2)}</sup> − 10<sup>${fd(bi * 4, 1)}</sup>)) − 9,05 − log<sub>10</sub> 1 = <b>${fd(z.a, 3)}</b>` },
      { titre: "Taux et périodes de retour", formule: "λ(≥ M) = 10<sup>a − b·M</sup> − 10<sup>a − b·Mmax</sup>",
        calcul: `λ(≥ 5) = 10<sup>${fd(z.a - 5, 3)}</sup> − 10<sup>${fd(z.a - mmax, 3)}</sup> = ${f(z.taux(5), 3)} /an, soit tous les <b>${f(1 / z.taux(5), 3)} ans</b> ; λ(≥ 6) = ${f(z.taux(6), 3)} /an, tous les <b>${Number.isFinite(T6) ? f(T6, 3) : "—"} ans</b>` },
    ],
  });
  el("koOut").innerHTML = `ε̇<sub>1</sub> = ${fd(P.e1h, 1)}, ε̇<sub>2</sub> = ${fd(P.e2h, 1)} ns/an (raccourcissement maximal à l'azimut ${fd(P.azimutRaccourcissement, 0)}°) ·
    Ṁ<sub>0</sub> = 2μHA·max(…) = <strong>${sci(M0)} N·m/an</strong> · sismique χ·Ṁ<sub>0</sub> = ${sci(z.momentSismique)} ·
    <strong>a = ${fd(z.a, 2)}</strong> · M ≥ 5 tous les ${f(1 / z.taux(5), 3)} ans · <strong>M ≥ 6 tous les ${Number.isFinite(T6) ? f(T6, 3) : "—"} ans</strong>
    <small>Équivalent : un séisme de magnitude ${fd(Geodesie.magnitude(z.momentSismique), 2)} par an. ${z65 ? `Avec Mmax = ${fd(mmax - 0.5, 1)}, M ≥ 6 tous les ${f(1 / z65.taux(6), 3)} ans.` : ""}</small>`;
});
brancher(["koXX", "koYY", "koXY", "koA", "koChi", "koMmax"], majKostrov);
