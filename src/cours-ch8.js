// Calculateurs du chapitre 8 : loi de Gutenberg-Richter tronquée (taux, périodes de retour, probabilités),
// catalogue simulé (complétude par courbure maximale, valeur b d'Aki-Utsu, déclusterage de Gardner et
// Knopoff), probabilité de Poisson.
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Sismicite from "./sismo/sismicite.js";
import { fenetresGK, poissonCourbe } from "./schemas-notes.js";

// Taux de la loi tronquée à Mmax (forme continue, comme les sources d'aléa) : λ(≥m) = λ4·(10^(−b(m−4)) − 10^(−b(Mmax−4)))/(1 − 10^(−b(Mmax−4))).
const tauxTronque = (l4, b, Mmax) => (m) => (m >= Mmax ? 0 : (l4 * (10 ** (-b * (m - 4)) - 10 ** (-b * (Mmax - 4)))) / (1 - 10 ** (-b * (Mmax - 4))));

// ── Taux annuels et périodes de retour ───────────────────────────────────
const majGR = garde("grOut", () => {
  const l4 = num("grL4"), b = num("grB"), Mmax = num("grMmax"), t = num("grT");
  if (!(l4 > 0 && b > 0 && Mmax > 4.5 && t > 0)) { el("grOut").textContent = "Saisir un taux, une valeur b, une Mmax supérieure à 4,5 et une durée positifs."; el("grFig").innerHTML = el("grTab").innerHTML = ""; return; }
  const lam = tauxTronque(l4, b, Mmax), illimite = (m) => l4 * 10 ** (-b * (m - 4));
  const ms = Array.from({ length: Math.round((Mmax - 4) / 0.05) }, (_, i) => 4 + i * 0.05);
  el("grFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 4, xmax: Math.ceil(Mmax + 0.2), ymin: 1e-4, ymax: 10 ** Math.ceil(Math.log10(l4) + 0.3), logY: true,
    xlabel: "magnitude M", ylabel: "taux annuel λ(≥ M)",
    series: [
      { points: ms.map((m) => [m, illimite(m)]).concat([[Mmax + 0.2, illimite(Mmax + 0.2)]]), couleur: COULEURS.discret, epaisseur: 1.4, tirets: "5 4", libelle: "loi non tronquée" },
      { points: ms.map((m) => [m, lam(m)]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: `tronquée à Mmax = ${fd(Mmax, 1)}` },
    ],
  });
  const lignes = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].filter((m) => m < Mmax);
  el("grTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>M ≥</th><th class="num">λ (/an)</th><th class="num">période de retour</th><th class="num">P en ${f(t, 3)} ans</th></tr></thead><tbody>${
    lignes.map((m) => { const l = lam(m); return `<tr><td>${fd(m, 1)}</td><td class="n">${f(l, 3)}</td><td class="n">${f(1 / l, 3)} ans</td><td class="n">${fd(100 * Sismicite.probabilite(l, t), 1)} %</td></tr>`; }).join("")
  }</tbody></table></div>`;
  const q = 10 ** (-b * (Mmax - 4)), l6 = lam(6);
  noter("calcGRNote", {
    donnees: [["λ(≥ 4)", `${f(l4, 3)} / an`], ["b", f(b, 3)], ["Mmax", fd(Mmax, 1)], ["durée t", `${f(t, 3)} ans`]],
    etapes: [
      { titre: "Paramètre a de la loi", formule: "log<sub>10</sub> λ(≥ M) = a − b·M ⇒ a = log<sub>10</sub> λ(≥ 4) + 4b", calcul: `a = log<sub>10</sub> ${f(l4, 3)} + 4 × ${f(b, 3)} = ${fd(Math.log10(l4), 3)} + ${fd(4 * b, 3)} = <b>${fd(Math.log10(l4) + 4 * b, 3)}</b>` },
      { titre: "Loi non tronquée à M 6", formule: "λ(≥ 6) = λ(≥ 4)·10<sup>−b(6 − 4)</sup>", calcul: `λ = ${f(l4, 3)} × 10<sup>−${fd(2 * b, 2)}</sup> = <b>${f(illimite(6), 3)} / an</b>` },
      Mmax > 6 && { titre: "Loi tronquée à Mmax", formule: "λ(≥ M) = λ(≥ 4)·(10<sup>−b(M − 4)</sup> − 10<sup>−b(Mmax − 4)</sup>) / (1 − 10<sup>−b(Mmax − 4)</sup>)",
        calcul: `10<sup>−b(Mmax − 4)</sup> = ${f(q, 3)} ; λ(≥ 6) = ${f(l4, 3)} × (${f(10 ** (-2 * b), 3)} − ${f(q, 3)}) / (1 − ${f(q, 3)}) = <b>${f(l6, 3)} / an</b>` },
      Mmax > 6 && { titre: "Période de retour et probabilité sur la durée", formule: "T<sub>R</sub> = 1/λ ; P = 1 − e<sup>−λt</sup> (Poisson)", calcul: `T<sub>R</sub> = 1/${f(l6, 3)} = ${f(1 / l6, 3)} ans ; P = 1 − e<sup>−${f(l6, 3)} × ${f(t, 3)}</sup> = <b>${fd(100 * Sismicite.probabilite(l6, t), 1)} %</b>` },
    ],
  });
  el("grOut").innerHTML = `a = log<sub>10</sub> ${f(l4, 3)} + ${f(b, 3)} × 4 = <strong>${fd(Math.log10(l4) + 4 * b, 2)}</strong> · M ≥ 6 : <strong>λ = ${f(lam(6), 3)} / an</strong>, une fois tous les ${f(1 / lam(6), 3)} ans en moyenne
    <small>La troncature n'agit que près de Mmax : à M 6, la loi non tronquée donnerait ${f(illimite(6), 3)} / an.</small>`;
});
brancher(["grL4", "grB", "grMmax", "grT"], majGR);

// ── Un catalogue simulé : complétude et valeur b ─────────────────────────
let cleCat = "", cat = null, garde_ = null;
const majCat = garde("caOut", () => {
  const b = num("caB"), debut = num("caDebut"), decl = el("caDecl").value;
  if (!(b >= 0.5 && b <= 1.5 && debut >= 1900 && debut <= 2020)) { el("caOut").textContent = "b de 0,5 à 1,5 ; année de 1900 à 2020."; el("caFig").innerHTML = ""; return; }
  if (`${b}` !== cleCat) { cat = Sismicite.genererCatalogue({ b, graine: 3 }); garde_ = Sismicite.declusterGK(cat); cleCat = `${b}`; }
  const sel = cat.filter((e, i) => e.t >= debut && (decl === "tous" || garde_[i])), mags = sel.map((e) => e.M), annees = 2025 - debut;
  if (mags.length < 20) { el("caOut").textContent = "Trop peu de séismes sur cette période."; el("caFig").innerHTML = ""; return; }
  const Mc = Sismicite.mcCourbureMax(mags), r = Sismicite.recurrence(mags, Mc, annees);
  // distributions incrémentale et cumulée, taux annuels
  const classes = new Map();
  for (const m of mags) { const k = Math.round(m * 10); classes.set(k, (classes.get(k) || 0) + 1); }
  const ks = [...classes.keys()].sort((p, q) => p - q), inc = ks.map((k) => [k / 10, classes.get(k) / annees]);
  let cumul = 0;
  const cum = [...ks].reverse().map((k) => { cumul += classes.get(k); return [k / 10, cumul / annees]; }).reverse();
  const mmax = ks[ks.length - 1] / 10;
  el("caFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 2, xmax: Math.ceil(mmax + 0.5), ymin: 10 ** Math.floor(Math.log10(1 / annees)), ymax: 10 ** Math.ceil(Math.log10(cum[0][1])), logY: true,
    xlabel: "magnitude M", ylabel: "taux annuel",
    series: [
      { points: cum, couleur: COULEURS.encre, nuage: true, rayon: 3.2, libelle: "λ(≥ M), cumulé" },
      { points: inc, couleur: COULEURS.discret, nuage: true, rayon: 2.6, libelle: "par classe de 0,1" },
      r && { points: [[Mc, r.taux(Mc)], [mmax + 0.3, r.taux(mmax + 0.3)]], couleur: COULEURS.effort, epaisseur: 2.2, libelle: `b = ${fd(r.b, 2)} au-dessus de Mc = ${fd(Mc, 1)}` },
    ].filter(Boolean),
    zones: [{ x0: 2, x1: Mc - 0.05, y0: 10 ** Math.floor(Math.log10(1 / annees)), y1: 10 ** Math.ceil(Math.log10(cum[0][1])), couleur: COULEURS.f62, opacite: 0.08, libelle: "incomplet" }],
  });
  if (!r) { el("caOut").textContent = "Trop peu de séismes au-dessus de la complétude."; noter("calcCatalogueNote", null); return; }
  const sel2 = mags.filter((m) => m >= Mc - 1e-9), moy = sel2.reduce((a1, m) => a1 + m, 0) / sel2.length;
  const kMode = ks.reduce((a1, k1) => (classes.get(k1) > classes.get(a1) ? k1 : a1), ks[0]), Mx = Math.max(...mags), win = Sismicite.fenetreGK(Mx);
  // voisins du plus fort séisme dans le catalogue complet (répliques comprises), pour le schéma des fenêtres
  const e0 = sel.find((e) => e.M === Mx), voisins = cat.filter((e) => e !== e0 && e.t > e0.t).map((e) => ({ dt: (e.t - e0.t) * Sismicite.JOURS_GK, r: Math.hypot(e.x - e0.x, e.y - e0.y), M: e.M }));
  noter("calcCatalogueNote", {
    donnees: [["période", `${Math.round(debut)} à 2025 (${f(annees, 3)} ans)`], ["séismes", `${mags.length}`], ["déclusterage", decl === "tous" ? "non (répliques comprises)" : "Gardner et Knopoff"], ["classes", "0,1 en magnitude"]],
    etapes: [
      decl !== "tous" && { titre: "Fenêtres de Gardner et Knopoff (exemple : le plus fort séisme)", formule: "L = 10<sup>0,1238·M + 0,983</sup> km ; T = 10<sup>0,5409·M − 0,547</sup> jours (M &lt; 6,5)", calcul: `M ${fd(Mx, 1)} : L = <b>${f(win.L, 3)} km</b>, T = <b>${f(win.T, 3)} jours</b> ; les séismes plus petits dans ces fenêtres sont retirés comme répliques`,
        schema: fenetresGK({ M: Mx, L: win.L, T: win.T, evenements: voisins }),
        legende: "Les séismes qui suivent le plus fort, placés selon leur distance à son épicentre et le temps écoulé : ceux de la fenêtre L × T sont ses répliques. On recommence avec le séisme suivant par magnitude décroissante." },
      { titre: "Magnitude de complétude (courbure maximale)", formule: "Mc = classe la plus peuplée + 0,2", calcul: `classe la plus peuplée : M ${fd(kMode / 10, 1)} (${classes.get(kMode)} séismes) → Mc = <b>${fd(Mc, 1)}</b>` },
      { titre: "Valeur b (Aki 1965, correction d'Utsu)", formule: "b = log<sub>10</sub>e / (M̄ − (Mc − ΔM/2)), ΔM = 0,1", calcul: `${r.N} séismes ≥ Mc, M̄ = ${fd(moy, 3)} ; b = 0,4343 / (${fd(moy, 3)} − ${fd(Mc - 0.05, 2)}) = <b>${fd(r.b, 3)}</b>` },
      { titre: "Écart type (Shi et Bolt 1982)", formule: "σ<sub>b</sub> = 2,3·b²·√(Σ(M − M̄)² / (N(N − 1)))", calcul: `σ<sub>b</sub> = <b>${fd(r.sigma, 3)}</b>` },
      { titre: "Taux annuels", formule: "λ(≥ Mc) = N / années ; a = log<sub>10</sub> λ(≥ Mc) + b·Mc ; λ(≥ 4) = λ(≥ Mc)·10<sup>−b(4 − Mc)</sup>", calcul: `λ(≥ ${fd(Mc, 1)}) = ${r.N} / ${f(annees, 3)} = ${f(r.lamMc, 3)} / an ; a = <b>${fd(r.a, 2)}</b> ; λ(≥ 4) = <b>${f(r.taux(4), 3)} / an</b>` },
    ],
  });
  el("caOut").innerHTML = `${mags.length} séismes depuis ${Math.round(debut)} · Mc (courbure maximale + 0,2) = <strong>${fd(Mc, 1)}</strong> ·
    <strong>b = ${fd(r.b, 2)} ± ${fd(r.sigma, 2)}</strong> (N = ${r.N}, vraie ${fd(b, 2)}) · a = ${fd(r.a, 2)} · λ(≥ 4) = ${f(r.taux(4), 3)} / an
    <small>${decl === "tous" ? "Répliques comprises : le taux des petits séismes est gonflé, et Poisson ne s'applique pas." : "Chocs principaux : le catalogue convient au calcul de l'aléa."} ${debut < 1960 ? "Sur une période longue, Mc est celle des années anciennes : on perd les petits séismes récents ; d'où l'estimateur de Weichert." : ""}</small>`;
});
brancher(["caB", "caDebut", "caDecl"], majCat);

// ── Probabilité de Poisson ───────────────────────────────────────────────
const majPoisson = garde("poOut", () => {
  const TR = num("poTR"), t = num("poT");
  if (!(TR > 0 && t > 0)) { el("poOut").textContent = "Saisir une période de retour et une durée positives."; return; }
  const P = Sismicite.probabilite(1 / TR, t);
  const lt = t / TR;
  noter("calcPoissonNote", {
    donnees: [["T<sub>R</sub>", `${f(TR, 4)} ans`], ["t", `${f(t, 3)} ans`]],
    etapes: [
      { titre: "Taux annuel", formule: "λ = 1 / T<sub>R</sub>", calcul: `λ = 1/${f(TR, 4)} = <b>${f(1 / TR, 4)} / an</b>` },
      { titre: "Nombre moyen d'événements sur la durée", formule: "λ·t", calcul: `${f(1 / TR, 4)} × ${f(t, 3)} = <b>${f(lt, 4)}</b>` },
      { titre: "Probabilité d'au moins un événement (Poisson)", formule: "P = 1 − e<sup>−λt</sup>", calcul: `P = 1 − e<sup>−${f(lt, 4)}</sup> = 1 − ${f(Math.exp(-lt), 4)} = <b>${fd(100 * P, 2)} %</b>`,
        schema: poissonCourbe({ lt, P }),
        legende: "Pour une durée courte devant la période de retour, P ≈ λt ; la probabilité sature ensuite : sur une durée égale à T<sub>R</sub> (λt = 1), elle ne vaut que 63 %." },
      { titre: "Au moins deux événements", formule: "P<sub>≥2</sub> = 1 − e<sup>−λt</sup>·(1 + λt)", calcul: `P<sub>≥2</sub> = 1 − ${f(Math.exp(-lt), 4)} × ${f(1 + lt, 4)} = <b>${fd(100 * (1 - Math.exp(-lt) * (1 + lt)), 2)} %</b>` },
      { titre: "Relation inverse", formule: "T<sub>R</sub> = −t / ln(1 − P)", calcul: `T<sub>R</sub> = −${f(t, 3)} / ln(1 − ${f(P, 4)}) = <b>${f(Sismicite.periodeRetour(P, t), 4)} ans</b>`, note: "10 % en 50 ans ↔ 475 ans ; 2 % en 50 ans ↔ 2 475 ans." },
    ],
  });
  el("poOut").innerHTML = `λ = 1/${f(TR, 4)} = ${f(1 / TR, 3)} / an → <strong>P = 1 − e<sup>−λt</sup> = ${fd(100 * P, 1)} %</strong> en ${f(t, 3)} ans
    <small>Inversement : ${fd(100 * P, 1)} % en ${f(t, 3)} ans ↔ T<sub>R</sub> = −t / ln(1 − P) = ${f(Sismicite.periodeRetour(P, t), 4)} ans. Probabilité d'au moins deux événements : ${fd(100 * (1 - Math.exp(-t / TR) * (1 + t / TR)), 1)} %.</small>`;
});
brancher(["poTR", "poT"], majPoisson);
