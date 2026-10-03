// Calculateurs du chapitre 6 : couches du globe et phases à travers lui (Globe, vérifié contre TauP) ; hodochrones
// Pg et Pn d'une croûte sur manteau (temps vrais ou réduits), inversion d'un profil de premières arrivées (vitesses,
// intercept, épaisseur), sismique réfraction de site.
import { el, num, f, fd, brancher, garde, lireTableau, esc } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Sismo from "./sismo/signal.js";
import Refraction from "./sismo/refraction.js";
import Globe from "./sismo/globe.js";
import { globe, eventail, raisVers, COULEURS_PHASES } from "./globe-figure.js";

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
  el("glOut").innerHTML = arr.length
    ? `À ${fd(d, 0)}° (${f(d * Globe.R * Math.PI / 180, 4)} km), foyer à ${h} km : <strong>première arrivée ${arr[0].phase} après ${mmss(arr[0].temps)}</strong>${arr.find((a) => a.phase === "S") ? ` ; S − P = ${mmss(arr.find((a) => a.phase === "S").temps - (arr.find((a) => a.phase === "P") || arr[0]).temps)}` : ""}
      <small>${d > pMax && d < pkp ? "La station est dans la zone d'ombre de P : n'y arrivent que des ondes passées par la graine ou réfléchies sur elle (et l'onde P diffractée par le noyau, non calculée ici)." : d > 100 ? "Plus d'onde S directe au-delà de 100° : le noyau liquide l'arrête." : "Les temps croissent moins vite que la distance : les rais plongent dans un manteau plus rapide."}</small>`
    : "Aucune des phases calculées n'atteint cette distance.";
});
brancher(["glH", "glD", "glVue"], majGlobe);
