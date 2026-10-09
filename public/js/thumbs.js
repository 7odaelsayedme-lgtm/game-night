// رسومات مصغّرة خفيفة لكل لعبة (SVG) — رموز تعبيرية، وليست لقطات شاشة
const wrap = (inner) => `<svg viewBox="0 0 120 80" aria-hidden="true" class="thumb-svg">${inner}</svg>`;

export const THUMBS = {
  tictactoe: wrap(`
    <g stroke="var(--line)" stroke-width="3" stroke-linecap="round">
      <path d="M47 14v52M73 14v52M30 31h60M30 49h60"/>
    </g>
    <g stroke="var(--red)" stroke-width="5" stroke-linecap="round"><path d="M33 17l9 9M42 17l-9 9M59 35l9 9M68 35l-9 9M85 53l-9 9"/><path d="M76 53l9 9"/></g>
    <g fill="none" stroke="var(--teal)" stroke-width="5"><circle cx="86" cy="22" r="5.5"/><circle cx="38" cy="58" r="5.5"/></g>
    <path d="M30 14 90 66" stroke="var(--saffron)" stroke-width="3" stroke-linecap="round" opacity=".9"/>`),
  snakes: wrap(`
    <g fill="var(--line)" opacity=".35">${Array.from({ length: 20 }, (_, i) => ((i + Math.floor(i / 5)) % 2 ? '' : `<rect x="${25 + (i % 5) * 14}" y="${12 + Math.floor(i / 5) * 14}" width="14" height="14"/>`)).join('')}</g>
    <g stroke="var(--saffron)" stroke-width="3.5" stroke-linecap="round"><path d="M38 66 52 14M50 68 64 16"/><path d="M41 54h12M44 42h12M48 29h12"/></g>
    <path d="M90 16c-14 4 6 16-8 22s4 18-10 26" fill="none" stroke="var(--teal)" stroke-width="6" stroke-linecap="round"/>
    <circle cx="90" cy="16" r="5" fill="var(--teal)"/>`),
  spy: wrap(`
    <path d="M34 44h52l-6-18c-1-3-4-4-7-3l-13 4-13-4c-3-1-6 0-7 3z" fill="var(--line)" opacity=".9"/>
    <path d="M26 44h68" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>
    <g fill="none" stroke="var(--saffron)" stroke-width="3.5"><circle cx="48" cy="56" r="7"/><circle cx="72" cy="56" r="7"/><path d="M55 56h10"/></g>
    <text x="96" y="30" font-size="20" fill="var(--red)" font-family="Lalezar, sans-serif">؟</text>`),
  connect4: wrap(`
    <rect x="30" y="14" width="60" height="52" rx="8" fill="var(--line)" opacity=".25"/>
    ${[[0, 3, 'red'], [1, 3, 'teal'], [2, 3, 'red'], [1, 2, 'red'], [2, 2, 'teal'], [2, 1, 'red'], [3, 3, 'teal'], [3, 2, 'teal'], [3, 1, 'teal'], [3, 0, 'red']]
      .map(([c, r, col]) => `<circle cx="${40 + c * 13.3}" cy="${24 + r * 12}" r="5" fill="var(--${col})"/>`).join('')}`),
  majority: wrap(`
    <rect x="34" y="30" width="20" height="36" rx="4" fill="var(--teal)"/>
    <rect x="66" y="46" width="20" height="20" rx="4" fill="var(--red)"/>
    <g fill="var(--line)">${[0, 1, 2].map((i) => `<circle cx="${38 + i * 6}" cy="22" r="2.6"/>`).join('')}<circle cx="73" cy="38" r="2.6"/></g>`),
  reaction: wrap(`
    <circle cx="60" cy="40" r="26" fill="none" stroke="var(--line)" stroke-width="3" opacity=".5"/>
    <path d="M64 14 46 44h13l-4 22 20-32H62z" fill="var(--saffron)"/>`),
  bluff: wrap(`
    <path d="M28 20h40a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H44l-10 8v-8h-6a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" fill="var(--teal)"/>
    <path d="M58 34h34a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-4v8l-10-8H58a6 6 0 0 1-6-6V40a6 6 0 0 1 6-6z" fill="var(--red)"/>
    <text x="70" y="54" font-size="14" fill="var(--cream)" font-family="Lalezar, sans-serif">!؟</text>`),
  draw: wrap(`
    <path d="M26 56c10-18 18-28 26-20s-4 18 6 18 12-26 22-28 10 14 14 20" fill="none" stroke="var(--teal)" stroke-width="4" stroke-linecap="round"/>
    <path d="m84 20 10-6 4 6-10 6z" fill="var(--saffron)"/><path d="m84 20 4 6-6 2z" fill="var(--red)"/>`),
  colors: wrap(`
    <g transform="rotate(-14 46 44)"><rect x="30" y="18" width="30" height="44" rx="6" fill="var(--red)"/><text x="45" y="48" font-size="20" text-anchor="middle" fill="var(--cream)" font-family="Lalezar, sans-serif">7</text></g>
    <g transform="rotate(2 62 40)"><rect x="48" y="16" width="30" height="44" rx="6" fill="var(--saffron)"/><text x="63" y="46" font-size="18" text-anchor="middle" fill="var(--ink)" font-family="Lalezar, sans-serif">+2</text></g>
    <g transform="rotate(16 80 42)"><rect x="66" y="18" width="30" height="44" rx="6" fill="var(--teal)"/><text x="81" y="47" font-size="18" text-anchor="middle" fill="var(--cream)">⇄</text></g>`),
  shayeb: wrap(`
    <g transform="rotate(-12 48 42)"><rect x="32" y="16" width="32" height="46" rx="5" fill="var(--cream)"/><text x="48" y="46" font-size="20" text-anchor="middle" fill="var(--red)">♥</text></g>
    <g transform="rotate(10 72 40)"><rect x="56" y="14" width="34" height="48" rx="5" fill="var(--cream)" stroke="var(--saffron)" stroke-width="2"/><text x="73" y="45" font-size="24" text-anchor="middle" fill="var(--ink)">♚</text></g>`),
  aqar: wrap(`
    <rect x="28" y="12" width="64" height="56" rx="6" fill="none" stroke="var(--line)" stroke-width="2" opacity=".6"/>
    <g>${[0, 1, 2, 3].map((i) => `<rect x="${30 + i * 15}" y="14" width="13" height="5" fill="${['#9A6B4F', '#5BC0EB', '#E86FB4', '#F08A3C'][i]}"/>`).join('')}
      ${[0, 1, 2].map((i) => `<rect x="85" y="${22 + i * 15}" width="5" height="13" fill="${['#E0474C', '#4F6BF7', '#E0474C'][i]}"/>`).join('')}</g>
    <path d="M48 52v-12l12-9 12 9v12z" fill="var(--saffron)"/><rect x="56" y="44" width="8" height="8" fill="var(--ink)"/>`),
};
