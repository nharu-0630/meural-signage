// Weather icons as inline SVG keyed to the provider's `icon` field. Each uses
// currentColor so CSS controls size/color. Designed to read clearly at a glance
// on a wall-mounted panel.

const sun = (cx = 12, cy = 12, r = 5) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffd34d"/>
  ${Array.from({ length: 8 })
    .map((_, i) => {
      const a = (i * Math.PI) / 4;
      const x1 = cx + Math.cos(a) * (r + 2.5);
      const y1 = cy + Math.sin(a) * (r + 2.5);
      const x2 = cx + Math.cos(a) * (r + 5);
      const y2 = cy + Math.sin(a) * (r + 5);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffd34d" stroke-width="1.6" stroke-linecap="round"/>`;
    })
    .join("")}`;

const moon = `<path d="M15.5 13.2A6 6 0 0 1 9 5.2a6.2 6.2 0 1 0 6.5 8z" fill="#cdd7ff"/>`;

const cloud = (fill = "#c8d0dc", x = 0, y = 0) =>
  `<path transform="translate(${x},${y})" d="M7.5 18h9a4 4 0 0 0 .4-7.98 5.5 5.5 0 0 0-10.6-1.2A3.9 3.9 0 0 0 7.5 18z" fill="${fill}"/>`;

const drops = (color = "#5aa9ff", n = 3) =>
  Array.from({ length: n })
    .map((_, i) => {
      const x = 8 + i * 3.5;
      return `<line x1="${x}" y1="18.5" x2="${x - 1.2}" y2="21.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
    })
    .join("");

const snow = (color = "#dfeeff", n = 3) =>
  Array.from({ length: n })
    .map((_, i) => `<circle cx="${8 + i * 3.5}" cy="20" r="1.1" fill="${color}"/>`)
    .join("");

const bolt = `<path d="M12 17l-2.2 3.8h2l-1 3.2 3.6-4.6h-2l1.2-2.4z" fill="#ffd34d"/>`;

function svg(inner: string): string {
  return `<svg viewBox="0 0 24 26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

export function weatherIcon(key: string, isDay = true): string {
  switch (key) {
    case "clear":
      return svg(isDay ? sun(12, 12, 6) : moon);
    case "mostly-clear":
      return svg((isDay ? sun(9, 9, 4) : moon) + cloud("#c8d0dc", 2, 3));
    case "partly-cloudy":
      return svg((isDay ? sun(8, 8, 4) : moon) + cloud("#c8d0dc", 2, 3));
    case "cloudy":
      return svg(cloud("#aab4c2", -2, -1) + cloud("#c8d0dc", 2, 2));
    case "fog":
      return svg(
        cloud("#c8d0dc", 0, -2) +
          `<line x1="5" y1="20" x2="19" y2="20" stroke="#aab4c2" stroke-width="1.6" stroke-linecap="round"/><line x1="6" y1="23" x2="18" y2="23" stroke="#aab4c2" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    case "drizzle":
      return svg(cloud("#aab4c2", 0, -1) + drops("#7fc0ff", 3));
    case "rain":
      return svg(cloud("#9fb0c4", 0, -1) + drops("#5aa9ff", 4));
    case "showers":
      return svg((isDay ? sun(8, 7, 3) : moon) + cloud("#9fb0c4", 1, 1) + drops("#5aa9ff", 3));
    case "snow":
      return svg(cloud("#aab4c2", 0, -1) + snow("#eaf4ff", 4));
    case "thunder":
      return svg(cloud("#8a97a8", 0, -2) + bolt + drops("#5aa9ff", 2));
    default:
      return svg(cloud());
  }
}

export const spotifyGlyph = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#1db954"/>
    <path d="M6.8 10.2c3.4-1 7.9-.8 11 1.1M7.2 13.2c2.8-.8 6.3-.6 8.8.9M7.6 16c2.2-.6 4.8-.5 6.8.7"
      fill="none" stroke="#06331a" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
