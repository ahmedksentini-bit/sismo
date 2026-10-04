// Calculateurs du chapitre 5 : oscillations libres (décrément logarithmique), réponse en fréquence d'un
// instrument, réponse d'un instrument à un mouvement sinusoïdal du sol (Newmark, Oscillateur.integrer).
import { el, num, f, fd, brancher, garde, noter } from "./ui.js";
import { graphe, echantillon, COULEURS } from "./figures.js";
import Oscillateur from "./sismo/oscillateur.js";

// ── Oscillations libres ──────────────────────────────────────────────────
const majLibre = garde("liOut", () => {
  const T0 = num("liT"), xi = num("liXi");
  if (!(T0 >= 0.05 && T0 <= 20 && xi >= 0 && xi < 1)) { el("liOut").textContent = "Période de 0,05 à 20 s, amortissement de 0 à 0,99."; el("liFig").innerHTML = ""; return; }
  const duree = 6 * T0, dt = T0 / 200, n = Math.round(duree / dt) + 1;
  const { x } = Oscillateur.integrer(new Float64Array(n), dt, 1 / T0, xi, 10, 0);
  const pics = [];
  for (let i = 1; i < n - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 1e-9) pics.push([i * dt, x[i]]);
  const w = (2 * Math.PI) / T0, Td = T0 / Math.sqrt(1 - xi * xi);
  el("liFig").innerHTML = graphe({
    largeur: 560, hauteur: 280, xmin: 0, xmax: duree, ymin: -10, ymax: 10,
    xlabel: "temps (s)", ylabel: "déplacement de la masse (mm)",
    series: [
      { points: Array.from(x, (v, i) => [i * dt, v]).filter((_, i) => i % 2 === 0), couleur: COULEURS.bleu, epaisseur: 2.2, libelle: "x(t), Newmark" },
      { points: echantillon((t) => 10 * Math.exp(-xi * w * t), 0, duree, 120), couleur: COULEURS.discret, tirets: "5 4", epaisseur: 1.4, libelle: "enveloppe 10·e^(−ξω₀t)" },
      { points: pics.slice(0, 6), couleur: COULEURS.effort, nuage: true, rayon: 4 },
    ],
  });
  if (pics.length < 2) { el("liOut").innerHTML = `Amortissement critique ou presque : la masse revient sans osciller (ξ = ${fd(xi, 2)}).`; noter("calcLibreNote", null); return; }
  const delta = Math.log(pics[0][1] / pics[1][1]), dTh = (2 * Math.PI * xi) / Math.sqrt(1 - xi * xi);
  noter("calcLibreNote", {
    donnees: [["T<sub>0</sub>", `${f(T0, 3)} s`], ["ξ", fd(xi, 3)], ["déplacement initial", "10 mm, vitesse nulle"], ["intégration", `Newmark, pas T<sub>0</sub>/200 = ${f(dt, 3)} s`]],
    etapes: [
      { titre: "Pulsation propre", formule: "ω<sub>0</sub> = 2π / T<sub>0</sub>", calcul: `ω<sub>0</sub> = 2π / ${f(T0, 3)} = <b>${f(w, 4)} rad/s</b>` },
      { titre: "Période amortie", formule: "T<sub>d</sub> = T<sub>0</sub> / √(1 − ξ²)", calcul: `T<sub>d</sub> = ${f(T0, 3)} / √(1 − ${fd(xi, 3)}²) = <b>${fd(Td, 3)} s</b> ; mesurée entre deux maxima : ${fd(pics[1][0] - pics[0][0], 3)} s` },
      { titre: "Décrément logarithmique mesuré", formule: "δ = ln(x<sub>n</sub> / x<sub>n+1</sub>)", calcul: `δ = ln(${fd(pics[0][1], 3)} / ${fd(pics[1][1], 3)}) = <b>${fd(delta, 4)}</b> ; théorie 2πξ/√(1 − ξ²) = ${fd(dTh, 4)}` },
      { titre: "Amortissement déduit", formule: "ξ = δ / √(4π² + δ²) ≈ δ / 2π", calcul: `ξ = ${fd(delta, 4)} / √(39,48 + ${fd(delta * delta, 4)}) = <b>${fd(delta / Math.sqrt(4 * Math.PI ** 2 + delta ** 2), 4)}</b> (approché : ${fd(delta / (2 * Math.PI), 4)})` },
      { titre: "Nombre de cycles pour diviser l'amplitude par deux", formule: "N = ln 2 / δ", calcul: `N = 0,693 / ${fd(delta, 4)} = <b>${f(Math.log(2) / delta, 3)} cycles</b>` },
    ],
  });
  el("liOut").innerHTML = `Maxima successifs ${fd(pics[0][1], 2)} et ${fd(pics[1][1], 2)} mm → <strong>δ = ln(${fd(pics[0][1], 2)} / ${fd(pics[1][1], 2)}) = ${fd(delta, 3)}</strong>, d'où ξ ≈ δ/2π = ${fd(delta / (2 * Math.PI), 3)}
    (exact : δ/√(4π² + δ²) = ${fd(delta / Math.sqrt(4 * Math.PI ** 2 + delta ** 2), 3)})
    <small>Période amortie mesurée ${fd(pics[1][0] - pics[0][0], 3)} s, théorique T<sub>0</sub>/√(1 − ξ²) = ${fd(Td, 3)} s ; l'amplitude est divisée par deux en ${f(Math.log(2) / delta, 2)} cycles.</small>`;
});
brancher(["liT", "liXi"], majLibre);

// ── Réponse en fréquence d'un instrument ─────────────────────────────────
const majReponse = garde("reOut", () => {
  const f0 = num("reF0"), xi = num("reXi");
  if (!(f0 > 0 && xi > 0)) { el("reOut").textContent = "Fréquence propre et amortissement positifs."; el("reFig").innerHTML = ""; return; }
  const pts = (cle) => echantillon((lf) => [10 ** lf, Oscillateur.reponse(10 ** lf, f0, xi)[cle]], -3, 2, 200).map(([, p]) => p);
  const pic = Oscillateur.reponse(f0, f0, xi).acceleration;
  el("reFig").innerHTML = graphe({
    largeur: 560, hauteur: 320, xmin: 0.001, xmax: 100, ymin: 0.001, ymax: Math.max(10, 10 ** Math.ceil(Math.log10(pic))), logX: true, logY: true,
    xlabel: "fréquence du mouvement du sol (Hz)", ylabel: "réponse de l'instrument",
    zones: [
      { x0: 0.001, x1: 0.3 * f0, y0: 0.001, y1: 100, couleur: COULEURS.reaction, opacite: 0.08, libelle: "lit l'accélération" },
      { x0: 3 * f0, x1: 100, y0: 0.001, y1: 100, couleur: COULEURS.bleu, opacite: 0.08, libelle: "lit le déplacement" },
    ].filter((z) => z.x1 > z.x0),
    series: [
      { points: pts("deplacement"), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: "|X / Ug| (déplacement)" },
      { points: pts("acceleration"), couleur: COULEURS.reaction, epaisseur: 2.6, tirets: "6 4", libelle: "|X·ω₀² / üg| (accélération)" },
    ],
    marques: [{ x: f0, y: pic, couleur: COULEURS.effort, libelle: `f₀ : ${f(pic, 3)}` }],
  });
  const lig = (fr) => { const r = fr / f0, D = Math.sqrt((1 - r * r) ** 2 + (2 * xi * r) ** 2); return `f = ${f(fr, 3)} Hz : r = ${f(r, 3)}, D = √((1 − r²)² + (2ξr)²) = ${f(D, 3)} → |X/Ug| = r²/D = ${f((r * r) / D, 3)}, |X·ω<sub>0</sub>²/üg| = 1/D = ${f(1 / D, 3)}`; };
  noter("calcReponseNote", {
    donnees: [["f<sub>0</sub>", `${f(f0, 3)} Hz`], ["ξ", f(xi, 3)]],
    etapes: [
      { titre: "Fonctions de transfert de l'oscillateur", formule: "r = f/f<sub>0</sub> ; D = √((1 − r²)² + (2ξr)²) ; |X/Ug| = r²/D ; |X·ω<sub>0</sub>²/üg| = 1/D" },
      { titre: "Basse fréquence (0,3·f<sub>0</sub>) : l'instrument lit l'accélération", calcul: lig(0.3 * f0) },
      { titre: "Résonance (f = f<sub>0</sub>)", formule: "r = 1 ⇒ D = 2ξ", calcul: `|X/Ug| = |X·ω<sub>0</sub>²/üg| = 1/(2 × ${f(xi, 3)}) = <b>${f(pic, 3)}</b>` },
      { titre: "Haute fréquence (3·f<sub>0</sub>) : l'instrument lit le déplacement", calcul: lig(3 * f0) },
    ],
    conclusion: `Un vélocimètre (f<sub>0</sub> petite) lit le déplacement au-dessus de ${f(3 * f0, 3)} Hz ; un accéléromètre (f<sub>0</sub> grande) lit l'accélération au-dessous de ${f(0.3 * f0, 3)} Hz.`,
  });
  el("reOut").innerHTML = `À la fréquence propre, les deux réponses valent 1/(2ξ) = <strong>${f(pic, 3)}</strong>
    <small>${pic > 1.5 ? "Instrument peu amorti : il résonne et déforme le signal autour de f₀." : "Instrument bien amorti : réponse sans pic."} Il lit le déplacement du sol au-dessus de ${f(3 * f0, 3)} Hz, l'accélération au-dessous de ${f(0.3 * f0, 3)} Hz.</small>`;
});
brancher(["reF0", "reXi"], majReponse);

// ── Un instrument sous un mouvement sinusoïdal ───────────────────────────
const majSinus = garde("siOut", () => {
  const inst = Oscillateur.INSTRUMENTS[el("siInst").value], fs = num("siF");
  if (!inst || !(fs >= 0.01 && fs <= 50)) { el("siOut").textContent = "Fréquence du sol de 0,01 à 50 Hz."; el("siFig").innerHTML = ""; return; }
  // sol : 1 mm d'amplitude, montée en cosinus sur 3 périodes, 12 périodes en tout (au moins 6 périodes propres)
  const Tg = 1 / fs, duree = Math.max(12 * Tg, 6 / inst.f0), montee = 3 * Tg;
  const dt = Math.min(Tg, 1 / inst.f0) / 100, n = Math.round(duree / dt) + 1, w = 2 * Math.PI * fs;
  const ug = new Float64Array(n), acc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt, e = t < montee ? 0.5 - 0.5 * Math.cos((Math.PI * t) / montee) : 1;
    ug[i] = e * Math.sin(w * t);
  }
  // accélération du sol par différences centrées (mm/s²) : même discrétisation que le déplacement tracé
  for (let i = 1; i < n - 1; i++) acc[i] = (ug[i + 1] - 2 * ug[i] + ug[i - 1]) / (dt * dt);
  const { x } = Oscillateur.integrer(acc, dt, inst.f0, inst.xi);
  const debut = Math.floor(n * 0.6);
  let amp = 0;
  for (let i = debut; i < n; i++) amp = Math.max(amp, Math.abs(x[i]));
  const theo = Oscillateur.reponse(fs, inst.f0, inst.xi).deplacement, pas = Math.max(1, Math.floor(n / 1200));
  const ymax = Math.max(1.2, Math.ceil(amp * 12) / 10);
  el("siFig").innerHTML = graphe({
    largeur: 560, hauteur: 280, xmin: 0, xmax: duree, ymin: -ymax, ymax,
    xlabel: "temps (s)", ylabel: "déplacement (mm)",
    series: [
      { points: Array.from(ug, (v, i) => [i * dt, v]).filter((_, i) => i % pas === 0), couleur: COULEURS.discret, epaisseur: 1.6, tirets: "5 4", libelle: "sol ug" },
      { points: Array.from(x, (v, i) => [i * dt, v]).filter((_, i) => i % pas === 0), couleur: COULEURS.bleu, epaisseur: 2.2, libelle: "masse / bâti x" },
    ],
  });
  const reg = Oscillateur.regime(fs, inst.f0), r = fs / inst.f0, Dr = Math.sqrt((1 - r * r) ** 2 + (2 * inst.xi * r) ** 2);
  noter("calcSinusNote", {
    donnees: [["instrument", `${inst.nom}, f<sub>0</sub> = ${f(inst.f0, 3)} Hz, ξ = ${f(inst.xi, 2)}`], ["mouvement du sol", `u<sub>g</sub> = 1 mm × sin(2π·${f(fs, 3)}·t), montée sur 3 périodes`]],
    etapes: [
      { titre: "Rapport des fréquences", formule: "r = f / f<sub>0</sub>", calcul: `r = ${f(fs, 3)} / ${f(inst.f0, 3)} = <b>${f(r, 3)}</b>` },
      { titre: "Amplitude établie prévue", formule: "|X| = U<sub>g</sub>·r² / √((1 − r²)² + (2ξr)²)", calcul: `|X| = 1 × ${f(r * r, 4)} / ${f(Dr, 4)} = <b>${f(theo, 3)} mm</b>` },
      { titre: "Amplitude calculée pas à pas (Newmark)", formule: "ẍ + 2ξω<sub>0</sub>ẋ + ω<sub>0</sub>²x = −üg, üg par différences centrées", calcul: `maximum sur les 40 % finaux de l'enregistrement : <b>${f(amp, 3)} mm</b> (écart ${f((100 * (amp - theo)) / theo, 2)} %)` },
      { titre: "Accélération du sol", formule: "|üg| = (2πf)²·U<sub>g</sub>", calcul: `|üg| = (2π × ${f(fs, 3)})² × 1 = <b>${f(w ** 2, 4)} mm/s²</b> ; x·ω<sub>0</sub>² = ${f(amp, 3)} × ${f((2 * Math.PI * inst.f0) ** 2, 4)} = ${f(amp * (2 * Math.PI * inst.f0) ** 2, 4)} mm/s²` },
    ],
  });
  el("siOut").innerHTML = `${inst.nom}, sol à ${f(fs, 3)} Hz (r = f/f₀ = ${f(fs / inst.f0, 3)}) : amplitude établie de la masse <strong>${f(amp, 3)} mm</strong> pour 1 mm au sol (|X/Ug| théorique ${f(theo, 3)})
    <small>${reg === "sismometre" ? "Régime sismomètre : la masse reste immobile, x reproduit le déplacement du sol (en opposition)." : reg === "accelerometre" ? `Régime accéléromètre : x est proportionnel à l'accélération du sol, ${f(w ** 2, 3)} mm/s² ici (x·ω₀² = ${f(amp * (2 * Math.PI * inst.f0) ** 2, 3)} mm/s²).` : "Zone de résonance : ni déplacement ni accélération, il faut corriger de la réponse de l'instrument."}</small>`;
});
brancher(["siInst", "siF"], majSinus);
