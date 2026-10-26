// Draws the shared natal wheel and dresses the planets as discs, as in the Figma frames; a planet can be picked.
const NS = 'http://www.w3.org/2000/svg';
const DISC_RADIUS = 19;

export const EMPTY_NATAL = { empty: true, planets: [], aspects: [], cusps: Array.from({ length: 12 }, (_, index) => index * 30),
  angles: { asc: { longitude: 0, sign: 'Овен' }, mc: { longitude: 270, sign: 'Козерог' } } };

export function drawWheel(container, natal, onPick = null) {
  window.drawNatalWheel(container, natal ?? EMPTY_NATAL);
  for (const group of container.querySelectorAll('.nw-planet')) {
    const glyph = group.querySelector('.nw-planet-glyph');
    const disc = document.createElementNS(NS, 'circle');
    disc.setAttribute('cx', glyph.getAttribute('x'));
    disc.setAttribute('cy', glyph.getAttribute('y'));
    disc.setAttribute('r', String(DISC_RADIUS));
    disc.setAttribute('class', 'nw-planet-disc');
    group.prepend(disc);
    if (!onPick) continue;
    const [name, ...rest] = (group.querySelector('title')?.textContent ?? '').split(': ');
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `${name}: ${rest.join(': ')}`);
    const pick = () => {
      for (const other of container.querySelectorAll('.nw-planet.is-picked')) other.classList.remove('is-picked');
      group.classList.add('is-picked');
      onPick(name, rest.join(': '));
    };
    group.addEventListener('click', pick);
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); } });
  }
}
