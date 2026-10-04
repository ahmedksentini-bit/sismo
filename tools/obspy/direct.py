"""tools/obspy/direct.py — références des traitements de la page « En direct » (src/sismo/direct.js) : filtres de
Butterworth passe-bande en sections du second ordre (scipy.signal.butter, sosfilt), rapport STA/LTA et déclenchements
(ObsPy : classic_sta_lta, trigger_onset), distances sur la sphère (ObsPy : locations2degrees). Écrit
tests/references/direct.json. ObsPy et scipy ne sont jamais embarqués dans le site.
"""
import json
import pathlib

import numpy as np
from obspy.geodetics import locations2degrees
from obspy.signal.trigger import classic_sta_lta, trigger_onset
from scipy.signal import butter, sosfilt

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references' / 'direct.json'


def g12(v):
    return float(f'{v:.12g}')


def main():
    rng = np.random.default_rng(7)
    x = rng.normal(0, 1, 1600)
    x[900:1100] += 8 * np.sin(2 * np.pi * 1.5 * np.arange(200) / 20) * np.exp(-np.arange(200) / 80)
    filtres = []
    for ordre, fmin, fmax, fs in [(2, 0.5, 2, 20), (4, 1, 10, 100), (2, 1 / 22, 1 / 18, 20), (3, 0.05, 0.2, 20), (2, 0.5, 5, 20)]:
        sos = butter(ordre, [fmin, fmax], btype='band', fs=fs, output='sos')
        filtres.append({'ordre': ordre, 'fmin': fmin, 'fmax': fmax, 'fs': fs, 'sortie': [g12(v) for v in sosfilt(sos, x)]})
    r = classic_sta_lta(x, 20, 200)
    dec = trigger_onset(r, 3.0, 1.5)
    paires = [(36.8, 10.2, 37.5, 15.1), (36.8, 10.2, -33.9, 151.2), (0, 0, 0, 90), (45, -170, -45, 10), (40, 20, 40, 20.5)]
    sortie = {
        'x': [g12(v) for v in x], 'filtres': filtres,
        'stalta': {'nsta': 20, 'nlta': 200, 'r': [g12(v) for v in r], 'on': 3.0, 'off': 1.5, 'declenchements': [[int(a), int(b)] for a, b in dec]},
        'distances': [{'p': list(p), 'degres': float(locations2degrees(*p))} for p in paires],
    }
    REF.write_text(json.dumps(sortie), encoding='utf-8')
    print(f'écrit {REF.name}')


if __name__ == '__main__':
    main()
