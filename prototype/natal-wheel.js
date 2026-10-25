// Draws a natal chart wheel as SVG from the /api/natal answer: sign ring, house cusps, planets and aspect lines.
// The ascendant sits on the left, signs run counter-clockwise (the usual way charts are drawn). Without a birth time
// there are no houses, so 0° Aries is placed on the left and only signs, planets and aspects are shown.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const SIZE = 640;
  const C = SIZE / 2;
  const R_OUT = 308, R_SIGN = 262, R_HOUSE = 150, R_PLANET = 214, R_TICK = 252, R_ASPECT = 146;
  const MIN_GAP = 8; // degrees between neighbouring planet glyphs
  const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
  const PLANET_GLYPHS = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', node: '☊' };
  const TEXT_FORM = '︎'; // asks the system to draw the symbol as text, not as a coloured emoji
  const ASPECT_COLOR = { conjunction: '#deb858', sextile: '#7fb3a1', trine: '#7fb3a1', square: '#c9694f', opposition: '#c9694f' };

  const el = (name, attributes = {}, text) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Math angle (degrees, counter-clockwise from the right) of a zodiac longitude, with the origin on the left.
  const angleOf = (longitude, origin) => 180 + (longitude - origin);
  const point = (radius, angle) => {
    const rad = (angle * Math.PI) / 180;
    return [C + radius * Math.cos(rad), C - radius * Math.sin(rad)];
  };
  const line = (r1, a1, r2, a2, attributes) => {
    const [x1, y1] = point(r1, a1); const [x2, y2] = point(r2, a2);
    return el('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), ...attributes });
  };

  // Pushes glyphs apart so neighbours do not overlap; the true position stays on the tick mark.
  function spread(planets, origin) {
    const items = planets.map((planet) => ({ planet, angle: angleOf(planet.longitude, origin), shown: 0 }))
      .sort((a, b) => a.angle - b.angle);
    for (const item of items) item.shown = item.angle;
    for (let pass = 0; pass < 40; pass += 1) {
      let moved = false;
      for (let i = 0; i < items.length; i += 1) {
        const next = items[(i + 1) % items.length];
        let gap = next.shown - items[i].shown;
        if (i === items.length - 1) gap += 360;
        if (gap < MIN_GAP) {
          const push = (MIN_GAP - gap) / 2;
          items[i].shown -= push; next.shown += push; moved = true;
        }
      }
      if (!moved) break;
    }
    return items;
  }

  function describe(natal) {
    if (natal.empty) return 'Колесо натальной карты';
    const sun = natal.planets.find((item) => item.key === 'sun');
    const moon = natal.planets.find((item) => item.key === 'moon');
    const parts = [`Солнце в знаке ${sun.sign}`, `Луна в знаке ${moon.sign}`];
    if (natal.angles) parts.push(`асцендент в знаке ${natal.angles.asc.sign}`);
    return `Колесо натальной карты: ${parts.join(', ')}.`;
  }

  window.drawNatalWheel = function drawNatalWheel(container, natal) {
    container.replaceChildren();
    const origin = natal.angles ? natal.angles.asc.longitude : 0;
    // Leave room for the ASC/MC labels outside the zodiac ring.
    const svg = el('svg', { viewBox: `-40 -40 ${SIZE + 80} ${SIZE + 80}`, role: 'img', 'aria-label': describe(natal), class: 'natal-wheel-svg' });
    svg.append(el('circle', { cx: C, cy: C, r: R_OUT, class: 'nw-ring' }), el('circle', { cx: C, cy: C, r: R_SIGN, class: 'nw-ring' }),
      el('circle', { cx: C, cy: C, r: R_HOUSE, class: 'nw-ring nw-ring-inner' }));

    // Signs: a divider every 30° and the glyph in the middle of the arc.
    for (let sign = 0; sign < 12; sign += 1) {
      const start = angleOf(sign * 30, origin);
      svg.append(line(R_SIGN, start, R_OUT, start, { class: 'nw-sign-line' }));
      const [x, y] = point((R_OUT + R_SIGN) / 2, start + 15);
      const glyph = el('text', { x: x.toFixed(1), y: y.toFixed(1), class: 'nw-sign-glyph', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, SIGN_GLYPHS[sign] + TEXT_FORM);
      glyph.append(el('title', {}, SIGNS[sign]));
      svg.append(glyph);
    }

    // Houses: cusp lines from the inner circle to the sign ring, numbers in the middle of each house.
    if (natal.cusps) {
      natal.cusps.forEach((cusp, index) => {
        const angle = angleOf(cusp, origin);
        const angular = index % 3 === 0;
        svg.append(line(R_HOUSE, angle, R_SIGN, angle, { class: angular ? 'nw-cusp nw-cusp-main' : 'nw-cusp' }));
        const next = natal.cusps[(index + 1) % 12];
        const span = ((next - cusp) % 360 + 360) % 360;
        const [x, y] = point(R_HOUSE + 26, angle + span / 2);
        svg.append(el('text', { x: x.toFixed(1), y: y.toFixed(1), class: 'nw-house-number', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, index + 1));
      });
      const [ax, ay] = point(R_OUT + 14, 180);
      svg.append(el('text', { x: (ax - 2).toFixed(1), y: ay.toFixed(1), class: 'nw-angle-label', 'text-anchor': 'end', 'dominant-baseline': 'central' }, 'ASC'));
      const [mx, my] = point(R_OUT + 14, angleOf(natal.angles.mc.longitude, origin));
      svg.append(el('text', { x: mx.toFixed(1), y: my.toFixed(1), class: 'nw-angle-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'MC'));
    }

    // Aspects: lines across the inner circle between the true positions.
    const longitudeOf = (key) => {
      if (key === 'asc') return natal.angles?.asc.longitude;
      if (key === 'mc') return natal.angles?.mc.longitude;
      return natal.planets.find((item) => item.key === key)?.longitude;
    };
    const aspectGroup = el('g', { class: 'nw-aspects' });
    for (const aspect of natal.aspects) {
      const a = longitudeOf(aspect.first); const b = longitudeOf(aspect.second);
      if (a === undefined || b === undefined) continue;
      const stroke = ASPECT_COLOR[aspect.type] ?? '#deb858';
      const drawn = line(R_ASPECT, angleOf(a, origin), R_ASPECT, angleOf(b, origin), { class: 'nw-aspect', stroke });
      const [x1, y1] = point(R_ASPECT, angleOf(a, origin)); const [x2, y2] = point(R_ASPECT, angleOf(b, origin));
      drawn.setAttribute('x1', x1.toFixed(1)); drawn.setAttribute('y1', y1.toFixed(1)); drawn.setAttribute('x2', x2.toFixed(1)); drawn.setAttribute('y2', y2.toFixed(1));
      drawn.append(el('title', {}, `${aspect.firstName} — ${aspect.secondName}: ${aspect.typeName}`));
      aspectGroup.append(drawn);
    }
    svg.append(aspectGroup);

    // Planets: a tick at the true place, the glyph pushed aside when neighbours are close.
    for (const { planet, angle, shown } of spread(natal.planets, origin)) {
      svg.append(line(R_TICK, angle, R_TICK - 9, angle, { class: 'nw-tick' }));
      const [x, y] = point(R_PLANET, shown);
      const group = el('g', { class: planet.retrograde ? 'nw-planet nw-retro' : 'nw-planet' });
      group.append(el('text', { x: x.toFixed(1), y: y.toFixed(1), class: 'nw-planet-glyph', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, PLANET_GLYPHS[planet.key] + TEXT_FORM));
      const [lx, ly] = point(R_PLANET - 24, shown);
      group.append(el('text', { x: lx.toFixed(1), y: ly.toFixed(1), class: 'nw-planet-degree', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, `${planet.degree}°${planet.retrograde ? 'R' : ''}`));
      group.append(el('title', {}, `${planet.name}: ${planet.degree}° ${planet.sign}${planet.house ? `, ${planet.house} дом` : ''}${planet.retrograde ? ', ретроградный' : ''}`));
      svg.append(group);
    }
    container.append(svg);
  };
})();
