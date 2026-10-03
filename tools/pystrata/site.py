"""tools/pystrata/site.py — calcul de référence des effets de site par pystrata (Kottke, licence MIT).

Lit tests/references/modele_site.json (écrit par exporter-site.mjs) et écrit tests/references/site.json :
- courbes de Darendeli (G/G0 et ξ aux 20 déformations par défaut) de chaque sous-couche ;
- fonction de transfert linéaire surface / affleurement du rocher (G0, ξmin) aux fréquences du modèle ;
- pour chaque accélérogramme d'entrée : calcul linéaire équivalent (rapport 0,65), G/G0, ξ, γeff et γmax
  de chaque sous-couche, PGA en surface et spectre de réponse à 5 % (oscillateurs en fréquence).
pystrata n'est jamais embarqué dans le site : il ne sert qu'à produire ces références.
"""
import json
import pathlib

import numpy as np
import pystrata

RACINE = pathlib.Path(__file__).resolve().parents[2]
REF = RACINE / 'tests' / 'references'


def profil(modele):
    couches = [pystrata.site.Layer(pystrata.site.DarendeliSoilType(unit_wt=c['poids'], plas_index=c['ip'], ocr=c['ocr'], stress_mean=c['sigmaM']), c['h'], c['vs'])
               for c in modele['couches']]
    r = modele['rocher']
    couches.append(pystrata.site.Layer(pystrata.site.SoilType('Roche', r['poids'], None, r['xi']), 0, r['vs']))
    return pystrata.site.Profile(couches)


def main():
    modele = json.loads((REF / 'modele_site.json').read_text(encoding='utf-8'))
    p = profil(modele)
    sortie = {
        'outil': f'pystrata {pystrata.__version__}',
        'courbes': [{'gamma': l.soil_type.mod_reduc.strains.tolist(), 'GG0': l.soil_type.mod_reduc.values.tolist(),
                     'xi': l.soil_type.damping.values.tolist(), 'xiMin': l.soil_type.damping_min} for l in p[:-1]],
    }
    # Fonction de transfert linéaire aux fréquences du modèle
    calc = pystrata.propagation.LinearElasticCalculator()
    for l in p:
        l.reset()
    calc._profile = p
    w = 2 * np.pi * np.array(modele['frequences'])
    calc._calc_waves(w, p)
    tf = calc.wave_at_location(p.location('outcrop', index=0)) / calc.wave_at_location(p.location('outcrop', index=-1))
    sortie['transfert'] = {'frequences': modele['frequences'], 're': tf.real.tolist(), 'im': tf.imag.tolist()}
    # Linéaire équivalent
    sortie['mouvements'] = []
    for m in modele['mouvements']:
        mvt = pystrata.motion.TimeSeriesMotion(m['nom'], '', m['dt'], np.array(m['acc']))
        p = profil(modele)
        eql = pystrata.propagation.EquivalentLinearCalculator(strain_ratio=modele['ratio'], tolerance=0.001, max_iterations=40)
        lin, lsurf = p.location('outcrop', index=-1), p.location('outcrop', index=0)
        eql(mvt, p, lin)
        tf = eql.calc_accel_tf(lin, lsurf)
        sa = mvt.calc_osc_accels(1 / np.array(modele['periodes']), 0.05, tf)
        sortie['mouvements'].append({
            'nom': m['nom'],
            'couches': [{'GG0': float(l.shear_mod_reduc), 'xi': float(l.damping), 'gammaEff': float(l.strain), 'gammaMax': float(l.strain_max)} for l in p[:-1]],
            'pgaSurface': float(mvt.calc_peak(tf)), 'pgaEntree': float(mvt.pga),
            'periodes': modele['periodes'], 'saSurface': sa.tolist(), 'saEntree': mvt.calc_osc_accels(1 / np.array(modele['periodes']), 0.05).tolist(),
        })
    (REF / 'site.json').write_text(json.dumps(sortie), encoding='utf-8')
    print(f"écrit tests/references/site.json ({len(sortie['courbes'])} sous-couches, {len(sortie['mouvements'])} mouvements)")


if __name__ == '__main__':
    main()
