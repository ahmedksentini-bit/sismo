// tools/direct/serveurs-essai.mjs — serveurs d'essai des fonctions de la page « En direct », sans réseau : un serveur
// SeedLink (TCP, port 18000) qui répond à la poignée de main puis envoie, pour chaque station acceptée, les enregistrements
// de tests/references/miniseed/steim2.mseed réétiquetés (réseau, station, voie) et redatés à partir de 5 minutes avant
// la connexion ; il refuse les stations du réseau IV et la station NOPE, pour essayer le repli vers le service FDSN. Un
// serveur FDSN (HTTP, port 8090) sert, sous /<centre>/fdsnws/…, des voies et des réseaux propres à chaque centre (GEOFON,
// INGV, et un réseau tunisien fictif chez EarthScope), des séismes et des enregistrements redatés ; PANNE_GEOFON=lent ou
// panne simule un GEOFON lent (inventaire complet en 40 s) ou en panne.
// Usage : node tools/direct/serveurs-essai.mjs, puis
//   npx wrangler pages dev . --binding SEEDLINK_SERVEUR=127.0.0.1:18000 --binding FDSN_ESSAI=http://127.0.0.1:8090/{centre}
import net from 'node:net';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import SeedLink from '../../src/sismo/seedlink.js';
import MiniSeed from '../../src/sismo/miniseed.js';

const mseed = readFileSync(new URL('../../tests/references/miniseed/steim2.mseed', import.meta.url));
const enregs = [];
for (let i = 0; i + 512 <= mseed.length; i += 512) enregs.push(new Uint8Array(mseed.subarray(i, i + 512)));
const PORT_SL = +(process.env.PORT_SL || 18000), PORT_FDSN = +(process.env.PORT_FDSN || 8090), PANNE = process.env.PANNE_GEOFON || '';

// Copie d'un enregistrement avec un autre identifiant et une autre heure de début (en-tête fixe du SEED 2.4).
function etiqueter(enr, { reseau, station, emplacement, voie }, t) {
  const o = enr.slice(), v = new DataView(o.buffer), champ = (a, n, txt) => { for (let i = 0; i < n; i++) o[a + i] = (txt.charCodeAt(i) || 32); };
  champ(8, 5, station.padEnd(5)); champ(13, 2, (emplacement || '').padEnd(2)); champ(15, 3, voie); champ(18, 2, reseau.padEnd(2));
  const d = new Date(t), jour = Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  v.setUint16(20, d.getUTCFullYear()); v.setUint16(22, jour); o[24] = d.getUTCHours(); o[25] = d.getUTCMinutes(); o[26] = d.getUTCSeconds();
  v.setUint16(28, Math.round((t % 1000) * 10));
  return o;
}
const duree = enregs.map(e => { const m = MiniSeed.enregistrement(e); return (m.echantillons.length / m.cadence) * 1000; });

net.createServer(sock => {
  let tampon = '', seq = 0, minuteur = null, courante = null;
  const stations = [];
  sock.on('data', d => {
    tampon += d.toString('latin1');
    let i;
    while ((i = tampon.indexOf('\r\n')) >= 0) {
      const l = tampon.slice(0, i); tampon = tampon.slice(i + 2);
      if (l === 'HELLO') sock.write('SeedLink v3.1 (essai)\r\nServeur d\'essai\r\n');
      else if (l.startsWith('STATION')) {
        const [, sta, res] = l.split(' ');
        if (sta === 'NOPE' || res === 'IV') { courante = null; sock.write('ERROR\r\n'); }
        else { courante = { reseau: res, station: sta, emplacement: '', voie: 'BHZ' }; stations.push(courante); sock.write('OK\r\n'); }
      } else if (l.startsWith('SELECT')) {
        const m = /^SELECT (\??\??|[A-Z0-9]{0,2})([A-Z0-9]{3})\.D$/.exec(l);
        if (courante && m) { courante.emplacement = /\?/.test(m[1]) ? '' : m[1]; courante.voie = m[2]; }
        sock.write('OK\r\n');
      } else if (/^(TIME|DATA)/.test(l)) sock.write('OK\r\n');
      else if (l === 'END') {
        const t0 = Date.now() - 5 * 60000, curseurs = stations.map(() => ({ t: t0, k: 0 }));
        minuteur = setInterval(() => {
          stations.forEach((s, j) => {
            const c = curseurs[j];
            while (c.t + duree[c.k % enregs.length] < Date.now()) {
              sock.write(SeedLink.paquet(seq++, etiqueter(enregs[c.k % enregs.length], s, c.t)));
              c.t += duree[c.k % enregs.length]; c.k++;
            }
          });
        }, 200);
      }
    }
  });
  sock.on('close', () => clearInterval(minuteur));
  sock.on('error', () => clearInterval(minuteur));
}).listen(PORT_SL, '127.0.0.1');

const ENTETE = '#Network | Station | Location | Channel | Latitude | Longitude | Elevation | Depth | Azimuth | Dip | SensorDescription | Scale | ScaleFreq | ScaleUnits | SampleRate | StartTime | EndTime';
const voie = (r, s, lat, lon) => `${r}|${s}||BHZ|${lat}|${lon}|100.0|0.0|0.0|-90.0|essai|6.0E8|1.0|M/S|20.0|2010-01-01T00:00:00|`;
const CENTRES = {
  geofon: { voies: [voie('GE', 'MTE', 40.4, -7.5), voie('GE', 'ESSAI', 38.0, 23.7)], reseaux: ['GE|GEOFON (essai)|1993-01-01T00:00:00||2'] },
  ingv: { voies: [voie('IV', 'LPEL', 35.5, 12.6), voie('IV', 'ROMA', 41.9, 12.5)], reseaux: ['IV|Réseau italien (essai) https://doi.org/10.13127/SD/X0FXNH7QFY_IDENTIFIANT_TRES_LONG_SANS_ESPACE_POUR_ESSAYER_LE_DEBORDEMENT|1988-01-01T00:00:00||2'] },
  earthscope: { voies: [voie('TT', 'TUNI', 36.8, 10.2), voie('GE', 'MTE', 40.4, -7.5)], reseaux: ['TT|Réseau tunisien fictif (essai)|2010-01-01T00:00:00||1', 'GE|GEOFON|1993-01-01T00:00:00||1'] },
};
const SEISMES = `#EventID | Time | Latitude | Longitude | Depth/km | Author | Catalog | Contributor | ContributorID | MagType | Magnitude | MagAuthor | EventLocationName
essai1|${new Date(Date.now() - 600000).toISOString().slice(0, 19)}|35.1|23.4|18.0|GFZ|GEOFON|GFZ|essai1|mb|4.6|GFZ|Séisme d'essai
`;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), centre = u.pathname.split('/')[1], c = CENTRES[centre], q = u.searchParams;
  const texte = t => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(t); };
  if (u.pathname.includes('/station/')) {
    // PANNE_GEOFON=lent : GEOFON met 40 s à répondre sans nom de réseau ; =panne : GEOFON répond 500 à tout
    if (centre === 'geofon' && PANNE === 'panne') { res.writeHead(500); res.end('panne d\'essai'); return; }
    if (centre === 'geofon' && PANNE === 'lent' && !q.get('network')) { setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(`${ENTETE}\n${c.voies.join('\n')}\n`); }, 40000); return; }
    if (!c) { res.writeHead(204); res.end(); return; }
    if (q.get('level') === 'network') texte(`#Network | Description | StartTime | EndTime | TotalStations\n${c.reseaux.join('\n')}\n`);
    else texte(`${ENTETE}\n${c.voies.join('\n')}\n`);
  } else if (u.pathname.includes('/event/')) texte(SEISMES);
  else if (u.pathname.includes('/dataselect/')) {
    // enregistrements de chaque station demandée, de starttime à endtime
    const t0 = Date.parse(q.get('starttime') + 'Z'), t1 = Date.parse(q.get('endtime') + 'Z'), out = [];
    for (const sta of q.get('station').split(',')) for (const r of q.get('network').split(',')) {
      if (!c || !c.voies.some(l => l.startsWith(`${r}|${sta}|`))) continue;
      for (let t = t0, k = 0; t + duree[k % enregs.length] < t1; t += duree[k % enregs.length], k++) out.push(etiqueter(enregs[k % enregs.length], { reseau: r, station: sta, emplacement: '', voie: q.get('channel').split(',')[0] }, t));
    }
    if (!out.length) { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/vnd.fdsn.mseed' }); res.end(Buffer.concat(out.map(o => Buffer.from(o))));
  } else { res.writeHead(404); res.end(); }
}).listen(PORT_FDSN, '127.0.0.1');
console.log(`SeedLink d'essai sur 127.0.0.1:${PORT_SL}, FDSN d'essai sur http://127.0.0.1:${PORT_FDSN}/<centre>`);
