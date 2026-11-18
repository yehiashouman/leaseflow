#!/usr/bin/env python3
"""Merge an authorized CSV export of Dubai building names into the picker index."""

import argparse
import csv
import json
import unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'web/src/data'


def clean(value):
    return ' '.join(unicodedata.normalize('NFC', value or '').split())


def key(value):
    return unicodedata.normalize('NFKC', value).casefold()


def merge(index, area_names, records, area_column, name_column, source):
    if index.get('registrySource'):
        raise ValueError('Use the map-only index as the base for each registry import.')
    areas = {
        area: {key(name): name for name in names}
        for area, names in index['areas'].items()
    }
    canonical = {key(area): area for area in [*area_names, *areas]}
    canonical.update({key(alias): area for alias, area in index['aliases'].items()})
    accepted = 0
    for row in records:
        area = clean(row[area_column])
        name = clean(row[name_column])
        if not area or not name or len(area) > 150 or len(name) > 150:
            continue
        area = canonical.setdefault(key(area), area)
        areas.setdefault(area, {}).setdefault(key(name), name)
        accepted += 1
    if not accepted:
        raise ValueError('The export has no usable area and building name pairs.')
    return {
        **index,
        'registrySource': source,
        'areas': {
            area: sorted(names.values(), key=key) for area, names in sorted(areas.items())
        },
    }, accepted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    parser.add_argument('--area-column', required=True)
    parser.add_argument('--name-column', required=True)
    parser.add_argument('--source', required=True, help='Publisher attribution for the export')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    index = json.loads((DATA / 'dubai-building-index.json').read_text())
    area_names = json.loads((DATA / 'dubai-areas.json').read_text())['areas']
    try:
        with args.csv.open(encoding='utf-8-sig', newline='') as file:
            records = csv.DictReader(file)
            if not {args.area_column, args.name_column}.issubset(records.fieldnames or ()):
                raise ValueError('The CSV does not contain both requested columns.')
            result, count = merge(
                index, area_names, records, args.area_column, args.name_column, args.source
            )
    except (OSError, csv.Error, ValueError) as error:
        parser.error(str(error))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Read {count} registry rows with an area and building name.')


if __name__ == '__main__':
    main()
