import Geodesie from './geodesie.js';
import Zones from './zones.js';

// src/sismo/gnss.js — champ de vitesses GNSS réel pour l'aléa (banc « aléa », mode « Zones du catalogue ») : lecture des
// fichiers psvelo de GMT (lon lat ve vn σe σn corr site, mm/an) et des tableaux dont l'en-tête nomme les colonnes ;
// tenseur des taux de déformation de chaque zone par moindres carrés (Geodesie.ajuster) sur les stations de la zone
// (élargie d'une marge), dans un repère local centré sur la zone, vitesses ramenées à ce repère (convergence des
// méridiens : une rotation d'ensemble de la plaque ne donne aucune déformation) ; taux de moment de Kostrov
// (Geodesie.momentKostrov, μ = 30 GPa, H = 15 km). Unités : km, mm/an, ns/an, N·m/an. Solveurs purs.
const Gnss = (() => {
  'use strict';
  const RAD = Math.PI / 180;
  const SIGMA_DEFAUT = 1, SIGMA_MIN = 0.2; // mm/an : vitesse sans incertitude ; plancher des incertitudes formelles

  // ── Lecture ─────────────────────────────────────────────────────────────
  const nombre = s => { const x = Number(String(s).trim().replace(',', '.')); return String(s).trim() !== '' && Number.isFinite(x) ? x : NaN; };
  const norme = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
  const NOMS = {
    lon: ['lon', 'long', 'longitude', 'lambda'], lat: ['lat', 'latitude', 'phi'],
    e: ['ve', 'vele', 'veast', 'eastvel', 'veleast', 'east', 'vest', 'vitessee', 'vlon', 'dedt', 'e'],
    n: ['vn', 'veln', 'vnorth', 'northvel', 'velnorth', 'north', 'vnord', 'vitessen', 'vlat', 'dndt', 'n'],
    se: ['se', 'sige', 'sigmae', 'sve', 'sigve', 'sigmave', 'esige', 'sde', 'sigeast', 'sigmaeast', 'dve', 'evele'],
    sn: ['sn', 'sign', 'sigman', 'svn', 'sigvn', 'sigmavn', 'esign', 'sdn', 'signorth', 'sigmanorth', 'dvn', 'eveln'],
    corr: ['corr', 'rho', 'corren', 'corrne', 'cen', 'rhoen', 'rhone', 'ren'],
    id: ['site', 'station', 'name', 'nom', 'id', 'code', 'sta'],
  };
  const separer = l => (l.includes(';') ? l.split(';') : l.includes('\t') ? l.split('\t') : l.includes(',') ? l.split(',') : l.trim().split(/\s+/));
  // Fichier de vitesses : { format: 'psvelo' | 'tableau', stations: [{ id, lon, lat, e, n, se, sn, corr }], rejetees, unite }.
  function lire(texte) {
    let s = String(texte);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    const lignes = s.split(/\r\n|\n|\r/).filter(l => l.trim() && !/^\s*[#%>!*]/.test(l));
    if (!lignes.length) throw new Error('fichier vide');
    const stations = [];
    let rejetees = 0, format, unite = 'mm/an';
    const ajouter = (id, lon, lat, e, n, se, sn, corr, k = 1) => {
      if (![lon, lat, e, n].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(e * k) > 200 || Math.abs(n * k) > 200) { rejetees++; return; }
      stations.push({ id: id || `S${stations.length + 1}`, lon: lon > 180 ? lon - 360 : lon, lat, e: e * k, n: n * k,
        se: Number.isFinite(se) && se > 0 ? se * k : null, sn: Number.isFinite(sn) && sn > 0 ? sn * k : null, corr: Number.isFinite(corr) && Math.abs(corr) < 1 ? corr : 0 });
    };
    const premiere = separer(lignes[0]).map(c => c.trim()).filter(c => c !== '');
    const entete = premiere.filter(c => Number.isNaN(nombre(c))).length >= 2;
    if (!entete) {
      // psvelo : lon lat ve vn [σe σn [corr]] [site…]
      format = 'psvelo';
      for (const l of lignes) {
        const c = l.trim().split(/\s+/), v = c.slice(0, 7).map(nombre);
        if (c.length < 4) { rejetees++; continue; }
        const nNum = v.findIndex(x => Number.isNaN(x)), nb = nNum < 0 ? v.length : nNum;
        ajouter(c.slice(nb).join(' '), v[0], v[1], v[2], v[3], nb > 4 ? v[4] : NaN, nb > 5 ? v[5] : NaN, nb > 6 ? v[6] : NaN);
      }
    } else {
      format = 'tableau';
      const cols = premiere.map(norme), indice = cle => cols.findIndex(c => NOMS[cle].includes(c));
      const ix = Object.fromEntries(Object.keys(NOMS).map(k => [k, indice(k)]));
      if (ix.lon < 0 || ix.lat < 0 || ix.e < 0 || ix.n < 0) throw new Error('en-tête sans colonnes longitude, latitude, vitesse est et vitesse nord (lon, lat, ve, vn)');
      // vitesses en m/an si l'en-tête le dit (m/yr, m/a, m/an), sinon en mm/an
      const brut = lignes[0].toLowerCase();
      if (/(^|[^m])m\s*\/\s*(yr|y|an|a)\b/.test(brut) && !/mm\s*\/\s*(yr|y|an|a)\b/.test(brut)) unite = 'm/an';
      const k = unite === 'm/an' ? 1000 : 1;
      for (const l of lignes.slice(1)) {
        const c = separer(l).map(x => x.trim()), v = cle => (ix[cle] >= 0 ? nombre(c[ix[cle]] ?? '') : NaN);
        ajouter(ix.id >= 0 ? c[ix.id] : '', v('lon'), v('lat'), v('e'), v('n'), v('se'), v('sn'), v('corr'), k);
      }
    }
    if (stations.length < 3) throw new Error(stations.length ? `${stations.length} station${stations.length > 1 ? 's' : ''} lisible${stations.length > 1 ? 's' : ''} seulement : il en faut au moins trois` : 'aucune station lisible (lon lat ve vn en mm/an)');
    return { format, stations, rejetees, unite };
  }

  // ── Repère local d'une zone ─────────────────────────────────────────────
  // Position (km) dans la projection équirectangulaire centrée sur (lat0, lon0), vitesse tournée de la convergence des
  // méridiens γ = Δλ·sin φ̄ : le nord local d'une station à l'est du centre penche vers l'ouest dans le repère du centre.
  function versLocal(st, pr, lat0, lon0) {
    const [x, y] = pr.versKm([st.lon, st.lat]);
    const dl = ((((st.lon - lon0 + 180) % 360) + 360) % 360) - 180, g = dl * RAD * Math.sin(((st.lat + lat0) / 2) * RAD), c = Math.cos(g), s = Math.sin(g);
    return { x, y, e: st.e * c - st.n * s, n: st.e * s + st.n * c };
  }
  // Distance (km) d'un point à un polygone [[x, y]…] (0 dedans).
  function distancePolygone(x, y, poly) {
    if (Geodesie.dansPolygone(x, y, poly)) return 0;
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2)) : 0;
      d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    }
    return d;
  }

  // Tenseur et moment géodésique d'une zone (polygone [[lon, lat]…]) : stations dans la zone ou à moins de `marge` km de
  // son contour, ajustement d'une déformation uniforme (σ de chaque station = moyenne quadratique de σe et σn, au moins
  // SIGMA_MIN). Renvoie { n, stations (indices), aj, principales, aire (km²), moment, incertitude (quantiles 16, 50, 84 %
  // du moment) } ou { n, stations, raison } si l'ajustement est impossible (moins de trois stations, stations alignées).
  function tenseurZone(stations, polygone, { marge = 0, mu = 3e10, H = 15, sigmaMin = SIGMA_MIN, tirages = 2000 } = {}) {
    const c = Zones.centre([{ polygone }]), pr = Zones.projection(c.lat, c.lon), poly = polygone.map(pr.versKm), A = Geodesie.aire(poly);
    const sel = [], loc = [];
    stations.forEach((st, i) => {
      const p = versLocal(st, pr, c.lat, c.lon);
      if (distancePolygone(p.x, p.y, poly) <= marge) {
        const sig = st.se && st.sn ? Math.sqrt((st.se ** 2 + st.sn ** 2) / 2) : st.se || st.sn || SIGMA_DEFAUT;
        sel.push(i); loc.push({ ...p, sigma: Math.max(sigmaMin, sig) });
      }
    });
    if (loc.length < 3) return { n: loc.length, stations: sel, aire: A, raison: loc.length ? `${loc.length} station${loc.length > 1 ? 's' : ''} seulement` : 'aucune station' };
    const aj = Geodesie.ajuster(loc);
    if (!aj) return { n: loc.length, stations: sel, aire: A, raison: 'stations alignées' };
    const opts = { mu, H, A };
    return { n: loc.length, stations: sel, aire: A, centre: c, aj, principales: Geodesie.principales(aj), moment: Geodesie.momentKostrov(aj, opts),
      incertitude: Geodesie.momentTires(aj, opts, { n: tirages }) };
  }
  // Moment sismique libéré par la loi du catalogue d'une zone ({ lam, b, mc, mmax }), de max(Mc, 4) à Mmax (N·m/an) : le
  // rapport au moment géodésique est le couplage apparent.
  function momentCatalogue(z) {
    const a = Math.log10(z.lam) + z.b * z.mc;
    return Geodesie.momentGR({ a, b: z.b, mmin: Math.max(z.mc, Zones.MMIN_CALCUL), mmax: z.mmax });
  }
  // Vitesses relatives à la moyenne pondérée des stations données (pour les flèches de la carte).
  function vitessesRelatives(stations) {
    let w = 0, e = 0, n = 0;
    for (const s of stations) { const k = 1 / Math.max(SIGMA_MIN, s.se || SIGMA_DEFAUT) ** 2; w += k; e += k * s.e; n += k * s.n; }
    return stations.map(s => ({ ...s, de: s.e - e / w, dn: s.n - n / w }));
  }

  return { SIGMA_DEFAUT, SIGMA_MIN, lire, versLocal, distancePolygone, tenseurZone, momentCatalogue, vitessesRelatives };
})();
export default Gnss;
