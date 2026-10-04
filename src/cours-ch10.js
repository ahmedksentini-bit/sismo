// Calculateurs du chapitre 10 : loi d'atténuation (médiane, dispersion, probabilité de dépassement) ;
// aléa d'un site par le moteur du banc « aléa » (Psha.modeleSimple) : courbe d'aléa, UHS face au spectre de
// l'EN 1998-1:2004, désagrégation.
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
import { svg, texte, graphe, echantillon, COULEURS } from "./figures.js";
import Gmpe from "./sismo/gmpe.js";
import Psha from "./sismo/psha.js";
import Spectre from "./sismo/spectre.js";

// ── Médiane, dispersion et probabilité de dépassement ────────────────────
const majGMPE = garde("gmOut", () => {
  const M = num("gmM"), R = num("gmR"), id = el("gmLoi").value, y = num("gmY"), loi = Gmpe.LOIS[id];
  if (!(M >= 3.5 && M <= 8 && R >= 0 && R <= 300 && y > 0)) { el("gmOut").textContent = "Mw de 3,5 à 8, distance de 0 à 300 km, seuil positif."; el("gmFig").innerHTML = ""; return; }
  const calc = (r) => loi.calculer({ M, Rjb: r, vs30: 800, rake: 0 }, "PGA");
  const pts = (k) => echantillon((lr) => { const r = 10 ** lr, c = calc(r); return [r, Math.exp(c.ln + k * c.sigma)]; }, 0, Math.log10(300), 90).map(([, p]) => p);
  const c = calc(R), z = (Math.log(y) - c.ln) / c.sigma, P = Psha.survie(z, 3);
  el("gmFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 1, xmax: 300, ymin: 0.001, ymax: 3, logX: true, logY: true,
    xlabel: "distance Rjb (km)", ylabel: "PGA (g)",
    series: [
      { points: pts(1), couleur: COULEURS.discret, epaisseur: 1.4, tirets: "5 4", libelle: "médiane × e^(±σ) (16 % et 84 %)" },
      { points: pts(-1), couleur: COULEURS.discret, epaisseur: 1.4, tirets: "5 4" },
      { points: pts(0), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: `médiane, ${loi.nom}` },
      { points: [[1, y], [300, y]], couleur: COULEURS.effort, epaisseur: 1.2, tirets: "2 3", libelle: `seuil ${f(y, 3)} g` },
    ],
    marques: [{ x: R, y: Math.exp(c.ln), couleur: COULEURS.bleu, libelle: `${f(Math.exp(c.ln), 3)} g` }],
  });
  const Phi = Psha.Phi;
  noter("calcGMPENote", {
    donnees: [["loi", loi.nom], ["Mw", fd(M, 1)], ["R<sub>jb</sub>", `${fd(R, 0)} km`], ["V<sub>s30</sub>", "800 m/s"], ["seuil y", `${f(y, 3)} g`]],
    etapes: [
      { titre: "Médiane de la loi", formule: "ln PGA<sub>méd</sub> = f(Mw, R<sub>jb</sub>, V<sub>s30</sub>) (coefficients publiés)", calcul: `ln PGA<sub>méd</sub> = ${fd(c.ln, 3)} → PGA<sub>méd</sub> = <b>${f(Math.exp(c.ln), 3)} g</b>` },
      { titre: "Dispersion totale", formule: "σ = √(τ² + φ²)", calcul: `σ = √(${fd(c.tau, 3)}² + ${fd(c.phi, 3)}²) = <b>${fd(c.sigma, 3)}</b>` },
      { titre: "Écart réduit du seuil", formule: "ε = (ln y − ln PGA<sub>méd</sub>) / σ", calcul: `ε = (${fd(Math.log(y), 3)} − ${fd(c.ln, 3)}) / ${fd(c.sigma, 3)} = <b>${fd(z, 3)}</b>` },
      { titre: "Probabilité de dépassement (loi normale tronquée à ± 3σ)", formule: "P = (Φ(3) − Φ(ε)) / (Φ(3) − Φ(−3))",
        calcul: z >= 3 ? "ε ≥ 3 : P = 0" : z <= -3 ? "ε ≤ −3 : P = 1" : `Φ(ε) = ${fd(Phi(z), 4)} ; P = (${fd(Phi(3), 5)} − ${fd(Phi(z), 4)}) / ${fd(Phi(3) - Phi(-3), 5)} = <b>${fd(100 * P, 2)} %</b>` },
      { titre: "Fractile à 84 %", formule: "PGA<sub>84</sub> = PGA<sub>méd</sub>·e<sup>σ</sup>", calcul: `${f(Math.exp(c.ln), 3)} × ${f(Math.exp(c.sigma), 3)} = <b>${f(Math.exp(c.ln + c.sigma), 3)} g</b>` },
    ],
  });
  el("gmOut").innerHTML = `Médiane <strong>${f(Math.exp(c.ln), 3)} g</strong>, σ = ${fd(c.sigma, 2)} (τ = ${fd(c.tau, 2)} entre séismes, φ = ${fd(c.phi, 2)} d'un site à l'autre) ·
    ε = (ln ${f(y, 3)} − ln ${f(Math.exp(c.ln), 3)})/σ = ${fd(z, 2)} → <strong>P(PGA &gt; ${f(y, 3)} g) = ${fd(100 * P, 1)} %</strong>
    <small>Loi normale tronquée à ± 3σ. À 84 %, la médiane est multipliée par e<sup>σ</sup> = ${f(Math.exp(c.sigma), 3)}.</small>`;
});
brancher(["gmM", "gmR", "gmLoi", "gmY"], majGMPE);

// ── Aléa d'un site au centre d'une zone source ───────────────────────────
const IMTS = ["PGA", 0.1, 0.2, 0.3, 0.5, 1, 2, 3];
let cle = "", res = null, modele = null, desag = null;
function grilleDesag(d) {
  const L = 560, H = 230, g = { gauche: 52, droite: 14, haut: 12, bas: 40 }, W = L - g.gauche - g.droite, Hh = H - g.haut - g.bas;
  const m0 = 4, m1 = 7.5, r0 = 0, r1 = 200, X = (r) => g.gauche + ((r - r0) / (r1 - r0)) * W, Y = (m) => g.haut + Hh - ((m - m0) / (m1 - m0)) * Hh;
  const max = Math.max(...d.cases.map((c) => c.part));
  return svg({ largeur: L, hauteur: H, titre: "Désagrégation magnitude–distance", contenu: () => {
    let s = "";
    for (const c of d.cases) {
      if (c.r0 >= r1 || c.m0 >= m1) continue;
      s += `<rect x="${X(c.r0).toFixed(1)}" y="${Y(Math.min(c.m1, m1)).toFixed(1)}" width="${(X(Math.min(c.r1, r1)) - X(c.r0) - 1).toFixed(1)}" height="${(Y(c.m0) - Y(Math.min(c.m1, m1)) - 1).toFixed(1)}" fill="${COULEURS.bleu}" opacity="${(0.08 + 0.92 * (c.part / max)).toFixed(2)}"/>`;
      if (c.part > 0.04) s += texte((X(c.r0) + X(Math.min(c.r1, r1))) / 2, (Y(c.m0) + Y(Math.min(c.m1, m1))) / 2 + 4, `${Math.round(100 * c.part)} %`, `text-anchor="middle" style="font-size:10px;font-weight:700;fill:${c.part / max > 0.55 ? "#fff" : COULEURS.encre}"`);
    }
    for (let r = 0; r <= r1; r += 40) s += texte(X(r), H - g.bas + 15, `${r}`, 'text-anchor="middle" class="pt"');
    for (let m = 4; m <= 7.5; m += 0.5) s += texte(g.gauche - 6, Y(m) + 4, fd(m, 1), 'text-anchor="end" class="pt"');
    s += texte(g.gauche + W / 2, H - 6, "distance Rjb (km)", 'text-anchor="middle" style="font-weight:700"');
    s += `<text transform="translate(14 ${g.haut + Hh / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700">magnitude</text>`;
    s += `<rect x="${g.gauche}" y="${g.haut}" width="${W}" height="${Hh}" fill="none" stroke="${COULEURS.trait}"/>`;
    return s;
  } });
}
const majPSHA = garde("psOut", () => {
  const taux4 = num("psL4"), b = num("psB"), mmax = num("psMmax"), rayon = num("psRayon"), distance = num("psDist");
  if (!(taux4 > 0 && b > 0.3 && mmax > 4.6 && mmax <= 8 && rayon >= 5 && distance >= 0 && distance <= 280)) {
    el("psOut").textContent = "Taux et b positifs, Mmax de 4,6 à 8, rayon d'au moins 5 km, distance de 0 à 280 km."; el("psFigC").innerHTML = el("psFigU").innerHTML = ""; return;
  }
  const c = `${taux4}|${b}|${mmax}|${rayon}|${distance}`;
  if (c !== cle) {
    modele = Psha.modeleSimple({ taux4, b, mmax, rayon, distance, imts: IMTS, pasGrille: rayon > 60 ? 10 : 5 });
    res = Psha.calculer(modele); cle = c; desag = null;
  }
  const N = res.niveaux, pga = res.moyenne[0], a475 = Psha.niveauPourProba(N, pga, 0.1), a2475 = Psha.niveauPourProba(N, pga, 0.02);
  if (!(a475 > 0)) { el("psOut").textContent = "Aléa trop faible : la probabilité de 10 % en 50 ans n'est pas atteinte au premier niveau (0,001 g)."; el("psFigC").innerHTML = el("psFigU").innerHTML = ""; return; }
  if (!desag) desag = Psha.desagregation(modele, "PGA", a475);
  const lam = (p) => -Math.log(1 - p) / 50;
  el("psFigC").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0.001, xmax: 3, ymin: 1e-5, ymax: 1, logX: true, logY: true,
    xlabel: "PGA (g)", ylabel: "taux annuel de dépassement",
    series: [
      ...res.realisations.map((r, i) => ({ points: N.map((x, l) => [x, lam(r.poe[0][l])]), couleur: "#94a3b8", epaisseur: 1.2, tirets: "4 3", libelle: i === 0 ? "chaque loi (réalisation)" : undefined })),
      { points: N.map((x, l) => [x, lam(pga[l])]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: "moyenne de l'arbre" },
    ],
    marques: [{ x: a475, y: 1 / 475, couleur: COULEURS.effort, guides: true, libelle: `475 ans : ${f(a475, 3)} g` }, { x: a2475, y: 1 / 2475, couleur: COULEURS.violet, guides: true, libelle: `2 475 ans : ${f(a2475, 3)} g` }],
  });
  const uhs = IMTS.map((imt, k) => [imt === "PGA" ? 0 : imt, Psha.niveauPourProba(N, res.moyenne[k], 0.1)]);
  const type = desag.mMoy <= 5.5 ? 2 : 1, Tg = Array.from({ length: 301 }, (_, i) => i * 0.01);
  el("psFigU").innerHTML = graphe({
    largeur: 560, hauteur: 280, xmin: 0, xmax: 3, ymin: 0, ymax: Math.ceil(Math.max(...uhs.map((u) => u[1]), 2.5 * a475) * 11) / 10,
    xlabel: "période T (s)", ylabel: "Sa à 475 ans (g)",
    series: [
      { points: Tg.map((t) => [t, Spectre.ec8(t, { type, sol: "A", ag: a475 })]), couleur: COULEURS.reaction, epaisseur: 1.8, tirets: "6 4", libelle: `EC8 sol A, type ${type}, ag = PGA 475 ans` },
      { points: uhs, couleur: COULEURS.bleu, epaisseur: 2.6, marqueurs: true, libelle: "UHS à 475 ans" },
    ],
  }) + grilleDesag(desag);
  // note : récurrence, discrétisation, un terme de la somme, lecture de la courbe
  const zone = modele.zones[0], aGR = Math.log10(taux4) + 4 * b, mfd = Psha.mfdGR({ a: aGR, b, mmin: 4, mmax }), pts = Psha.discretiser(zone.polygone, modele.pasGrille);
  // terme d'exemple : la classe et le point les plus proches du scénario moyen de la désagrégation
  const lamTot = mfd.reduce((s0, x) => s0 + x.taux, 0), cl = mfd.reduce((q, x) => (Math.abs(x.M - desag.mMoy) < Math.abs(q.M - desag.mMoy) ? x : q), mfd[0]);
  const dist = (x) => Math.hypot(x.x, x.y), pt = pts.reduce((q, x) => (Math.abs(dist(x) - desag.rMoy) < Math.abs(dist(q) - desag.rMoy) ? x : q), pts[0]), Rex = dist(pt);
  const sci = (x) => { const e = Math.floor(Math.log10(x)); return `${f(x / 10 ** e, 3)}·10<sup>${String(e).replace("-", "−")}</sup>`; };
  const lois3 = ["akkar2014", "bindi2014", "boore2014"].map((id) => { const q = Gmpe.LOIS[id].calculer({ M: cl.M, Rjb: Rex, vs30: 800, rake: 0 }, "PGA"); return Psha.survie((Math.log(a475) - q.ln) / q.sigma, 3); });
  const pMoy = lois3.reduce((s0, x) => s0 + x, 0) / 3, lam475 = -Math.log(0.9) / 50;
  noter("calcPSHANote", {
    donnees: [["λ(≥ 4)", `${f(taux4, 3)} / an`], ["b", f(b, 3)], ["Mmax", fd(mmax, 1)], ["zone", `cercle de ${f(rayon, 3)} km, à ${f(distance, 3)} km du site`], ["lois", "Akkar, Bindi, Boore (2014), poids 1/3"], ["V<sub>s30</sub>", "800 m/s"]],
    etapes: [
      { titre: "Récurrence par classes de 0,1 (Gutenberg-Richter tronquée)", formule: "a = log<sub>10</sub> λ(≥ 4) + 4b ; λ<sub>i</sub> = 10<sup>a − b(M<sub>i</sub> − 0,05)</sup> − 10<sup>a − b(M<sub>i</sub> + 0,05)</sup>",
        calcul: `a = ${fd(aGR, 3)} ; ${mfd.length} classes de M ${fd(mfd[0].M, 2)} à ${fd(mfd[mfd.length - 1].M, 2)} ; première : ${f(mfd[0].taux, 3)} /an ; total <b>${f(lamTot, 4)} /an</b>` },
      { titre: "Répartition dans la zone", formule: `grille de ${modele.pasGrille} km : N points ; chaque point reçoit λ<sub>i</sub>/N`, calcul: `N = <b>${pts.length}</b> points` },
      { titre: `Un terme de la somme : classe M ${fd(cl.M, 2)}, point de la grille à ${fd(Rex, 1)} km du site`, formule: "λ<sub>i</sub>/N × P(PGA &gt; y | M, R), P moyennée sur les trois lois (arbre logique)",
        calcul: `pour y = ${f(a475, 3)} g : P = (${lois3.map((x) => fd(x, 4)).join(" + ")}) / 3 = ${fd(pMoy, 4)} ; terme = ${f(cl.taux, 3)} / ${pts.length} × ${fd(pMoy, 4)} = <b>${sci((cl.taux / pts.length) * pMoy)} /an</b>`,
        note: "Choisi près du scénario moyen de la désagrégation ; la courbe somme tous les points et toutes les classes." },
      { titre: "Courbe d'aléa et lecture à 10 % en 50 ans", formule: "λ(y) = Σ des termes ; P<sub>50</sub> = 1 − e<sup>−50·λ(y)</sup> ; 10 % ↔ λ = −ln(0,9)/50", calcul: `λ = ${f(lam475, 4)} /an (1/475) → interpolation log-log entre niveaux : <b>PGA = ${f(a475, 3)} g</b> ; à 2 % en 50 ans : <b>${f(a2475, 3)} g</b>` },
      { titre: "Désagrégation", formule: "part de chaque case (M, R) dans λ(PGA &gt; a<sub>475</sub>) ; M̄ = Σ part·M, R̄ = Σ part·R", calcul: `M̄ = <b>${fd(desag.mMoy, 2)}</b>, R̄ = <b>${fd(desag.rMoy, 1)} km</b>` },
    ],
  });
  el("psOut").innerHTML = `<strong>PGA à 475 ans : ${f(a475, 3)} g</strong> · à 2 475 ans : ${f(a2475, 3)} g · Sa(0,2 s) = ${f(uhs[2][1], 3)} g, Sa(1 s) = ${f(uhs[5][1], 3)} g à 475 ans ·
    désagrégation : <strong>M̄ = ${fd(desag.mMoy, 1)}, R̄ = ${fd(desag.rMoy, 0)} km</strong>
    <small>Le rapport 2 475 / 475 ans vaut ${f(a2475 / a475, 3)} pour le PGA. Type de spectre suggéré par M̄ : ${type}.</small>`;
});
brancher(["psL4", "psB", "psMmax", "psRayon", "psDist"], majPSHA);
