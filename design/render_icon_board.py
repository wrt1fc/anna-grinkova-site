"""Render a contact sheet for the hand-drawn site icon family."""

from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

import cairosvg


ROOT = Path(__file__).resolve().parent.parent
SPRITE = ROOT / "prototype" / "assets" / "icons.svg"
OUTPUT = ROOT / "design" / "preview" / "icon-system.png"
NAMES = [
    ("home", "Главная"),
    ("day", "Карта дня"),
    ("week", "Неделя"),
    ("chat", "Чат"),
    ("user", "Профиль"),
    ("calendar", "Календарь"),
    ("clock", "Время"),
    ("send", "Отправить"),
    ("star", "Знак карты"),
    ("eye", "Показать"),
    ("copy", "Копировать"),
    ("refresh", "Повторить"),
]


def unnamespace(element):
    element.tag = element.tag.rsplit("}", 1)[-1]
    for child in element:
        unnamespace(child)
    return element


symbols = {
    symbol.get("id"): "".join(
        ET.tostring(unnamespace(deepcopy(child)), encoding="unicode")
        for child in symbol
    )
    for symbol in ET.parse(SPRITE).getroot()
}

pieces = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="820" viewBox="0 0 1200 820">',
    '<defs><radialGradient id="base" cx="50%" cy="0%" r="95%"><stop stop-color="#302016"/><stop offset="1" stop-color="#130d0b"/></radialGradient></defs>',
    '<rect width="1200" height="820" fill="url(#base)"/>',
    '<circle cx="1050" cy="90" r="270" fill="none" stroke="#8a6638" opacity=".28"/>',
    '<circle cx="1050" cy="90" r="200" fill="none" stroke="#8a6638" opacity=".24"/>',
    '<text x="45" y="59" fill="#efd281" font-family="Georgia" font-size="16" letter-spacing="4">АННА ГРИНЬКОВА</text>',
    '<text x="45" y="120" fill="#f6efe7" font-family="Georgia" font-size="47">Латунная орбита</text>',
    '<text x="47" y="150" fill="#bcaa98" font-family="Arial" font-size="14">Система знаков для сайта</text>',
    '<line x1="45" y1="171" x2="1155" y2="171" stroke="#987647" opacity=".6"/>',
]

for index, (name, label) in enumerate(NAMES):
    col, row = index % 4, index // 4
    x, y = 45 + col * 285, 194 + row * 195
    pieces += [
        f'<rect x="{x}" y="{y}" width="255" height="169" fill="#211610" stroke="#735632" stroke-width="1"/>',
        f'<circle cx="{x + 127.5}" cy="{y + 69}" r="47" fill="none" stroke="#6f5432" opacity=".7"/>',
        f'<g transform="translate({x + 89} {y + 31}) scale(3.2)" fill="none" stroke="#e8c574" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">{symbols[name]}</g>',
        f'<text x="{x + 127.5}" y="{y + 142}" text-anchor="middle" fill="#e8d7bf" font-family="Arial" font-size="15">{label}</text>',
    ]

pieces += [
    '<line x1="45" y1="786" x2="1155" y2="786" stroke="#987647" opacity=".6"/>',
    '<text x="45" y="807" fill="#927f6c" font-family="Arial" font-size="10" letter-spacing="2">ENGRAVED ORBITS / ICON STUDY</text>',
    '</svg>',
]
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
cairosvg.svg2png(bytestring="".join(pieces).encode("utf-8"), write_to=str(OUTPUT))
print(OUTPUT)
