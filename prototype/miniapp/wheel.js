// Draws the shared natal wheel and dresses the planets as discs, as in the Figma frames; a planet can be picked.
const NS = 'http://www.w3.org/2000/svg';
const DISC_RADIUS = 22;
const SIZE = 640, CENTER = SIZE / 2, R_OUT = 308, R_SIGN = 262;
const AXIS_OVERSHOOT = 34;

export const EMPTY_NATAL = { empty: true, planets: [], aspects: [], cusps: Array.from({ length: 12 }, (_, index) => index * 30),
  angles: { asc: { longitude: 0, sign: 'Овен' }, mc: { longitude: 270, sign: 'Козерог' } } };

export function drawWheel(container, natal, onPick = null) {
  const chart = natal ?? EMPTY_NATAL;
  window.drawNatalWheel(container, chart);
  const svg = container.querySelector('svg');
  const origin = chart.angles ? chart.angles.asc.longitude : 0;
  svg.prepend(...signBands(origin), ...(chart.angles ? [axis()] : []));
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

const point = (radius, angle) => [CENTER + radius * Math.cos((angle * Math.PI) / 180), CENTER - radius * Math.sin((angle * Math.PI) / 180)];

// Every second sign of the zodiac ring is filled, as in the Figma wheel.
function signBands(origin) {
  const bands = [];
  for (let sign = 1; sign < 12; sign += 2) {
    const start = 180 + (sign * 30 - origin), end = start + 30;
    const [ox1, oy1] = point(R_OUT, start), [ox2, oy2] = point(R_OUT, end), [ix2, iy2] = point(R_SIGN, end), [ix1, iy1] = point(R_SIGN, start);
    const band = document.createElementNS(NS, 'path');
    band.setAttribute('d', `M${ox1} ${oy1} A${R_OUT} ${R_OUT} 0 0 0 ${ox2} ${oy2} L${ix2} ${iy2} A${R_SIGN} ${R_SIGN} 0 0 1 ${ix1} ${iy1} Z`);
    band.setAttribute('class', 'nw-band');
    bands.push(band);
  }
  return bands;
}

// The ascendant axis shows only outside the inner circle: from past the ring through the zodiac band, both sides.
function axis() {
  const path = document.createElementNS(NS, 'path');
  const reach = R_OUT + AXIS_OVERSHOOT;
  path.setAttribute('d', `M${CENTER - reach} ${CENTER} H${CENTER - R_SIGN} M${CENTER + R_SIGN} ${CENTER} H${CENTER + reach}`);
  path.setAttribute('class', 'nw-axis');
  return path;
}
