// Calculateurs du chapitre 2 : localisation par quatre stations (cercles de distance, moindres carrés,
// zone d'incertitude, lacune azimutale), diagramme de Wadati, profondeur par la station la plus proche.
import { el, num, fd, brancher, garde, lireTableau, noter } from "./ui.js";
import { svg, texte, ligne, graphe, echantillon, COULEURS } from "./figures.js";
import Sismo from "./sismo/signal.js";
import { rosaceAzimuts, triangleProfondeur } from "./schemas-notes.js";

const K = Sismo.kmS;
// Les stations du banc « réseau » (km ; x vers l'est, y vers le nord).
const STATIONS = [
  { nom: "SIM1", x: 0, y: 0 }, { nom: "SIM2", x: 58, y: 22 }, { nom: "SIM3", x: 22, y: -52 }, { nom: "SIM4", x: -46, y: -14 },
];
// Erreurs de pointé : une série normale fixe (P puis S par station), multipliée par l'écart type choisi.
const u = Sismo.aleatoire(2024);
const gauss = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const TIRAGES = STATIONS.map(() => ({ P: gauss(), S: gauss() }));

// ── Localiser un séisme avec quatre stations ─────────────────────────────
const majLoc = garde("locOut", () => {
  const x = num("locX"), y = num("locY"), h = num("locH"), err = Math.max(0, num("locErr", 0));
  if (![x, y].every((v) => v >= -150 && v <= 150) || !(h >= 0.5 && h <= 31) || !(err <= 1)) {
    el("locOut").textContent = "Épicentre à moins de 150 km de l'origine, profondeur de 0,5 à 31 km, erreur de 0 à 1 s.";
    el("locFig").innerHTML = el("locTab").innerHTML = ""; return;
  }
  const t0 = 4;
  const lect = STATIONS.map((s, k) => {
    const d = Math.hypot(x - s.x, y - s.y), tt = Sismo.temps(d, h);
    return { d, tt, tP: +(t0 + tt.tP + err * TIRAGES[k].P).toFixed(2), tS: +(t0 + tt.tSg + err * TIRAGES[k].S).toFixed(2) };
  });
  const L = Sismo.localiser(STATIONS, lect);
  const rayons = lect.map((l) => { const R = K * (l.tS - l.tP); return { R, D: Math.sqrt(Math.max(R * R - L.h * L.h, 0)) }; });

  // carte
  const T = 520, m = 26, cx = 6, cy = -12, demi = 130, k = (T - 2 * m) / (2 * demi);
  const X = (v) => m + (v - (cx - demi)) * k, Y = (v) => m + ((cy + demi) - v) * k;
  el("locFig").innerHTML = `<div style="max-width:560px;margin:0 auto">${svg({
    largeur: T, hauteur: T, titre: "Carte des stations, cercles de distance et épicentre", contenu: (id) => {
      let s = `<clipPath id="${id}-c"><rect x="${m}" y="${m}" width="${T - 2 * m}" height="${T - 2 * m}"/></clipPath>`;
      for (let v = -100; v <= 100; v += 50) {
        s += ligne(X(v), m, X(v), T - m, COULEURS.grille, 1) + ligne(m, Y(v), T - m, Y(v), COULEURS.grille, 1);
        s += texte(X(v), T - m + 14, `${v}`, 'text-anchor="middle" class="pt"') + texte(m - 4, Y(v) + 4, `${v}`, 'text-anchor="end" class="pt"');
      }
      s += `<rect x="${m}" y="${m}" width="${T - 2 * m}" height="${T - 2 * m}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.2"/>`;
      s += `<g clip-path="url(#${id}-c)">`;
      // zone d'incertitude (cellules de 1 km)
      for (const [zx, zy] of L.zone) s += `<rect x="${(X(zx - 0.5)).toFixed(1)}" y="${(Y(zy + 0.5)).toFixed(1)}" width="${(k + 0.3).toFixed(2)}" height="${(k + 0.3).toFixed(2)}" fill="${COULEURS.violet}" opacity="0.28"/>`;
      STATIONS.forEach((st, i) => {
        s += `<circle cx="${X(st.x).toFixed(1)}" cy="${Y(st.y).toFixed(1)}" r="${(rayons[i].R * k).toFixed(1)}" fill="none" stroke="${COULEURS.discret}" stroke-width="1" stroke-dasharray="4 4"/>`;
        s += `<circle cx="${X(st.x).toFixed(1)}" cy="${Y(st.y).toFixed(1)}" r="${(rayons[i].D * k).toFixed(1)}" fill="none" stroke="${COULEURS.bleu}" stroke-width="1.6"/>`;
      });
      s += "</g>";
      for (const st of STATIONS) {
        const sx = X(st.x), sy = Y(st.y);
        s += `<path d="M${sx} ${sy - 8}L${sx + 7} ${sy + 5}L${sx - 7} ${sy + 5}Z" fill="${COULEURS.reaction}" stroke="#fff" stroke-width="1.2"/>`;
        s += texte(sx + 9, sy + 14, st.nom, 'class="halo" style="font-weight:800;font-size:11px"');
      }
      // épicentre vrai (étoile) et localisé (rond)
      const ex = X(x), ey = Y(y), etoile = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 4 : 10, a = (Math.PI * i) / 5 - Math.PI / 2;
        return `${i ? "L" : "M"}${(ex + r * Math.cos(a)).toFixed(1)} ${(ey + r * Math.sin(a)).toFixed(1)}`;
      }).join("") + "Z";
      s += `<path d="${etoile}" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1"/>`;
      s += `<circle cx="${X(L.x).toFixed(1)}" cy="${Y(L.y).toFixed(1)}" r="5" fill="none" stroke="${COULEURS.encre}" stroke-width="2"/>`;
      s += texte(T - m - 6, m + 16, "★ épicentre vrai   ○ localisé", 'text-anchor="end" class="halo" style="font-size:11px;font-weight:700"');
      s += texte(T - m - 6, m + 31, "— Δ (h localisée)   - - R = 8,4 (S − P)", 'text-anchor="end" class="halo pt"');
      s += texte(T / 2, T - 4, "km vers l'est", 'text-anchor="middle" class="pt"');
      return s;
    },
  })}</div>`;
  el("locTab").innerHTML = `<div class="table-large"><table class="resultats"><thead><tr><th>Station</th><th class="num">Δ vraie</th><th class="num">t<sub>P</sub></th><th class="num">t<sub>S</sub></th><th class="num">S − P</th><th class="num">8,4 (S − P)</th><th class="num">résidu P</th><th class="num">résidu S</th></tr></thead><tbody>${
    STATIONS.map((st, i) => `<tr><td>${st.nom}${lect[i].tt.tPn !== null && lect[i].tt.tPn < lect[i].tt.tPg ? " <small>P = Pn</small>" : ""}</td><td class="n">${fd(lect[i].d, 1)} km</td><td class="n">${fd(lect[i].tP, 2)} s</td><td class="n">${fd(lect[i].tS, 2)} s</td><td class="n">${fd(lect[i].tS - lect[i].tP, 2)} s</td><td class="n">${fd(rayons[i].R, 1)} km</td><td class="n">${fd(L.residus[i].dP, 2)} s</td><td class="n">${fd(L.residus[i].dS, 2)} s</td></tr>`).join("")
  }</tbody></table></div>`;
  // note de calcul : distances, cercles, moindres carrés, vérification à la station la plus proche, lacune
  const iProche = lect.reduce((j, l, i) => (Math.hypot(L.x - STATIONS[i].x, L.y - STATIONS[i].y) < Math.hypot(L.x - STATIONS[j].x, L.y - STATIONS[j].y) ? i : j), 0);
  const sp0 = STATIONS[iProche], dp = Math.hypot(L.x - sp0.x, L.y - sp0.y), ttp = Sismo.temps(dp, L.h);
  const az = STATIONS.map((st) => ((Math.atan2(st.x - L.x, st.y - L.y) * 180) / Math.PI + 360) % 360), azTri = [...az].sort((a1, a2) => a1 - a2);
  const ecarts = azTri.map((a1, i) => (i + 1 < azTri.length ? azTri[i + 1] : azTri[0] + 360) - a1);
  noter("calcLocNote", {
    donnees: [["épicentre vrai", `x = ${fd(x, 0)} km, y = ${fd(y, 0)} km`], ["h", `${fd(h, 1)} km`], ["t<sub>0</sub> vrai", "4,00 s"], ["erreur de pointé", `± ${fd(err, 2)} s`]],
    etapes: [
      { titre: "Distance au foyer vue par chaque station", formule: "R<sub>i</sub> = 8,4 × (t<sub>S,i</sub> − t<sub>P,i</sub>)",
        calcul: STATIONS.map((st, i) => `${st.nom} : 8,4 × (${fd(lect[i].tS, 2)} − ${fd(lect[i].tP, 2)}) = <b>${fd(rayons[i].R, 1)} km</b>`).join(" ; ") },
      { titre: "Cercles de distance à la surface", formule: "Δ<sub>i</sub> = √(R<sub>i</sub>² − h²), avec la profondeur localisée",
        calcul: STATIONS.map((st, i) => `${st.nom} : √(${fd(rayons[i].R, 1)}² − ${fd(L.h, 1)}²) = <b>${fd(rayons[i].D, 1)} km</b>`).join(" ; "),
        note: "Les cercles se recoupent près de l'épicentre ; avec des lectures imparfaites, ils ne passent pas tous par un même point." },
      { titre: "Moindres carrés sur toutes les lectures", formule: "min Σ w<sub>j</sub>·(t<sub>j</sub> − t<sub>0</sub> − T<sub>j</sub>(x, y, h))², w = 1 pour P, 0,5 pour S ; t<sub>0</sub> = Σ w<sub>j</sub>(t<sub>j</sub> − T<sub>j</sub>) / Σ w<sub>j</sub>",
        calcul: `recherche sur grilles de 5 km, 0,5 km puis 0,1 km : x = <b>${fd(L.x, 1)} km</b>, y = <b>${fd(L.y, 1)} km</b>, h = <b>${fd(L.h, 1)} km</b>, t<sub>0</sub> = <b>${fd(L.t0, 2)} s</b> ; rms = √(Σ w r² / Σ w) = <b>${fd(L.rms, 2)} s</b>`,
        note: "T<sub>j</sub> : temps de trajet du modèle (première P : Pg ou Pn ; S : Sg)." },
      { titre: `Vérification à la station la plus proche (${sp0.nom})`, formule: "d = √((x − x<sub>s</sub>)² + (y − y<sub>s</sub>)²) ; t<sub>P</sub> prédit = t<sub>0</sub> + T<sub>P</sub>(d, h)",
        calcul: `d = √((${fd(L.x, 1)} − ${fd(sp0.x, 0)})² + (${fd(L.y, 1)} − ${fd(sp0.y, 0)})²) = ${fd(dp, 1)} km ; R = √(${fd(dp, 1)}² + ${fd(L.h, 1)}²) = ${fd(ttp.R, 1)} km ; t<sub>P</sub> = ${fd(L.t0, 2)} + ${fd(ttp.tP, 2)} = ${fd(L.t0 + ttp.tP, 2)} s ; lu ${fd(lect[iProche].tP, 2)} s → résidu <b>${fd(lect[iProche].tP - L.t0 - ttp.tP, 2)} s</b>` },
      { titre: "Lacune azimutale", formule: "azimut de chaque station vu de l'épicentre, puis plus grand écart entre deux azimuts voisins",
        calcul: `azimuts triés : ${azTri.map((a1) => `${fd(a1, 0)}°`).join(", ")} ; écarts : ${ecarts.map((e1) => `${fd(e1, 0)}°`).join(", ")} → lacune <b>${fd(L.gap, 0)}°</b> ${L.gap > 180 ? "(&gt; 180° : hors du réseau)" : "(&lt; 180° : séisme entouré)"}`,
        schema: rosaceAzimuts({ stations: STATIONS.map((st, i) => ({ nom: st.nom, az: az[i], d: Math.hypot(st.x - L.x, st.y - L.y) })) }),
        legende: "Les stations vues de l'épicentre localisé, à leur azimut (distances à l'échelle) ; le secteur rouge est le plus grand angle sans station." },
    ],
  });
  const ecart = Math.hypot(L.x - x, L.y - y), large = L.zone.length ? Math.max(...L.zone.map(([a, b]) => Math.hypot(a - L.x, b - L.y))) : 0;
  el("locOut").innerHTML = `Localisé en x = ${fd(L.x, 1)} km, y = ${fd(L.y, 1)} km, <strong>h = ${fd(L.h, 1)} km</strong>,
    t<sub>0</sub> = ${fd(L.t0, 2)} s (vrai : 4,00 s) · rms ${fd(L.rms, 2)} s ·
    <strong>lacune azimutale ${fd(L.gap, 0)}°</strong> ${L.gap > 180 ? '<span class="verdict ko">hors du réseau</span>' : '<span class="verdict ok">✓ entouré</span>'}
    <small>Épicentre à ${fd(ecart, 1)} km du vrai, profondeur à ${fd(Math.abs(L.h - h), 1)} km ; zone d'incertitude jusqu'à ${fd(large, 0)} km du point localisé.</small>`;
});
brancher(["locX", "locY", "locH", "locErr"], majLoc);

// ── Diagramme de Wadati ──────────────────────────────────────────────────
const majWadati = garde("wdOut", () => {
  const lect = lireTableau(el("wdPts").value).filter((r) => r.length >= 2 && r.every(Number.isFinite)).map(([tP, tS]) => ({ tP, tS }));
  const w = Sismo.wadati(lect);
  if (!w) { el("wdOut").textContent = "Il faut au moins deux stations, avec tS > tP et des tP différents, et une pente positive."; el("wdFig").innerHTML = ""; return; }
  const tmax = Math.max(...w.pts.map((p) => p[0])), xmin = Math.min(w.t0, ...w.pts.map((p) => p[0])) - 1, xmax = tmax + 1;
  const ymax = Math.max(...w.pts.map((p) => p[1])) * 1.15;
  const resid = w.pts.map(([x, y]) => y - w.pente * (x - w.t0)), pire = resid.reduce((i, r, j) => (Math.abs(r) > Math.abs(resid[i]) ? j : i), 0);
  el("wdFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: Math.floor(xmin), xmax: Math.ceil(xmax), ymin: 0, ymax: Math.ceil(ymax),
    xlabel: "temps d'arrivée de l'onde P, tP (s)", ylabel: "S − P (s)",
    series: [
      { points: [[w.t0, 0], [xmax, w.pente * (xmax - w.t0)]], couleur: COULEURS.bleu, epaisseur: 2.2, libelle: `droite de Wadati, pente ${fd(w.pente, 3)}` },
      { points: w.pts, couleur: COULEURS.encre, nuage: true, rayon: 4.5, libelle: "stations" },
    ],
    marques: [{ x: w.t0, y: 0, couleur: COULEURS.effort, libelle: `t0 = ${fd(w.t0, 2)} s` }],
  });
  const n = w.pts.length, mx = w.pts.reduce((a1, q) => a1 + q[0], 0) / n, my = w.pts.reduce((a1, q) => a1 + q[1], 0) / n;
  const sxy = w.pts.reduce((a1, [x1, y1]) => a1 + (x1 - mx) * (y1 - my), 0), sxx = w.pts.reduce((a1, [x1]) => a1 + (x1 - mx) ** 2, 0);
  noter("calcWadatiNote", {
    donnees: [["stations", `${n}`], ["points (t<sub>P</sub> ; S − P)", w.pts.map(([x1, y1]) => `(${fd(x1, 2)} ; ${fd(y1, 2)})`).join(" ")]],
    etapes: [
      { titre: "Moyennes", formule: "t̄<sub>P</sub> = Σ t<sub>P</sub>/n ; (S − P)‾ = Σ (S − P)/n", calcul: `t̄<sub>P</sub> = ${fd(mx, 3)} s ; (S − P)‾ = ${fd(my, 3)} s` },
      { titre: "Pente de la droite des moindres carrés", formule: "pente = Σ (t<sub>P</sub> − t̄<sub>P</sub>)·((S − P) − (S − P)‾) / Σ (t<sub>P</sub> − t̄<sub>P</sub>)²", calcul: `pente = ${fd(sxy, 3)} / ${fd(sxx, 3)} = <b>${fd(w.pente, 4)}</b>` },
      { titre: "Rapport des vitesses", formule: "S − P = (Vp/Vs − 1)·(t<sub>P</sub> − t<sub>0</sub>) ⇒ Vp/Vs = 1 + pente", calcul: `Vp/Vs = 1 + ${fd(w.pente, 4)} = <b>${fd(w.vpvs, 3)}</b>` },
      { titre: "Heure d'origine : là où S − P s'annule", formule: "ordonnée à l'origine a = (S − P)‾ − pente·t̄<sub>P</sub> ; t<sub>0</sub> = −a / pente", calcul: `a = ${fd(my, 3)} − ${fd(w.pente, 4)} × ${fd(mx, 3)} = ${fd(w.a, 3)} s ; t<sub>0</sub> = ${fd(-w.a, 3)} / ${fd(w.pente, 4)} = <b>${fd(w.t0, 2)} s</b>` },
    ],
  });
  el("wdOut").innerHTML = `Pente ${fd(w.pente, 3)} → <strong>Vp/Vs = ${fd(w.vpvs, 2)}</strong> · <strong>t<sub>0</sub> = ${fd(w.t0, 2)} s</strong>
    <small>Écart le plus fort à la droite : ${fd(resid[pire], 2)} s (station ${pire + 1})${Math.abs(resid[pire]) > 0.3 ? " — à vérifier : un pointé est sans doute faux" : ""}. Pour un solide de Poisson, Vp/Vs = √3 ≈ 1,73.</small>`;
});
brancher(["wdPts"], majWadati);

// ── Profondeur par la station la plus proche ─────────────────────────────
const majProf = garde("prOut", () => {
  const D = num("prDelta"), sp = num("prSP"), e = Math.abs(num("prErr", 0.1));
  if (!(D >= 0 && sp > 0)) { el("prOut").textContent = "Saisir la distance et l'écart S − P."; el("prFig").innerHTML = ""; return; }
  const R = K * sp;
  if (R <= D) { el("prOut").innerHTML = `R = 8,4 × ${fd(sp, 1)} = ${fd(R, 1)} km ne dépasse pas Δ = ${fd(D, 1)} km : lectures incompatibles (S − P trop court pour cette distance).`; el("prFig").innerHTML = ""; return; }
  const h = Math.sqrt(R * R - D * D), hDe = (r) => (r > D ? Math.sqrt(r * r - D * D) : 0);
  const hBas = hDe(K * (sp - e)), hHaut = hDe(K * (sp + e));
  // incertitude sur h en fonction de Δ, pour ce foyer et cette erreur de lecture
  const dh = (d) => { const r = Math.hypot(d, h); return Math.sqrt((r + K * e) ** 2 - d * d) - h; };
  const dmax = Math.max(100, Math.ceil(D / 20) * 20);
  el("prFig").innerHTML = graphe({
    largeur: 560, hauteur: 280, xmin: 0, xmax: dmax, ymin: 0, ymax: Math.ceil(dh(dmax) * 1.1),
    xlabel: "distance épicentrale de la station la plus proche Δ (km)", ylabel: "erreur sur h (km)",
    series: [{ points: echantillon(dh, 0, dmax, 100), couleur: COULEURS.bleu, epaisseur: 2.4, libelle: `foyer à ${fd(h, 1)} km, S − P lu à ± ${fd(e, 2)} s` }],
    marques: [{ x: D, y: dh(D), couleur: COULEURS.effort, guides: true, libelle: `+${fd(dh(D), 1)} km` }],
  });
  noter("calcProfNote", {
    donnees: [["Δ", `${fd(D, 1)} km`], ["S − P", `${fd(sp, 2)} s`], ["erreur de lecture", `± ${fd(e, 2)} s`]],
    etapes: [
      { titre: "Distance au foyer", formule: "R = 8,4 × (S − P)", calcul: `R = 8,4 × ${fd(sp, 2)} = <b>${fd(R, 2)} km</b>` },
      { titre: "Profondeur (triangle rectangle épicentre–foyer–station)", formule: "h = √(R² − Δ²)", calcul: `h = √(${fd(R, 2)}² − ${fd(D, 1)}²) = √(${fd(R * R, 1)} − ${fd(D * D, 1)}) = <b>${fd(h, 1)} km</b>` },
      { titre: "Effet d'une erreur de lecture", formule: "R<sub>±</sub> = 8,4 × (S − P ± e) ; h<sub>±</sub> = √(R<sub>±</sub>² − Δ²)",
        calcul: `R<sub>−</sub> = ${fd(K * (sp - e), 2)} km → h = ${fd(hBas, 1)} km ; R<sub>+</sub> = ${fd(K * (sp + e), 2)} km → h = ${fd(hHaut, 1)} km`,
        note: `L'erreur sur R (8,4 × ${fd(e, 2)} = ${fd(K * e, 2)} km) est amplifiée d'un facteur dh/dR = R/h = ${fd(R / h, 2)} : d'autant plus que la station est loin devant la profondeur.`,
        schema: triangleProfondeur({ D, h, R, Rm: K * (sp - e), Rp: K * (sp + e) }),
        legende: "Le foyer est sur la verticale de l'épicentre, à la distance R de la station. Une erreur sur R déplace le cercle de rayon R : sa trace sur la verticale bouge d'autant plus que le cercle la coupe en biais, c'est-à-dire que Δ est grand devant h." },
    ],
  });
  el("prOut").innerHTML = `R = 8,4 × ${fd(sp, 2)} = ${fd(R, 1)} km → <strong>h = √(R² − Δ²) = √(${fd(R, 1)}² − ${fd(D, 1)}²) = ${fd(h, 1)} km</strong>
    <small>Avec S − P à ± ${fd(e, 2)} s : h entre ${fd(hBas, 1)} et ${fd(hHaut, 1)} km. ${D > 2 * h ? "La station est loin devant la profondeur : h est mal contraint." : "La station est assez proche pour contraindre h."}</small>`;
});
brancher(["prDelta", "prSP", "prErr"], majProf);
