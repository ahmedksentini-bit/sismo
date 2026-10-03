// Exercices du chapitre 6 : la structure de la Terre. Les temps d'arrivée « lus » sortent des temps de
// trajet des modèles (Sismo.temps pour la croûte tirée au hasard, Globe.arrivees pour ak135) ; les réponses
// appliquent les formules du cours aux lectures arrondies.
import { fr, frd, nombre, choixMelange, donnee } from "./alea.js";
import Sismo from "../sismo/signal.js";
import Refraction from "../sismo/refraction.js";
import Globe from "../sismo/globe.js";
import { globe, raisVers } from "../globe-figure.js";

export default [
  {
    id: "ch6-profil", titre: "Vitesses et épaisseur de la croûte par deux droites", difficulte: 2,
    generer(a) {
      const m = { ...Sismo.MODELE, vp1: a.entre(5.8, 6.4, 0.1), vp2: a.entre(7.8, 8.3, 0.1), H: a.entier(25, 45) };
      const h = a.entier(5, 15);
      const xc = Refraction.croisement(m.vp1, m.vp2, Refraction.intercept(m.vp1, m.vp2, m.H, h), h);
      // deux stations sur Pg (loin du foyer, avant le croisement), deux sur Pn (au-delà)
      const dg = [Math.round(0.35 * xc / 5) * 5, Math.round(0.8 * xc / 5) * 5], dn = [Math.round((xc + 40) / 10) * 10, Math.round((xc + 160) / 10) * 10];
      const t = (d) => +Sismo.temps(d, h, m).tP.toFixed(2);
      const [g1, g2, n1, n2] = [...dg, ...dn].map((d) => [d, t(d)]);
      const V1 = (g2[0] - g1[0]) / (g2[1] - g1[1]), V2 = (n2[0] - n1[0]) / (n2[1] - n1[1]), ti = n1[1] - n1[0] / V2;
      const cos = Math.sqrt(1 - (V1 / V2) ** 2), H = (ti * V1 / cos + h) / 2;
      return {
        enonce: `Sur un profil, quatre stations lisent la première arrivée P d'un séisme localisé à ${h} km de profondeur (temps depuis l'origine) : ${[g1, g2, n1, n2].map(([d, tt]) => `${d} km, ${frd(tt, 2)} s`).join(" ; ")}. Les deux premières sont avant le croisement (Pg), les deux dernières au-delà (Pn).`,
        donnees: [g1, g2, n1, n2].map(([d, tt], k) => donnee(`${k < 2 ? "Pg" : "Pn"} à ${d} km`, `${frd(tt, 2)} s`)),
        questions: [
          nombre("Vitesse de la croûte V₁ (pente des deux premières) ?", V1, "km/s", `V₁ = (${g2[0]} − ${g1[0]}) / (${frd(g2[1], 2)} − ${frd(g1[1], 2)}) = ${frd(V1, 2)} km/s (modèle : ${frd(m.vp1, 1)} ; près du foyer Pg n'est pas encore droite).`, { rel: 0.03 }),
          nombre("Vitesse du manteau V₂ ?", V2, "km/s", `V₂ = (${n2[0]} − ${n1[0]}) / (${frd(n2[1], 2)} − ${frd(n1[1], 2)}) = ${frd(V2, 2)} km/s.`, { rel: 0.02 }),
          nombre("Temps d'intercept tᵢ de Pn ?", ti, "s", `tᵢ = t − Δ/V₂ = ${frd(n1[1], 2)} − ${n1[0]} / ${frd(V2, 2)} = ${frd(ti, 2)} s.`, { abs: 0.25 }),
          nombre("Épaisseur de la croûte H ?", H, "km", `cos iᶜ = √(1 − (V₁/V₂)²) = ${frd(cos, 3)} ; H = (tᵢ·V₁/cos iᶜ + h)/2 = (${frd(ti, 2)} × ${frd(V1, 2)} / ${frd(cos, 3)} + ${h})/2 = ${frd(H, 1)} km (modèle : ${m.H} km).`, { rel: 0.06 }),
        ],
      };
    },
  },
  {
    id: "ch6-croisement", titre: "Distance critique et distance de croisement", difficulte: 1,
    generer(a) {
      const V1 = a.entre(5.8, 6.4, 0.1), V2 = a.entre(7.8, 8.3, 0.1), H = a.entier(25, 45), h = a.entier(0, 15);
      const ic = Math.asin(V1 / V2), ti = Refraction.intercept(V1, V2, H, h), dc = (2 * H - h) * Math.tan(ic), xc = Refraction.croisement(V1, V2, ti, h);
      const d = a.choix([Math.round(xc * 0.6), Math.round(xc * 1.6)]), premiere = Math.hypot(d, h) / V1 <= d / V2 + ti || d < dc ? "Pg" : "Pn";
      return {
        enonce: `Une croûte de ${H} km d'épaisseur (V₁ = ${frd(V1, 1)} km/s) repose sur un manteau à V₂ = ${frd(V2, 1)} km/s. Le séisme est à ${h} km de profondeur.`,
        donnees: [donnee("V₁, V₂", `${frd(V1, 1)} et ${frd(V2, 1)} km/s`), donnee("H, h", `${H} km, ${h} km`)],
        questions: [
          nombre("Angle critique iᶜ ?", (ic * 180) / Math.PI, "°", `sin iᶜ = V₁/V₂ = ${frd(V1 / V2, 3)}, iᶜ = ${frd((ic * 180) / Math.PI, 1)}°.`, { abs: 0.5 }),
          nombre("Temps d'intercept tᵢ ?", ti, "s", `tᵢ = (2H − h)·cos iᶜ/V₁ = (${2 * H} − ${h}) × ${frd(Math.cos(ic), 3)} / ${frd(V1, 1)} = ${frd(ti, 2)} s.`, { rel: 0.03 }),
          nombre("Distance critique, où Pn apparaît ?", dc, "km", `(2H − h)·tan iᶜ = ${2 * H - h} × ${frd(Math.tan(ic), 3)} = ${frd(dc, 0)} km.`, { rel: 0.03 }),
          choixMelange(a, `À ${d} km, la première onde P est…`, [premiere, premiere === "Pg" ? "Pn" : "Pg", "Sg", "l'onde de Rayleigh"],
            `Pg arrive à √(${d}² + ${h}²)/${frd(V1, 1)} = ${frd(Math.hypot(d, h) / V1, 2)} s, Pn à ${d}/${frd(V2, 1)} + ${frd(ti, 2)} = ${frd(d / V2 + ti, 2)} s : la distance de croisement vaut ${frd(xc, 0)} km.`),
        ],
      };
    },
  },
  {
    id: "ch6-site", titre: "Sismique réfraction : profondeur du substratum", difficulte: 1,
    generer(a) {
      const V1 = a.entier(6, 16) * 50, V2 = a.entier(15, 45) * 100, H = a.entre(2, 15, 0.1);
      const ti = +Refraction.intercept(V1 / 1000, V2 / 1000, H, 0).toFixed(1), cos = Math.sqrt(1 - (V1 / V2) ** 2);
      const Hc = (ti * V1) / 1000 / (2 * cos), xc = Refraction.croisement(V1 / 1000, V2 / 1000, ti, 0);
      return {
        enonce: `Une ligne de géophones donne deux droites de premières arrivées : la première, issue de l'origine, de vitesse ${V1} m/s ; la seconde de vitesse ${V2} m/s et d'ordonnée à l'origine ${frd(ti, 1)} ms. Le tir est en surface.`,
        donnees: [donnee("V₁", `${V1} m/s`), donnee("V₂", `${V2} m/s`), donnee("tᵢ", `${frd(ti, 1)} ms`)],
        questions: [
          nombre("Profondeur du substratum H ?", Hc, "m", `cos iᶜ = √(1 − (${V1}/${V2})²) = ${frd(cos, 3)} ; H = tᵢ·V₁/(2 cos iᶜ) = ${frd(ti / 1000, 4)} × ${V1} / (2 × ${frd(cos, 3)}) = ${frd(Hc, 2)} m.`, { rel: 0.03 }),
          nombre("Distance de croisement ?", xc, "m", `Les deux droites se coupent où x/V₁ = x/V₂ + tᵢ : x = tᵢ / (1/V₁ − 1/V₂) = ${frd(xc, 1)} m.`, { rel: 0.03 }),
          choixMelange(a, "Pour lire correctement la vitesse du substratum, la ligne de géophones doit…",
            ["s'étendre à 2 ou 3 fois la distance de croisement", "rester plus courte que la distance de croisement", "être enterrée sous le substratum", "être parallèle à la nappe"],
            "Il faut plusieurs géophones au-delà du croisement pour tracer la seconde droite."),
        ],
      };
    },
  },
  {
    id: "ch6-globe", titre: "Ondes P et S à travers le globe", difficulte: 2,
    generer(a) {
      const h = a.choix([10, 100, 300, 600]), D = a.entier(30, 90), X = a.entier(110, 140), R = Globe.R, v0 = Globe.modele[0][1];
      const [P] = Globe.arrivees("P", h, D), [S] = Globe.arrivees("S", h, D);
      const tP = +P.temps.toFixed(1), tS = +S.temps.toFixed(1), i = +P.depart.toFixed(1);
      const v = +((R - h) * Math.sin(P.depart / 180 * Math.PI) / P.p).toFixed(2);
      const dkm = D * Math.PI * R / 180, regle = 8.4 * (tS - tP);
      const p = (R - h) * Math.sin(i / 180 * Math.PI) / v, i0 = Math.asin(p * v0 / R) * 180 / Math.PI;
      const loin = Object.keys(Globe.PHASES).flatMap((ph) => Globe.arrivees(ph, h, X).map((x) => x.phase)).filter((x, k, t) => t.indexOf(x) === k);
      const mmss = (t) => `${Math.floor(t / 60)} min ${frd(t % 60, 1)} s`;
      return {
        enonce: `Un séisme se produit à ${h} km de profondeur. Une station située à ${D}° de l'épicentre lit l'onde P après ${mmss(tP)} et l'onde S après ${mmss(tS)} (temps depuis l'origine, modèle ak135). Le rai P quitte le foyer sous ${frd(i, 1)}° de la verticale, où Vp = ${frd(v, 2)} km/s ; sous la station, Vp = ${frd(v0, 1)} km/s. Rayon de la Terre : ${fr(R, 4)} km.`,
        donnees: [donnee("profondeur h", `${h} km`), donnee("distance Δ", `${D}°`), donnee("tP, tS", `${mmss(tP)}, ${mmss(tS)}`), donnee("départ du rai P", `${frd(i, 1)}°, Vp = ${frd(v, 2)} km/s`)],
        figure: globe({ rais: [...raisVers("S", h, D), ...raisVers("P", h, D)], stations: [{ distance: D, nom: `${D}°` }], h, largeur: 380, titre: "Rais P (bleu) et S (rouge)" }),
        questions: [
          nombre("Distance épicentrale le long de la surface ?", dkm, "km", `Δ = ${D}° × π × ${fr(R, 4)} / 180 = ${fr(dkm, 4)} km.`, { rel: 0.01 }),
          nombre("Quelle distance donnerait la règle locale d ≈ 8,4 × (S − P) ?", regle, "km", `S − P = ${frd(tS - tP, 1)} s, d ≈ 8,4 × ${frd(tS - tP, 1)} = ${fr(regle, 4)} km au lieu de ${fr(dkm, 4)} : les rais plongent dans un manteau plus rapide, S − P croît moins vite que la distance. Aux distances télésismiques, on lit les tables de temps de trajet.`, { rel: 0.02 }),
          nombre("Paramètre de rai p de l'onde P, en s/° ?", p * Math.PI / 180, "s/°", `p = r·sin i / v = (${fr(R, 4)} − ${h}) × sin ${frd(i, 1)}° / ${frd(v, 2)} = ${fr(p, 4)} s/rad, soit ${frd(p * Math.PI / 180, 2)} s/° : c'est aussi la pente de l'hodochrone de P à ${D}°.`, { rel: 0.02 }),
          nombre("Angle d'incidence du rai P sous la station ?", i0, "°", `p se conserve le long du rai : sin i₀ = p·v₀/R = ${fr(p, 4)} × ${frd(v0, 1)} / ${fr(R, 4)} = ${frd(Math.sin(i0 * Math.PI / 180), 3)}, i₀ = ${frd(i0, 1)}°${h > 10 ? " : le rai remonte plus raide qu'il n'est parti, la vitesse étant plus faible en surface" : ""}.`, { abs: 0.5 }),
          choixMelange(a, `Pour le même séisme, une station à ${X}° enregistre…`,
            [`des ondes passées par le noyau (${loin.join(", ")}), mais ni P ni S directes`, `les ondes P et S directes, comme à ${D}°`, "l'onde S directe seulement", "aucune onde de volume"],
            `La station est dans la zone d'ombre : les rais P directs émergent avant 100° et les ondes S ne traversent pas le noyau liquide. Arrivent seulement ${loin.join(", ")} (et l'onde P diffractée, faible).`),
        ],
      };
    },
  },
  {
    id: "ch6-notions", titre: "Croûte, Moho et premières arrivées", difficulte: 1,
    generer(a) {
      const pool = [
        ["Le Moho est…", ["la base de la croûte, où la vitesse des ondes P passe d'environ 6 à 8 km/s", "la surface de la nappe phréatique", "le plan de faille d'un séisme", "la limite entre le manteau et le noyau"],
          "Mohorovičić l'a découvert en 1909 par le dédoublement des premières arrivées."],
        ["Pourquoi la règle d ≈ 8,4 × (S − P) surestime-t-elle la distance au-delà de 150 km ?", ["parce que la première onde P y est Pn, passée par le manteau plus rapide", "parce que l'onde S y disparaît", "parce que Vp/Vs y vaut 2", "parce que les stations y saturent"],
          "Au-delà du croisement, P arrive plus tôt que Pg : S − P est plus long que pour l'onde directe."],
        ["Sur des temps réduits t − Δ/8, l'onde Pn d'un manteau à 8 km/s apparaît…", ["horizontale", "verticale", "de pente 1/8", "invisible"],
          "La réduction retranche Δ/8 : une onde à 8 km/s devient horizontale. Les droites se calculent toujours sur les temps vrais."],
        ["Une croûte plus épaisse donne, pour la même vitesse,…", ["un temps d'intercept plus grand et un croisement plus lointain", "un temps d'intercept plus petit", "une onde Pn plus rapide", "aucun changement des hodochrones"],
          "tᵢ = (2H − h)·cos iᶜ/V₁ croît avec H, et le croisement s'éloigne."],
        ["L'onde réfractée n'existe qu'au-delà de la distance critique parce que…", ["il faut que le rai frappe le Moho sous l'angle critique", "le manteau l'absorbe près du foyer", "elle est plus lente que Pg", "elle naît à la surface"],
          "Sous l'angle critique sin iᶜ = V₁/V₂, le rai longe le Moho ; la distance critique vaut (2H − h)·tan iᶜ."],
        ["Pour le Vs30 et la classe de sol de l'Eurocode 8, on mesure surtout…", ["les ondes S des terrains superficiels", "la profondeur du Moho", "les ondes P du manteau", "la vitesse des ondes de Love à 100 km"],
          "La sismique réfraction en ondes P classe les terrains ; la classe de sol EC8 dépend de la vitesse des ondes S des 30 premiers mètres (chapitre 12)."],
      ];
      return { enonce: "Questions sur la structure de la croûte.", questions: a.tirage(pool, 4).map(([q, o, e]) => choixMelange(a, q, o, e)) };
    },
  },
];
