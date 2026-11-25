#!/usr/bin/env node
/**
 * render-lol-tier.js — data/lol-tier.json → lol-tier-list.html
 *
 * 1. 重新產生 <!-- LOL-TIER:RENDER-START/END --> 標記之間的區塊
 *    （30 秒摘要 + 五路 tier 表 + 本版改動速覽）
 * 2. 同步檔頭散落的版號／日期欄位（title / meta / og / JSON-LD / h1 / page-date / 下一版提示）
 *
 * 跟版流程：改 data/lol-tier.json → 跑本腳本 → git diff 自檢 → commit push。
 * 冪等：重複執行第二次起 diff 為零。
 * 用法：node scripts/render-lol-tier.js [--check] （--check 只驗證不寫入）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const HTML = path.join(root, 'lol-tier-list.html');
const DATA = path.join(root, 'data', 'lol-tier.json');

const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const before = fs.readFileSync(HTML, 'utf8');

const fmtDate = (iso) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return `${y} 年 ${m} 月 ${dd} 日`;
};

const pill = (c) => {
  const name = c.zh && c.en ? `${c.zh} ${c.en}` : (c.zh || c.en || '');
  const img = c.id
    ? `<img class="champ-ic" src="assets/lol/icons/${c.id}.png" alt="" loading="lazy" width="32" height="32">`
    : '';
  const delta = c.delta ? ` <span class="${c.delta.dir}">${c.delta.text}</span>` : '';
  const note = c.note ? ` <small>${c.note}</small>` : '';
  return `        <span class="champ">${img}${name}${delta}${note}</span>`;
};

const tierRow = (t) => {
  const note = t.note ? `      <div class="tier-note">${t.note}</div>\n` : '';
  const pills = t.champs.map(pill).join('\n');
  return `    <div class="tier-row tier-${t.tier}"><div class="tier-label">${t.tier}</div><div>\n${note}      <div class="champ-pills">\n${pills}\n      </div>\n    </div></div>`;
};

const roleBlock = (r) => `  <h2>${r.title}</h2>\n  <div class="tier-table">\n${r.tiers.map(tierRow).join('\n')}\n  </div>`;

const parts = [];
parts.push(`  <h2>本版 30 秒摘要</h2>`);
parts.push(`  <ul>`);
for (const li of d.summary) parts.push(`    <li>${li}</li>`);
parts.push(`  </ul>`);
parts.push('');
for (const r of d.roles) { parts.push(roleBlock(r)); parts.push(''); }
parts.push(`  <h2>本版改動中文速覽（召喚峽谷）</h2>`);
parts.push(`  <ul>`);
parts.push(`    <li><strong>加強</strong>：${d.patchNotes.buffs}</li>`);
parts.push(`    <li><strong>削弱</strong>：${d.patchNotes.nerfs}</li>`);
parts.push(`    <li>詳細數值以<a href="${d.patchNotes.sourceUrl}" target="_blank" rel="noopener">${d.patchNotes.sourceLabel}</a>為準。</li>`);
parts.push(`  </ul>`);
const section = parts.join('\n');

const START = /<!-- LOL-TIER:RENDER-START[^\n]*-->\n/;
const END = /\n[ \t]*<!-- LOL-TIER:RENDER-END -->/;

let html = before;
if (!START.test(html) || !END.test(html)) {
  console.error('ERROR: LOL-TIER render markers not found in lol-tier-list.html');
  process.exit(1);
}
html = html.replace(START, (m) => m); // no-op guard
html = html.replace(/(<!-- LOL-TIER:RENDER-START[^\n]*-->\n)[\s\S]*?(\n[ \t]*<!-- LOL-TIER:RENDER-END -->)/, `$1${section}$2`);

// ---- 同步散落欄位 ----
const v = d.version;
html = html.replace(/LoL \d+\.\d+ 版/g, `LoL ${v} 版`);
html = html.replace(/Patch \d+\.\d+/g, `Patch ${v}`);
html = html.replace(/\d+\.\d+ tier list/g, `${v} tier list`);
html = html.replace(/"dateModified":"\d{4}-\d{2}-\d{2}"/, `"dateModified":"${d.updated}"`);
html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d.ogDescription}"`);
html = html.replace(/下一版 Patch [\d.]+ 預計/, `下一版 Patch ${d.nextVersion} 預計`);
html = html.replace(/<div class="page-date">[^<]*<\/div>/, `<div class="page-date">對應版本：Patch ${v}（${d.patchLive} 上線）｜整理日期：${fmtDate(d.updated)}｜每兩週跟版更新</div>`);

if (process.argv.includes('--check')) {
  const changed = html !== before;
  console.log(changed ? 'CHECK: would update (diff exists)' : 'CHECK: clean (no diff)');
  process.exit(changed ? 2 : 0);
}

fs.writeFileSync(HTML, html);
const pills = d.roles.reduce((n, r) => n + r.tiers.reduce((m, t) => m + t.champs.length, 0), 0);
console.log(`OK: lol-tier-list.html rendered — v${v} roles=${d.roles.length} pills=${pills} updated=${d.updated}`);
