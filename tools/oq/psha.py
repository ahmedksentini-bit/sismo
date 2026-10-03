"""tools/oq/psha.py — calcul de référence du moteur PSHA par OpenQuake (calculateurs « classical » et
« disaggregation », post-traitement « conditional_spectrum »).

Lit tests/references/modele_psha.json (écrit par exporter-modele.mjs : points des zones, variantes du
modèle de taux, branches de l'arbre), le traduit en NRML, fait tourner le moteur et écrit
tests/references/psha.json : courbes d'aléa de chaque réalisation, moyenne et fractiles, spectre à
probabilité uniforme, désagrégation magnitude-distance, spectre conditionnel (sommes de Lin et al. 2013
par réalisation et pour la moyenne, corrélation de Baker et Jayaram 2008).

Traduction du modèle :
- chaque zone devient une multiPointSource (PointMSR : rupture de 10 m × 10 m, donc Rjb égale à la
  distance épicentrale) dont chaque point porte la part 1/n du taux : a_point = a_zone − log10(n) ;
- chaque faille devient une simpleFaultSource (WC1994, maillage de rupture_mesh_spacing = pasFaille) dont la
  loi va du Mmax de sa zone (ΔMmax compris) au Mmax de la faille, a calculé par OpenQuake (_set_a) pour
  libérer le moment de la variante ;
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

import numpy

os.environ.setdefault('OQ_DISTRIBUTE', 'no')

import openquake.engine  # noqa: E402
from openquake.calculators import base  # noqa: E402
from openquake.commonlib import datastore, logs  # noqa: E402
from openquake.hazardlib.mfd import TruncatedGRMFD  # noqa: E402
from openquake.hazardlib.map_array import compute_hazard_maps  # noqa: E402
from openquake.baselib.general import decode  # noqa: E402
from openquake.hazardlib import valid  # noqa: E402
from openquake.hazardlib.calc.cond_spectra import get_cs_out  # noqa: E402
from openquake.hazardlib.contexts import get_unique_inverse, read_cmakers, read_ctx_by_grp  # noqa: E402
from openquake.hazardlib.cross_correlation import BakerJayaram2008  # noqa: E402
from openquake.hazardlib.imt import from_string  # noqa: E402

RACINE = pathlib.Path(__file__).resolve().parents[2]
REF = RACINE / 'tests' / 'references'
GSIM = {'akkar2014': 'AkkarEtAlRjb2014', 'bindi2014': 'BindiEtAl2014Rjb', 'boore2014': 'BooreEtAl2014'}
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
        if p['moment'] <= 0:
            return None
        mfd = TruncatedGRMFD(z['mmin'], mmax, modele['pasMfd'], 0.0, p['b'])
        mfd._set_a(p['moment'])
        return mfd.a_val, p['b'], z['mmin'], mmax
    return p['a'], p['b'], z['mmin'], mmax


def loi_faille(modele, variante, jf, d):
    """Loi de la faille jf : b de sa zone, de Mmax de la zone (ΔMmax compris) à Mmax de la faille, a calculé
    par OpenQuake (_set_a) pour libérer le moment de la variante ; None si la zone dépasse la faille."""
    f = modele['failles'][jf]
    z = modele['zones'][f['zone']]
    mmin = z['mmax'] + d
    if mmin >= f['mmax'] - 1e-9:
        return None
    b = z['ajustement']['b']
    mfd = TruncatedGRMFD(mmin, f['mmax'], modele['pasMfd'], 0.0, b)
    mfd._set_a(variante['failles'][jf]['moment'])
    return mfd.a_val, b, mmin, f['mmax']


def sources(modele, variante, idm):
    """Modèle de sources d'une branche : variante de taux et branche ΔMmax.
    Une multiPointSource par zone ; tous ses points portent la même loi (part 1/n du taux)."""
    d = modele['dMmax'][idm]['d']
    blocs = []
    for iz, z in enumerate(modele['zones']):
        loi = loi_zone(modele, variante, iz, d)
        if loi is None:
            continue
        a, b, mmin, mmax = loi
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
    for jf, f in enumerate(modele.get('failles', [])):
        loi = loi_faille(modele, variante, jf, d)
        if loi is None:
            continue
        a, b, mmin, mmax = loi
        pos = ' '.join(f"{x / modele['kmParDegre']!r} {y / modele['kmParDegre']!r}" for x, y in f['trace'])
        blocs.append(f'''  <simpleFaultSource id="{f['id']}" name="{f['id']}" tectonicRegion="{TRT}">
   <simpleFaultGeometry><gml:LineString><gml:posList>{pos}</gml:posList></gml:LineString>
    <dip>{f['pendage']!r}</dip><upperSeismoDepth>{f['zHaut']!r}</upperSeismoDepth><lowerSeismoDepth>{f['zBas']!r}</lowerSeismoDepth></simpleFaultGeometry>
   <magScaleRel>WC1994</magScaleRel><ruptAspectRatio>{f['rapport']!r}</ruptAspectRatio>
   <truncGutenbergRichterMFD aValue="{a!r}" bValue="{b!r}" minMag="{mmin!r}" maxMag="{mmax!r}"/>
   <rake>{f['rake']!r}</rake>
  </simpleFaultSource>''')
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
    assert modele.get('pasFaille', 1.0) == 1.0, 'rupture_mesh_spacing du job = pasFaille'
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
    cs = modele['spectreConditionnel']
    (dossier / 'job_cs.ini').write_text(commun + f'''calculation_mode = classical
intensity_measure_types_and_levels = {json.dumps(imtls)}
postproc_func = conditional_spectrum.main
cross_correlation = BakerJayaram2008
imt_ref = {nom_imt(cs['imtRef'])}
poes = {' '.join(repr(p) for p in cs['poes'])}

[output]
mean = true
''', encoding='utf-8')
    carte = modele['carte']
    sites = ', '.join(f"{s['lon']!r} {s['lat']!r}" for s in carte['sites'])
    (dossier / 'job_carte.ini').write_text(commun.replace('sites = 0.0 0.0', f'sites = {sites}') + f'''calculation_mode = classical
intensity_measure_types_and_levels = {json.dumps({nom_imt(carte['imt']): niveaux})}

[output]
mean = true
hazard_maps = true
poes = {carte['poe']!r}
''', encoding='utf-8')
    return dossier / 'job_classique.ini', dossier / 'job_desag.ini', dossier / 'job_cs.ini', dossier / 'job_carte.ini'


def lancer(job):
    if not logs.dbcmd("SELECT name FROM sqlite_master WHERE name='job'"):
        logs.dbcmd('upgrade_db')  # première utilisation : crée la base des calculs (~/oqdata)
    with logs.init(str(job)) as log:
        base.calculators(log.get_oqparam(), log.calc_id).run()
        return log.calc_id


def calculer(modele):
    """Fait tourner les quatre jobs ; renvoie leurs numéros (datastores ~/oqdata/calc_N.hdf5)."""
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


def imt_de(periode):
    return from_string('PGA' if periode == 0 else f'SA({float(periode)})')


def extraire_cs(calc_id, modele):
    """Spectre conditionnel (post-traitement conditional_spectrum d'OpenQuake : Lin et al. 2013, corrélation
    de Baker et Jayaram 2008). Pour chaque probabilité, OpenQuake somme sur les ruptures u
    ws = λu·P(Sa(T*) > x | u)/λ(P) : c0 = Σ ws, c1 = Σ ws·(μ + ρεσ), c2 = Σ ws·(σ²(1 − ρ²) + (μ + ρεσ − c1)²),
    le centre de c2 étant le c1 de la moyenne ; il écrit exp(c1) et √c2 sans diviser par c0 (≈ 1).

    Défaut d'OpenQuake 3.26 contourné ici : compute_cs relie les groupes de sources aux réalisations par
    get_trt_rlzs(trt_smrs) dans l'ordre des groupes, alors que les numéros gid des ContextMaker suivent
    l'ordre de get_unique_inverse (numpy.unique sur des chaînes : 0, 1, 10, 11…). Au-delà de dix modèles de
    sources, chaque groupe est ajouté aux réalisations d'un autre. On refait donc l'agrégation avec les
    mêmes briques (contextes, get_cs_out) et get_trt_rlzs(groupes uniques), qui suit les gid."""
    ds = datastore.read(calc_id)
    oq = ds['oqparam']
    imts = list(oq.imtls)
    flt = ds['full_lt'].init()
    rlzs = flt.get_realizations()
    cles = [cle(r, flt, modele) for r in rlzs]
    poids = numpy.array([float(r.weight[0]) for r in rlzs])
    uniques, _ = get_unique_inverse(ds['trt_smrs'][:])
    trt_rlzs = flt.get_trt_rlzs(uniques)  # indice gid → réalisations
    imti = imts.index(oq.imt_ref)
    courbe = ds.sel('hcurves-stats', stat='mean', imt=oq.imt_ref)[:, 0, 0, :]
    niveaux = compute_hazard_maps(courbe, oq.imtls[oq.imt_ref], oq.poes)  # (1, P)
    cmakers = read_cmakers(ds).to_array()
    toms = decode(ds['toms'][:])
    contextes = read_ctx_by_grp(ds)
    R, M, P = len(rlzs), len(imts), len(oq.poes)

    def passe(centre=None):
        par_rlz = numpy.zeros((R, M, 3, P))
        for grp, ctx in contextes.items():
            out = get_cs_out(cmakers[grp], ctx, imti, niveaux, valid.occurrence_model(toms[grp]), centre)
            for g, arr in out.items():
                par_rlz[trt_rlzs[g] % 2 ** 24] += arr[:, 0]
        return par_rlz, numpy.einsum('r,rmop->mop', poids, par_rlz)

    _, moyenne = passe()
    par_rlz, moyenne = passe(moyenne[:, None])  # seconde passe : c2 autour du c1 de la moyenne
    g10 = lambda v: float(f'{v:.10g}')  # noqa: E731
    bj = BakerJayaram2008()
    periodes = [0, 0.01, 0.04, 0.05, 0.1, 0.109, 0.15, 0.2, 0.3, 0.5, 1, 2, 3, 5]
    return {
        'correlation': {'periodes': periodes, 'rho': [[g10(bj.get_correlation(imt_de(a), imt_de(b))) for b in periodes] for a in periodes]},
        'imtRef': oq.imt_ref, 'poes': [float(p) for p in oq.poes], 'imts': imts,
        'niveaux': [float(x) for x in niveaux[0]],
        'moyenne': [{'c0': g10(moyenne[0, 0, p]), 'c1': [g10(moyenne[m, 1, p]) for m in range(M)],
                     'c2': [g10(moyenne[m, 2, p]) for m in range(M)]} for p in range(P)],
        'realisations': [{'cle': c, 'c0': [g10(par_rlz[r, 0, 0, p]) for p in range(P)],
                          'c1': [[g10(par_rlz[r, m, 1, p]) for m in range(M)] for p in range(P)]}
                         for r, c in enumerate(cles)],
        # sortie d'OpenQuake telle quelle (agrégation fautive), pour mémoire : exp(c1) au T* de la moyenne
        'csStatsOQ': [float(ds['cs-stats'][0, p, 0, imti, 0]) for p in range(P)],
    }


def extraire_carte(calc_id, modele):
    """Carte d'aléa : pour chaque site de contrôle, courbe moyenne et niveau moyen à la probabilité visée
    (hmaps-stats, interpolation log-log de compute_hazard_maps). Les sites sont repérés par leurs
    coordonnées, OpenQuake pouvant les réordonner."""
    ds = datastore.read(calc_id)
    sc = ds['sitecol']
    courbes = ds['hcurves-stats'][:, 0, 0, :]  # (N, L) moyenne, PGA
    cartes = ds['hmaps-stats'][:, 0, 0, 0]     # (N,) moyenne, PGA, première probabilité
    sites = []
    for s in modele['carte']['sites']:
        n = min(range(len(sc)), key=lambda k: (sc.lons[k] - s['lon']) ** 2 + (sc.lats[k] - s['lat']) ** 2)
        sites.append({'x': s['x'], 'y': s['y'], 'poe': f7s(courbes[n]), 'niveau': float(cartes[n])})
    return {'imt': modele['carte']['imt'], 'poe': modele['carte']['poe'], 'sites': sites}


def main():
    modele = json.loads((REF / 'modele_psha.json').read_text(encoding='utf-8'))
    # --calc N M K L : relire quatre calculs déjà faits (classique, désagrégation, spectre conditionnel, carte) ;
    # --carte : ne lancer que le calcul de la carte et afficher son numéro
    if '--carte' in sys.argv:
        with tempfile.TemporaryDirectory() as tmp:
            print('calcul de la carte :', lancer(ecrire_jobs(modele, pathlib.Path(tmp))[3]))
        return
    if '--calc' in sys.argv:
        i = sys.argv.index('--calc')
        ids = tuple(int(x) for x in sys.argv[i + 1:i + 5])
    else:
        ids = calculer(modele)
    sortie = extraire(ids[0], modele)
    sortie['desagregation'] = extraire_desag(ids[1], modele)
    sortie['spectreConditionnel'] = extraire_cs(ids[2], modele)
    sortie['carte'] = extraire_carte(ids[3], modele)
    (REF / 'psha.json').write_text(json.dumps(sortie, ensure_ascii=False), encoding='utf-8')
    print(f'écrit tests/references/psha.json (calculs {", ".join(map(str, ids))}, {len(sortie["realisations"])} réalisations, {len(sortie["imts"])} grandeurs)')


if __name__ == '__main__':
    main()
