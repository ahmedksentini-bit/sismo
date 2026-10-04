"""tools/obspy/globe.py — modèle de Terre ak135 et références des phases du globe par ObsPy (TauP, licence LGPL,
jamais embarqué).

1. Lit le modèle ak135 livré avec ObsPy (obspy/taup/data/ak135.tvel : profondeur, Vp, Vs, masse volumique) et
   l'écrit dans src/sismo/coefficients/ak135.js (fichier produit, à ne pas modifier à la main).
2. Calcule avec TauPyModel('ak135') les temps de trajet et les paramètres de rai de quelques phases (P, S, PcP,
   ScS, PKP, PKiKP, PKIKP, SKS et les phases de profondeur pP, sP) pour plusieurs profondeurs et distances, et les écrit dans
   tests/references/phases.json : le solveur src/sismo/globe.js doit les retrouver (tests/globe.test.mjs).
3. Écrit les trajets de quelques rais (temps, distance, profondeur le long du rai, get_ray_paths) dans
   tests/references/trajets.json : la position d'un front d'onde au temps t (Globe.trajet, Globe.position) doit les
   retrouver.
"""
import json
import os
import pathlib

import obspy.taup
from obspy.taup import TauPyModel

RACINE = pathlib.Path(__file__).resolve().parents[2]
PHASES = ['P', 'S', 'PcP', 'ScS', 'PKP', 'PKiKP', 'PKIKP', 'SKS', 'pP', 'sP']
PROFONDEURS = [10, 100, 300, 600]
DISTANCES = list(range(10, 181, 10)) + [95, 105, 115, 125, 135, 143, 145, 147, 150, 155]


def modele():
    chemin = os.path.join(os.path.dirname(obspy.taup.__file__), 'data', 'ak135.tvel')
    lignes = open(chemin, encoding='utf-8').read().splitlines()[2:]
    pts = [[float(x) for x in l.split()[:4]] for l in lignes if l.strip()]
    corps = ',\n'.join('  [' + ', '.join(f'{v:g}' for v in p) + ']' for p in pts)
    texte = ("// Fichier produit par tools/obspy/globe.py : ne pas modifier à la main.\n"
             "// Modèle de Terre ak135 (Kennett, Engdahl et Buland 1995), tel que livré avec ObsPy (ak135.tvel) :\n"
             "// [profondeur (km), Vp (km/s), Vs (km/s), masse volumique (g/cm³)], de la surface vers le centre ;\n"
             "// une discontinuité apparaît comme deux lignes à la même profondeur.\n"
             f"const AK135 = [\n{corps},\n];\nexport default AK135;\n")
    (RACINE / 'src' / 'sismo' / 'coefficients' / 'ak135.js').write_text(texte, encoding='utf-8')
    return len(pts)


def references():
    m = TauPyModel('ak135')
    out = []
    for h in PROFONDEURS:
        for d in sorted(set(DISTANCES)):
            for ph in PHASES:
                for a in m.get_travel_times(source_depth_in_km=h, distance_in_degree=d, phase_list=[ph]):
                    out.append({'profondeur': h, 'distance': d, 'phase': a.name, 'temps': a.time,
                                'p': a.ray_param, 'depart': a.takeoff_angle, 'incidence': a.incident_angle})
    (RACINE / 'tests' / 'references' / 'phases.json').write_text(json.dumps({'modele': 'ak135', 'arrivees': out}, indent=1), encoding='utf-8')
    return len(out)


TRAJETS = [('P', 10, 40), ('P', 300, 80), ('PcP', 10, 30), ('PKIKP', 100, 150), ('PKP', 10, 150), ('PKiKP', 10, 120),
           ('S', 10, 60), ('ScS', 100, 40), ('SKS', 10, 100), ('pP', 100, 60), ('sP', 300, 70)]


def trajets():
    m = TauPyModel('ak135')
    out = []
    for ph, h, d in TRAJETS:
        a = m.get_ray_paths(source_depth_in_km=h, distance_in_degree=d, phase_list=[ph])[0]
        pas = max(1, len(a.path) // 40)
        pts = [[float(q['time']), float(q['dist']) * 180 / 3.141592653589793, float(q['depth'])] for q in a.path[::pas]]
        out.append({'phase': ph, 'profondeur': h, 'distance': d, 'p': a.ray_param, 'temps': a.time, 'points': pts})
    (RACINE / 'tests' / 'references' / 'trajets.json').write_text(json.dumps({'modele': 'ak135', 'trajets': out}, indent=1), encoding='utf-8')
    return len(out)


if __name__ == '__main__':
    print('ak135 :', modele(), 'points')
    print('phases :', references(), 'arrivées')
    print('trajets :', trajets(), 'rais')
