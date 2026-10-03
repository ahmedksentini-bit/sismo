"""tools/oq/psha.py — calcul de référence du moteur PSHA par OpenQuake (calculateurs « classical » et
« disaggregation »).

Lit tests/references/modele_psha.json (écrit par exporter-modele.mjs : points des zones, variantes du
modèle de taux, branches de l'arbre), le traduit en NRML, fait tourner le moteur et écrit
tests/references/psha.json : courbes d'aléa de chaque réalisation, moyenne et fractiles, spectre à
probabilité uniforme, désagrégation magnitude-distance.

Traduction du modèle :
- chaque zone devient une multiPointSource (PointMSR : rupture de 10 m × 10 m, donc Rjb égale à la
  distance épicentrale) dont chaque point porte la part 1/n du taux : a_point = a_zone − log10(n) ;
- variantes « catalogue » : a et b donnés, inchangés quand Mmax varie ; variantes « géodésie » : a
  calculé par OpenQuake (TruncatedGRMFD._set_a) pour libérer le taux de moment χ·Ṁ0 avec le Mmax de
  la branche ;
- chaque combinaison variante × ΔMmax est un fichier de sources, branche d'un branchset
  « sourceModel » : les incertitudes abGRAbsolute ne s'appliquent qu'à une source, et sur une
  multiPointSource deux modifications successives s'écrasent (MultiMFD.modify ne les empile pas) ;
- l'arbre des lois d'atténuation est un branchset gmpeModel ordinaire.
Le calcul est fait sans serveur (OQ_DISTRIBUTE=no), dans un dossier temporaire.
"""
import json
import math
import os
import pathlib
import sys
import tempfile

os.environ.setdefault('OQ_DISTRIBUTE', 'no')

import openquake.engine  # noqa: E402
from openquake.calculators import base  # noqa: E402
from openquake.commonlib import datastore, logs  # noqa: E402
from openquake.hazardlib.mfd import TruncatedGRMFD  # noqa: E402

RACINE = pathlib.Path(__file__).resolve().parents[2]
REF = RACINE / 'tests' / 'references'
GSIM = {'akkar2014': 'AkkarEtAlRjb2014', 'bindi2014': 'BindiEtAl2014Rjb'}
TRT = 'Active Shallow Crust'
NRML = '<?xml version="1.0" encoding="utf-8"?>\n<nrml xmlns:gml="http://www.opengis.net/gml" xmlns="http://openquake.org/xmlns/nrml/0.5">\n{}\n</nrml>\n'


def f7(v):
    """Sept chiffres significatifs : la précision des courbes d'OpenQuake (flottants simples)."""
    return float(f'{v:.7g}')


def f7s(arr):
    return [f7s(x) for x in arr] if hasattr(arr, '__len__') else f7(float(arr))


def nom_imt(imt):
    return 'PGA' if imt == 'PGA' else f'SA({float(imt)})'


def loi_zone(modele, variante, iz, d):
    """Loi (a, b, mmin, mmax) de la zone iz pour une variante de taux et un ΔMmax. Variante géodésique :
    a est calculé par OpenQuake lui-même (TruncatedGRMFD._set_a) pour libérer le taux de moment χ·Ṁ0."""
    z, p = modele['zones'][iz], variante['zones'][iz]
    mmax = z['mmax'] + d
    if 'moment' in p:
        mfd = TruncatedGRMFD(z['mmin'], mmax, modele['pasMfd'], 0.0, p['b'])
        mfd._set_a(p['moment'])
        return mfd.a_val, p['b'], z['mmin'], mmax
    return p['a'], p['b'], z['mmin'], mmax


def sources(modele, variante, idm):
    """Modèle de sources d'une branche : variante de taux et branche ΔMmax.
    Une multiPointSource par zone ; tous ses points portent la même loi (part 1/n du taux)."""
    d = modele['dMmax'][idm]['d']
    blocs = []
    for iz, z in enumerate(modele['zones']):
        a, b, mmin, mmax = loi_zone(modele, variante, iz, d)
        n = len(z['points'])
        a -= math.log10(n)
        pos = ' '.join(f"{p['lon']!r} {p['lat']!r}" for p in z['points'])
        blocs.append(f'''  <multiPointSource id="{z['id']}" name="{z['id']}" tectonicRegion="{TRT}">
   <multiPointGeometry><gml:posList>{pos}</gml:posList>
    <upperSeismoDepth>0</upperSeismoDepth><lowerSeismoDepth>20</lowerSeismoDepth></multiPointGeometry>
   <magScaleRel>PointMSR</magScaleRel><ruptAspectRatio>1</ruptAspectRatio>
   <multiMFD kind="truncGutenbergRichterMFD" size="{n}">
    <min_mag>{mmin!r}</min_mag><max_mag>{mmax!r}</max_mag><a_val>{a!r}</a_val><b_val>{b!r}</b_val>
   </multiMFD>
   <nodalPlaneDist><nodalPlane probability="1" strike="0" dip="90" rake="{z['rake']}"/></nodalPlaneDist>
   <hypoDepthDist><hypoDepth probability="1" depth="{z['profondeur']!r}"/></hypoDepthDist>
  </multiPointSource>''')
    return NRML.format(f' <sourceModel name="modele">\n <sourceGroup name="zones" tectonicRegion="{TRT}">\n'
                       + '\n'.join(blocs) + '\n </sourceGroup>\n </sourceModel>')


def branches_sources(modele):
    """Toutes les branches du modèle de sources (variante de taux × ΔMmax), avec leur poids."""
    for v in modele['variantes']:
        for idm, dm in enumerate(modele['dMmax']):
            yield f"sm_{v['id']}_{idm}", v, idm, v['poids'] * dm['poids']


def ecrire_jobs(modele, dossier):
    """Écrit les sources, les deux arbres logiques et deux jobs : classique (courbes, fractiles, UHS) et
    désagrégation magnitude-distance aux niveaux imposés (OpenQuake refuse les deux dans un même job)."""
    branches = []
    for nom, v, idm, poids in branches_sources(modele):
        (dossier / f'{nom}.xml').write_text(sources(modele, v, idm), encoding='utf-8')
        branches.append(f'   <logicTreeBranch branchID="{nom}"><uncertaintyModel>{nom}.xml</uncertaintyModel>'
                        f'<uncertaintyWeight>{poids!r}</uncertaintyWeight></logicTreeBranch>')
    (dossier / 'ssmlt.xml').write_text(NRML.format(
        ' <logicTree logicTreeID="sources">\n  <logicTreeBranchSet uncertaintyType="sourceModel" branchSetID="bs_sources">\n'
        + '\n'.join(branches) + '\n  </logicTreeBranchSet>\n </logicTree>'), encoding='utf-8')
    gs = [f'   <logicTreeBranch branchID="{g["id"]}"><uncertaintyModel>{GSIM[g["id"]]}</uncertaintyModel>'
          f'<uncertaintyWeight>{g["poids"]!r}</uncertaintyWeight></logicTreeBranch>' for g in modele['gmpe']]
    (dossier / 'gmmlt.xml').write_text(NRML.format(
        f' <logicTree logicTreeID="lois">\n  <logicTreeBranchSet uncertaintyType="gmpeModel" branchSetID="bs_lois" applyToTectonicRegionType="{TRT}">\n'
        + '\n'.join(gs) + '\n  </logicTreeBranchSet>\n </logicTree>'), encoding='utf-8')
    commun = f'''[general]
description = Modele d'ecole du site sismo
random_seed = 23

[geometry]
sites = 0.0 0.0

[logic_tree]
number_of_logic_tree_samples = 0

[erf]
rupture_mesh_spacing = 1.0
width_of_mfd_bin = {modele['pasMfd']!r}

[site_params]
reference_vs30_type = measured
reference_vs30_value = {modele['site']['vs30']!r}

[calculation]
source_model_logic_tree_file = ssmlt.xml
gsim_logic_tree_file = gmmlt.xml
investigation_time = {modele['dureeVie']!r}
truncation_level = {modele['troncature']!r}
maximum_distance = {modele['distanceMax']!r}
'''
    niveaux = [float(x) for x in modele['niveaux']]
    imtls = {nom_imt(i): niveaux for i in modele['imts']}
    (dossier / 'job_classique.ini').write_text(commun + f'''calculation_mode = classical
intensity_measure_types_and_levels = {json.dumps(imtls)}

[output]
mean = true
quantiles = 0.16 0.5 0.84
individual_rlzs = true
hazard_maps = true
poes = 0.1
''', encoding='utf-8')
    d = modele['desagregation']
    iml_disagg = {nom_imt(n['imt']): n['x'] for n in d['niveaux']}
    (dossier / 'job_desag.ini').write_text(commun + f'''calculation_mode = disaggregation

[disaggregation]
iml_disagg = {json.dumps(iml_disagg)}
disagg_outputs = Mag_Dist
mag_bin_width = {d['largeurM']!r}
distance_bin_width = {d['largeurR']!r}
coordinate_bin_width = 5.0
num_epsilon_bins = 1
num_rlzs_disagg = 0

[output]
mean = true
individual_rlzs = true
''', encoding='utf-8')
    return dossier / 'job_classique.ini', dossier / 'job_desag.ini'


def lancer(job):
    if not logs.dbcmd("SELECT name FROM sqlite_master WHERE name='job'"):
        logs.dbcmd('upgrade_db')  # première utilisation : crée la base des calculs (~/oqdata)
    with logs.init(str(job)) as log:
        base.calculators(log.get_oqparam(), log.calc_id).run()
        return log.calc_id


def calculer(modele):
    """Fait tourner les deux jobs ; renvoie leurs numéros (datastores ~/oqdata/calc_N.hdf5)."""
    with tempfile.TemporaryDirectory() as tmp:
        return tuple(lancer(job) for job in ecrire_jobs(modele, pathlib.Path(tmp)))


def cle(rlz, flt, modele):
    """Clé d'une réalisation dans l'arbre du site : « variante|ΔMmax|loi »."""
    ids = {v: k for k, v in GSIM.items()}  # identifiants abrégés des branches de lois (gA0…) → site
    loi = {b.id: ids[type(b.gsim).__name__] for b in flt.gsim_lt.branches}
    _, variante, idm = rlz.sm_lt_path[0].split('_')
    return f"{variante}|{idm}|{[g['id'] for g in modele['gmpe']].index(loi[rlz.gsim_lt_path[0]])}"


def extraire(calc_id, modele):
    """Courbes par réalisation, statistiques et UHS lues dans le datastore du calcul."""
    ds = datastore.read(calc_id)
    oq = ds['oqparam']
    imts = list(oq.imtls)
    flt = ds['full_lt']
    courbes = ds['hcurves-rlzs'][0]  # (R, M, L)
    stats = ds['hcurves-stats'][0]   # (S, M, L)
    hmaps = ds['hmaps-stats'][0]     # (S, M, P)
    noms_stats = list(oq.hazard_stats())
    realisations = [{
        'cle': cle(r, flt, modele),
        'poids': float(r.weight[0]),
        'poe': {imt: f7s(courbes[r.ordinal, m]) for m, imt in enumerate(imts)},
    } for r in flt.get_realizations()]
    return {
        'outil': f'OpenQuake {openquake.engine.__version__}',
        'calcul': 'classical, énumération complète, PointMSR',
        'imts': imts,
        'niveaux': [float(x) for x in oq.imtls[imts[0]]],
        'realisations': realisations,
        'stats': {s: {imt: f7s(stats[i, m]) for m, imt in enumerate(imts)} for i, s in enumerate(noms_stats)},
        'uhs': {s: {imt: float(hmaps[i, m, 0]) for m, imt in enumerate(imts)} for i, s in enumerate(noms_stats)},
    }


def extraire_desag(calc_id, modele):
    """Désagrégation Mag_Dist : probabilité en 50 ans par case (magnitude, Rrup), pour la moyenne (taux
    moyens pondérés, puis probabilité) et pour chaque réalisation. Le Rrup d'OpenQuake est la distance en
    ligne droite au foyer sur la Terre sphérique (Psha.distanceHypocentrale)."""
    ds = datastore.read(calc_id)
    oq = ds['oqparam']
    imts = list(oq.imtls)
    cles = {r.ordinal: cle(r, ds['full_lt'], modele) for r in ds['full_lt'].get_realizations()}
    rlzs = ds['best_rlzs'][0]                 # z → numéro de réalisation
    stats = ds['disagg-stats/Mag_Dist'][0]    # (Ma, D, M, P, 1)
    indiv = ds['disagg-rlzs/Mag_Dist'][0]     # (Ma, D, M, P, Z)
    return {
        'mag': [float(x) for x in ds['disagg-bins/Mag'][:]],
        'dist': [float(x) for x in ds['disagg-bins/Dist'][:]],
        'niveaux': {nom_imt(n['imt']): n['x'] for n in modele['desagregation']['niveaux']},
        'moyenne': {imt: f7s(stats[:, :, m, 0, 0]) for m, imt in enumerate(imts)},
        'realisations': [{'cle': cles[int(r)], 'poe': {imt: f7s(indiv[:, :, m, 0, z]) for m, imt in enumerate(imts)}}
                         for z, r in enumerate(rlzs)],
    }


def main():
    modele = json.loads((REF / 'modele_psha.json').read_text(encoding='utf-8'))
    # --calc N M : relire deux calculs déjà faits (classique, désagrégation) au lieu de relancer le moteur
    if '--calc' in sys.argv:
        i = sys.argv.index('--calc')
        ids = int(sys.argv[i + 1]), int(sys.argv[i + 2])
    else:
        ids = calculer(modele)
    sortie = extraire(ids[0], modele)
    sortie['desagregation'] = extraire_desag(ids[1], modele)
    (REF / 'psha.json').write_text(json.dumps(sortie, ensure_ascii=False), encoding='utf-8')
    print(f'écrit tests/references/psha.json (calculs {ids[0]} et {ids[1]}, {len(sortie["realisations"])} réalisations, {len(sortie["imts"])} grandeurs)')


if __name__ == '__main__':
    main()
