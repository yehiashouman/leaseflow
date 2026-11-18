#!/usr/bin/env python3
"""Build the Dubai picker index from a local OSM PBF and community GeoJSON.

Requires osmium and shapely. Pass a GCC States PBF from Geofabrik and a
WGS84 community boundary export whose English name field is COMM_NAME_EN.
"""
import argparse
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import osmium
from shapely.geometry import Polygon, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web/src/data'
AREA_ALIASES = {
    'marsa dubai': ['Dubai Marina'],
    'burj khalifa': ['Downtown Dubai'],
    'nakhlat jumeira': ['Palm Jumeirah'],
}
NEIGHBOURHOODS = {
    'Discovery Gardens',
    'Dubai Silicon Oasis',
    'Jumeirah Beach Residence',
    'Jumeirah Lakes Towers',
    'Jumeirah Village Circle',
}


def clean(value):
    return ' '.join(value.split())


def key(value):
    return re.sub(r'[^\w]+', ' ', unicodedata.normalize('NFKC', value).casefold()).strip()


class NeighbourhoodBoundaries(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.polygons = []

    def way(self, way):
        name = way.tags.get('name:en') or way.tags.get('name')
        if name not in NEIGHBOURHOODS or not way.is_closed():
            return
        if not way.tags.get('place') and way.tags.get('landuse') != 'residential':
            return
        if len(way.nodes) < 4 or not all(node.location.valid() for node in way.nodes):
            return
        polygon = Polygon([(node.lon, node.lat) for node in way.nodes])
        if polygon.is_valid and not polygon.is_empty:
            self.polygons.append((name, polygon))


class BuildingIndex(osmium.SimpleHandler):
    def __init__(self, communities, accepted_bounds):
        super().__init__()
        self.names, self.polygons = zip(*communities)
        self.tree = STRtree(self.polygons)
        self.bounds = accepted_bounds
        self.entries = defaultdict(dict)
        self.geometry = osmium.geom.GeoJSONFactory()

    def area(self, area):
        name = clean(area.tags.get('name:en') or area.tags.get('name') or '')
        building = area.tags.get('building')
        if not building or building == 'no' or not name or len(name) > 150:
            return
        outer = next(iter(area.outer_rings()), None)
        if outer is None:
            return
        point = next(iter(outer)).location
        west, south, east, north = self.bounds
        if not (west <= point.lon <= east and south <= point.lat <= north):
            return
        try:
            footprint = shape(json.loads(self.geometry.create_multipolygon(area)))
        except (RuntimeError, ValueError):
            return
        point = footprint.representative_point()
        for index in self.tree.query(point, predicate='intersects'):
            self.entries[self.names[index]].setdefault(key(name), name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pbf', type=Path)
    parser.add_argument('boundaries', type=Path)
    parser.add_argument('--source-date', required=True, help='Date of the Geofabrik snapshot')
    args = parser.parse_args()

    available = json.loads((DATA / 'dubai-areas.json').read_text())['areas']
    known_names = {key(name): name for name in available}
    communities = []
    for item in json.loads(args.boundaries.read_text())['features']:
        raw = clean(item['properties'].get('COMM_NAME_EN') or '')
        if not raw or not item['geometry']:
            continue
        label = known_names.get(key(raw), raw.title())
        polygon = shape(item['geometry'])
        if not polygon.is_valid or polygon.is_empty:
            continue
        communities.append((label, polygon))

    bounds = [polygon.bounds for _, polygon in communities]
    extent = (
        min(item[0] for item in bounds), min(item[1] for item in bounds),
        max(item[2] for item in bounds), max(item[3] for item in bounds),
    )
    neighbourhoods = NeighbourhoodBoundaries()
    neighbourhoods.apply_file(str(args.pbf), locations=True, idx='flex_mem')
    communities.extend(neighbourhoods.polygons)
    index = BuildingIndex(communities, extent)
    index.apply_file(str(args.pbf), locations=True, idx='flex_mem')

    entries = {
        name: sorted(places.values(), key=str.casefold)
        for name, places in sorted(index.entries.items())
    }
    result = {
        'attribution': '© OpenStreetMap contributors',
        'license': 'https://www.openstreetmap.org/copyright',
        'source': 'https://download.geofabrik.de/asia/gcc-states.html',
        'sourceDate': args.source_date,
        'communitySource': 'https://services1.arcgis.com/wQnFk5ouCfPzTlPw/ArcGIS/rest/services/Dubai_Traffic_Incidents_WFL1/FeatureServer/2',
        'aliases': {
            alias: name
            for name in entries
            for alias in AREA_ALIASES.get(key(name), [])
        },
        'areas': entries,
    }
    (DATA / 'dubai-building-index.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    )
    print(f'{sum(map(len, entries.values()))} building names across {len(entries)} communities')


if __name__ == '__main__':
    main()
