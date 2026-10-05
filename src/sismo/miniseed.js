// src/sismo/miniseed.js — décodage des enregistrements miniSEED 2 (SEED 2.4) reçus des centres de données (FDSN
// dataselect) ou du flux SeedLink : en-tête fixe de 48 octets, blockettes 1000 (codage, ordre des octets, longueur)
// et 1001 (microsecondes), données en Steim 1, Steim 2, entiers de 16 ou 32 bits, réels de 32 ou 64 bits. Vérifié
// contre ObsPy (tests/references/miniseed.json, tools/obspy/miniseed.py). Solveurs purs, sans accès au DOM.
const MiniSeed = (() => {
  'use strict';
  const CODAGES = { 1: 'INT16', 3: 'INT32', 4: 'FLOAT32', 5: 'FLOAT64', 10: 'STEIM1', 11: 'STEIM2' };
  const texte = (o, a, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(o[a + i]); return s.trim(); };

  // Cadence (Hz) à partir du facteur et du multiplicateur de l'en-tête (SEED 2.4, § 8).
  function cadence(f, m) {
    if (f === 0 || m === 0) return 0;
    if (f > 0 && m > 0) return f * m;
    if (f > 0 && m < 0) return -f / m;
    if (f < 0 && m > 0) return -m / f;
    return 1 / (f * m);
  }

  // Décodage de Steim 1 ou 2 : trames de 64 octets (16 mots de 32 bits), mot 0 = codes de 2 bits des 16 mots ; dans
  // la première trame, mots 1 et 2 = premier et dernier échantillons (constantes d'intégration). Les différences
  // reconstruisent les échantillons à partir du premier ; le dernier sert de contrôle.
  function steim(vue, debut, fin, n, petit, version) {
    const diffs = [];
    let x0 = null, xn = null;
    for (let trame = debut; trame + 64 <= fin && diffs.length < n + 1; trame += 64) {
      const codes = vue.getUint32(trame, petit);
      for (let w = 1; w < 16; w++) {
        const c = (codes >>> (30 - 2 * w)) & 3, o = trame + 4 * w, mot = vue.getUint32(o, petit);
        if (trame === debut && w === 1) { x0 = vue.getInt32(o, petit); continue; }
        if (trame === debut && w === 2) { xn = vue.getInt32(o, petit); continue; }
        if (c === 0) continue;
        if (c === 1) { for (let k = 0; k < 4; k++) diffs.push(vue.getInt8(o + k)); continue; }
        if (version === 1) {
          if (c === 2) { diffs.push(vue.getInt16(o, petit), vue.getInt16(o + 2, petit)); continue; }
          diffs.push(vue.getInt32(o, petit));
          continue;
        }
        // Steim 2 : le sous-code (2 bits de poids fort du mot) donne le nombre et la taille des différences
        const dnib = mot >>> 30;
        const champs = c === 2 ? { 1: [1, 30], 2: [2, 15], 3: [3, 10] }[dnib] : { 0: [5, 6], 1: [6, 5], 2: [7, 4] }[dnib];
        if (!champs) continue;
        const [nb, bits] = champs;
        for (let k = nb - 1; k >= 0; k--) {
          let v = (mot >>> (k * bits)) & ((1 << bits) - 1);
          if (v & (1 << (bits - 1))) v -= 1 << bits; // complément à deux
          diffs.push(v);
        }
      }
    }
    const out = new Float64Array(n);
    if (!n) return { echantillons: out, controle: true };
    out[0] = x0;
    for (let i = 1; i < n; i++) out[i] = out[i - 1] + diffs[i];
    return { echantillons: out, controle: out[n - 1] === xn };
  }

  // Un enregistrement à partir de l'octet `debut` d'un ArrayBuffer (ou d'une vue Uint8Array). Renvoie l'identifiant,
  // l'heure du premier échantillon (ms depuis 1970, UTC), la cadence, les échantillons et la longueur de
  // l'enregistrement (pour passer au suivant) ; null si ce n'est pas un enregistrement de données. sansDonnees : en-tête
  // seul (nombre d'échantillons n, heure qui suit le dernier, fin), sans décoder les échantillons.
  function enregistrement(tampon, debut = 0, { sansDonnees = false } = {}) {
    const octets = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon);
    const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    if (octets.length - debut < 48) return null;
    const qualite = String.fromCharCode(octets[debut + 6]);
    if (!'DRQM'.includes(qualite)) return null;
    // ordre des octets de l'en-tête : l'année doit être plausible
    let petit = false;
    const an = vue.getUint16(debut + 20, false);
    if (an < 1900 || an > 2500) petit = true;
    const h = {
      station: texte(octets, debut + 8, 5), emplacement: texte(octets, debut + 13, 2), voie: texte(octets, debut + 15, 3), reseau: texte(octets, debut + 18, 2),
      annee: vue.getUint16(debut + 20, petit), jour: vue.getUint16(debut + 22, petit), heure: octets[debut + 24], minute: octets[debut + 25],
      seconde: octets[debut + 26], dixMillieme: vue.getUint16(debut + 28, petit), n: vue.getUint16(debut + 30, petit),
      facteur: vue.getInt16(debut + 32, petit), multiplicateur: vue.getInt16(debut + 34, petit), activite: octets[debut + 36],
      nbBlockettes: octets[debut + 39], correction: vue.getInt32(debut + 40, petit), donnees: vue.getUint16(debut + 44, petit), blockette: vue.getUint16(debut + 46, petit),
    };
    let codage = null, ordreDonnees = !petit, longueur = 512, micro = 0, b = h.blockette, garde = 0;
    while (b && b >= 48 && debut + b + 4 <= octets.length && garde++ < 16) {
      const type = vue.getUint16(debut + b, petit), suivante = vue.getUint16(debut + b + 2, petit);
      if (type === 1000) { codage = octets[debut + b + 4]; ordreDonnees = octets[debut + b + 5] === 1; longueur = 2 ** octets[debut + b + 6]; }
      else if (type === 1001) micro = vue.getInt8(debut + b + 5);
      if (!suivante || suivante <= b) break;
      b = suivante;
    }
    // heure du premier échantillon : jour julien → date, plus la correction si elle n'est pas déjà appliquée (bit 1)
    let t = Date.UTC(h.annee, 0, 1, h.heure, h.minute, h.seconde) + (h.jour - 1) * 86400000 + h.dixMillieme / 10 + micro / 1000;
    if (!(h.activite & 2)) t += h.correction / 10;
    const fs = cadence(h.facteur, h.multiplicateur), o = debut + h.donnees, fin = debut + Math.min(longueur, octets.length - debut);
    if (sansDonnees) return { ...entete(h), debut: t, cadence: fs, codage: CODAGES[codage] || codage, longueur, n: h.n, fin: fs > 0 ? t + (h.n * 1000) / fs : t };
    const p = !ordreDonnees;
    let ech = new Float64Array(0), controle = true;
    if (h.n && codage !== null) {
      if (codage === 10 || codage === 11) ({ echantillons: ech, controle } = steim(vue, o, fin, h.n, p, codage === 10 ? 1 : 2));
      else {
        const taille = { 1: 2, 3: 4, 4: 4, 5: 8 }[codage];
        if (!taille) return { ...entete(h), debut: t, cadence: fs, codage: CODAGES[codage] || codage, echantillons: ech, longueur, controle: false, inconnu: true };
        ech = new Float64Array(h.n);
        for (let i = 0; i < h.n && o + (i + 1) * taille <= fin; i++) {
          const a = o + i * taille;
          ech[i] = codage === 1 ? vue.getInt16(a, p) : codage === 3 ? vue.getInt32(a, p) : codage === 4 ? vue.getFloat32(a, p) : vue.getFloat64(a, p);
        }
      }
    }
    return { ...entete(h), debut: t, cadence: fs, codage: CODAGES[codage] || codage, echantillons: ech, longueur, controle };
  }
  const entete = h => ({ reseau: h.reseau, station: h.station, emplacement: h.emplacement, voie: h.voie, id: `${h.reseau}.${h.station}.${h.emplacement}.${h.voie}` });

  // Tous les enregistrements d'un fichier (réponse FDSN dataselect : enregistrements bout à bout). Chacun garde ses
  // octets d'origine (brut, une vue sur le tampon), pour être réécrit tel quel (fichier d'un séisme).
  function lire(tampon) {
    const octets = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon), out = [];
    let i = 0;
    while (i + 48 <= octets.length) {
      const e = enregistrement(octets, i);
      if (!e) { i += 512; continue; }
      e.brut = octets.subarray(i, Math.min(octets.length, i + e.longueur));
      out.push(e);
      i += e.longueur;
    }
    return out;
  }

  // Résumé d'une réponse dataselect, en-têtes seuls (relais du site, présence de données des stations) : pour chaque voie,
  // heure du premier échantillon, heure qui suit le dernier et nombre d'échantillons.
  function resumer(tampon) {
    const octets = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon), voies = {};
    let i = 0;
    while (i + 48 <= octets.length) {
      const e = enregistrement(octets, i, { sansDonnees: true });
      if (!e) { i += 512; continue; }
      const v = voies[e.id] || (voies[e.id] = { debut: e.debut, fin: e.fin, n: 0 });
      v.debut = Math.min(v.debut, e.debut); v.fin = Math.max(v.fin, e.fin); v.n += e.n;
      i += e.longueur;
    }
    return { voies };
  }

  return { cadence, enregistrement, lire, resumer, CODAGES };
})();
export default MiniSeed;
