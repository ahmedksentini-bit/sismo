// Calculateurs du chapitre 6 : couches du globe et phases à travers lui (Globe, vérifié contre TauP), zone de
// subduction, profondeur d'un séisme lointain par pP et sP ; hodochrones
// Pg et Pn d'une croûte sur manteau (temps vrais ou réduits), inversion d'un profil de premières arrivées (vitesses,
// intercept, épaisseur), sismique réfraction de site.
import { el, num, f, fd, brancher, garde, lireTableau, esc, noter, noteCalcul } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Sismo from "./sismo/signal.js";
import Refraction from "./sismo/refraction.js";
import Globe from "./sismo/globe.js";
import Tables from "./sismo/tables.js";
import { globe, eventail, raisVers, foyer, subduction, COULEURS_PHASES } from "./globe-figure.js";
import { raisCroute, pPgeometrie } from "./schemas-notes.js";

// Moindres carrés t = ti + Δ/V sur des points [Δ, t].
function droiteMC(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  if (sxx < 1e-9 || sxy <= 0) return null;
  const pente = sxy / sxx;
  return { V: 1 / pente, ti: my - pente * mx };
}

// ── Hodochrones d'une croûte sur manteau ─────────────────────────────────
const majHodo = garde("hoOut", () => {
  const V1 = num("hoV1"), V2 = num("hoV2"), H = num("hoH"), h = num("hoh"), red = Number(el("hoRed").value) || 0;
  if (!(V1 > 0 && V2 > V1 && H > 0 && h >= 0 && h < H)) { el("hoOut").textContent = "Il faut V₂ > V₁ et un foyer dans la croûte (h < H)."; el("hoFig").innerHTML = ""; return; }
  const ic = Math.asin(V1 / V2), ti = Refraction.intercept(V1, V2, H, h), dcrit = (2 * H - h) * Math.tan(ic), xc = Refraction.croisement(V1, V2, ti, h);
  const R = (d, t) => t - (red ? d / red : 0), dmax = 300;
  const pg = echantillon((d) => [d, R(d, Math.hypot(d, h) / V1)], 0, dmax, 150).map(([, p]) => p);
  const pn = echantillon((d) => [d, R(d, d / V2 + ti)], dcrit, dmax, 100).map(([, p]) => p);
  const prem = echantillon((d) => [d, R(d, Math.min(Math.hypot(d, h) / V1, d >= dcrit ? d / V2 + ti : Infinity))], 0, dmax, 300).map(([, p]) => p);
  const tous = [...pg, ...pn].map((p) => p[1]);
  el("hoFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0, xmax: dmax, ymin: Math.floor(Math.min(0, ...tous)), ymax: Math.ceil(Math.max(...tous) * 1.05),
    xlabel: "distance épicentrale Δ (km)", ylabel: red ? `t − Δ/${red} (s)` : "temps depuis l'origine (s)",
    series: [
      { points: prem, couleur: "#fde68a", epaisseur: 9, libelle: "première arrivée" },
      { points: pg, couleur: COULEURS.bleu, epaisseur: 2.4, libelle: `Pg (${fd(V1, 1)} km/s)` },
      { points: pn, couleur: COULEURS.effort, epaisseur: 2.4, libelle: `Pn (${fd(V2, 1)} km/s)` },
    ],
    marques: xc ? [{ x: xc, y: R(xc, Math.hypot(xc, h) / V1), couleur: COULEURS.encre, libelle: `croisement ${fd(xc, 0)} km` }] : [],
  });
  const d100 = Math.max(xc ? Math.round(xc * 1.5) : 200, 50);
  noter("calcHodoNote", {
    donnees: [["V<sub>1</sub>", `${fd(V1, 2)} km/s`], ["V<sub>2</sub>", `${fd(V2, 2)} km/s`], ["H", `${fd(H, 1)} km`], ["h", `${fd(h, 1)} km`]],
    etapes: [
      { titre: "Angle critique", formule: "sin i<sub>c</sub> = V<sub>1</sub>/V<sub>2</sub>", calcul: `sin i<sub>c</sub> = ${fd(V1, 2)}/${fd(V2, 2)} = ${fd(V1 / V2, 4)} → i<sub>c</sub> = <b>${fd((ic * 180) / Math.PI, 2)}°</b> ; cos i<sub>c</sub> = ${fd(Math.cos(ic), 4)}` },
      { titre: "Temps d'intercept de Pn", formule: "t<sub>i</sub> = (2H − h)·cos i<sub>c</sub> / V<sub>1</sub>", calcul: `t<sub>i</sub> = (${fd(2 * H, 1)} − ${fd(h, 1)}) × ${fd(Math.cos(ic), 4)} / ${fd(V1, 2)} = <b>${fd(ti, 2)} s</b>` },
      { titre: "Distance critique : Pn apparaît", formule: "x<sub>crit</sub> = (2H − h)·tan i<sub>c</sub>", calcul: `x<sub>crit</sub> = ${fd(2 * H - h, 1)} × ${fd(Math.tan(ic), 4)} = <b>${fd(dcrit, 1)} km</b>` },
      { titre: "Distance de croisement : Pg et Pn arrivent ensemble", formule: "√(x² + h²)/V<sub>1</sub> = x/V<sub>2</sub> + t<sub>i</sub> (résolu par dichotomie ; pour h = 0 : x = t<sub>i</sub>/(1/V<sub>1</sub> − 1/V<sub>2</sub>))",
        calcul: xc ? `x<sub>c</sub> = <b>${fd(xc, 1)} km</b> ; vérification : Pg = √(${fd(xc, 1)}² + ${fd(h, 1)}²)/${fd(V1, 2)} = ${fd(Math.hypot(xc, h) / V1, 2)} s, Pn = ${fd(xc, 1)}/${fd(V2, 2)} + ${fd(ti, 2)} = ${fd(xc / V2 + ti, 2)} s` : "pas de croisement avant 2 000 km",
        schema: raisCroute({ V1, V2, H, h, delta: xc || 1.3 * dcrit, xc }),
        legende: xc ? "Station placée à la distance de croisement : les deux rais y arrivent en même temps. Plus loin, Pn arrive le premier : son trajet est plus long, mais il en fait une grande part à la vitesse du manteau." : "Pn existe au-delà de la distance critique, mais n'y devance pas Pg." },
      { titre: `Exemple à Δ = ${d100} km`, formule: "t<sub>Pg</sub> = √(Δ² + h²)/V<sub>1</sub> ; t<sub>Pn</sub> = Δ/V<sub>2</sub> + t<sub>i</sub>",
        calcul: `t<sub>Pg</sub> = ${fd(Math.hypot(d100, h) / V1, 2)} s ; t<sub>Pn</sub> = ${fd(d100 / V2, 2)} + ${fd(ti, 2)} = ${fd(d100 / V2 + ti, 2)} s → première : <b>${Math.hypot(d100, h) / V1 <= d100 / V2 + ti ? "Pg" : "Pn"}</b>` },
    ],
  });
  el("hoOut").innerHTML = `sin i<sub>c</sub> = ${fd(V1 / V2, 3)}, i<sub>c</sub> = ${fd((ic * 180) / Math.PI, 1)}° · <strong>t<sub>i</sub> = (2H − h)·cos i<sub>c</sub>/V<sub>1</sub> = ${fd(ti, 2)} s</strong> ·
    Pn dès ${fd(dcrit, 0)} km · <strong>croisement à ${xc ? fd(xc, 0) : "—"} km</strong>
    <small>${red ? `En temps réduits, une onde de vitesse ${red} km/s devient horizontale. ` : ""}Au-delà du croisement, la première onde P a voyagé dans le manteau.</small>`;
});
brancher(["hoV1", "hoV2", "hoH", "hoh", "hoRed"], majHodo);

// ── Vitesses et épaisseur de la croûte par un profil ─────────────────────
{
  const zone = el("prPts");
  if (zone && !zone.value.trim()) zone.value = Array.from({ length: 12 }, (_, i) => 15 + 30 * i).map((d) => `${d} ${Sismo.temps(d, 10).tP.toFixed(1)}`).join("\n");
}
const majProfil = garde("prResultat", () => {
  const pts = lireTableau(el("prPts").value).filter((r) => r.length >= 2 && r.every(Number.isFinite)).map(([d, t]) => [d, t]);
  const coupe = num("prCoupe"), h = Math.max(0, num("prh", 0));
  const avant = pts.filter((p) => p[0] < coupe), apres = pts.filter((p) => p[0] >= coupe);
  const g = droiteMC(avant), n = droiteMC(apres);
  const dmax = Math.max(300, ...pts.map((p) => p[0])), tmax = Math.max(10, ...pts.map((p) => p[1]));
  const serie = (d, couleur, nom) => d && { points: [[0, d.ti], [dmax, d.ti + dmax / d.V]], couleur, epaisseur: 2, libelle: `${nom} : V = ${fd(d.V, 2)} km/s, tᵢ = ${fd(d.ti, 2)} s` };
  el("prFigure").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0, xmax: dmax, ymin: 0, ymax: Math.ceil(tmax * 1.1),
    xlabel: "distance épicentrale Δ (km)", ylabel: "premières arrivées P (s)",
    series: [serie(g, COULEURS.bleu, "Pg"), serie(n, COULEURS.effort, "Pn"),
      { points: avant, couleur: COULEURS.bleu, nuage: true, rayon: 4.5 }, { points: apres, couleur: COULEURS.effort, nuage: true, rayon: 4.5 }].filter(Boolean),
    zones: [{ x0: coupe, x1: dmax, y0: 0, y1: Math.ceil(tmax * 1.1), couleur: COULEURS.effort, opacite: 0.05 }],
  });
  if (!g || !n) { el("prResultat").textContent = "Il faut au moins deux points de part et d'autre de la coupure, alignés sur des pentes positives."; noter("calcProfilNote", null); return; }
  const H = Refraction.epaisseur(g.V, n.V, n.ti, h), cosc = n.V > g.V ? Math.sqrt(1 - (g.V / n.V) ** 2) : NaN;
  const moy = (q) => [q.reduce((a1, p) => a1 + p[0], 0) / q.length, q.reduce((a1, p) => a1 + p[1], 0) / q.length];
  const [mxg, myg] = moy(avant), [mxn, myn] = moy(apres);
  noter("calcProfilNote", {
    donnees: [["points avant la coupure", `${avant.length} (Pg)`], ["points après", `${apres.length} (Pn)`], ["coupure", `${fd(coupe, 0)} km`], ["h", `${fd(h, 1)} km`]],
    etapes: [
      { titre: "Droite des premiers points (Pg)", formule: "t = t<sub>i</sub> + Δ/V : pente = Σ(Δ − Δ̄)(t − t̄) / Σ(Δ − Δ̄)² ; V = 1/pente ; t<sub>i</sub> = t̄ − Δ̄/V",
        calcul: `Δ̄ = ${fd(mxg, 1)} km, t̄ = ${fd(myg, 2)} s → pente = ${fd(1 / g.V, 4)} s/km, V<sub>1</sub> = <b>${fd(g.V, 2)} km/s</b>, ordonnée ${fd(g.ti, 2)} s` },
      { titre: "Droite des derniers points (Pn)", calcul: `Δ̄ = ${fd(mxn, 1)} km, t̄ = ${fd(myn, 2)} s → pente = ${fd(1 / n.V, 4)} s/km, V<sub>2</sub> = <b>${fd(n.V, 2)} km/s</b>, t<sub>i</sub> = ${fd(myn, 2)} − ${fd(mxn, 1)}/${fd(n.V, 2)} = <b>${fd(n.ti, 2)} s</b>` },
      { titre: "Angle critique", formule: "cos i<sub>c</sub> = √(1 − (V<sub>1</sub>/V<sub>2</sub>)²)", calcul: `cos i<sub>c</sub> = √(1 − (${fd(g.V, 2)}/${fd(n.V, 2)})²) = <b>${fd(cosc, 4)}</b>` },
      { titre: "Épaisseur de la croûte", formule: "t<sub>i</sub> = (2H − h)·cos i<sub>c</sub>/V<sub>1</sub> ⇒ H = (t<sub>i</sub>·V<sub>1</sub>/cos i<sub>c</sub> + h)/2",
        calcul: H ? `H = (${fd(n.ti, 2)} × ${fd(g.V, 2)} / ${fd(cosc, 4)} + ${fd(h, 1)}) / 2 = <b>${fd(H, 1)} km</b>` : "V<sub>2</sub> doit dépasser V<sub>1</sub>",
        schema: H ? raisCroute({ V1: g.V, V2: n.V, H, h, delta: Math.max(coupe, 1.2 * (2 * H - h) * Math.tan(Math.asin(g.V / n.V))) }) : null,
        legende: H ? "La croûte retrouvée, avec les vitesses et l'épaisseur déduites des deux droites. Le temps d'intercept tᵢ est le temps « perdu » par Pn à descendre et remonter la croûte à l'angle critique." : null },
    ],
  });
  el("prResultat").innerHTML = `V<sub>1</sub> = ${fd(g.V, 2)} km/s · V<sub>2</sub> = ${fd(n.V, 2)} km/s · t<sub>i</sub> = ${fd(n.ti, 2)} s →
    <strong>H = (t<sub>i</sub>V<sub>1</sub>/cos i<sub>c</sub> + h)/2 = ${H ? fd(H, 1) : "—"} km</strong>
    <small>${H ? `cos i<sub>c</sub> = ${fd(Math.sqrt(1 - (g.V / n.V) ** 2), 3)}. ` : "V₂ doit dépasser V₁. "}Modèle du cours : 6,0 et 8,0 km/s, 32 km. Près du foyer, Pg n'est pas encore une droite (√(Δ² + h²)) : la droite des premiers points est trop plate, V<sub>1</sub> sort un peu fort, et H avec lui.</small>`;
});
brancher(["prPts", "prCoupe", "prh"], majProfil);

// ── Sismique réfraction de site ──────────────────────────────────────────
const majRefra = garde("rfOut", () => {
  const V1 = num("rfV1") / 1000, V2 = num("rfV2") / 1000, H = num("rfH"); // m/ms
  if (!(V1 > 0 && V2 > V1 && H > 0)) { el("rfOut").textContent = "Il faut un substratum plus rapide que la couche superficielle."; el("rfFig").innerHTML = ""; return; }
  const ti = Refraction.intercept(V1, V2, H, 0), xc = Refraction.croisement(V1, V2, ti, 0), dc = 2 * H * Math.tan(Math.asin(V1 / V2));
  const L = Math.max(60, Math.ceil((xc * 2.5) / 10) * 10);
  const geophones = Array.from({ length: 13 }, (_, i) => (L * (i + 1)) / 13).map((x) => [x, Math.min(x / V1, x >= dc ? x / V2 + ti : Infinity)]);
  el("rfFig").innerHTML = graphe({
    largeur: 560, hauteur: 280, xmin: 0, xmax: L, ymin: 0, ymax: Math.ceil((L / V1) * 0.7),
    xlabel: "distance au point de tir (m)", ylabel: "temps (ms)",
    series: [
      { points: [[0, 0], [L, L / V1]], couleur: COULEURS.bleu, epaisseur: 2, libelle: `directe ${f(V1 * 1000, 3)} m/s` },
      { points: [[0, ti], [L, ti + L / V2]], couleur: COULEURS.effort, epaisseur: 2, tirets: "6 4", libelle: `réfractée ${f(V2 * 1000, 3)} m/s` },
      { points: geophones, couleur: COULEURS.encre, nuage: true, rayon: 4, libelle: "premières arrivées aux géophones" },
    ],
    marques: [{ x: 0, y: ti, couleur: COULEURS.effort, libelle: `tᵢ = ${fd(ti, 1)} ms` }],
  });
  const icr = Math.asin(V1 / V2);
  noter("calcRefraNote", {
    donnees: [["V<sub>1</sub>", `${f(V1 * 1000, 4)} m/s`], ["V<sub>2</sub>", `${f(V2 * 1000, 4)} m/s`], ["H", `${f(H, 3)} m`], ["tir", "en surface"]],
    etapes: [
      { titre: "Angle critique", formule: "i<sub>c</sub> = arcsin(V<sub>1</sub>/V<sub>2</sub>)", calcul: `i<sub>c</sub> = arcsin(${f(V1 * 1000, 4)}/${f(V2 * 1000, 4)}) = <b>${fd((icr * 180) / Math.PI, 2)}°</b> ; cos i<sub>c</sub> = ${fd(Math.cos(icr), 4)}` },
      { titre: "Temps d'intercept (V en m/ms)", formule: "t<sub>i</sub> = 2H·cos i<sub>c</sub> / V<sub>1</sub>", calcul: `t<sub>i</sub> = 2 × ${f(H, 3)} × ${fd(Math.cos(icr), 4)} / ${fd(V1, 3)} = <b>${fd(ti, 2)} ms</b>` },
      { titre: "Distance critique", formule: "x<sub>crit</sub> = 2H·tan i<sub>c</sub>", calcul: `x<sub>crit</sub> = 2 × ${f(H, 3)} × ${fd(Math.tan(icr), 4)} = <b>${fd(dc, 2)} m</b>` },
      { titre: "Distance de croisement", formule: "x/V<sub>1</sub> = x/V<sub>2</sub> + t<sub>i</sub> ⇒ x<sub>c</sub> = t<sub>i</sub> / (1/V<sub>1</sub> − 1/V<sub>2</sub>)", calcul: `x<sub>c</sub> = ${fd(ti, 2)} / (1/${fd(V1, 3)} − 1/${fd(V2, 3)}) = <b>${fd(xc, 1)} m</b>`,
        schema: raisCroute({ V1, V2, H, h: 0, delta: xc, xc, unite: "m", uniteT: "ms", noms: ["directe", "réfractée"], vitesses: [`V₁ = ${f(V1 * 1000, 4)} m/s`, `V₂ = ${f(V2 * 1000, 4)} m/s`], interface: "toit du substratum" }),
        legende: "Tir en surface, géophone à la distance de croisement : l'onde directe et l'onde réfractée y arrivent ensemble. Les géophones plus lointains reçoivent d'abord l'onde réfractée, dont la pente donne V₂." },
      { titre: "Lecture inverse sur le terrain", formule: "H = t<sub>i</sub>·V<sub>1</sub> / (2 cos i<sub>c</sub>)", calcul: `H = ${fd(ti, 2)} × ${fd(V1, 3)} / (2 × ${fd(Math.cos(icr), 4)}) = <b>${fd((ti * V1) / (2 * Math.cos(icr)), 2)} m</b>` },
    ],
  });
  el("rfOut").innerHTML = `<strong>t<sub>i</sub> = 2H·cos i<sub>c</sub>/V<sub>1</sub> = ${fd(ti, 1)} ms</strong> · croisement à <strong>${fd(xc, 1)} m</strong>
    <small>Inversement, H = t<sub>i</sub>·V<sub>1</sub>/(2 cos i<sub>c</sub>) = ${fd((ti * V1) / (2 * Math.sqrt(1 - (V1 / V2) ** 2)), 2)} m. La ligne de géophones doit dépasser 2 à 3 fois la distance de croisement pour bien lire la pente du substratum.</small>`;
});
brancher(["rfV1", "rfV2", "rfH"], majRefra);

// ── Le globe en couches et les phases ─────────────────────────────────────

{
  const t = el("tabCouches");
  if (t) {
    const M = Globe.modele, R = Globe.R, { moho, d410, d660, noyau, graine } = Globe.RAYONS;
    const regions = [["croûte", 0, R - moho], ["manteau supérieur", R - moho, R - d410], ["zone de transition", R - d410, R - d660],
      ["manteau inférieur", R - d660, R - noyau], ["noyau externe (liquide)", R - noyau, R - graine], ["graine (solide)", R - graine, R]];
    // vitesses au sommet et à la base de chaque région, du côté intérieur des discontinuités (lignes doublées)
    const sommet = (z) => M.filter((x) => x[0] === z).pop(), base = (z) => M.filter((x) => x[0] === z)[0];
    t.innerHTML = `<thead><tr><th>Couche</th><th class="num">profondeur</th><th class="num">Vp</th><th class="num">Vs</th><th class="num">masse volumique</th></tr></thead><tbody>${
      regions.map(([nom, z1, z2]) => { const a = sommet(z1), b = base(z2); return `<tr><td>${esc(nom)}</td><td class="n">${fd(z1, 0)} à ${fd(z2, 0)} km</td><td class="n">${fd(a[1], 1)} → ${fd(b[1], 1)} km/s</td><td class="n">${fd(a[2], 1)} → ${fd(b[2], 1)} km/s</td><td class="n">${fd(a[3], 1)} → ${fd(b[3], 1)} t/m³</td></tr>`; }).join("")
    }</tbody>`;
  }
}

const PH = Object.keys(Globe.PHASES), mmss = (s) => `${Math.floor(s / 60)} min ${fd(s % 60, 1)} s`;
const majGlobe = garde("glOut", () => {
  const h = Number(el("glH").value), d = num("glD"), vue = el("glVue").value;
  if (!(d > 0 && d <= 180)) { el("glOut").textContent = "Distance de 0 à 180°."; el("glFig").innerHTML = el("glTab").innerHTML = el("glHodo").innerHTML = ""; return; }
  const arr = PH.flatMap((ph) => Globe.arrivees(ph, h, d)).sort((x, y) => x.temps - y.temps);
  const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (i * (b - a)) / (n - 1));
  const rais = vue === "eventail"
    ? [...eventail("P", h, lin(10, 98, 12)), ...eventail("PKP", h, lin(146, 178, 6)), ...eventail("PKIKP", h, lin(116, 140, 3)), ...eventail("S", h, lin(10, 98, 12), { sens: -1 }), ...eventail("SKS", h, lin(70, 170, 6), { sens: -1 })]
    : PH.flatMap((ph) => raisVers(ph, h, d, { epaisseur: 2.2 }));
  const pMax = Math.max(...Globe.branche("P", h).filter(Boolean).map((x) => x.dist)) * 180 / Math.PI, pkp = Math.min(...Globe.branche("PKP", h).filter(Boolean).map((x) => x.dist)) * 180 / Math.PI;
  el("glFig").innerHTML = `<div style="max-width:520px;margin:0 auto">${globe({ rais, h, ombre: [pMax, pkp], stations: vue === "station" ? [{ distance: d, nom: `${fd(d, 0)}°` }] : [], titre: "Rais sismiques à travers le globe" })}</div>`;
  el("glTab").innerHTML = arr.length ? `<div class="table-large"><table class="resultats"><thead><tr><th>Phase</th><th class="num">temps de trajet</th><th class="num">après P</th><th class="num">p (s/°)</th><th class="num">départ</th><th class="num">incidence</th></tr></thead><tbody>${
    arr.map((a) => `<tr><td><strong style="color:${COULEURS_PHASES[a.phase]}">${a.phase}</strong></td><td class="n">${mmss(a.temps)}</td><td class="n">${fd(a.temps - arr[0].temps, 1)} s</td><td class="n">${fd(a.p * Math.PI / 180, 2)}</td><td class="n">${fd(a.depart, 1)}°</td><td class="n">${fd(a.incidence, 1)}°</td></tr>`).join("")
  }</tbody></table></div>` : "";
  el("glHodo").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0, xmax: 180, ymin: 0, ymax: 40, pasX: 30, pasY: 5,
    xlabel: "distance épicentrale Δ (°)", ylabel: "temps de trajet (min)",
    series: [
      ...PH.map((ph) => ({ points: Globe.branche(ph, h).filter(Boolean).map((x) => [x.dist * 180 / Math.PI, x.temps / 60]).filter((q) => q[0] <= 180), couleur: COULEURS_PHASES[ph], epaisseur: 1.8, libelle: ph })),
      { points: [[d, 0], [d, 40]], couleur: COULEURS.discret, epaisseur: 1, tirets: "4 3" },
    ],
    marques: arr.map((a) => ({ x: d, y: a.temps / 60, couleur: COULEURS_PHASES[a.phase], rayon: 4 })),
  });
  const aP = arr.find((x1) => x1.phase === "P"), aS = arr.find((x1) => x1.phase === "S"), km = (d * Globe.R * Math.PI) / 180;
  const v0 = aP ? ((Globe.R - h) * Math.sin((aP.depart * Math.PI) / 180)) / aP.p : NaN;
  noter("calcGlobeNote", arr.length ? {
    donnees: [["Δ", `${fd(d, 0)}°`], ["h", `${h} km`], ["R", `${Globe.R} km`], ["modèle", "ak135"]],
    etapes: [
      { titre: "Distance le long de la surface", formule: "Δ<sub>km</sub> = Δ° × π·R / 180", calcul: `Δ<sub>km</sub> = ${fd(d, 0)} × π × ${Globe.R} / 180 = <b>${f(km, 5)} km</b>` },
      { titre: "Temps de trajet", formule: "pour chaque phase : T = Σ sur les sous-couches de √(η² − p²)/k, Δ = Σ arccos(p/η)/k (η = r/v, loi de Bullen) ; p cherché pour que Δ soit la distance voulue",
        calcul: arr.slice(0, 4).map((x1) => `${x1.phase} : ${mmss(x1.temps)}`).join(" ; ") + (arr.length > 4 ? "…" : "") },
      aP && { titre: "Paramètre de rai de l'onde P (loi de Snell sphérique)", formule: "p = r·sin i / v, constant le long du rai ; p (s/°) = p (s/rad) × π/180",
        calcul: `p = (${Globe.R} − ${h}) × sin ${fd(aP.depart, 2)}° / ${fd(v0, 2)} = ${f(aP.p, 5)} s/rad = <b>${fd((aP.p * Math.PI) / 180, 3)} s/°</b> ; sous la station : sin i<sub>0</sub> = p·5,8/${Globe.R} → i<sub>0</sub> = ${fd(aP.incidence, 1)}°` },
      aP && aS && { titre: "Écart S − P et règle locale", formule: "S − P lu ; règle du chapitre 1 : d ≈ 8,4 × (S − P)",
        calcul: `S − P = ${mmss(aS.temps)} − ${mmss(aP.temps)} = ${fd(aS.temps - aP.temps, 1)} s ; 8,4 × ${fd(aS.temps - aP.temps, 1)} = ${f(8.4 * (aS.temps - aP.temps), 4)} km au lieu de ${f(km, 4)} km`,
        note: "La règle locale ne vaut pas aux distances télésismiques : les rais plongent dans un manteau plus rapide." },
    ],
  } : null);
  el("glOut").innerHTML = arr.length
    ? `À ${fd(d, 0)}° (${f(d * Globe.R * Math.PI / 180, 4)} km), foyer à ${h} km : <strong>première arrivée ${arr[0].phase} après ${mmss(arr[0].temps)}</strong>${arr.find((a) => a.phase === "S") ? ` ; S − P = ${mmss(arr.find((a) => a.phase === "S").temps - (arr.find((a) => a.phase === "P") || arr[0]).temps)}` : ""}
      <small>${d > pMax && d < pkp ? "La station est dans la zone d'ombre de P : n'y arrivent que des ondes passées par la graine ou réfléchies sur elle (et l'onde P diffractée par le noyau, non calculée ici)." : d > 100 ? "Plus d'onde S directe au-delà de 100° : le noyau liquide l'arrête." : "Les temps croissent moins vite que la distance : les rais plongent dans un manteau plus rapide."}</small>`
    : "Aucune des phases calculées n'atteint cette distance.";
});
brancher(["glH", "glD", "glVue"], majGlobe);

// ── Plaques, profondeur des séismes et phases de profondeur ──────────────

{
  const z = el("figSubduction");
  if (z) z.innerHTML = `<div style="max-width:560px;margin:0 auto">${subduction()}</div>`;
}

// Retards pP − P et sP − P en fonction de la profondeur, mémorisés par distance (branches rapides de Globe).
const PROF = [1, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700], courbes = new Map();
const courbe = (ph, d) => {
  const cle = `${ph}|${d}`;
  if (!courbes.has(cle)) courbes.set(cle, PROF.map((h) => [h, Globe.retard(ph, h, d)]));
  return courbes.get(cle);
};
const majPP = garde("ppOut", () => {
  const d = num("ppD"), ph = el("ppPh").value, lu = num("ppR");
  if (!(d >= 40 && d <= 95) || !(lu > 0)) { el("ppOut").textContent = "Distance de 40 à 95° et retard positif."; el("ppGraph").innerHTML = el("ppFig").innerHTML = ""; return; }
  const h = Globe.profondeur(lu, d, ph), autre = ph === "pP" ? "sP" : "pP";
  const cPP = courbe("pP", d), cSP = courbe("sP", d), ymax = Math.ceil(Math.max(...cSP.map((q) => q[1])) / 20) * 20;
  el("ppGraph").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0, xmax: 700, ymin: 0, ymax, pasX: 100, pasY: 20,
    xlabel: "profondeur du foyer (km)", ylabel: "retard sur P (s)",
    series: [
      { points: courbe("pP", 40), couleur: COULEURS_PHASES.pP, epaisseur: 1, tirets: "3 3", libelle: "pP à 40°" },
      { points: courbe("pP", 95), couleur: COULEURS_PHASES.pP, epaisseur: 1, tirets: "8 3", libelle: "pP à 95°" },
      { points: cPP, couleur: COULEURS_PHASES.pP, epaisseur: 2.4, libelle: `pP − P à ${fd(d, 0)}°` },
      { points: cSP, couleur: COULEURS_PHASES.sP, epaisseur: 2.4, libelle: `sP − P à ${fd(d, 0)}°` },
      { points: [[0, lu], [700, lu]], couleur: COULEURS.discret, epaisseur: 1, tirets: "4 3" },
    ],
    marques: Number.isFinite(h) ? [{ x: h, y: lu, couleur: COULEURS_PHASES[ph], rayon: 5 }] : [],
  });
  if (!Number.isFinite(h)) {
    el("ppFig").innerHTML = "";
    noter("calcPPNote", null);
    el("ppOut").innerHTML = `À ${fd(d, 0)}°, ${ph} − P va de ${fd(Globe.retard(ph, 1, d), 1)} s (foyer à 1 km) à ${fd(Globe.retard(ph, 700, d), 1)} s (700 km) : <strong>retard hors de portée</strong>.`;
    return;
  }
  const hs = [Math.max(1, Math.floor(h / 50) * 50), Math.min(700, Math.floor(h / 50) * 50 + 50)];
  // vitesse moyenne verticale de la surface au foyer (temps vertical dans ak135)
  let tv = 0;
  for (let z = 0.25; z < h; z += 0.5) { const M = Globe.modele, i = M.findIndex((l, j) => j && M[j - 1][0] <= z && l[0] > z), [z1, v1] = M[i - 1], [z2, v2] = M[i]; tv += 0.5 / (v1 + ((v2 - v1) * (z - z1)) / (z2 - z1)); }
  const aP0 = Globe.arrivees("P", h, d, { rapide: true })[0], cosi = Math.cos((aP0.depart * Math.PI) / 180), vm = h / tv;
  noter("calcPPNote", {
    donnees: [["Δ", `${fd(d, 0)}°`], ["phase lue", ph], ["retard lu", `${fd(lu, 1)} s`]],
    etapes: [
      { titre: "Retard calculé en fonction de la profondeur (rais dans ak135)", formule: `${ph} − P (h) = T<sub>${ph}</sub>(h, Δ) − T<sub>P</sub>(h, Δ), croissant avec h`,
        calcul: hs.map((z) => `h = ${z} km : ${fd(Globe.retard(ph, z, d), 2)} s`).join(" ; ") },
      { titre: "Profondeur cherchée par dichotomie", formule: `on resserre [1 ; 700] km jusqu'à ce que ${ph} − P (h) = ${fd(lu, 1)} s`, calcul: `h = <b>${fd(h, 1)} km</b> ; vérification : ${ph} − P (${fd(h, 1)}) = ${fd(Globe.retard(ph, h, d), 2)} s` },
      { titre: "Ordre de grandeur à la main (pour pP)", formule: "pP − P ≈ 2h·cos i / v, v vitesse moyenne au-dessus du foyer, i angle du rai P au départ",
        calcul: `v = h / temps vertical = ${fd(h, 1)} / ${fd(tv, 2)} = ${fd(vm, 2)} km/s ; i = ${fd(aP0.depart, 1)}° ; 2 × ${fd(h, 1)} × ${fd(cosi, 3)} / ${fd(vm, 2)} = <b>${fd((2 * h * cosi) / vm, 1)} s</b> (calcul complet : ${fd(Globe.retard("pP", h, d), 1)} s)`,
        note: "La formule plane ignore la courbure du rai : bonne pour les foyers peu profonds, elle s'écarte au-delà de quelques centaines de kilomètres.",
        schema: pPgeometrie({ h, i: aP0.depart, v: vm, retard: Globe.retard("pP", h, d) }),
        legende: "Près du foyer, la Terre est plane : pP monte, se réfléchit sur la surface et repart parallèle à P. Tout se passe comme s'il partait de l'image du foyer, symétrique par rapport à la surface ; jusqu'au front d'onde commun, il parcourt 2h·cos i de plus." },
      { titre: `Phase compagne`, calcul: `${autre} − P (${fd(h, 1)} km, ${fd(d, 0)}°) = <b>${fd(Globe.retard(autre, h, d), 1)} s</b>` },
    ],
  });
  const rais = ["P", "pP", "sP"].map((p) => { const a = Globe.arrivees(p, h, d, { rapide: true })[0]; return { phase: p, points: a && Globe.trajet(p, h, a.p) }; });
  el("ppFig").innerHTML = `<div style="max-width:560px;margin:0 auto">${foyer({ h, rais, distance: fd(d, 0) })}</div>`;
  const classe = h < 70 ? "superficiel" : h < 300 ? "intermédiaire" : "profond";
  el("ppOut").innerHTML = `${ph} − P = ${fd(lu, 1)} s à ${fd(d, 0)}° : <strong>foyer à ${fd(h, 0)} km</strong> (séisme ${classe}) ;
    ${autre} devrait suivre P de ${fd(Globe.retard(autre, h, d), 1)} s.
    <small>${h < 30 ? "À cette profondeur, pP suit P de quelques secondes et se confond avec lui sur un enregistrement réel." : `La formule 2h·cos i/v donne l'ordre de grandeur ; le calcul suit les rais dans ak135.`}</small>`;
});
// une demi-seconde de calcul (courbes et dichotomie) : après le premier affichage de la page
setTimeout(() => brancher(["ppD", "ppPh", "ppR"], majPP), 0);

// ── Tables de temps de trajet ─────────────────────────────────────────────
// Calculées après le premier affichage (une seconde environ) ; les exemples et le calculateur les relisent.

const KM_DEG = (Globe.R * Math.PI) / 180;
/** Temps en minutes et secondes, « 8:56,4 » ; tiret si la phase n'existe pas. */
const minsec = (t) => {
  if (t === null || !Number.isFinite(t)) return "—";
  const q = Math.round(t * 10) / 10, m = Math.floor(q / 60);
  return `${m}:${fd(q - 60 * m, 1).padStart(4, "0")}`;
};
/** Heure « 10:21:04 » ou « 10:21:04,5 » en secondes depuis minuit (NaN si illisible). */
const lireHeure = (texte) => {
  const m = String(texte).trim().replace(",", ".").match(/^(\d{1,2})[:h ](\d{1,2})[:min ]+(\d{1,2}(?:\.\d+)?)\s*s?$/);
  return m ? 3600 * +m[1] + 60 * +m[2] + +m[3] : NaN;
};
/** Secondes depuis minuit en « 10 h 10 min 00,3 s ». */
const heure = (t) => {
  const q = Math.round(t * 10) / 10, h = Math.floor(q / 3600), m = Math.floor((q - 3600 * h) / 60);
  return `${h} h ${String(m).padStart(2, "0")} min ${fd(q - 3600 * h - 60 * m, 1).padStart(4, "0")} s`;
};
const DIST_REG = Array.from({ length: 21 }, (_, i) => 20 * i), DIST_TELE = Array.from({ length: 18 }, (_, i) => 10 * (i + 1));
const HS = [10, 100, 300, 600], DIST_PROF = [30, 40, 50, 60, 70, 80, 90], PH_TELE = ["P", "PcP", "PKiKP", "PKIKP", "PKP", "S", "ScS", "SKS"];
const cacheTele = new Map();
const tableTele = (h) => {
  if (!cacheTele.has(h)) cacheTele.set(h, Tables.telesismique({ h, distances: DIST_TELE }));
  return cacheTele.get(h);
};
let tableReg = null, tableProf = null;

function remplirTables() {
  tableReg = Tables.regionale({ h: 10, distances: DIST_REG });
  const t1 = el("tabTempsRegional");
  if (t1) t1.innerHTML = `<thead><tr><th class="num">Δ (km)</th><th class="num">Pg (s)</th><th class="num">Pn (s)</th><th class="num">Sg (s)</th><th class="num">Sn (s)</th><th class="num">Sg − P (s)</th><th class="num">8,4 × (S − P)</th><th class="num">R vrai</th></tr></thead><tbody>${
    tableReg.map((r) => `<tr><td class="n">${r.d}</td><td class="n">${r.premiere === "Pg" ? "<strong>" : ""}${fd(r.Pg, 1)}${r.premiere === "Pg" ? "</strong>" : ""}</td><td class="n">${r.Pn === null ? "—" : `${r.premiere === "Pn" ? "<strong>" : ""}${fd(r.Pn, 1)}${r.premiere === "Pn" ? "</strong>" : ""}`}</td><td class="n">${fd(r.Sg, 1)}</td><td class="n">${r.Sn === null ? "—" : fd(r.Sn, 1)}</td><td class="n">${fd(r.SP, 2)}</td><td class="n">${fd(8.4 * r.SP, 0)} km</td><td class="n">${fd(Math.hypot(r.d, 10), 0)} km</td></tr>`).join("")
  }</tbody>`;
  const t2 = el("tabTempsTele"), rows = tableTele(10);
  if (t2) t2.innerHTML = `<thead><tr><th class="num">Δ (°)</th><th class="num">Δ (km)</th>${PH_TELE.map((ph) => `<th class="num">${ph}</th>`).join("")}<th class="num">S − P</th></tr></thead><tbody>${
    rows.map((r) => `<tr><td class="n">${r.d}</td><td class="n">${f(r.d * KM_DEG, 4)}</td>${PH_TELE.map((ph) => `<td class="n">${r[ph] !== null && ph === r.premiere ? `<strong>${minsec(r[ph])}</strong>` : minsec(r[ph])}</td>`).join("")}<td class="n">${minsec(r.SP)}</td></tr>`).join("")
  }</tbody>`;
  tableProf = Tables.profondeurs({ profondeurs: HS, distances: DIST_PROF });
  const t3 = el("tabTempsProf");
  if (t3) t3.innerHTML = `<thead><tr><th class="num" rowspan="2">Δ (°)</th>${HS.map((h) => `<th class="num" colspan="3">foyer à ${h} km</th>`).join("")}</tr><tr>${HS.map(() => '<th class="num">P</th><th class="num">pP − P</th><th class="num">sP − P</th>').join("")}</tr></thead><tbody>${
    tableProf.map((r) => `<tr><td class="n">${r.d}</td>${HS.map((h) => `<td class="n">${minsec(r[h].P)}</td><td class="n">${r[h].pPP === null ? "—" : `${fd(r[h].pPP, 1)} s`}</td><td class="n">${r[h].sPP === null ? "—" : `${fd(r[h].sPP, 1)} s`}</td>`).join("")}</tr>`).join("")
  }</tbody>`;
  const ex = el("exTables");
  if (ex) ex.innerHTML = exemplesTables().map(noteCalcul).join("");
}

/** Exemples d'application des trois tables (valeurs de départ tirées du modèle, puis lues comme sur le terrain). */
function exemplesTables() {
  // 1. Séisme régional : la station est à 187 km d'un foyer à 10 km
  const t187 = Sismo.temps(187, 10), sp1 = Math.round((t187.tSg - t187.tP) * 10) / 10, l1 = Tables.inverser(tableReg, sp1, (r) => r.d, (r) => r.SP);
  // 2. Séisme lointain : à 64°, foyer à 10 km, origine à 10 h 10 min 00 s
  const rows = tableTele(10), TP64 = Tables.premiere("P", 10, 64), sp2 = Math.round(Tables.spTele(10, 64)), tP2 = Math.round(36600 + TP64);
  const l2 = Tables.inverser(rows, sp2, (r) => r.d, (r) => r.SP), tp2 = Tables.interpoler(rows, l2.x, (r) => r.d, (r) => r.P);
  const ex2 = Tables.dichotomie((d) => Tables.spTele(10, d), sp2, l2.a.d, l2.b.d, 16), TPex = Tables.premiere("P", 10, ex2);
  // 3. Profondeur : pP − P lu à 50° pour un foyer à 200 km
  const r50 = tableProf.find((r) => r.d === 50), pp3 = Math.round(10 * (Tables.premiere("pP", 200, 50) - Tables.premiere("P", 200, 50))) / 10, l3 = Tables.lireProfondeur(r50, pp3, HS);
  // 4. Zone d'ombre : quelles ondes à 120° ?
  const r120 = rows.find((r) => r.d === 120), presentes = PH_TELE.filter((ph) => r120[ph] !== null).sort((a, b) => r120[a] - r120[b]);
  return [
    { titre: `Exemple 1 · Séisme régional : S − P = ${fd(sp1, 1)} s, foyer à 10 km (table 1)`, etapes: [
      { titre: "Lignes qui encadrent l'écart lu", calcul: `Δ = ${l1.a.d} km : Sg − P = ${fd(l1.a.SP, 2)} s ; Δ = ${l1.b.d} km : Sg − P = ${fd(l1.b.SP, 2)} s` },
      { titre: "Interpolation linéaire", formule: "Δ = Δ<sub>1</sub> + (S − P − (S − P)<sub>1</sub>) / ((S − P)<sub>2</sub> − (S − P)<sub>1</sub>) × (Δ<sub>2</sub> − Δ<sub>1</sub>)",
        calcul: `Δ = ${l1.a.d} + (${fd(sp1, 1)} − ${fd(l1.a.SP, 2)}) / (${fd(l1.b.SP, 2)} − ${fd(l1.a.SP, 2)}) × ${l1.b.d - l1.a.d} = <b>${fd(l1.x, 0)} km</b> (vrai : 187 km)` },
      { titre: "La règle du chapitre 1 se trompe ici", formule: "R ≈ 8,4 × (S − P)", calcul: `8,4 × ${fd(sp1, 1)} = <b>${fd(8.4 * sp1, 0)} km</b>, soit ${fd(100 * (8.4 * sp1 / Math.hypot(187, 10) - 1), 0)} % de trop`,
        note: "À cette distance, la première P est Pn, passée par le manteau : elle arrive plus tôt que Pg et allonge S − P. La table, calculée avec Pn, n'a pas ce biais." },
    ] },
    { titre: `Exemple 2 · Séisme lointain : P à ${heure(tP2)}, S − P = ${minsec(sp2)} (table 2)`, etapes: [
      { titre: "Écart lu, en secondes", calcul: `S − P = ${minsec(sp2)} = <b>${sp2} s</b>` },
      { titre: "Lignes qui encadrent l'écart", calcul: `Δ = ${l2.a.d}° : S − P = ${fd(l2.a.SP, 1)} s ; Δ = ${l2.b.d}° : S − P = ${fd(l2.b.SP, 1)} s` },
      { titre: "Distance par interpolation", formule: "Δ = Δ<sub>1</sub> + r × (Δ<sub>2</sub> − Δ<sub>1</sub>), r = (S − P − (S − P)<sub>1</sub>) / ((S − P)<sub>2</sub> − (S − P)<sub>1</sub>)",
        calcul: `r = (${sp2} − ${fd(l2.a.SP, 1)}) / (${fd(l2.b.SP, 1)} − ${fd(l2.a.SP, 1)}) = ${fd(l2.r, 3)} → Δ = <b>${fd(l2.x, 1)}°</b>, soit ${fd(l2.x, 1)} × ${fd(KM_DEG, 2)} = ${f(l2.x * KM_DEG, 4)} km` },
      { titre: "Temps de trajet de P à cette distance (même interpolation, colonne P)", formule: "T<sub>P</sub> = T<sub>P,1</sub> + r × (T<sub>P,2</sub> − T<sub>P,1</sub>)",
        calcul: `T<sub>P</sub> = ${fd(l2.a.P, 1)} + ${fd(tp2.r, 3)} × (${fd(l2.b.P, 1)} − ${fd(l2.a.P, 1)}) = <b>${fd(tp2.y, 1)} s</b> = ${minsec(tp2.y)}` },
      { titre: "Heure d'origine", formule: "t<sub>0</sub> = t<sub>P</sub> − T<sub>P</sub>", calcul: `t<sub>0</sub> = ${heure(tP2)} − ${minsec(tp2.y)} = <b>${heure(tP2 - tp2.y)}</b>` },
      { titre: "Contrôle par les rais", calcul: `Δ exact = ${fd(ex2, 2)}°, T<sub>P</sub> = ${fd(TPex, 1)} s → t<sub>0</sub> = ${heure(tP2 - TPex)} : la lecture de la table est juste à ${fd(Math.abs(l2.x - ex2), 2)}° près`,
        note: "Entre deux lignes, la courbe réelle n'est pas une droite : l'interpolation linéaire laisse une petite erreur, d'autant plus faible que le pas de la table est fin." },
    ] },
    { titre: `Exemple 3 · Profondeur : pP − P = ${fd(pp3, 1)} s à 50° (table 3)`, etapes: [
      { titre: "Ligne Δ = 50°, colonnes pP − P", calcul: HS.map((h) => `${h} km : ${fd(r50[h].pPP, 1)} s`).join(" ; ") },
      { titre: "Interpolation entre les deux profondeurs qui encadrent le retard", formule: "h = h<sub>1</sub> + (r − r<sub>1</sub>) / (r<sub>2</sub> − r<sub>1</sub>) × (h<sub>2</sub> − h<sub>1</sub>)",
        calcul: `h = ${l3.a.h} + (${fd(pp3, 1)} − ${fd(l3.a.r, 1)}) / (${fd(l3.b.r, 1)} − ${fd(l3.a.r, 1)}) × ${l3.b.h - l3.a.h} = <b>${fd(l3.x, 0)} km</b> (vrai : 200 km)`,
        note: "Les colonnes sont espacées de 100 à 300 km : une table plus serrée, ou le calculateur de pP plus bas, donne la profondeur plus finement." },
    ] },
    { titre: "Exemple 4 · Quelles ondes arrivent à 120° ? (table 2)", etapes: [
      { titre: "Ligne Δ = 120°", calcul: presentes.map((ph) => `${ph} : ${minsec(r120[ph])}`).join(" ; ") + " ; P, PcP, S et ScS : —" },
      { titre: "Lecture", calcul: `La première onde est <b>${presentes[0]}</b>, à ${minsec(r120[presentes[0]])} : la station est dans la zone d'ombre de P, qui ne l'atteint pas. La première onde de cisaillement est SKS, à ${minsec(r120.SKS)}.`,
        note: "Prendre la première onde pour P et lui appliquer la colonne P conduirait à une distance fausse : on identifie d'abord la phase, d'après les écarts entre ondes." },
    ] },
  ];
}

// ── Distance et heure d'origine d'un séisme lointain, par la table ────────
const majTable = garde("tbOut", () => {
  const sp = num("tbSP"), h = Number(el("tbH").value), tP = lireHeure(el("tbP").value), rows = tableTele(h);
  const def = rows.filter((r) => r.SP !== null);
  if (!(sp > 0) || !Number.isFinite(tP)) { el("tbOut").textContent = "Saisir S − P en secondes et l'heure de P sous la forme 10:21:04."; el("tbFig").innerHTML = ""; noter("calcTableNote", null); return; }
  const l = Tables.inverser(rows, sp, (r) => r.d, (r) => r.SP);
  if (!l) { el("tbOut").textContent = `Hors table : à cette profondeur, S − P va de ${fd(def[0].SP, 0)} s (${def[0].d}°) à ${fd(def.at(-1).SP, 0)} s (${def.at(-1).d}°).`; el("tbFig").innerHTML = ""; noter("calcTableNote", null); return; }
  const tp = Tables.interpoler(rows, l.x, (r) => r.d, (r) => r.P), t0 = tP - tp.y;
  const dEx = Tables.dichotomie((d) => Tables.spTele(h, d), sp, l.a.d, l.b.d, 16), TPex = Tables.premiere("P", h, dEx);
  el("tbFig").innerHTML = graphe({
    largeur: 560, hauteur: 290, xmin: 0, xmax: 100, ymin: 0, ymax: Math.ceil(Math.max(...def.map((r) => r.SP)) / 100) * 100, pasX: 10, pasY: 100,
    xlabel: "distance Δ (°)", ylabel: "S − P (s)",
    series: [
      { points: def.map((r) => [r.d, r.SP]), couleur: COULEURS.bleu, epaisseur: 2, marqueurs: true, libelle: `table ak135, foyer à ${h} km (lignes tous les 10°)` },
      { points: [[0, sp], [100, sp]], couleur: COULEURS.discret, epaisseur: 1, tirets: "4 3", libelle: `S − P lu : ${fd(sp, 0)} s` },
    ],
    marques: [{ x: l.x, y: sp, couleur: COULEURS.effort, guides: true, libelle: `Δ = ${fd(l.x, 1)}°` }],
  });
  noter("calcTableNote", {
    donnees: [["S − P", `${fd(sp, 0)} s = ${minsec(sp)}`], ["heure de P", heure(tP)], ["foyer", `${h} km`], ["table", "ak135, lignes tous les 10°"]],
    etapes: [
      { titre: "Lignes qui encadrent l'écart lu (colonne S − P)", calcul: `Δ = ${l.a.d}° : ${fd(l.a.SP, 1)} s ; Δ = ${l.b.d}° : ${fd(l.b.SP, 1)} s` },
      { titre: "Distance par interpolation linéaire", formule: "r = (S − P − (S − P)<sub>1</sub>) / ((S − P)<sub>2</sub> − (S − P)<sub>1</sub>) ; Δ = Δ<sub>1</sub> + r·(Δ<sub>2</sub> − Δ<sub>1</sub>)",
        calcul: `r = (${fd(sp, 0)} − ${fd(l.a.SP, 1)}) / (${fd(l.b.SP, 1)} − ${fd(l.a.SP, 1)}) = ${fd(l.r, 3)} ; Δ = ${l.a.d} + ${fd(l.r, 3)} × 10 = <b>${fd(l.x, 2)}°</b> = ${f(l.x * KM_DEG, 4)} km` },
      { titre: "Temps de trajet de P (colonne P, même r)", formule: "T<sub>P</sub> = T<sub>P,1</sub> + r·(T<sub>P,2</sub> − T<sub>P,1</sub>)",
        calcul: `T<sub>P</sub> = ${fd(l.a.P, 1)} + ${fd(l.r, 3)} × (${fd(l.b.P, 1)} − ${fd(l.a.P, 1)}) = <b>${fd(tp.y, 1)} s</b> (${minsec(tp.y)})` },
      { titre: "Heure d'origine", formule: "t<sub>0</sub> = t<sub>P</sub> − T<sub>P</sub>", calcul: `t<sub>0</sub> = ${heure(tP)} − ${minsec(tp.y)} = <b>${heure(t0)}</b>` },
      { titre: "Contrôle par les rais (dichotomie entre les deux lignes)", calcul: `Δ = ${fd(dEx, 2)}°, T<sub>P</sub> = ${fd(TPex, 1)} s → t<sub>0</sub> = ${heure(tP - TPex)} ; écart de la lecture : ${fd(Math.abs(l.x - dEx), 2)}° et ${fd(Math.abs(tp.y - TPex), 1)} s` },
    ],
  });
  el("tbOut").innerHTML = `Δ = <strong>${fd(l.x, 1)}°</strong> (${f(l.x * KM_DEG, 3)} km), T<sub>P</sub> = ${minsec(tp.y)} → <strong>origine à ${heure(t0)}</strong>
    <small>Calcul exact par les rais : ${fd(dEx, 2)}°, origine à ${heure(tP - TPex)}.</small>`;
});
// une seconde de calcul (trois tables) : après le premier affichage de la page
setTimeout(() => { remplirTables(); brancher(["tbSP", "tbH", "tbP"], majTable); }, 0);

