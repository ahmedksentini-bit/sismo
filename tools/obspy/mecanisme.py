"""tools/obspy/mecanisme.py — référence du mécanisme au foyer par ObsPy (licence LGPL, jamais embarqué).

Lit tests/references/modele_mecanisme.json (exporter-mecanisme.mjs) et écrit tests/references/mecanisme.json :
pour chaque mécanisme, le plan auxiliaire (aux_plane), les deux plans nodaux et les axes P, T, N retrouvés à
partir du tenseur des moments du site (mt2plane, mt2axes ; NED converti en USE : Mrr = Mzz, Mθθ = Mxx,
Mφφ = Myy, Mrθ = Mxz, Mrφ = −Myz, Mθφ = −Mxy) et le rayonnement P en champ lointain (farfield, composante
radiale) pour chaque direction de rai.
"""
import json
import pathlib

import numpy as np
from obspy.imaging.beachball import MomentTensor, aux_plane, mt2axes, mt2plane
from obspy.imaging.source import farfield

REF = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'references'


def main():
    modele = json.loads((REF / 'modele_mecanisme.json').read_text(encoding='utf-8'))
    pts = np.array(modele['directions']).T  # (3, n)
    sortie = {'mecanismes': []}
    for m in modele['mecanismes']:
        M = m['M']
        mt = MomentTensor(M[2][2], M[0][0], M[1][1], M[0][2], -M[1][2], -M[0][1], 0)
        plans = mt2plane(mt)
        t, n, p = mt2axes(mt)
        aux = aux_plane(m['azimut'], m['pendage'], m['glissement'])
        ned = [M[0][0], M[1][1], M[2][2], M[0][1], M[0][2], M[1][2]]
        u = farfield(ned, pts, 'P')
        radial = (u * pts).sum(axis=0)
        sortie['mecanismes'].append({
            'azimut': m['azimut'], 'pendage': m['pendage'], 'glissement': m['glissement'],
            'auxiliaire': [float(x) for x in aux],
            'plan1': [float(plans.strike), float(plans.dip), float(plans.rake)],
            'axes': {nom: {'azimut': float(a.strike), 'plongement': float(a.dip), 'valeur': float(a.val)} for nom, a in (('T', t), ('N', n), ('P', p))},
            'rayonnement': [float(x) for x in radial],
        })
    (REF / 'mecanisme.json').write_text(json.dumps(sortie), encoding='utf-8')
    print(f"écrit tests/references/mecanisme.json ({len(sortie['mecanismes'])} mécanismes)")


if __name__ == '__main__':
    main()
