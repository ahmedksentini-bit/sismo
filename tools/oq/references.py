"""tools/oq/references.py — valeurs de référence calculées par OpenQuake (hazardlib et HMTK).

Écrit tests/references/*.json, que `npm test` compare aux solveurs du site :
- gmpe_akkar2014.json, gmpe_bindi2014.json : médianes et écarts types d'AkkarEtAlRjb2014 et de
  BindiEtAl2014Rjb sur une grille (M, Rjb, Vs30, style, période) ;
- hmtk.json : déclusterage de Gardner et Knopoff et estimateur de Weichert sur tests/references/catalogue.csv ;
- geodesie.json : invariants des taux de déformation (GeodeticStrain d'HMTK) ; taux de moment d'une
  Gutenberg-Richter tronquée et valeur a qui équilibre un taux de moment (TruncatedGRMFD de hazardlib).
Prérequis : openquake.engine installé (voir README) ; le catalogue est produit par exporter-catalogue.mjs.
"""
import csv
import json
import pathlib

import numpy as np
from openquake.hazardlib import contexts, imt as IMT
from openquake.hazardlib.gsim.akkar_2014 import AkkarEtAlRjb2014
from openquake.hazardlib.gsim.bindi_2014 import BindiEtAl2014Rjb
from openquake.hmtk.seismicity.catalogue import Catalogue
from openquake.hmtk.seismicity.declusterer.dec_gardner_knopoff import GardnerKnopoffType1
from openquake.hmtk.seismicity.declusterer.distance_time_windows import GardnerKnopoffWindow
from openquake.hmtk.seismicity.occurrence.weichert import Weichert
from openquake.hmtk.strain.geodetic_strain import GeodeticStrain
from openquake.hazardlib.mfd import TruncatedGRMFD
import openquake.engine

RACINE = pathlib.Path(__file__).resolve().parents[2]
REF = RACINE / 'tests' / 'references'
COMPLETUDE = [[1990, 3.0], [1964, 4.0], [1930, 5.0], [1900, 6.0]]


def gmpe(classe=AkkarEtAlRjb2014, imts=('PGA', 'PGV', 0.01, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0)):
    g = classe()
    imts = list(imts)
    grille = [(M, R, v, rake) for M in (4.0, 5.0, 6.0, 6.75, 7.0, 8.0) for R in (0.0, 1.0, 5.0, 10.0, 30.0, 100.0, 200.0)
              for v in (200.0, 400.0, 750.0, 900.0, 1100.0) for rake in (0.0, -90.0, 90.0)]
    ctx = contexts.RuptureContext()
    ctx.mag = np.array([c[0] for c in grille]); ctx.rjb = np.array([c[1] for c in grille])
    ctx.vs30 = np.array([c[2] for c in grille]); ctx.rake = np.array([c[3] for c in grille])
    ctx.sids = np.arange(len(grille))
    objets = [IMT.PGA() if i == 'PGA' else IMT.PGV() if i == 'PGV' else IMT.SA(i) for i in imts]
    res = contexts.get_mean_stds(g, ctx, objets)  # [moyenne, σ, τ, φ] × imt × cas
    cas = []
    for k, (M, R, v, rake) in enumerate(grille):
        cas.append({'M': M, 'Rjb': R, 'vs30': v, 'rake': rake,
                    'ln': [round(float(res[0, j, k]), 10) for j in range(len(imts))],
                    'sigma': [round(float(res[1, j, k]), 10) for j in range(len(imts))]})
    return {'gsim': classe.__name__, 'imts': imts, 'cas': cas}


def lire_catalogue():
    with open(REF / 'catalogue.csv', newline='', encoding='utf-8') as f:
        lignes = list(csv.DictReader(f))
    col = lambda k, t=float: np.array([t(r[k]) for r in lignes])
    return {'eventID': col('id', int), 'year': col('annee', int), 'month': col('mois', int), 'day': col('jour', int),
            'hour': np.zeros(len(lignes), int), 'minute': np.zeros(len(lignes), int), 'second': np.zeros(len(lignes)),
            'longitude': col('longitude'), 'latitude': col('latitude'), 'depth': np.full(len(lignes), 10.0),
            'magnitude': col('magnitude'), 'dtime': col('dtime')}


def hmtk():
    d = lire_catalogue()
    cat = Catalogue.make_from_dict({k: v for k, v in d.items() if k != 'dtime'})
    amas, drapeau = GardnerKnopoffType1().decluster(cat, {'time_distance_window': GardnerKnopoffWindow(), 'fs_time_prop': 0.0})
    garde = drapeau == 0
    sous = {k: v[garde] for k, v in d.items()}
    cat2 = Catalogue.make_from_dict({k: v for k, v in sous.items() if k != 'dtime'})
    cat2.data['dtime'] = sous['dtime']
    cat2.end_year = int(np.max(d['year']))
    config = {'magnitude_interval': 0.1, 'reference_magnitude': 4.0, 'bvalue': 1.0, 'itstab': 1e-5, 'maxiter': 1000}
    b, sb, taux, staux, agr, sagr = Weichert()._calculate(cat2, config, np.array(COMPLETUDE, dtype=float))
    return {
        'gk': {'n': int(len(drapeau)), 'drapeau': [int(x) for x in drapeau], 'amas': int(np.max(amas))},
        'weichert': {'completude': COMPLETUDE, 'dm': 0.1, 'mref': 4.0, 'anneeFin': int(np.max(d['year'])),
                     'b': float(b), 'sigma_b': float(sb), 'taux_mref': float(taux), 'agr': float(agr)},
    }


def geodesie():
    rng = np.random.default_rng(2024)
    # Tenseurs en ns/an : cas particuliers (raccourcissement E–O, cisaillement pur, isotrope) et tirages
    t = np.array([[-20.0, 0.0, 0.0], [0.0, 0.0, -1.5], [5.0, 5.0, 0.0], [-3.0, 8.0, 4.0]] + rng.normal(0, 15, (40, 3)).tolist())
    g = GeodeticStrain()
    g.get_secondary_strain_data({'longitude': np.zeros(len(t)), 'latitude': np.zeros(len(t)),
                                 'exx': t[:, 0], 'eyy': t[:, 1], 'exy': t[:, 2]})
    deformations = [{'exx': float(e[0]), 'eyy': float(e[1]), 'exy': float(e[2]),
                     **{k: float(g.data[k][i]) for k in ('2nd_inv', 'dilatation', 'err', 'e1h', 'e2h')}} for i, e in enumerate(t)]
    lois = []
    for a, b, mmin, mmax in [(3.4, 1.0, 4.0, 6.5), (3.68, 0.9, 4.0, 7.3), (4.2, 0.75, 4.5, 8.0), (2.5, 1.5, 4.0, 6.0), (3.0, 1.2, 5.0, 7.6)]:
        mfd = TruncatedGRMFD(mmin, mmax, 0.1, a, b)
        tmr = mfd._get_total_moment_rate()
        cible = 1.0e17
        mfd._set_a(cible)
        lois.append({'a': a, 'b': b, 'mmin': mmin, 'mmax': mmax, 'moment': tmr, 'momentCible': cible, 'aCible': mfd.a_val})
    return {'deformations': deformations, 'lois': lois}


def main():
    entete = {'outil': f'OpenQuake {openquake.engine.__version__}'}
    (REF / 'gmpe_akkar2014.json').write_text(json.dumps({**entete, **gmpe()}, ensure_ascii=False), encoding='utf-8')
    (REF / 'gmpe_bindi2014.json').write_text(json.dumps({**entete, **gmpe(BindiEtAl2014Rjb, ('PGA', 'PGV', 0.02, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0))}, ensure_ascii=False), encoding='utf-8')
    (REF / 'hmtk.json').write_text(json.dumps({**entete, **hmtk()}, ensure_ascii=False), encoding='utf-8')
    (REF / 'geodesie.json').write_text(json.dumps({**entete, **geodesie()}, ensure_ascii=False), encoding='utf-8')
    print('écrit tests/references/gmpe_akkar2014.json, gmpe_bindi2014.json, hmtk.json et geodesie.json')


if __name__ == '__main__':
    main()
