// Calculateurs du chapitre 1 : un séisme vu par une station (sismogramme trois composantes du
// générateur des bancs), distance et heure d'origine à partir des lectures, magnitude locale,
// accélération médiane en fonction de la distance (moyenne des trois lois d'atténuation du cours) ; coupe du globe
// avec ses couches et les rais des principales phases (src/globe-figure.js).
import { el, num, f, fd, brancher, garde } from "./ui.js";
import { svg, texte, ligne, graphe, echantillon, COULEURS } from "./figures.js";
import Sismo from "./sismo/signal.js";
import Accelero from "./sismo/accelerogramme.js";
import { globe, eventail, COULEURS_PHASES } from "./globe-figure.js";

const VP = Sismo.MODELE.vp1, VS = Sismo.MODELE.vs1, K = Sismo.kmS;

// ── Un séisme vu par une station ──────────────────────────────────────────
let cle = "", ev = null;
const majSismo = garde("smOut", () => {
  const delta = num("smDelta"), h = num("smH");
  if (!(delta >= 5 && delta <= 300 && h >= 0 && h <= 60)) { el("smOut").textContent = "Distance de 5 à 300 km, profondeur de 0 à 60 km."; el("smFig").innerHTML = ""; return; }
  const c = `${delta}|${h}`;
  if (c !== cle) { ev = Sismo.generer({ Mw: 4, delta, h, baz: 40, graine: 11 }); cle = c; }
  const tt = ev.tt, debut = tt.tP - 10, fin = Math.min(ev.t0 + ev.n * ev.dt, Math.max(tt.tSg + 25, delta > 40 ? tt.tLR + 20 : 0));
  const largeur = 640, hauteur = 330, g = { gauche: 44, droite: 14, haut: 26, bas: 34 }, W = largeur - g.gauche - g.droite, H = hauteur - g.haut - g.bas;
  const X = (t) => g.gauche + ((t - debut) / (fin - debut)) * W;
  const voies = [["Z", "verticale (Z)"], ["N", "nord–sud (N)"], ["E", "est–ouest (E)"]], hv = H / voies.length;
  const i0 = Math.max(0, Math.round((debut - ev.t0) / ev.dt)), i1 = Math.min(ev.n, Math.round((fin - ev.t0) / ev.dt));
  let amax = 0;
  for (const [v] of voies) for (let i = i0; i < i1; i++) amax = Math.max(amax, Math.abs(ev.vit[v][i]));
  el("smFig").innerHTML = svg({
    largeur, hauteur, titre: "Sismogramme trois composantes", contenu: () => {
      let s = "";
      const pas = fin - debut > 80 ? 20 : 10;
      for (let t = 0; t <= fin - debut + 1e-9; t += pas) {
        s += ligne(X(debut + t), g.haut, X(debut + t), g.haut + H, COULEURS.grille, 1);
        s += texte(X(debut + t), g.haut + H + 16, `${t} s`, 'text-anchor="middle" class="pt"');
      }
      voies.forEach(([v, nom], k) => {
        const y0 = g.haut + hv * (k + 0.5), Y = (a) => y0 - (a / amax) * hv * 0.46;
        // enveloppe min–max par paquet : aucun pic perdu à l'échelle de la figure
        const saut = Math.max(1, Math.floor((i1 - i0) / (2 * W)));
        let d = "";
        for (let i = i0; i < i1; i += saut) {
          let lo = ev.vit[v][i], hi = lo;
          for (let j = i; j < Math.min(i1, i + saut); j++) { lo = Math.min(lo, ev.vit[v][j]); hi = Math.max(hi, ev.vit[v][j]); }
          const x = X(ev.t0 + i * ev.dt).toFixed(1);
          d += `${d ? "L" : "M"}${x} ${Y(lo).toFixed(1)}L${x} ${Y(hi).toFixed(1)}`;
        }
        s += `<path d="${d}" fill="none" stroke="${COULEURS.encre}" stroke-width="0.8"/>`;
        s += texte(g.gauche + 4, y0 - hv * 0.36, nom, 'class="pt halo" style="font-weight:700"');
      });
      const repere = (t, nom, couleur) => {
        s += ligne(X(t), g.haut, X(t), g.haut + H, couleur, 1.6, 'stroke-dasharray="5 4"');
        s += texte(X(t) + 4, g.haut - 8, nom, `class="halo" style="font-weight:800;fill:${couleur}"`);
      };
      repere(tt.tP, "P", COULEURS.effort);
      repere(tt.tSg, "S", COULEURS.bleu);
      if (delta > 40) repere(tt.tLR, "ondes de surface", COULEURS.reaction);
      s += texte(largeur - g.droite, hauteur - 6, "temps depuis le début de la fenêtre", 'text-anchor="end" class="pt"');
      return s;
    },
  });
  const sp = tt.tSg - tt.tP;
  el("smOut").innerHTML = `P à ${fd(tt.tP - debut, 1)} s · S à ${fd(tt.tSg - debut, 1)} s · S − P = ${fd(sp, 1)} s →
    <strong>R ≈ ${fd(K, 1)} × ${fd(sp, 1)} = ${fd(Sismo.distanceSP(sp), 0)} km</strong>
    <small>distance vraie au foyer : ${fd(tt.R, 0)} km${tt.tPn !== null && tt.tPn < tt.tPg ? " — la première onde P est passée par le manteau (Pn) : la règle surestime un peu" : ""}.</small>`;
});
brancher(["smDelta", "smH"], majSismo);

// ── Distance et heure d'origine à partir des lectures ─────────────────────
const majSP = garde("spOut", () => {
  const tP = num("spP"), tS = num("spS"), h = Math.max(0, num("spH", 0));
  if (!(Number.isFinite(tP) && Number.isFinite(tS))) { el("spOut").textContent = "Saisir les deux temps d'arrivée."; return; }
  if (!(tS > tP)) { el("spOut").textContent = "L'onde S arrive après l'onde P : tS doit dépasser tP."; return; }
  const sp = tS - tP, R = Sismo.distanceSP(sp), t0 = Sismo.origineDepuis(tP, sp);
  const epi = R > h ? Math.sqrt(R * R - h * h) : null;
  el("spOut").innerHTML = `S − P = ${fd(sp, 1)} s → <strong>R ≈ ${fd(K, 1)} × ${fd(sp, 1)} = ${fd(R, 0)} km</strong> ·
    épicentre à ${epi === null ? "—" : `√(R² − h²) = ${fd(epi, 0)} km`} ·
    <strong>t<sub>0</sub> = t<sub>P</sub> − R/Vp = ${fd(tP, 1)} − ${fd(R / VP, 1)} = ${fd(t0, 1)} s</strong>
    <small>Vp = ${fd(VP, 1)} km/s, Vs = ${fd(VS, 1)} km/s ${epi === null ? "— la profondeur dépasse la distance au foyer : lectures incohérentes" : ""}</small>`;
});
brancher(["spP", "spS", "spH"], majSP);

// ── Magnitude locale ──────────────────────────────────────────────────────
const majML = garde("mlOut", () => {
  const la = num("mlLogA"), R = num("mlR");
  if (!(Number.isFinite(la) && R > 0)) { el("mlOut").textContent = "Saisir l'amplitude et la distance."; return; }
  const A = 10 ** la, corr = 1.11 * Math.log10(R) + 0.00189 * R - 2.09, ml = Sismo.ML(A, R);
  const ecrit = A >= 1e6 ? `${f(A / 1e6, 3)} mm` : A >= 1e3 ? `${f(A / 1e3, 3)} µm` : `${f(A, 3)} nm`;
  el("mlOut").innerHTML = `A = ${ecrit} · log<sub>10</sub> A = ${fd(la, 2)} · correction de distance 1,11·log<sub>10</sub> R + 0,00189·R − 2,09 = ${fd(corr, 2)}
    → <strong>ML = ${fd(ml, 1)}</strong>
    <small>À la même distance, une amplitude dix fois plus grande donnerait ML = ${fd(ml + 1, 1)}.</small>`;
});
brancher(["mlLogA", "mlR"], majML);

// ── Accélération médiane en fonction de la distance ──────────────────────
const pga = (M, R) => Math.exp(Accelero.medianeLois(M, R, "PGA"));
const majPGA = garde("pgOut", () => {
  const M = num("pgM"), R = num("pgR");
  if (!(M >= 4 && M <= 8 && R >= 1 && R <= 300)) { el("pgOut").textContent = "Magnitude de 4 à 8, distance de 1 à 300 km."; el("pgFig").innerHTML = ""; return; }
  const courbe = (m) => echantillon((lr) => [10 ** lr, pga(m, 10 ** lr)], 0, Math.log10(300), 90).map(([, p]) => p);
  const serie = (m, couleur, epaisseur, tirets) => ({ points: courbe(m), couleur, epaisseur, tirets, libelle: `Mw ${fd(m, 1)}` });
  const ici = pga(M, R);
  el("pgFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 1, xmax: 300, ymin: 0.001, ymax: 2, logX: true, logY: true,
    xlabel: "distance Rjb (km)", ylabel: "accélération maximale médiane (g)",
    series: [serie(M - 1, COULEURS.discret, 1.6, "5 4"), serie(M, COULEURS.bleu, 2.8), serie(M + 1, COULEURS.violet, 1.6, "5 4")].filter((x) => x.points.length),
    marques: [{ x: R, y: ici, couleur: COULEURS.effort, guides: true, libelle: `${f(ici, 2)} g` }],
  });
  el("pgOut").innerHTML = `Mw ${fd(M, 1)} à ${fd(R, 0)} km : accélération maximale médiane au rocher <strong>${f(ici, 2)} g</strong>
    <small>à 2 × ${fd(R, 0)} km : ${f(pga(M, 2 * R), 2)} g · une magnitude de plus à la même distance : ${f(pga(M + 1, R), 2)} g.</small>`;
});
brancher(["pgM", "pgR"], majPGA);

// ── Le globe et ses phases (figure) ──────────────────────────────────────
{
  const zone = el("globeCh1");
  if (zone) {
    const d = (a, b, n) => Array.from({ length: n }, (_, i) => a + (i * (b - a)) / (n - 1));
    const rais = [...eventail("P", 10, d(10, 98, 12)), ...eventail("PKP", 10, d(146, 178, 6)), ...eventail("PKIKP", 10, d(116, 140, 3)),
      ...eventail("S", 10, d(10, 98, 12), { sens: -1 }), ...eventail("SKS", 10, d(70, 170, 6), { sens: -1 })];
    zone.innerHTML = `<div style="max-width:520px;margin:0 auto">${globe({ rais, ombre: [99.6, 145], titre: "Coupe du globe : couches et phases", etiquettes: [
      { r: 5200, angle: 45, texte: "P", couleur: COULEURS_PHASES.P }, { r: 5200, angle: 45, sens: -1, texte: "S", couleur: COULEURS_PHASES.S },
      { r: 2400, angle: 150, texte: "PKP", couleur: COULEURS_PHASES.PKP }, { r: 2500, angle: 120, sens: -1, texte: "SKS", couleur: COULEURS_PHASES.SKS },
    ] })}</div>`;
  }
}
