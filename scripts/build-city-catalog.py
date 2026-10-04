"""Build the bundled city picker from a GeoNames cities15000.txt snapshot.

Usage: python scripts/build-city-catalog.py /path/to/cities15000.txt
"""

import csv
import json
import re
import sys
from pathlib import Path


def aliases(value, primary):
    result = []
    for candidate in value.split(','):
        candidate = candidate.strip()
        if (candidate != primary and candidate not in result
                and 3 <= len(candidate) <= 70
                and re.fullmatch(r"[\u0400-\u04ff\s\-'.]+", candidate)):
            result.append(candidate)
    return sorted(result, key=lambda name: (len(name), name))[:6]


def main(source):
    cities = []
    with Path(source).open(encoding='utf-8', newline='') as handle:
        for row in csv.reader(handle, delimiter='\t'):
            if len(row) != 19 or not row[17]:
                continue
            cities.append({
                'id': int(row[0]), 'name': row[1], 'aliases': aliases(row[3], row[1]),
                'country': row[8], 'regionCode': row[10],
                'latitude': float(row[4]), 'longitude': float(row[5]),
                'population': int(row[14] or 0), 'timeZone': row[17],
            })
    if len(cities) < 20000:
        raise SystemExit('GeoNames source is incomplete')
    destination = Path(__file__).resolve().parents[1] / 'config' / 'cities.json'
    destination.write_text(json.dumps(cities, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(cities)} cities -> {destination}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/build-city-catalog.py /path/to/cities15000.txt')
    main(sys.argv[1])
