// Calculateurs du chapitre 6 : hodochrones Pg et Pn d'une croûte sur manteau (temps vrais ou réduits),
// inversion d'un profil de premières arrivées (vitesses, intercept, épaisseur), sismique réfraction de site.
import { el, num, f, fd, brancher, garde, lireTableau } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Sismo from "./sismo/signal.js";
import Refraction from "./sismo/refraction.js";

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
  if (!g || !n) { el("prResultat").textContent = "Il faut au moins deux points de part et d'autre de la coupure, alignés sur des pentes positives."; return; }
  const H = Refraction.epaisseur(g.V, n.V, n.ti, h);
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
  el("rfOut").innerHTML = `<strong>t<sub>i</sub> = 2H·cos i<sub>c</sub>/V<sub>1</sub> = ${fd(ti, 1)} ms</strong> · croisement à <strong>${fd(xc, 1)} m</strong>
    <small>Inversement, H = t<sub>i</sub>·V<sub>1</sub>/(2 cos i<sub>c</sub>) = ${fd((ti * V1) / (2 * Math.sqrt(1 - (V1 / V2) ** 2)), 2)} m. La ligne de géophones doit dépasser 2 à 3 fois la distance de croisement pour bien lire la pente du substratum.</small>`;
});
brancher(["rfV1", "rfV2", "rfH"], majRefra);
