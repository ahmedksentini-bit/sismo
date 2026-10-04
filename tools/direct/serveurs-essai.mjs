// tools/direct/serveurs-essai.mjs — serveurs d'essai des fonctions de la page « En direct », sans réseau : un serveur
// SeedLink (TCP, port 18000) qui répond à la poignée de main puis envoie en boucle les enregistrements de
// tests/references/miniseed/steim2.mseed, et un serveur FDSN (HTTP, port 8090) qui renvoie des voies, des séismes et ces
// mêmes enregistrements. Usage : node tools/direct/serveurs-essai.mjs, puis
//   npx wrangler pages dev . --binding SEEDLINK_SERVEUR=127.0.0.1:18000 --binding GEOFON_FDSN=http://127.0.0.1:8090
import net from 'node:net';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import SeedLink from '../../src/sismo/seedlink.js';

const mseed = readFileSync(new URL('../../tests/references/miniseed/steim2.mseed', import.meta.url));
const enregs = [];
for (let i = 0; i + 512 <= mseed.length; i += 512) enregs.push(new Uint8Array(mseed.subarray(i, i + 512)));
const PORT_SL = +(process.env.PORT_SL || 18000), PORT_FDSN = +(process.env.PORT_FDSN || 8090);

net.createServer(sock => {
  let tampon = '', seq = 0, minuteur = null;
  sock.on('data', d => {
    tampon += d.toString('latin1');
    let i;
    while ((i = tampon.indexOf('\r\n')) >= 0) {
      const l = tampon.slice(0, i); tampon = tampon.slice(i + 2);
      if (l === 'HELLO') sock.write('SeedLink v3.1 (essai)\r\nServeur d\'essai\r\n');
      else if (l.startsWith('STATION')) sock.write(l.includes('NOPE') ? 'ERROR\r\n' : 'OK\r\n');
      else if (/^(SELECT|TIME|DATA)/.test(l)) sock.write('OK\r\n');
      else if (l === 'END') minuteur = setInterval(() => { sock.write(SeedLink.paquet(seq, enregs[seq % enregs.length])); seq++; }, 100);
    }
  });
  sock.on('close', () => clearInterval(minuteur));
  sock.on('error', () => clearInterval(minuteur));
}).listen(PORT_SL, '127.0.0.1');

const VOIES = `#Network | Station | Location | Channel | Latitude | Longitude | Elevation | Depth | Azimuth | Dip | SensorDescription | Scale | ScaleFreq | ScaleUnits | SampleRate | StartTime | EndTime
GE|TEST|00|BHZ|36.8|10.2|100.0|0.0|0.0|-90.0|essai|6.0E8|1.0|M/S|20.0|2010-01-01T00:00:00|
GE|ESSAI||BHZ|38.0|23.7|80.0|0.0|0.0|-90.0|essai|6.0E8|1.0|M/S|20.0|2010-01-01T00:00:00|
`;
const SEISMES = `#EventID | Time | Latitude | Longitude | Depth/km | Author | Catalog | Contributor | ContributorID | MagType | Magnitude | MagAuthor | EventLocationName
essai1|${new Date(Date.now() - 600000).toISOString().slice(0, 19)}|35.1|23.4|18.0|GFZ|GEOFON|GFZ|essai1|mb|4.6|GFZ|Séisme d'essai
`;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.includes('/station/')) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(VOIES); }
  else if (u.pathname.includes('/event/')) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(SEISMES); }
  else if (u.pathname.includes('/dataselect/')) { res.writeHead(200, { 'Content-Type': 'application/vnd.fdsn.mseed' }); res.end(mseed); }
  else { res.writeHead(404); res.end(); }
}).listen(PORT_FDSN, '127.0.0.1');
console.log(`SeedLink d'essai sur 127.0.0.1:${PORT_SL}, FDSN d'essai sur http://127.0.0.1:${PORT_FDSN}`);
