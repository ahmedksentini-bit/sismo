// Exercices du chapitre 2 : localiser un séisme avec un réseau. Les temps d'arrivée sortent du modèle de
// croûte du générateur (Pg ou Pn pour P, Sg pour S) ; les réponses appliquent les méthodes du cours aux
// lectures arrondies ; les explications rappellent la position vraie.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Sismo from "../sismo/signal.js";

const K = Sismo.kmS;
const arrondi = (x, d = 1) => +x.toFixed(d);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (p) => `(${frd(p.x, 0)} ; ${frd(p.y, 0)})`;

// Réseau tiré au hasard autour de l'origine ; séisme à moins de 135 km de toutes les stations, Pg en première arrivée.
function tirerReseau(a, n, { dedans = true } = {}) {
  for (;;) {
    const st = Array.from({ length: n }, (_, i) => {
      const az = (2 * Math.PI * i) / n + a.entre(-0.4, 0.4, 0.01), r = a.entier(25, 60);
      return { nom: `ST${i + 1}`, x: Math.round(r * Math.sin(az)), y: Math.round(r * Math.cos(az)) };
    });
    const r0 = dedans ? a.entier(0, 20) : a.entier(80, 110), az0 = a.entre(0, 6.28, 0.01);
    const E = { x: Math.round(r0 * Math.sin(az0)), y: Math.round(r0 * Math.cos(az0)), h: a.entier(5, 20) };
    const tt = st.map((s) => Sismo.temps(Math.max(0.5, distance(E, s)), E.h));
    if (tt.every((t) => t.R < 135 && (t.tPn === null || t.tPn >= t.tPg))) return { st, E, tt };
  }
}

export default [
  {
    id: "ch2-wadati", titre: "Heure d'origine et Vp/Vs par le diagramme de Wadati", difficulte: 1,
    generer(a) {
      const { st, E, tt } = tirerReseau(a, 4);
      const t0 = a.entre(2, 8, 0.1);
      const lect = tt.map((t) => ({ tP: arrondi(t0 + t.tP), tS: arrondi(t0 + t.tSg) }));
      const w = Sismo.wadati(lect);
      const [i, j] = [0, 1, 2, 3].sort((p, q) => lect[p].tP - lect[q].tP).filter((_, k) => k === 0 || k === 3);
      const pente2 = ((lect[j].tS - lect[j].tP) - (lect[i].tS - lect[i].tP)) / (lect[j].tP - lect[i].tP);
      return {
        enonce: `Quatre stations lisent les arrivées d'un même séisme (secondes après une heure ronde) : ${lect.map((l, k) => `${st[k].nom}, P à ${frd(l.tP, 1)} s et S à ${frd(l.tS, 1)} s`).join(" ; ")}.`,
        donnees: lect.map((l, k) => donnee(st[k].nom, `tP ${frd(l.tP, 1)} s · tS ${frd(l.tS, 1)} s`)),
        questions: [
          nombre("Pente de la droite de Wadati (S − P en fonction de tP) ?", w.pente, "",
            `Par les deux stations extrêmes, ${st[i].nom} et ${st[j].nom} : (${frd(lect[j].tS - lect[j].tP, 1)} − ${frd(lect[i].tS - lect[i].tP, 1)}) / (${frd(lect[j].tP, 1)} − ${frd(lect[i].tP, 1)}) = ${frd(pente2, 3)} ; les moindres carrés sur les quatre points donnent ${frd(w.pente, 3)}.`, { abs: 0.03 }),
          nombre("Rapport Vp/Vs ?", w.vpvs, "", `Vp/Vs = 1 + pente = ${frd(w.vpvs, 2)} (modèle du cours : 6,0 / 3,5 = 1,71).`, { abs: 0.03 }),
          nombre("Heure d'origine t₀ (secondes après l'heure ronde) ?", w.t0, "s",
            `La droite coupe S − P = 0 en t₀ = tP − (S − P)/pente, soit ${frd(lect[i].tP, 1)} − ${frd(lect[i].tS - lect[i].tP, 1)} / ${frd(pente2, 3)} = ${frd(lect[i].tP - (lect[i].tS - lect[i].tP) / pente2, 2)} s par deux points, ${frd(w.t0, 2)} s par les moindres carrés (origine vraie : ${frd(t0, 1)} s).`, { abs: 0.4 }),
          choixMelange(a, "Une cinquième station tomberait 1,5 s au-dessus de la droite. On conclut…",
            ["que l'une de ses lectures (sans doute S) est fausse", "que le séisme est plus profond", "que Vp/Vs vaut 2 à cette station", "que l'heure d'origine est fausse"],
            "Toutes les stations d'un même séisme s'alignent, quelle que soit leur distance : un point écarté signale un pointé faux, le plus souvent celui de S, qui émerge dans la coda de P."),
        ],
      };
    },
  },
  {
    id: "ch2-cercles", titre: "Placer l'épicentre par les cercles de distance", difficulte: 2,
    generer(a) {
      const { st: tous, E, tt: ttTous } = tirerReseau(a, 4);
      const st = tous.slice(0, 3), tt = ttTous.slice(0, 3);
      const sp = tt.map((t) => arrondi(t.tSg - t.tP));
      const R = sp.map((x) => K * x), D = R.map((r) => Math.sqrt(Math.max(r * r - E.h * E.h, 0)));
      const ecart = (p) => Math.sqrt(st.reduce((s, x, k) => s + (distance(p, x) - D[k]) ** 2, 0) / 3);
      // leurres : symétriques de l'épicentre et points décalés
      const leurres = [{ x: -E.x, y: E.y }, { x: E.x, y: -E.y }, { x: E.y, y: E.x }, { x: E.x + 25, y: E.y - 20 }, { x: -E.y, y: -E.x },
        { x: E.x - 30, y: E.y + 15 }, { x: E.x + 15, y: E.y + 30 }].filter((p) => ecart(p) > 6);
      const choisis = a.tirage(leurres, 3);
      return {
        enonce: `Trois stations, de coordonnées ${st.map((s) => `${s.nom} ${point(s)}`).join(", ")} (km, x vers l'est, y vers le nord), lisent des écarts S − P de ${sp.map((x) => `${frd(x, 1)} s`).join(", ")}. Le foyer est supposé à ${E.h} km de profondeur.`,
        donnees: st.map((s, k) => donnee(s.nom, `${point(s)} km · S − P ${frd(sp[k], 1)} s`)),
        questions: [
          nombre(`Distance hypocentrale de ${st[0].nom} ?`, R[0], "km", `R = 8,4 × ${frd(sp[0], 1)} = ${fr(R[0], 3)} km.`),
          nombre(`Rayon du cercle épicentral de ${st[0].nom} ?`, D[0], "km", `Δ = √(R² − h²) = √(${fr(R[0], 3)}² − ${E.h}²) = ${fr(D[0], 3)} km.`, { rel: 0.03 }),
          nombre(`Rayon du cercle épicentral de ${st[1].nom} ?`, D[1], "km", `R = 8,4 × ${frd(sp[1], 1)} = ${fr(R[1], 3)} km, Δ = √(R² − ${E.h}²) = ${fr(D[1], 3)} km.`, { rel: 0.03 }),
          choixMelange(a, "Quel point est l'épicentre (coordonnées en km) ?", [point(E), ...choisis.map(point)],
            `Le point ${point(E)} est à ${st.map((s) => `${fr(distance(E, s), 3)} km de ${s.nom}`).join(", ")} : les trois cercles (${D.map((d) => fr(d, 3)).join(", ")} km) passent tout près (écart moyen ${frd(ecart(E), 1)} km, dû aux lectures arrondies). Les autres points s'en écartent de ${choisis.map((p) => frd(ecart(p), 0)).join(", ")} km en moyenne.`),
        ],
      };
    },
  },
  {
    id: "ch2-lacune", titre: "Lacune azimutale et qualité d'une localisation", difficulte: 1,
    generer(a) {
      const dedans = a.reel() < 0.5;
      const { st, E } = tirerReseau(a, a.entier(4, 6), { dedans });
      const azs = st.map((s) => Sismo.azimut(s.x - E.x, s.y - E.y));
      const gap = Sismo.gapAzimutal(E.x, E.y, st);
      const tri = [...azs].sort((p, q) => p - q);
      return {
        enonce: `Vues de l'épicentre localisé, les ${st.length} stations du réseau sont dans les azimuts ${azs.map((z) => `${frd(z, 0)}°`).join(", ")} (comptés depuis le nord, dans le sens horaire).`,
        donnees: st.map((s, k) => donnee(s.nom, `azimut ${frd(azs[k], 0)}°`)),
        questions: [
          nombre("Lacune azimutale (plus grand secteur sans station) ?", gap, "°",
            `Azimuts rangés : ${tri.map((z) => frd(z, 0)).join(", ")}° ; écarts successifs, y compris le passage par le nord (${frd(tri[0] + 360 - tri[tri.length - 1], 0)}°) : le plus grand vaut ${frd(gap, 0)}°.`, { abs: 2 }),
          choixMelange(a, "L'épicentre est-il bien contraint ?",
            gap < 180 ? ["oui : la lacune reste sous 180°, les stations entourent le séisme", "non : la lacune dépasse 180°, le séisme est hors du réseau"] : ["non : la lacune dépasse 180°, le séisme est hors du réseau", "oui : la lacune reste sous 180°, les stations entourent le séisme"],
            `Critère usuel des catalogues : lacune < 180°. Ici ${frd(gap, 0)}°.`),
          choixMelange(a, "Pour un séisme hors du réseau, la zone d'incertitude de l'épicentre…",
            ["s'allonge dans la direction qui l'éloigne du réseau", "reste circulaire, de même taille", "se réduit, les stations étant toutes du même côté", "ne dépend que de la profondeur"],
            "Toutes les stations voient le séisme du même côté : rapprocher ou éloigner l'épicentre le long de cette direction change peu les écarts entre stations, compensé par l'heure d'origine."),
        ],
      };
    },
  },
  {
    id: "ch2-profondeur", titre: "La profondeur par la station la plus proche", difficulte: 2,
    generer(a) {
      const h = a.entier(5, 20), D = a.entre(3, 25, 0.1), Dloin = a.entier(50, 90);
      const tt = Sismo.temps(D, h), sp = arrondi(tt.tSg - tt.tPg), R = K * sp, hEst = Math.sqrt(Math.max(R * R - D * D, 0));
      const hDe = (d, s) => Math.sqrt(Math.max((K * s) ** 2 - d * d, 0));
      const spLoin = arrondi(Sismo.temps(Dloin, h).tSg - Sismo.temps(Dloin, h).tPg);
      const dhPres = hDe(D, sp + 0.1) - hEst, dhLoin = hDe(Dloin, spLoin + 0.1) - hDe(Dloin, spLoin);
      return {
        enonce: `Un séisme est localisé à ${frd(D, 1)} km de la station la plus proche, qui lit S − P = ${frd(sp, 1)} s. Une autre station, à ${Dloin} km, lit S − P = ${frd(spLoin, 1)} s.`,
        donnees: [donnee("Station proche", `Δ = ${frd(D, 1)} km · S − P = ${frd(sp, 1)} s`), donnee("Station lointaine", `Δ = ${Dloin} km · S − P = ${frd(spLoin, 1)} s`)],
        questions: [
          nombre("Profondeur du foyer d'après la station proche ?", hEst, "km",
            `R = 8,4 × ${frd(sp, 1)} = ${fr(R, 3)} km ; h = √(R² − Δ²) = √(${fr(R, 3)}² − ${frd(D, 1)}²) = ${fr(hEst, 3)} km (foyer vrai : ${h} km).`, { rel: 0.06 }),
          nombre("De combien change cette profondeur si S − P est lu 0,1 s plus long ?", dhPres, "km",
            `R passe à 8,4 × ${frd(sp + 0.1, 1)} = ${fr(K * (sp + 0.1), 3)} km, h à ${fr(hDe(D, sp + 0.1), 3)} km : + ${frd(dhPres, 2)} km.`, { rel: 0.15 }),
          nombre("Et pour la station lointaine, la même erreur de 0,1 s change h de ?", dhLoin, "km",
            `Avec la station lointaine : h = √((8,4 × S − P)² − Δ²) passe de ${fr(hDe(Dloin, spLoin), 3)} à ${fr(hDe(Dloin, spLoin + 0.1), 3)} km, soit + ${frd(dhLoin, 1)} km : la profondeur y est mal contrainte.`, { rel: 0.15 }),
          choixMelange(a, "Pourquoi la profondeur est-elle l'inconnue la plus mal déterminée ?",
            ["un foyer plus profond retarde toutes les arrivées, ce qu'une heure d'origine plus précoce compense", "parce que les ondes S ne traversent pas la croûte", "parce que Vp/Vs varie avec la profondeur", "parce que les stations mesurent mal la composante verticale"],
            "h et t₀ se « troquent » ; seule une station à une distance comparable à la profondeur les sépare."),
        ],
      };
    },
  },
];
