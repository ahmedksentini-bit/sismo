"""tools/carte/monde.py — fond de carte du monde pour la carte des épicentres du banc « sismicité » (mode « Catalogue
réel ») : côtes et frontières terrestres de Natural Earth (1:50 m, domaine public, https://www.naturalearthdata.com),
simplifiées (Douglas-Peucker, 0,04°) et écrites dans data/cotes-monde.json (fichier produit, à ne pas modifier à la
main), au même format que data/cotes-mediterranee.json (tools/carte/cotes.py), qui reste plus fin et sert quand le
catalogue tient dans le bassin méditerranéen.

Usage : python tools/carte/monde.py [dossier contenant ne_50m_coastline.geojson et ne_50m_admin_0_boundary_lines_land.geojson]
Sans dossier, les fichiers sont téléchargés depuis le dépôt nvkelso/natural-earth-vector.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cotes import FICHIERS, RACINE, lignes, lire  # noqa: E402

TOLERANCE = 0.04  # degrés : environ 4 km, moins d'un pixel tant que la carte couvre plus de 15° de large


def douglas_peucker(pts, tol):
    """Douglas-Peucker sans récursion (les côtes du monde ont des lignes de plusieurs milliers de points)."""
    n = len(pts)
    if n < 3:
        return pts
    garde = [False] * n
    garde[0] = garde[-1] = True
    pile = [(0, n - 1)]
    while pile:
        a, b = pile.pop()
        (x1, y1), (x2, y2) = pts[a][:2], pts[b][:2]
        dx, dy = x2 - x1, y2 - y1
        L = (dx * dx + dy * dy) ** 0.5
        dmax, imax = -1, 0
        for i in range(a + 1, b):
            x, y = pts[i][:2]
            d = abs(dy * (x - x1) - dx * (y - y1)) / L if L > 0 else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
            if d > dmax:
                dmax, imax = d, i
        if dmax > tol:
            garde[imax] = True
            pile += [(a, imax), (imax, b)]
    return [p for p, g in zip(pts, garde) if g]


def main():
    dossier = sys.argv[1] if len(sys.argv) > 1 else None
    sortie = {'source': 'Natural Earth 1:50 m (domaine public), simplifié par tools/carte/monde.py',
              'domaine': {'lon': [-180.0, 180.0], 'lat': [-90.0, 90.0]}}
    for cle, nom in FICHIERS.items():
        out = []
        for l in lignes(lire(nom, dossier)):
            s = douglas_peucker(l, TOLERANCE)
            if len(s) > 1:
                # coordonnées plates [lon, lat, lon, lat…], au centième de degré
                out.append([round(v, 2) for p in s for v in p[:2]])
        sortie[cle] = out
    chemin = RACINE / 'data' / 'cotes-monde.json'
    chemin.write_text(json.dumps(sortie, separators=(',', ':')), encoding='utf-8')
    print(f"écrit {chemin.relative_to(RACINE)} : {len(sortie['cotes'])} côtes, {len(sortie['frontieres'])} frontières, "
          f"{chemin.stat().st_size // 1024} Ko")


if __name__ == '__main__':
    main()
