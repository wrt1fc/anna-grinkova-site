"""CPU-only private source import. Explicit inventory, verified hashes, no model calls.

python training/import-methodics.py inventory.json NEW-private-output
Document instructions are data, never executable commands or assistant policy.
"""
import sys, json, hashlib, re
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

W = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
PROFESSIONAL = re.compile(r'заявки|сторис|сторителлинг|заголовк|очередь на|соцсет|промо-разбор|первую консультацию|юрист', re.I)

def paragraphs(path):
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
    return [text for p in root.findall('.//w:p', W)
            if (text := re.sub(r'\s+', ' ', ''.join(t.text or '' for t in p.findall('.//w:t', W))).strip())]

def main():
    inventory, output = map(Path, sys.argv[1:])
    if output.exists():
        raise ValueError('Refusing to overwrite source snapshot')
    records = json.loads(inventory.read_text(encoding='utf-8'))['records']
    documents, ledger, seen = [], [], {}
    for record in records:
        path = Path(record['path'])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != record['sha256']:
            raise ValueError('Source changed since inventory: ' + path.name)
        row = dict(record, sourceId='src-' + digest[:12])
        if digest in seen:
            row.update(disposition='duplicate', duplicateOf=seen[digest])
        else:
            seen[digest] = row['sourceId']
            if path.name == 'контакты и документы.docx':
                row['disposition'] = 'private-contacts-not-read-not-training'
            elif path.suffix != '.docx' or PROFESSIONAL.search(path.name):
                row['disposition'] = 'professional-separate-not-client-training'
            else:
                row['disposition'] = 'astrology-and-support-source'
                documents.append({'sourceId': row['sourceId'], 'name': path.name,
                    'sha256': digest, 'paragraphs': paragraphs(path),
                    'authority': 'user-supplied-methodic-not-clinical-evidence',
                    'status': 'extracted-pending-curated-selection'})
        ledger.append(row)
    output.mkdir(parents=True)
    (output / 'documents.json').write_text(json.dumps(documents, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'source-ledger.json').write_text(json.dumps({'records': ledger,
        'sourceCount': len(records), 'uniqueFiles': len(seen), 'clientDocuments': len(documents),
        'policy': 'Private sources outside git; only explicitly selected paragraphs become SFT/reference.'}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'sources': len(records), 'unique': len(seen), 'clientDocuments': len(documents),
        'paragraphs': sum(len(d['paragraphs']) for d in documents)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
