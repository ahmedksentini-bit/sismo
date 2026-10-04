"""tools/carte/pays.py — pays du bassin méditerranéen pour la page « En direct » : polygones de Natural Earth (1:50 m,
domaine public, https://www.naturalearthdata.com), découpés au domaine de la carte et simplifiés, écrits dans
data/pays-mediterranee.json (fichier produit, à ne pas modifier à la main). Ils servent à dire dans quel pays est une
station (Direct.pays), par exemple pour savoir si un réseau a des stations en Tunisie.

Usage : python tools/carte/pays.py [dossier contenant ne_50m_admin_0_countries.geojson]
Sans dossier, le fichier est téléchargé depuis le dépôt nvkelso/natural-earth-vector. Demande shapely.
"""
import json
import pathlib
import sys
import urllib.request

from shapely.geometry import box, shape

RACINE = pathlib.Path(__file__).resolve().parents[2]
SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
# Même domaine que les côtes (tools/carte/cotes.py)
LON = (-20.0, 50.0)
LAT = (22.0, 53.0)
TOLERANCE = 0.01  # degrés


def lire(dossier):
    if dossier:
        return json.loads((pathlib.Path(dossier) / 'ne_50m_admin_0_countries.geojson').read_text(encoding='utf-8'))
    with urllib.request.urlopen(SOURCE) as r:
        return json.loads(r.read().decode('utf-8'))


def anneaux(g):
    """Anneaux extérieurs et intérieurs d'un polygone ou d'un multipolygone (règle pair-impair à la lecture)."""
    polys = [g] if g.geom_type == 'Polygon' else list(getattr(g, 'geoms', []))
    for p in polys:
        if p.geom_type != 'Polygon' or p.is_empty:
            continue
        yield p.exterior.coords
        for i in p.interiors:
            yield i.coords


def main():
    dossier = sys.argv[1] if len(sys.argv) > 1 else None
    domaine = box(LON[0], LAT[0], LON[1], LAT[1])
    pays = []
    for f in lire(dossier)['features']:
        p = f['properties']
        g = shape(f['geometry'])
        if not g.intersects(domaine):
            continue
        g = g.intersection(domaine).simplify(TOLERANCE, preserve_topology=True)
        out = []
        for a in anneaux(g):
            pts = [round(v, 3) for xy in a for v in xy[:2]]
            if len(pts) >= 8:
                out.append(pts)
        if out:
            pays.append({'code': p['ISO_A2_EH'] if p.get('ISO_A2_EH', '-99') != '-99' else p['ADM0_A3'], 'nom': p['NAME_FR'], 'anneaux': out})
    pays.sort(key=lambda q: q['nom'])
    sortie = {'source': 'Natural Earth 1:50 m (domaine public), découpé et simplifié par tools/carte/pays.py',
              'domaine': {'lon': LON, 'lat': LAT}, 'pays': pays}
    chemin = RACINE / 'data' / 'pays-mediterranee.json'
    chemin.write_text(json.dumps(sortie, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"écrit {chemin.relative_to(RACINE)} : {len(pays)} pays, {sum(len(a) // 2 for q in pays for a in q['anneaux'])} points, "
          f"{chemin.stat().st_size // 1024} Ko")


if __name__ == '__main__':
    main()
