"use strict";

/* 遊戲前哨站 — 讀取同源 data/games.json（官方 RSS 產出）渲染最新收錄。 */

(async () => {
  const status = document.getElementById("data-status");
  const grid = document.getElementById("game-grid");
  const note = document.getElementById("game-note");

  /* 靜態清單已由更新腳本寫進 HTML（SEO 用）——直接讀 data 屬性顯示狀態 */
  if (grid && grid.children.length) {
    status.innerHTML = `<span>📅 最近更新：<strong>${grid.dataset.updated || ""}</strong></span><span>📦 收錄 <strong>${grid.dataset.count || grid.children.length}</strong> 款最新遊戲</span><span>📡 來源：Apple 官方 iTunes RSS</span>`;
    note.textContent = `顯示最新 ${grid.children.length} 款（按上架時間新到舊）。清單為官方資料自動收錄，非編輯推薦。`;
    return;
  }

  /* 備援：靜態內容缺失時才動態抓 JSON */
  let data = null;
  try {
    const res = await fetch("data/games.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (e) {
    status.textContent = "❌ 資料載入失敗（" + (e.message || e) + "）——請稍後再試，或以 App Store 官方為準。";
    return;
  }
  status.innerHTML = `<span>📅 最近更新：<strong>${data.updated}</strong></span><span>📦 收錄 <strong>${data.count}</strong> 款最新遊戲</span><span>📡 來源：${data.source}</span>`;

  grid.innerHTML = "";
  for (const g of data.games.slice(0, 24)) {
    const a = document.createElement("a");
    a.className = "game-card";
    a.href = g.url || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `
      ${g.icon ? `<img src="${g.icon}" alt="" loading="lazy">` : ""}
      <span class="t">
        <span class="name">${g.name.replace(/</g, "&lt;")}</span>
        <span class="meta">${(g.artist || "").replace(/</g, "&lt;") || "獨立開發"} · ${g.price || "免費"}</span>
        <span class="go">在 App Store 查看 →</span>
      </span>`;
    grid.appendChild(a);
  }
  note.textContent = `顯示最新 ${Math.min(24, data.games.length)} 款（共收錄 ${data.count} 款，按上架時間新到舊）。清單為官方資料自動收錄，非編輯推薦。`;
})();
