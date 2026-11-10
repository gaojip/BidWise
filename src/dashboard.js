(() => {
  "use strict";

  const { evaluateLot } = window.BetterToBid.evaluator;
  const {
    escapeAttr,
    escapeHtml,
    formatLotPrice,
    formatMoney,
    parseMoney
  } = window.BetterToBid.utils;
  const { loadState, saveState } = window.BetterToBid.storage;
  const { exportBackup, mergeBackupState, parseBackupText, previewBackupImport } = window.BetterToBid.exporters;
  const pricing = window.BetterToBid.pricing;
  const { scoreAdvice } = window.BetterToBid.ai;
  const sorting = window.BetterToBid.sorting;

  const lanes = [
    { id: "upcoming", title: "将要关注", hint: "已收藏但尚未记录出价" },
    { id: "active", title: "已出价/领先", hint: "当前仍在竞价或你的出价有效" },
    { id: "outbid", title: "已落后", hint: "当前价高于你的最高出价" },
    { id: "completed", title: "已完成", hint: "已成交、已结束或已售出" }
  ];

  const manualStatusLabels = {
    auto: "自动判断",
    upcoming: "将要关注",
    active: "已出价/领先",
    outbid: "已落后",
    completed: "已完成"
  };

  let state = null;
  let query = "";
  let filterKey = "all";
  let sortKey = "auction";
  let selectedId = "";

  init().catch((error) => {
    console.error("[BetterToBid] Dashboard failed", error);
  });

  async function init() {
    state = await loadState();
    document.getElementById("search").addEventListener("input", (event) => {
      query = event.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById("sort").addEventListener("change", (event) => {
      sortKey = event.target.value;
      render();
    });
    document.getElementById("filter").addEventListener("change", (event) => {
      filterKey = event.target.value || "all";
      render();
    });
    document.getElementById("reload").addEventListener("click", async () => {
      state = await loadState();
      render();
    });
    document.getElementById("backup").addEventListener("click", () => {
      exportBackup(state, setBoardStatus);
    });
    document.getElementById("restore").addEventListener("click", importBackup);
    document.getElementById("board").addEventListener("click", onBoardClick);
    document.getElementById("detail").addEventListener("click", onDetailClick);
    document.getElementById("detail").addEventListener("pointerdown", onDetailPointerDown);
    document.getElementById("detail").addEventListener("submit", onDetailSubmit);
    render();
  }

  function setBoardStatus(message) {
    const headerText = document.querySelector(".board-header p");
    if (!headerText) return;
    headerText.textContent = message;
    clearTimeout(setBoardStatus.timer);
    setBoardStatus.timer = setTimeout(() => {
      setBoardStatus.timer = null;
      renderBoardMeta(getLots().length);
    }, 4500);
  }

  function importBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const importedState = parseBackupText(await file.text());
        const preview = previewBackupImport(importedState, state);
        if (!confirmBackupImport(preview)) {
          setBoardStatus("已取消导入");
          return;
        }
        state = mergeBackupState(importedState, state);
        await saveState(state);
        render();
        setBoardStatus(`已导入备份：${Object.keys(state.lots || {}).length} 个 lot`);
      } catch (error) {
        console.error("[BetterToBid] Backup import failed", error);
        setBoardStatus(`导入失败：${error.message || error}`);
      }
    }, { once: true });
    input.click();
  }

  function confirmBackupImport(preview) {
    return window.confirm([
      "确认导入 BetterToBid 备份？",
      `导入 lot: ${preview.importedLots}`,
      `新增: ${preview.addedLots}`,
      `覆盖/合并已有: ${preview.overwrittenLots}`,
      `设置变化: ${preview.changedSettings}`
    ].join("\n"));
  }

  function render() {
    applyDetailWidth();
    const lots = getLots();
    const grouped = groupLots(lots);
    document.getElementById("board").innerHTML = lanes.map((lane) => renderLane(lane, grouped[lane.id] || [])).join("");
    if (selectedId && !lots.some((lot) => lot.id === selectedId)) selectedId = "";
    renderDetail(lots.find((lot) => lot.id === selectedId));
    renderBoardMeta(lots.length);
  }

  function getLots() {
    const lots = Object.values(state.lots)
      .map((item) => item.snapshot)
      .filter((lot) => lot?.id);
    return lots
      .filter(matchesQuery)
      .filter(matchesFilter)
      .sort(compareLots);
  }

  function renderBoardMeta(count) {
    const headerText = document.querySelector(".board-header p");
    if (!headerText || setBoardStatus.timer) return;
    const filter = document.getElementById("filter");
    const label = filter?.selectedOptions?.[0]?.textContent || "全部记录";
    headerText.textContent = `${label} · ${count} 个 lot · 本地收藏记录，仅用于参考`;
  }

  function groupLots(lots) {
    return lots.reduce((groups, lot) => {
      const lane = laneFor(lot);
      groups[lane] = groups[lane] || [];
      groups[lane].push(lot);
      return groups;
    }, {});
  }

  function laneFor(lot) {
    const saved = state.lots[lot.id] || {};
    if (saved.manualStatus && saved.manualStatus !== "auto" && manualStatusLabels[saved.manualStatus]) return saved.manualStatus;

    const status = String(lot.status || "").toLowerCase();
    if (status.includes("sold") || status.includes("passed") || status.includes("ended") || status.includes("closed")) return "completed";
    if (status.includes("outbid")) return "outbid";
    if (lot.yourMaxBid || status.includes("bidding") || lot.sourcePage === "bids") return "active";
    return "upcoming";
  }

  function matchesQuery(lot) {
    if (!query) return true;
    const saved = state.lots[lot.id] || {};
    return [
      lot.lotNumber,
      lot.title,
      lot.sale,
      lot.status,
      lot.pcgs,
      lot.gradingCompany,
      lot.gradingGrade,
      lot.gradingCert,
      lot.gradingText,
      manualStatusLabels[saved.manualStatus],
      saved.tags,
      saved.notes
    ].join(" ").toLowerCase().includes(query);
  }

  function matchesFilter(lot) {
    if (!filterKey || filterKey === "all") return true;
    const saved = state.lots[lot.id] || {};
    const status = String(lot.status || "").toLowerCase();
    if (filterKey === "outbid") return status.includes("outbid") || laneFor(lot) === "outbid";
    if (filterKey === "overTarget") {
      const target = Number(saved.maxAllIn || 0);
      return target > 0 && pricing.currentTotal(lot, state.settings) > target;
    }
    if (filterKey === "missingTarget") return !Number(saved.maxAllIn || 0);
    if (filterKey === "missingMarket") return !Number(saved.marketValue || 0);
    if (filterKey === "missingEstimate") return !Number(lot.estimateLow || 0) && !Number(lot.estimateHigh || 0);
    if (filterKey === "missingCert") return Boolean(lot.gradingCompany || lot.gradingText) && !(lot.gradingCert || lot.pcgs);
    if (filterKey === "missingImage") return !lot.imageUrl;
    if (filterKey === "recentChange") return Boolean(formatRecentChange(saved));
    if (filterKey === "aiAdvice") return Boolean(saved.aiAdvice);
    return true;
  }

  function compareLots(a, b) {
    return sorting.compareDashboardLots(a, b, state, sortKey);
  }

  function renderLane(lane, lots) {
    return `
      <section class="lane">
        <header>
          <h2>${escapeHtml(lane.title)}</h2>
          <small>${escapeHtml(lane.hint)} · ${lots.length}</small>
        </header>
        <div class="cards">
          ${lots.length ? lots.map(renderCard).join("") : `<p class="empty">暂无记录</p>`}
        </div>
      </section>
    `;
  }

  function renderCard(lot) {
    const saved = state.lots[lot.id] || {};
    const verdict = evaluateLot(lot, saved, state.settings);
    const note = saved.notes || saved.tags || lot.sale || "";
    const noteSnippet = String(note).slice(0, 180);
    const grading = formatGrading(lot);
    const tone = priceToneClass(lot, saved);
    const toneLabel = pricing.priceToneLabel(lot, saved, state.settings);
    const urgency = sorting.urgencyScore(lot, saved, state.settings);
    const recentChange = formatRecentChange(saved);
    const qualityBadges = renderQualityBadges(lot, saved);
    return `
      <button class="card ${lot.id === selectedId ? "is-selected" : ""}" data-lot-id="${escapeAttr(lot.id)}" type="button">
        ${lot.imageUrl ? `<img src="${escapeAttr(lot.imageUrl)}" alt="">` : `<span class="image-empty"></span>`}
        <div>
          <h3>${escapeHtml(lot.lotNumber ? `Lot ${lot.lotNumber}` : "Lot")}</h3>
          <p>${escapeHtml(lot.title || "")}</p>
          <div class="metrics">
            <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">${escapeHtml(formatLotPrice(lot))}</span>
            <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">Total ${escapeHtml(pricing.formatCurrentTotal(lot, state.settings))}</span>
            <span>Max ${formatMoney(lot.yourMaxBid)}</span>
            <span>Est ${formatMoney(lot.estimateLow)}-${formatMoney(lot.estimateHigh)}</span>
            ${recentChange ? `<span class="change-badge" title="${escapeAttr(recentChange.summary)}">变化 ${escapeHtml(recentChange.label)}</span>` : ""}
            ${qualityBadges}
            ${urgency > 0 ? `<span class="urgency">急 ${escapeHtml(urgency)}</span>` : ""}
            ${pricing.formatTargetPrice(saved) ? `<span class="target-price">目标 ${escapeHtml(pricing.formatTargetPrice(saved))}</span>` : ""}
            ${grading ? `<span>${escapeHtml(grading)}</span>` : ""}
            ${saved.aiAdvice ? `<span>AI ${Math.round(scoreAdvice(lot, saved, state.settings))}</span>` : ""}
            <span>${escapeHtml(manualStatusLabels[saved.manualStatus] || lot.status || verdict.label)}</span>
            ${saved.desire ? `<span>意愿 ${escapeHtml(saved.desire)}/5</span>` : ""}
          </div>
        </div>
        ${noteSnippet ? `<div class="note">${escapeHtml(noteSnippet)}</div>` : ""}
      </button>
    `;
  }

  function renderQualityBadges(lot, saved) {
    const badges = [];
    if (!Number(saved.maxAllIn || 0)) badges.push("缺目标");
    if (!Number(saved.marketValue || 0)) badges.push("缺行情");
    if (!Number(lot.estimateLow || 0) && !Number(lot.estimateHigh || 0)) badges.push("缺估价");
    if ((lot.gradingCompany || lot.gradingText) && !(lot.gradingCert || lot.pcgs)) badges.push("缺编号");
    if (!lot.imageUrl) badges.push("缺图片");
    return badges.map((badge) => `<span class="quality-badge">${escapeHtml(badge)}</span>`).join("");
  }

  function formatRecentChange(saved) {
    const changedAt = Date.parse(saved.lastChangeAt || "");
    if (!Number.isFinite(changedAt)) return null;
    const ageMs = Date.now() - changedAt;
    if (ageMs < 0 || ageMs > 6 * 60 * 60 * 1000) return null;
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    return {
      label: minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`,
      summary: saved.changeSummary || "页面信息变化"
    };
  }

  function renderDetail(lot) {
    const detail = document.getElementById("detail");
    detail.classList.toggle("is-empty", !lot);
    if (!lot) {
      detail.innerHTML = `
        <button class="detail-resize" data-action="resize-detail" type="button" title="调整详情栏宽度" aria-label="调整详情栏宽度"></button>
        <p>选择一个卡片后，可以编辑状态、购买意愿和笔记。</p>
      `;
      return;
    }

    const saved = state.lots[lot.id] || {};
    const verdict = evaluateLot(lot, saved, state.settings);
    const grading = formatGrading(lot);
    const tone = priceToneClass(lot, saved);
    const toneLabel = pricing.priceToneLabel(lot, saved, state.settings);
    const urgency = sorting.urgencyScore(lot, saved, state.settings);
    const qualityBadges = renderQualityBadges(lot, saved);
    detail.innerHTML = `
      <form class="detail-form">
        <button class="detail-resize" data-action="resize-detail" type="button" title="调整详情栏宽度" aria-label="调整详情栏宽度"></button>
        <div class="detail-head">
          <div>
            <strong>${escapeHtml(lot.lotNumber ? `Lot ${lot.lotNumber}` : "Lot")}</strong>
            <span>${escapeHtml(lot.sale || "")}</span>
          </div>
          <button data-action="close-detail" type="button">×</button>
        </div>
        ${lot.imageUrl ? `<img class="detail-image" src="${escapeAttr(lot.imageUrl)}" alt="">` : ""}
        <h2>${escapeHtml(lot.title || "")}</h2>
        <div class="detail-metrics">
          <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">${escapeHtml(formatLotPrice(lot))}</span>
          <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">Total ${escapeHtml(pricing.formatCurrentTotal(lot, state.settings))}</span>
          <span>Max ${formatMoney(lot.yourMaxBid)}</span>
          <span>Est ${formatMoney(lot.estimateLow)}-${formatMoney(lot.estimateHigh)}</span>
          ${qualityBadges}
          ${urgency > 0 ? `<span class="urgency">急 ${escapeHtml(urgency)}</span>` : ""}
          ${pricing.formatTargetPrice(saved) ? `<span class="target-price">目标 ${escapeHtml(pricing.formatTargetPrice(saved))}</span>` : ""}
          ${grading ? `<span>${escapeHtml(grading)}</span>` : ""}
          ${saved.aiAdvice ? `<span>AI ${Math.round(scoreAdvice(lot, saved, state.settings))}</span>` : ""}
          <span>${escapeHtml(lot.status || verdict.label)}</span>
        </div>
        <p class="detail-verdict"><strong class="${escapeAttr(verdict.kind)}">${escapeHtml(verdict.label)}</strong> ${escapeHtml(verdict.reason)}</p>
        ${renderChangeHistory(saved)}
        ${renderAiHistory(saved)}
        <label>Kanban 状态
          <select name="manualStatus">
            ${Object.entries(manualStatusLabels).map(([value, label]) => `<option value="${escapeAttr(value)}" ${String(saved.manualStatus || "auto") === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
        </label>
        <label>行情/参考价
          <input name="marketValue" inputmode="decimal" value="${escapeAttr(saved.marketValue ?? "")}" placeholder="例如 1200">
        </label>
        <label>最高愿付全包价
          <input name="maxAllIn" inputmode="decimal" value="${escapeAttr(saved.maxAllIn ?? "")}" placeholder="含佣金、税费的心理价">
        </label>
        <label>购买意愿
          <select name="desire">
            ${[5, 4, 3, 2, 1].map((value) => `<option value="${value}" ${Number(saved.desire || 3) === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>标签
          <input name="tags" value="${escapeAttr(saved.tags || "")}" placeholder="稀缺, 品相好, 溢价高">
        </label>
        <label>笔记
          <textarea name="notes" rows="6" placeholder="记录瑕疵、版别、来源、比较成交价等">${escapeHtml(saved.notes || "")}</textarea>
        </label>
        <div class="detail-actions">
          <a href="${escapeAttr(lot.url || "#")}" target="_blank" rel="noopener noreferrer">打开商品页</a>
          ${lot.gradingUrl ? `<a href="${escapeAttr(lot.gradingUrl)}" target="_blank" rel="noopener noreferrer">查询评级</a>` : ""}
          <button type="submit">保存</button>
        </div>
      </form>
    `;
  }

  function renderAiHistory(saved) {
    const history = Array.isArray(saved.aiAdviceHistory) ? saved.aiAdviceHistory.slice(-5).reverse() : [];
    if (!history.length) return "";
    return `
      <section class="detail-ai-history">
        <h3>AI 历史</h3>
        ${history.map((item) => `
          <p>
            <strong>${escapeHtml(formatShortDate(item.generatedAt))}</strong>
            <span>${escapeHtml(item.providerLabel || item.model || "AI")} · ${escapeHtml(item.recommendation || "watch")} · ${escapeHtml(String(Math.round(Number(item.score || 0))))}/100${item.maxReasonableAllIn ? ` · 建议 ${formatMoney(item.maxReasonableAllIn)}` : ""}</span>
          </p>
        `).join("")}
      </section>
    `;
  }

  function renderChangeHistory(saved) {
    const history = Array.isArray(saved.changeHistory) ? saved.changeHistory.slice(-5).reverse() : [];
    if (!history.length) return "";
    return `
      <section class="detail-ai-history">
        <h3>变化历史</h3>
        ${history.map((item) => `
          <p>
            <strong>${escapeHtml(formatShortDate(item.at))}</strong>
            <span>${escapeHtml(item.summary || "页面信息变化")}</span>
          </p>
        `).join("")}
      </section>
    `;
  }

  function onBoardClick(event) {
    const card = event.target.closest("[data-lot-id]");
    if (!card) return;
    selectedId = card.dataset.lotId;
    render();
  }

  function onDetailClick(event) {
    if (event.target.closest('[data-action="close-detail"]')) {
      selectedId = "";
      render();
    }
  }

  async function onDetailSubmit(event) {
    event.preventDefault();
    if (!selectedId) return;

    const data = Object.fromEntries(new FormData(event.target).entries());
    state.lots[selectedId] = {
      ...state.lots[selectedId],
      ...data,
      manualStatus: data.manualStatus || "auto",
      marketValue: parseMoney(data.marketValue),
      maxAllIn: parseMoney(data.maxAllIn),
      desire: Number(data.desire || 3),
      updatedAt: new Date().toISOString()
    };
    await saveState(state);
    render();
  }

  function onDetailPointerDown(event) {
    const handle = event.target.closest('[data-action="resize-detail"]');
    if (!handle) return;
    event.preventDefault();

    const detail = document.getElementById("detail");
    const start = {
      width: detail.getBoundingClientRect().width,
      x: event.clientX
    };

    handle.setPointerCapture(event.pointerId);
    detail.classList.add("is-resizing");

    const onMove = (moveEvent) => {
      setDetailWidth(clampDetailWidth(start.width + (start.x - moveEvent.clientX)));
    };

    const onUp = async (upEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      detail.classList.remove("is-resizing");
      state.settings.dashboardDetailWidth = Math.round(detail.getBoundingClientRect().width);
      await saveState(state);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  function applyDetailWidth() {
    setDetailWidth(clampDetailWidth(state.settings.dashboardDetailWidth));
  }

  function setDetailWidth(width) {
    document.documentElement.style.setProperty("--detail-width", `${width}px`);
  }

  function clampDetailWidth(width) {
    const maxWidth = Math.max(340, Math.min(680, window.innerWidth - 260));
    return Math.round(Math.max(320, Math.min(maxWidth, Number(width) || 392)));
  }

  function priceToneClass(lot, saved) {
    return `price-${pricing.priceTone(lot, saved, state.settings)}`;
  }

  function formatGrading(lot) {
    if (lot.gradingText) return lot.gradingText;
    const parts = [lot.gradingCompany, lot.gradingGrade].filter(Boolean);
    if (lot.gradingCert) parts.push(`Cert ${lot.gradingCert}`);
    if (parts.length) return parts.join(" · ");
    return lot.pcgs ? `PCGS ${lot.pcgs}` : "";
  }

  function formatShortDate(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "未知时间";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  }

})();
