"""Turns the text of the psychology course presentations (extracted to D:/AnnaAI/data/presentations-text) into Markdown for the chat's
search over materials (server/knowledge.js): one slide = one paragraph, the file title as the heading.

Only the lessons about people and relationships are taken (character, needs, defenses, attachment, parents, family, trauma,
dependence, development, communication, motivation); lessons for practising psychologists (consulting methods, ethics, law, sales,
self-presentation, promotion in social networks) are left out, because the chat answers visitors, not colleagues.

The materials are not Anna's own lectures. They stay outside Git (D:/AnnaAI) and are switched on for the chat only after the rights to use
them are confirmed and Anna has read them: KNOWLEDGE_PATH on the server is empty at the moment.

Usage: python training/presentations-to-knowledge.py [out-dir]   (default D:/AnnaAI/knowledge/psychology)
"""
import re
import sys
from pathlib import Path

SOURCE = Path('D:/AnnaAI/data/presentations-text')
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'D:/AnnaAI/knowledge/psychology')
TAKE = ('характер', 'привязанност', 'потребност', 'родител', 'семья', 'защит', 'развитие_личности', 'мотивац', 'травм', 'зависим',
        'эффективного_общения')
SKIP = ('продаж', 'самопрезент', 'консультир', 'этика', 'правов', 'подходы', 'литература', 'требования', 'как_работать_с_разными', 'цели_и_задачи')


def title_of(stem):
    text = re.sub(r'^(\d+_)', '', stem).replace('_', ' ').strip()
    return text[:1].upper() + text[1:]


written = 0
OUT.mkdir(parents=True, exist_ok=True)
for path in sorted((SOURCE / 'Психолог Горячая Анна').glob('*.txt')):
    key = path.stem.lower()
    if not any(word in key for word in TAKE) or any(word in key for word in SKIP):
        continue
    slides = re.split(r'--- слайд \d+ ---', path.read_text(encoding='utf-8'))
    paragraphs = [re.sub(r'\s+', ' ', slide).strip() for slide in slides]
    paragraphs = [p for p in paragraphs if len(p) > 40]
    if not paragraphs:
        continue
    body = f'# {title_of(path.stem)}\n\n' + '\n\n'.join(paragraphs) + '\n'
    (OUT / f'{path.stem[:80]}.md').write_text(body, encoding='utf-8')
    written += 1
    print(f'{len(paragraphs):3} слайдов | {title_of(path.stem)[:90]}')
print(f'файлов: {written}; папка {OUT}')
