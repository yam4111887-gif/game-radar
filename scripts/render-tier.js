#!/usr/bin/env node
/**
 * render-tier.js — data/<game>-tier.json → <game>-tier-list.html（資料層渲染器）
 *
 * 用法：node scripts/render-tier.js <lol|wr|all> [--check]
 *   --check：只驗證是否會產生 diff，不寫入（exit 2 = 有 diff）
 *
 * 每個遊戲：
 *   1. 重新產生 <!-- <MARKER>:RENDER-START/END --> 標記之間的區塊
 *      （30 秒摘要 + 五路 tier 表 + LoL 另含本版改動速覽）
 *   2. 同步檔頭散落的版號／日期欄位（title / meta / og / JSON-LD / h1 / page-date）
 *
 * 跟版流程（cron 與人工同款）：改 data/<game>-tier.json → 跑本腳本 → git diff 自檢 → commit push。
 * 冪等：重複執行第二次起 diff 為零。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const fmtDate = (iso) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return `${y} 年 ${m} 月 ${dd} 日`;
};

const lolVersion = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'data', 'lol-tier.json'), 'utf8')).version; }
  catch { return null; }
})();

const GAMES = {
  lol: {
    html: 'lol-tier-list.html',
    data: 'data/lol-tier.json',
    marker: 'LOL-TIER',
    fields: (d) => [
      [/LoL \d+\.\d+ 版/g, `LoL ${d.version} 版`],
      [/Patch \d+\.\d+/g, `Patch ${d.version}`],
      [/\d+\.\d+ tier list/g, `${d.version} tier list`],
      [/"dateModified":"\d{4}-\d{2}-\d{2}"/, `"dateModified":"${d.updated}"`],
      [/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d.ogDescription}"`],
      [/下一版 Patch [\d.]+ 預計/, `下一版 Patch ${d.nextVersion} 預計`],
      [/<div class="page-date">[^<]*<\/div>/, `<div class="page-date">對應版本：Patch ${d.version}（${d.patchLive} 上線）｜整理日期：${fmtDate(d.updated)}｜每兩週跟版更新</div>`],
    ],
  },
  wr: {
    html: 'wild-rift-tier-list.html',
    data: 'data/wr-tier.json',
    marker: 'WR-TIER',
    fields: (d) => [
      [/狂野峽谷 \d+\.\d+/g, `狂野峽谷 ${d.version}`],
      [/"version":"\d+\.\d+"/, `"version":"${d.version}"`],
      [/"dateModified":"\d{4}-\d{2}-\d{2}"/, `"dateModified":"${d.updated}"`],
      [/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d.ogDescription}"`],
      ...(lolVersion ? [[/LoL \d+\.\d+ 五路排行/g, `LoL ${lolVersion} 五路排行`]] : []),
      [/<div class="page-date">[^<]*<\/div>/, `<div class="page-date">對應版本：${d.version}｜整理日期：${fmtDate(d.updated)}｜每版跟版更新</div>`],
    ],
  },
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

const buildSection = (d) => {
  const parts = [];
  parts.push(`  <h2>本版 30 秒摘要</h2>`);
  parts.push(`  <ul>`);
  for (const li of d.summary) parts.push(`    <li>${li}</li>`);
  parts.push(`  </ul>`);
  parts.push('');
  for (const r of d.roles) { parts.push(roleBlock(r)); parts.push(''); }
  if (d.patchNotes) {
    parts.push(`  <h2>本版改動中文速覽（召喚峽谷）</h2>`);
    parts.push(`  <ul>`);
    parts.push(`    <li><strong>加強</strong>：${d.patchNotes.buffs}</li>`);
    parts.push(`    <li><strong>削弱</strong>：${d.patchNotes.nerfs}</li>`);
    parts.push(`    <li>詳細數值以<a href="${d.patchNotes.sourceUrl}" target="_blank" rel="noopener">${d.patchNotes.sourceLabel}</a>為準。</li>`);
    parts.push(`  </ul>`);
  }
  return parts.join('\n');
};

const renderGame = (game, checkOnly) => {
  const cfg = GAMES[game];
  const d = JSON.parse(fs.readFileSync(path.join(root, cfg.data), 'utf8'));
  const file = path.join(root, cfg.html);
  const before = fs.readFileSync(file, 'utf8');
  let html = before;

  const START = new RegExp(`<!-- ${cfg.marker}:RENDER-START[^\\n]*-->\\n`);
  const END = new RegExp(`\\n[ \\t]*<!-- ${cfg.marker}:RENDER-END -->`);
  if (!START.test(html) || !END.test(html)) {
    console.error(`ERROR: ${cfg.marker} render markers not found in ${cfg.html}`);
    process.exitCode = 1;
    return;
  }
  html = html.replace(
    new RegExp(`(<!-- ${cfg.marker}:RENDER-START[^\\n]*-->\\n)[\\s\\S]*?(\\n[ \\t]*<!-- ${cfg.marker}:RENDER-END -->)`),
    `$1${buildSection(d)}$2`
  );
  for (const [re, out] of cfg.fields(d)) html = html.replace(re, out);

  if (checkOnly) {
    const changed = html !== before;
    console.log(`${game}: ${changed ? 'would update (diff exists)' : 'clean (no diff)'}`);
    if (changed) process.exitCode = 2;
    return;
  }
  fs.writeFileSync(file, html);
  const pills = d.roles.reduce((n, r) => n + r.tiers.reduce((m, t) => m + t.champs.length, 0), 0);
  console.log(`OK: ${cfg.html} rendered — v${d.version} roles=${d.roles.length} pills=${pills} updated=${d.updated}`);
};

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const targets = args.filter(a => !a.startsWith('--'));
const games = targets.length && targets[0] !== 'all' ? targets.filter(g => GAMES[g]) : Object.keys(GAMES);
if (!games.length) { console.error('usage: node scripts/render-tier.js <lol|wr|all> [--check]'); process.exit(1); }
for (const g of games) renderGame(g, checkOnly);
