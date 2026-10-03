"""tools/liquepy/liquefaction.py — référence du déclenchement de la liquéfaction par liquepy (eng-tools, licence
MIT), méthode de Boulanger et Idriss (2014) au CPT.

Lit tests/references/modele_liquefaction.json (exporter-liquefaction.mjs) et écrit tests/references/liquefaction.json :
pour chaque scénario, à chaque profondeur, poids volumique, σv, σ'v, rd, Ic, FC, qc1N, qc1Ncs, Kσ, MSF, CSR,
CRR7,5, CRR et FS ; le LPI ; la déformation volumique de Zhang et al. (2002) ; et, pour le SPT, CRR7,5 et Kσ
sur une grille de (N1)60cs et de σ'v. liquepy n'est jamais embarqué dans le site.
"""
import json
import pathlib

import numpy as np
from liquepy.field import CPT
from liquepy.trigger import boulanger_and_idriss_2014 as bi
from liquepy.trigger import triggering_measures as tm
from liquepy.trigger import volumetric_strain as vs

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references'


def liste(a):
    return [float(x) for x in np.asarray(a)]


def main():
    modele = json.loads((REF / 'modele_liquefaction.json').read_text(encoding='utf-8'))
    s = modele['sondage']
    z, qc, fs = (np.array(s[k], dtype=float) for k in ('z', 'qc', 'fs'))
    sortie = {'scenarios': []}
    for sc in modele['scenarios']:
        cpt = CPT(z, qc.copy(), fs.copy(), np.zeros_like(z), sc['gwl'], a_ratio=0.8)
        r = bi.run_bi2014(cpt, pga=sc['amax'], m_w=sc['M'], gwl=sc['gwl'])
        ev = vs.calc_volumetric_strain_zhang_2002(r.factor_of_safety, r.q_c1n_cs)
        sortie['scenarios'].append({
            **sc,
            'gamma': liste(r.unit_wt), 'sv': liste(r.sigma_v), 'sve': liste(r.sigma_veff), 'rd': liste(r.rd), 'ic': liste(r.i_c),
            'fc': liste(r.fines_content), 'qc1n': liste(r.q_c1n), 'qc1ncs': liste(r.q_c1n_cs), 'ks': liste(r.k_sigma),
            'msf': liste(r.msf), 'csr': liste(r.csr), 'crr75': liste(r.crr_m7p5), 'crr': liste(r.crr), 'fs': liste(r.factor_of_safety),
            'lpi': float(tm.calc_lpi(r.factor_of_safety, z)), 'ev': liste(ev),
        })
    n, sve = np.array(modele['spt']['n'], float), np.array(modele['spt']['sve'], float)
    sortie['spt'] = {'n': liste(n), 'sve': liste(sve), 'crr75': liste(bi.calc_crr_m7p5_from_n1_60cs(n)),
                     'ks': [liste(bi.calc_k_sigma_w_n1_60cs(v, np.maximum(n, 1e-9))) for v in sve]}
    (REF / 'liquefaction.json').write_text(json.dumps(sortie), encoding='utf-8')
    print(f"écrit tests/references/liquefaction.json ({len(sortie['scenarios'])} scénarios, {len(z)} profondeurs)")


if __name__ == '__main__':
    main()
