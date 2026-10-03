import Spectre from './spectre.js';
import Poussee from './poussee.js';

// src/sismo/isolation.js — isolation à la base : isolateur bilinéaire (élastomère fretté à noyau de plomb ou pendule
// équivalent) défini par la période post-élastique Tiso de la masse portée, la résistance caractéristique Q (force à
// déplacement nul, en fraction du poids) et le déplacement de plastification dy ; viscosité additionnelle ξv.
// Linéarisation équivalente : raideur sécante Keff = F(d)/d, amortissement ξeff = ξv + ED/(2π·Keff·d²) avec
// ED = 4·Q·(d − dy) l'aire d'une boucle ; déplacement de calcul par point fixe d = Se(Teff, ξeff)·(Teff/2π)², la
// correction η de l'EN 1998-1:2004 (§ 3.2.2.2 (3)) traduisant l'amortissement. Calcul temporel non linéaire du
// bâtiment isolé (isolateur + superstructure à un niveau) par Poussee.temporel. Masses en t, raideurs en kN/m.
// Solveurs purs.
const Isolation = (() => {
  'use strict';
  const G = Spectre.G, DEUXPI = 2 * Math.PI;

  // Isolateur pour une masse portée M : K2 = M·(2π/Tiso)², Q = q·M·g, K1 = K2 + Q/dy, Fy = K1·dy.
  function isolateur({ M, Tiso, q, dy }) {
    const K2 = M * (DEUXPI / Tiso) ** 2, Q = q * M * G, K1 = K2 + Q / dy;
    return { M, Tiso, q, dy, K1, K2, Q, Fy: K1 * dy, alpha: K2 / K1 };
  }
  // Force sur la courbe enveloppe, raideur sécante, période et amortissement équivalents à l'amplitude d.
  function equivalent(iso, d, xiV = 0) {
    const F = d <= iso.dy ? iso.K1 * d : iso.Q + iso.K2 * d, Keff = F / d, ED = d > iso.dy ? 4 * iso.Q * (d - iso.dy) : 0;
    return { d, F, Keff, Teff: DEUXPI * Math.sqrt(iso.M / Keff), ED, xi: xiV + ED / (DEUXPI * Keff * d * d) };
  }
  // Déplacement de calcul par point fixe : se(T, ξ) en m/s². Départ sur la période post-élastique ; relaxation de
  // moitié dès qu'une itération oscille. Renvoie l'historique et le point convergé.
  function deplacementCalcul(iso, { se, xiV = 0, tolerance = 1e-10, max = 200 }) {
    let d = se(iso.Tiso, 0.05) * (iso.Tiso / DEUXPI) ** 2, relax = 1, ecartAvant = Infinity;
    const etapes = [];
    for (let k = 0; k < max; k++) {
      const e = equivalent(iso, d, xiV), dn = se(e.Teff, e.xi) * (e.Teff / DEUXPI) ** 2;
      etapes.push({ ...e, suivant: dn });
      const ecart = Math.abs(dn - d);
      if (ecart <= tolerance * d) return { ...e, etapes, converge: true };
      if (ecart > 0.9 * ecartAvant) relax = Math.max(0.1, relax / 2);
      ecartAvant = ecart;
      d += relax * (dn - d);
    }
    return { ...equivalent(iso, d, xiV), etapes, converge: false };
  }

  // Bâtiment isolé à deux niveaux : dalle de base mb sur l'isolateur, superstructure ms de période propre Ts (base
  // fixe) et d'amortissement ξs. Amortisseurs : isolateur cv = 2·ξv·M·2π/Tiso, superstructure cs = 2·ξs·ms·2π/Ts.
  function modele({ ms, mb, Ts, xiS = 0.05 }, iso, xiV = 0) {
    const ks = ms * (DEUXPI / Ts) ** 2;
    return {
      bat: { m: [mb, ms], k: [iso.K1, ks], Vy: [iso.Fy, 1e30], alpha: [iso.alpha, 0] },
      amortissement: { a0: 0, c: [2 * xiV * iso.M * (DEUXPI / iso.Tiso), 2 * xiS * ms * (DEUXPI / Ts)] },
    };
  }
  function temporel(batIsole, acc, dt) {
    const { bat, amortissement } = batIsole, r = Poussee.temporel(bat, acc, dt, { amortissement });
    return { ...r, dIso: r.glissements[0], fIso: r.efforts[0], dIsoMax: r.dMax[0] };
  }

  return { isolateur, equivalent, deplacementCalcul, modele, temporel };
})();
export default Isolation;
