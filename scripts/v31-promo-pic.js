/* 一次性 codemod：幫 .game-card.promo 注入圖示勳章 <span class="pic">（v3.1 內容層）
   對既有 HTML 冪等：已有 .pic 的卡不再插入。用法：node scripts/v31-promo-pic.js */
const fs = require("fs");
const path = require("path");

const ICONS = {
  steam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  couple: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.6-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.7 4.4-9.3 9-9.3 9z"/></svg>',
  tier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 21h8"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h13v16H6a2 2 0 0 1-2-2V4z"/><path d="M17 8h3v10a2 2 0 0 1-2 2"/><path d="M7 8h7M7 12h7M7 16h4"/></svg>',
  codes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8v12"/><path d="M12 8H8.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8z"/><path d="M12 8h3.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z"/></svg>',
  radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/></svg>',
};

function iconFor(href) {
  if (/steam/.test(href)) return ICONS.steam;
  if (/couple/.test(href)) return ICONS.couple;
  if (/tier-list/.test(href)) return ICONS.tier;
  if (/codes/.test(href)) return ICONS.codes;
  if (/lol-|zelda|gta|gamescom|2026/.test(href)) return ICONS.news;
  return ICONS.radar;
}

for (const file of ["index.html", "steam.html", "specs.html"]) {
  const p = path.join(__dirname, "..", file);
  let html = fs.readFileSync(p, "utf8");
  const re = /<a class="game-card promo" href="([^"]+)">(\s*)<span class="t">/g;
  let n = 0;
  html = html.replace(re, (m, href, ws) => {
    n++;
    return `<a class="game-card promo" href="${href}">${ws}  <span class="pic">${iconFor(href)}</span>${ws}<span class="t">`;
  });
  fs.writeFileSync(p, html);
  console.log(`${file}: +${n} pic`);
}
