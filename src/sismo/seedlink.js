// src/sismo/seedlink.js — protocole SeedLink 3 (serveurs temps réel des réseaux sismologiques, port 18000) : commandes
// de la poignée de main (STATION, SELECT, TIME ou DATA, END), lecture des réponses ligne à ligne, découpage du flux en
// paquets « SL » + numéro de séquence (6 chiffres hexadécimaux) + enregistrement miniSEED (512 octets en général,
// longueur lue dans la blockette 1000). Validation des demandes reçues par le relais (functions/api/seedlink.js) :
// flux bien formés, au plus 12, reprise au plus 30 minutes en arrière. Partagé par le relais et la page « En direct ».
// Solveurs purs, sans accès au DOM ni au réseau.
const SeedLink = (() => {
  'use strict';
  const MAX_FLUX = 12, RETOUR_MAX = 30 * 60 * 1000;
  const MOTIF = /^([A-Z0-9]{1,2})\.([A-Z0-9]{1,5})\.([A-Z0-9]{0,2})\.([BHESL][HNL][ZNE12])$/;

  // « GE.TNTN..BHZ,GE.ISP..BHZ » → [{ reseau, station, emplacement, voie }], ou null si un flux est mal formé.
  function lireFlux(chaine) {
    if (typeof chaine !== 'string' || !chaine.length || chaine.length > 400) return null;
    const out = [];
    for (const f of chaine.split(',')) {
      const m = MOTIF.exec(f.trim().toUpperCase());
      if (!m) return null;
      out.push({ reseau: m[1], station: m[2], emplacement: m[3], voie: m[4] });
    }
    return out.length && out.length <= MAX_FLUX ? out : null;
  }
  const versFlux = l => l.map(f => `${f.reseau}.${f.station}.${f.emplacement || ''}.${f.voie}`).join(',');

  // Heure de reprise : au plus 30 minutes avant maintenant, jamais dans le futur ; null si absente ou illisible.
  function lireDepuis(iso, maintenant = Date.now()) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return Math.min(maintenant, Math.max(maintenant - RETOUR_MAX, t));
  }
  const deux = n => String(n).padStart(2, '0');
  const temps = ms => { const d = new Date(ms); return `${d.getUTCFullYear()},${deux(d.getUTCMonth() + 1)},${deux(d.getUTCDate())},${deux(d.getUTCHours())},${deux(d.getUTCMinutes())},${deux(d.getUTCSeconds())}`; };

  // Commandes de la poignée de main, regroupées par station : STATION, un SELECT par voie (« BHZ.D » sans emplacement,
  // qui vaut pour tous ; « ??BHZ.D » ne trouve pas l'emplacement vide sur tous les serveurs), TIME (reprise) ou DATA
  // (temps réel seul), puis END qui lance le flux.
  function commandes(flux, depuis = null) {
    const parStation = new Map();
    for (const f of flux) {
      const cle = `${f.reseau}.${f.station}`;
      if (!parStation.has(cle)) parStation.set(cle, { reseau: f.reseau, station: f.station, selections: [] });
      parStation.get(cle).selections.push(`${f.emplacement || ''}${f.voie}.D`);
    }
    const out = [];
    for (const s of parStation.values()) {
      out.push({ ligne: `STATION ${s.station} ${s.reseau}`, reponse: true, station: `${s.reseau}.${s.station}` });
      for (const sel of s.selections) out.push({ ligne: `SELECT ${sel}`, reponse: true, station: `${s.reseau}.${s.station}` });
      out.push({ ligne: depuis ? `TIME ${temps(depuis)}` : 'DATA', reponse: true, station: `${s.reseau}.${s.station}` });
    }
    out.push({ ligne: 'END', reponse: false });
    return out;
  }

  // Lecteur de lignes (réponses « OK », « ERROR », bannière de HELLO) sur un flux d'octets.
  function lecteurLignes() {
    let reste = '';
    return {
      pousser(octets) {
        for (const b of octets) reste += String.fromCharCode(b);
        const lignes = [];
        let i;
        while ((i = reste.indexOf('\r\n')) >= 0) { lignes.push(reste.slice(0, i)); reste = reste.slice(i + 2); }
        return lignes;
      },
    };
  }

  // Découpe un flux d'octets en paquets SeedLink. Chaque paquet : { sequence (entier, ou null pour SLINFO), info,
  // enregistrement (Uint8Array) }. Les octets incomplets attendent le morceau suivant.
  function decoupeur() {
    let tampon = new Uint8Array(0);
    const ajouter = o => { const t = new Uint8Array(tampon.length + o.length); t.set(tampon); t.set(o, tampon.length); tampon = t; };
    // longueur de l'enregistrement miniSEED qui commence en i : 2^n de la blockette 1000 (512 par défaut)
    const longueur = i => {
      if (tampon.length < i + 48) return null;
      const v = new DataView(tampon.buffer, tampon.byteOffset + i);
      const an = v.getUint16(20, false), petit = an < 1900 || an > 2500;
      let b = v.getUint16(46, petit), garde = 0;
      while (b >= 48 && garde++ < 8) {
        if (tampon.length < i + b + 8) return null;
        if (v.getUint16(b, petit) === 1000) return 2 ** tampon[i + b + 6];
        const s = v.getUint16(b + 2, petit);
        if (!s || s <= b) break;
        b = s;
      }
      return 512;
    };
    return {
      pousser(octets) {
        ajouter(octets);
        const paquets = [];
        for (;;) {
          if (tampon.length < 8) break;
          if (tampon[0] !== 83 || tampon[1] !== 76) {
            // resynchronisation : on cherche le prochain « SL »
            let j = 1;
            while (j + 1 < tampon.length && !(tampon[j] === 83 && tampon[j + 1] === 76)) j++;
            tampon = tampon.slice(j);
            continue;
          }
          const tete = String.fromCharCode(...tampon.slice(0, 8)), info = tete.startsWith('SLINFO');
          const L = longueur(8);
          if (L === null || tampon.length < 8 + L) break;
          paquets.push({ sequence: info ? null : parseInt(tete.slice(2), 16), info, enregistrement: tampon.slice(8, 8 + L) });
          tampon = tampon.slice(8 + L);
        }
        return paquets;
      },
      reste: () => tampon.length,
    };
  }

  // Identifiant « RÉSEAU.STATION.EMPLACEMENT.VOIE » d'un enregistrement miniSEED, lu dans l'en-tête fixe (octets 8 à 19)
  // sans décoder les données : le relais ne transmet que les voies demandées.
  function identifiant(enr) {
    if (!enr || enr.length < 20) return null;
    const t = (a, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(enr[a + i]); return s.trim(); };
    return `${t(18, 2)}.${t(8, 5)}.${t(13, 2)}.${t(15, 3)}`;
  }

  // Paquet SeedLink à partir d'un enregistrement (serveur d'essai et tests).
  function paquet(sequence, enregistrement) {
    const tete = `SL${sequence.toString(16).toUpperCase().padStart(6, '0')}`, out = new Uint8Array(8 + enregistrement.length);
    for (let i = 0; i < 8; i++) out[i] = tete.charCodeAt(i);
    out.set(enregistrement, 8);
    return out;
  }

  return { MAX_FLUX, RETOUR_MAX, lireFlux, versFlux, lireDepuis, temps, commandes, lecteurLignes, decoupeur, identifiant, paquet };
})();
export default SeedLink;
