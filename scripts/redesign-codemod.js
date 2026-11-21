#!/usr/bin/env node
/* eslint-disable */
/**
 * redesign-codemod.js — 一次性：全站 chrome 升級至設計系統 v2
 *  - logo ◎ → SVG 雷達標誌（header + footer）
 *  - hero 插入 eyebrow（GAME RADAR · 每日更新）
 *  - badge 去 emoji（CSS 圓點取代）
 *  - h2 去 emoji → SVG 圖示（.h2i）
 *  - 導流卡 inline max-width → .promo class
 *  - <head> 掛 favicon.svg + theme-color
 * 不動任何 <!--XXX-START--> 區塊內容以外的東西？——注意：h2/badge 也在標記外；
 * 標記區塊內容由每日腳本重生成，腳本模板已同步升級（update-codes.js）。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..");

/* ---------- SVG 圖示庫（24×24, stroke=currentColor） ---------- */
const I = (d) =>
  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ICONS = {
  "🎮": I(`<rect x="2.5" y="7.5" width="19" height="10.5" rx="5.25"/><path d="M7 11.5h4M9 9.5v4"/><path d="M15.2 11.5h.01M17.6 13.6h.01"/>`),
  "🖥️": I(`<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>`),
  "🖥": I(`<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>`),
  "📰": I(`<path d="M4 4h13v16H6a2 2 0 0 1-2-2V4z"/><path d="M17 8h3v10a2 2 0 0 1-2 2"/><path d="M7 8h7M7 12h7M7 16h4"/>`),
  "🏆": I(`<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 21h8"/>`),
  "💕": I(`<path d="M12 20s-7.6-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.7 4.4-9.3 9-9.3 9z"/>`),
  "💚": I(`<path d="M12 20s-7.6-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.7 4.4-9.3 9-9.3 9z"/><path d="M7 11.5h2l1-2 2 4 1-2h4"/>`),
  "🧭": I(`<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-4 1 2-5 4-1z"/>`),
  "🤖": I(`<rect x="5" y="8" width="14" height="10" rx="2.5"/><path d="M12 8V4.8"/><circle cx="12" cy="3.8" r="1"/><path d="M9 12.5h.01M15 12.5h.01M9.5 15.5h5"/>`),
  "⚡": I(`<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2z"/>`),
  "⚔️": I(`<path d="M3.5 3.5 17 17M20.5 3.5 7 17"/><path d="m14.5 19.5 5-5M9.5 19.5l-5-5"/>`),
  "⚔": I(`<path d="M3.5 3.5 17 17M20.5 3.5 7 17"/><path d="m14.5 19.5 5-5M9.5 19.5l-5-5"/>`),
  "🎯": I(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`),
  "🏹": I(`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/><circle cx="12" cy="12" r="1.2"/>`),
  "👀": I(`<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`),
  "🎵": I(`<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>`),
  "🌑": I(`<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>`),
  "🌳": I(`<path d="M12 3 6.5 11h3L5 17h14l-4.5-6h3L12 3z"/><path d="M12 17v4"/>`),
  "🌿": I(`<path d="M4 20C4 11 11 4 20 4c0 9-7 16-16 16z"/><path d="M8 16c2-4 5-7 9-9"/>`),
  "🍜": I(`<path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9z"/><path d="M8 7c0-1.5 1-1.5 1-3M13 7c0-1.5 1-1.5 1-3"/>`),
  "🎬": I(`<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M2.5 10.5 7 7M7 7v3.5M12.5 7v3.5M18 7l3.5 3.5"/>`),
  "✨": I(`<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>`),
  "🌀": I(`<path d="M12 12a2.6 2.6 0 1 0 2.6 2.6A5.6 5.6 0 1 1 9 9a8.6 8.6 0 1 0 8.6 8.6"/>`),
  "🌍": I(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`),
  "💥": I(`<path d="M12 2c1.5 3 1 5 .5 6.5C14 7.5 15.5 6 16 4c1.5 2 1.5 5 .5 7 2-.5 4 0 5.5 1.5-2 1-3 2-3.5 4-1.5-1-3.5-1-5 .5.5-2-.5-4-2.5-5-1.5 1.5-3.5 1.5-5 .5.5-2-.5-4-2.5-5C5 6 5.5 4 7 2.5c.5 2 2 3.5 4 4C10.5 5 11 3.5 12 2z"/>`),
  "💫": I(`<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z"/>`),
  "📋": I(`<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/><path d="M9 10h.01M9 14h.01M9 18h.01M13 10h3M13 14h3M13 18h2"/>`),
  "📌": I(`<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>`),
  "📚": I(`<path d="M12 5.5C10 4.2 7.5 3.5 4 3.5v14c3.5 0 6 .7 8 2 2-1.3 4.5-2 8-2v-14c-3.5 0-6 .7-8 2z"/><path d="M12 5.5v14"/>`),
  "📱": I(`<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>`),
  "🗓": I(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`),
  "🗓️": I(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`),
  "🛠️": I(`<path d="M14.5 6.5a4.5 4.5 0 0 0-6 5.7L3 17.7 6.3 21l5.5-5.5a4.5 4.5 0 0 0 5.7-6L14 13l-3-3 3.5-3.5z"/>`),
  "🛡️": I(`<path d="M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6l8-3z"/>`),
  "🛡": I(`<path d="M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6l8-3z"/>`),
  "🤝": I(`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2 .8 3.5 2.6 4 5.2"/>`),
  "☣️": I(`<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17.3h.01"/>`),
  "🎁": I(`<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12M12 8v13"/><path d="M12 8c-4 0-5.2-2-4.6-3.6C8 2.8 10.2 3 12 5.6 13.8 3 16 2.8 16.6 4.4 17.2 6 16 8 12 8z"/>`),
};

const FALLBACK_ICON = ICONS["🧭"];

/* logo 雷達標誌（漸層，每頁 header/footer 各一，id 加流水號） */
function logoSvg(n) {
  return `<svg width="21" height="21" viewBox="0 0 64 64" fill="none" aria-hidden="true"><defs><linearGradient id="lg${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><circle cx="32" cy="32" r="19" stroke="url(#lg${n})" stroke-width="3.4" opacity=".95"/><circle cx="32" cy="32" r="10.5" stroke="url(#lg${n})" stroke-width="2.4" opacity=".45"/><circle cx="32" cy="32" r="3.6" fill="#22d3ee"/><path d="M32 32 46 18" stroke="#dff4ff" stroke-width="3.6" stroke-linecap="round"/><circle cx="43" cy="39" r="3.4" fill="#8b5cf6"/><circle cx="21" cy="23" r="2.4" fill="#22d3ee" opacity=".85"/></svg>`;
}

const EMOJI_RE =
  /^((?:\p{Extended_Pictographic}|\uFE0F|\u200D|\p{Regional_Indicator})+)/u;

let changed = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(DIR, f);
  let html = fs.readFileSync(p, "utf8");
  const before = html;

  /* ① favicon + theme-color */
  html = html.replace(
    `<link rel="stylesheet" href="style.css">`,
    `<link rel="stylesheet" href="style.css">\n<meta name="theme-color" content="#070a12">\n<link rel="icon" href="favicon.svg" type="image/svg+xml">`
  );

  /* ② logo ◎ → SVG（流水號 gradient id） */
  let n = 0;
  html = html.replace(/<span class="mark">◎<\/span>/g, () => {
    n += 1;
    return `<span class="mark">${logoSvg(n)}</span>`;
  });

  /* ③ hero eyebrow */
  html = html.replace(
    /(<section id="hero">)(\s*)(<h1>)/,
    `$1$2<p class="hero-eyebrow"><span class="dot"></span>GAME RADAR · 每日更新</p>$2$3`
  );

  /* ④ badge 去 emoji */
  html = html.replace(
    /(class="badge">)(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]\uFE0F?\u200D?)+\s*/gu,
    "$1"
  );

  /* ⑤ h2 去 emoji → .h2i SVG */
  html = html.replace(/<h2>([^<]*)<\/h2>/g, (m, inner) => {
    const t = inner.trim();
    const em = EMOJI_RE.exec(t);
    if (!em) return m;
    const emoji = em[1].replace(/[\uFE0F\u200D]/g, "");
    const rest = t.slice(em[1].length).trim();
    const icon = ICONS[emoji] || FALLBACK_ICON;
    return `<h2><span class="h2i" aria-hidden="true">${icon}</span>${rest}</h2>`;
  });

  /* ⑥ 導流卡：inline max-width → .promo */
  html = html.replace(
    /class="game-card" style="max-width:\d+px"/g,
    `class="game-card promo"`
  );

  if (html !== before) {
    fs.writeFileSync(p, html);
    changed++;
    console.log(`✓ ${f}`);
  } else {
    console.log(`– ${f}（無變更）`);
  }
}
console.log(`\n完成：${changed} 頁更新`);
