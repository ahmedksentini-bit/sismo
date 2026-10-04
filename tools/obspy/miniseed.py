"""tools/obspy/miniseed.py — références du décodeur miniSEED du site (src/sismo/miniseed.js) par ObsPy (licence LGPL,
jamais embarqué) : écrit des enregistrements de 512 octets dans plusieurs codages (Steim 1, Steim 2, entiers de 32 et
16 bits, réels de 32 et 64 bits ; gros-boutiste, et un petit-boutiste) dans tests/references/miniseed/, avec les
échantillons, l'heure de début et la cadence attendus (tests/references/miniseed.json), relus par ObsPy.
"""
import json
import pathlib

import numpy as np
from obspy import Stream, Trace, UTCDateTime, read

DOSSIER = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references' / 'miniseed'
CAS = [
    ('steim2', 'STEIM2', 'int32', '>', 20.0),
    ('steim1', 'STEIM1', 'int32', '>', 20.0),
    ('int32', 'INT32', 'int32', '>', 100.0),
    ('int32le', 'INT32', 'int32', '<', 40.0),
    ('int16', 'INT16', 'int16', '>', 50.0),
    ('float32', 'FLOAT32', 'float32', '>', 1.0),
    ('float64', 'FLOAT64', 'float64', '>', 0.1),
]


def signal(n, dtype, graine):
    rng = np.random.default_rng(graine)
    # marche aléatoire avec quelques grands sauts : toutes les tailles de différences de Steim y passent
    d = rng.normal(0, 30, n)
    d[::37] *= 400
    d[5::53] *= 40000
    x = np.cumsum(d)
    if dtype == 'int16':
        return np.clip(x / 200, -32000, 32000).astype(np.int16)
    if dtype.startswith('float'):
        return (x * 1e-3).astype(dtype)
    return np.clip(x, -2**30, 2**30).astype(np.int32)


def main():
    DOSSIER.mkdir(parents=True, exist_ok=True)
    sortie = []
    for k, (nom, codage, dtype, ordre, cadence) in enumerate(CAS):
        x = signal(1500, dtype, k + 1)
        debut = UTCDateTime(2026, 10, 4, 19, 50, 12, 345600)
        tr = Trace(x, header={'network': 'GE', 'station': 'TEST', 'location': '' if k % 2 else '00', 'channel': 'BHZ',
                              'sampling_rate': cadence, 'starttime': debut})
        chemin = DOSSIER / f'{nom}.mseed'
        Stream([tr]).write(str(chemin), format='MSEED', encoding=codage, reclen=512, byteorder=ordre)
        relu = read(str(chemin))
        enregs = []
        for t in relu:
            enregs.append({'debut': t.stats.starttime.timestamp, 'n': t.stats.npts})
        lu = np.concatenate([t.data for t in relu])
        assert np.array_equal(lu, x), nom
        sortie.append({'fichier': f'miniseed/{nom}.mseed', 'codage': codage, 'ordre': ordre, 'reseau': 'GE', 'station': 'TEST',
                       'emplacement': tr.stats.location, 'voie': 'BHZ', 'cadence': cadence, 'debut': debut.timestamp,
                       'echantillons': [float(v) for v in x], 'taille': chemin.stat().st_size})
    (DOSSIER.parent / 'miniseed.json').write_text(json.dumps({'cas': sortie}), encoding='utf-8')
    print(f'écrit {len(sortie)} fichiers miniSEED et tests/references/miniseed.json')


if __name__ == '__main__':
    main()
