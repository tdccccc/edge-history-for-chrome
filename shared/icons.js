/**
 * Inline SVG sprite. Keeping icons in one local module avoids external fonts,
 * network requests and CSP issues while still allowing simple HTML markup.
 */

const SYMBOLS = {
  history: `
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l3 2"/>`,
  restore: `
    <path d="M3 3v6h6"/>
    <path d="M3.6 9A9 9 0 1 1 3 14.5"/>`,
  devices: `
    <rect x="2" y="4" width="13" height="9" rx="1.6"/>
    <path d="M5 17h7M8.5 13v4"/>
    <rect x="17" y="8" width="5" height="9" rx="1.2"/>
    <path d="M19 15h1"/>`,
  search: `
    <circle cx="11" cy="11" r="7"/>
    <path d="m20 20-3.6-3.6"/>`,
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  "chevron-left": '<path d="m15 6-6 6 6 6"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="2.6"/>',
  trash: `
    <path d="M3 6h18"/>
    <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v5M14 11v5"/>`,
  external: `
    <path d="M14 3h7v7"/>
    <path d="M21 3 12 12"/>
    <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>`,
  copy: `
    <rect x="9" y="9" width="11" height="11" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  settings: `
    <path d="M4 7h9M18 7h2M4 17h2M11 17h9"/>
    <circle cx="16" cy="7" r="2.2"/>
    <circle cx="8" cy="17" r="2.2"/>`,
  sun: `
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  monitor: `
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8M12 17v4"/>`,
  refresh: `
    <path d="M21 12a9 9 0 1 1-2.6-6.4"/>
    <path d="M21 3v6h-6"/>`,
  select: `
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <path d="m8 12 3 3 5-6"/>`,
  clock: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3.2 2"/>`,
  calendar: `
    <rect x="3" y="5" width="18" height="16" rx="2"/>
    <path d="M16 3v4M8 3v4M3 11h18"/>`,
  window: `
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <path d="M3 9h18"/>`,
  globe: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M3 12h18"/>
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>`,
  pin: '<path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  keyboard: `
    <rect x="2" y="6" width="20" height="12" rx="2"/>
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`,
  info: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 11v5M12 8h.01"/>`,
  shield: `
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="m9 12 2 2 4-4"/>`,
  alert: `
    <path d="M10.3 3.9 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
    <path d="M12 9v4M12 17h.01"/>`,
  link: `
    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/>
    <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>`,
  laptop: `
    <rect x="4" y="4" width="16" height="11" rx="2"/>
    <path d="M2 19h20"/>`,
  phone: `
    <rect x="7" y="2" width="10" height="20" rx="2.5"/>
    <path d="M11 18h2"/>`,
  tablet: `
    <rect x="5" y="2" width="14" height="20" rx="2.5"/>
    <path d="M11 18h2"/>`,
  "circle-check": `
    <circle cx="12" cy="12" r="9"/>
    <path d="m8 12 3 3 5-6"/>`,
  "arrow-up-right": '<path d="M7 17 17 7M8 7h9v9"/>',
  "file-text": `
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6M8 13h8M8 17h5"/>`,
  inbox: `
    <path d="M4 4h16v16H4z"/>
    <path d="M4 14h5l1.5 2h3L15 14h5"/>`,
  sparkle: `
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>
    <path d="M19 16v4M17 18h4"/>`
};

const SPRITE_ID = '__edge_history_icon_sprite__';
let mounted = false;

export function icon(name, className = '') {
  if (!SYMBOLS[name]) return '';
  return `<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

export function mountIcons(root = document) {
  if (!mounted) {
    if (!document.body || document.getElementById(SPRITE_ID)) {
      if (document.getElementById(SPRITE_ID)) mounted = true;
    } else {
      const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sprite.id = SPRITE_ID;
      sprite.setAttribute('aria-hidden', 'true');
      sprite.setAttribute('focusable', 'false');
      sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      sprite.innerHTML = Object.entries(SYMBOLS)
        .map(([name, paths]) => `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</symbol>`)
        .join('');
      document.body.prepend(sprite);
      mounted = true;
    }
  }

  for (const element of root.querySelectorAll('[data-icon]')) {
    const name = element.getAttribute('data-icon');
    if (!name) continue;
    if (!element.querySelector(':scope > svg.icon[data-generated]')) {
      const svg = icon(name, element.getAttribute('data-icon-class') || '');
      element.insertAdjacentHTML('afterbegin', svg);
      const inserted = element.querySelector(':scope > svg.icon');
      if (inserted) inserted.setAttribute('data-generated', '');
    }
    element.removeAttribute('data-icon');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountIcons(), { once: true });
} else {
  mountIcons();
}
