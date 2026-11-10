(() => {
  "use strict";

  const { formatMoney, parseMoney } = window.BetterToBid.utils;
  const { exportBackup, exportNotes, mergeBackupState, parseBackupText, previewBackupImport } = window.BetterToBid.exporters;
  const { createSaver, loadState, saveState } = window.BetterToBid.storage;
  const { mergeAiTags } = window.BetterToBid.ai;
  const aiProviders = window.BetterToBid.aiProviders;
  const sorting = window.BetterToBid.sorting;
  const ui = window.BetterToBid.ui;
  const site = pickSiteAdapter();
  const AUTO_REFRESH_BEFORE_AUCTION_MS = 60000;
  const AUTO_REFRESH_LIVE_MS = 900;

  let state = null;
  let scannedLots = [];
  let selectedId = null;
  let viewMode = "all";
  let filterKey = "all";
  let sortKey = "source";
  let sortDirection = "desc";
  let observer = null;
  let mutationTimer = null;
  let detailStatusTimer = null;
  let root = null;
  let queueSave = null;
  let aiPageOpen = false;

  init().catch((error) => {
    console.error("[BetterToBid] Failed to initialize", error);
  });

  function pickSiteAdapter() {
    return window.BetterToBid.siteAdapters.find((adapter) => adapter.matches?.()) || window.BetterToBid.sites.stacksbowers;
  }

  async function init() {
    state = await loadState();
    queueSave = createSaver(() => state);
    root = ui.createPanel({
      onBackupExport,
      onBackupImport,
      onEditorInput,
      onAiPageAction,
      onExport,
      onLotClick,
      onOpenAiPage,
      onOpenBoard,
      onPanelResize,
      onRefresh: () => refreshLots({ notify: true, manual: true }),
      onFilterChange,
      onSessionAnalyze,
      onSettingChange,
      onSortChange,
      onSortDirectionToggle,
      onSyncAll,
      onTestAiProvider,
      onViewModeChange
    });
    ui.syncSettings(root, state, { onSettingChange });
    ui.applyPanelSize(root, state);
    viewMode = state.settings.listViewMode || "all";
    filterKey = state.settings.listFilterKey || "all";
    sortKey = state.settings.listSortKey || "source";
    sortDirection = state.settings.listSortDirection || "desc";
    aiPageOpen = Boolean(state.settings.aiPagePinned);
    refreshLots({ notify: false });
    document.addEventListener("input", onPageDetailInput);
    document.addEventListener("change", onPageDetailInput);
    startObserver();
  }

  function startObserver() {
    if (observer) observer.disconnect();
    if (!state.settings.autoRefresh) return;

    observer = new MutationObserver((mutations) => {
      if (mutations.every(isBetterToBidMutation)) return;
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => refreshLots({ notify: state.settings.alertOnChanges }), getAutoRefreshDelay());
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function isBetterToBidMutation(mutation) {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
    if (!nodes.length && mutation.target?.nodeType === Node.ELEMENT_NODE) nodes.push(mutation.target);
    return nodes.length > 0 && nodes.every((node) => node.closest?.(`#${window.BetterToBid.constants.APP_ID}`) || node.closest?.(".btb-page-annotation,.btb-page-ai-badge,.btb-page-insight,.btb-detail-card") || node.classList?.contains("btb-page-annotation") || node.classList?.contains("btb-page-ai-badge") || node.classList?.contains("btb-page-insight") || node.classList?.contains("btb-detail-card"));
  }

  function getAutoRefreshDelay() {
    return hasStartedAuction() ? AUTO_REFRESH_LIVE_MS : AUTO_REFRESH_BEFORE_AUCTION_MS;
  }

  function hasStartedAuction() {
    const now = Date.now();
    return scannedLots.some((lot) => {
      const start = Date.parse(lot.auctionStart || "");
      if (Number.isFinite(start) && start <= now) return true;
      const status = String(lot.status || "").toLowerCase();
      return status.includes("bidding") || status.includes("outbid");
    });
  }

  function mergeLotSnapshot(lot, previousLot, nowIso) {
    const saved = state.lots[lot.id] || {};
    const baseline = previousLot || saved.snapshot;
    const next = { ...saved, snapshot: lot };

    if (baseline?.hash && baseline.hash !== lot.hash) {
      const summary = summarizeLotChange(baseline, lot);
      next.previousSnapshot = baseline;
      next.lastChangeAt = nowIso;
      next.changeSummary = summary;
      next.changeHistory = appendChangeHistory(saved.changeHistory, {
        afterBid: Number(lot.currentBid || 0),
        afterStatus: lot.status || "",
        at: nowIso,
        beforeBid: Number(baseline.currentBid || 0),
        beforeStatus: baseline.status || "",
        bidUnit: lot.bidUnit || baseline.bidUnit || "$",
        summary
      });
      state.lots[lot.id] = next;
      return "changed";
    }

    state.lots[lot.id] = next;
    return baseline?.hash ? "unchanged" : "added";
  }

  function appendChangeHistory(history, entry) {
    return [...(Array.isArray(history) ? history : []), entry].slice(-5);
  }

  function summarizeLotChange(before = {}, after = {}) {
    const changes = [];
    if (String(before.status || "") !== String(after.status || "")) {
      changes.push(`状态 ${before.status || "未知"} → ${after.status || "未知"}`);
    }
    if (Number(before.currentBid || 0) !== Number(after.currentBid || 0) || String(before.bidUnit || "") !== String(after.bidUnit || "")) {
      changes.push(`当前价 ${formatLotAmount(before)} → ${formatLotAmount(after)}`);
    }
    if (Number(before.yourMaxBid || 0) !== Number(after.yourMaxBid || 0)) {
      changes.push(`你的最高 ${formatMoney(Number(before.yourMaxBid || 0))} → ${formatMoney(Number(after.yourMaxBid || 0))}`);
    }
    if (Number(before.estimateLow || 0) !== Number(after.estimateLow || 0) || Number(before.estimateHigh || 0) !== Number(after.estimateHigh || 0)) {
      changes.push(`估价 ${formatEstimateRange(before)} → ${formatEstimateRange(after)}`);
    }
    return changes.slice(0, 3).join(" · ") || "页面信息变化";
  }

  function formatLotAmount(lot = {}) {
    const value = Number(lot.currentBid || 0);
    if (!value) return "无";
    return lot.bidUnit === "%" ? `${value.toFixed(1)}%` : formatMoney(value);
  }

  function formatEstimateRange(lot = {}) {
    const low = Number(lot.estimateLow || 0);
    const high = Number(lot.estimateHigh || 0);
    if (low && high) return `${formatMoney(low)}-${formatMoney(high)}`;
    if (low || high) return formatMoney(low || high);
    return "无";
  }

  function refreshLots({ notify = true, manual = false } = {}) {
    const previousLots = new Map(scannedLots.map((lot) => [lot.id, lot]));
    scannedLots = site.scanLots();

    const changedLots = [];
    const addedLots = [];
    const nowIso = new Date().toISOString();
    for (const lot of scannedLots) {
      const result = mergeLotSnapshot(lot, previousLots.get(lot.id), nowIso);
      if (result === "changed") changedLots.push(lot);
      if (result === "added") addedLots.push(lot);
    }
    const displayLots = getDisplayLots();
    if (!selectedId && displayLots.length) selectedId = displayLots[0].id;
    if (selectedId && !displayLots.some((lot) => lot.id === selectedId)) selectedId = displayLots[0]?.id || null;

    queueSave();
    renderList();
    annotatePageLots();

    if (notify && (manual || changedLots.length || addedLots.length)) {
      const parts = [];
      if (manual) parts.push(`检测到 ${scannedLots.length} 个 lot`);
      if (addedLots.length) parts.push(`新增 ${addedLots.length}`);
      if (changedLots.length) parts.push(`变化 ${changedLots.length}`);
      ui.setStatus(root, parts.join(" · ") || "暂无变化");
    }
  }

  async function onSyncAll() {
    if (!site.scanAllLots) {
      refreshLots({ notify: true, manual: true });
      return;
    }

    try {
      ui.setStatus(root, "正在同步全部分页...");
      const previousLots = new Map(getAllKnownLots().map((lot) => [lot.id, lot]));
      scannedLots = await site.scanAllLots();
      const changedLots = [];
      const addedLots = [];
      const nowIso = new Date().toISOString();
      for (const lot of scannedLots) {
        const result = mergeLotSnapshot(lot, previousLots.get(lot.id), nowIso);
        if (result === "changed") changedLots.push(lot);
        if (result === "added") addedLots.push(lot);
      }
      viewMode = "page";
      state.settings.listViewMode = viewMode;
      if (!selectedId && scannedLots.length) selectedId = scannedLots[0].id;
      if (selectedId && !scannedLots.some((lot) => lot.id === selectedId)) selectedId = scannedLots[0]?.id || null;
      queueSave();
      renderList();
      annotatePageLots();

      ui.setStatus(root, `已同步 ${scannedLots.length} 个 lot · 新增 ${addedLots.length} · 变化 ${changedLots.length}`);
    } catch (error) {
      console.error("[BetterToBid] Sync all failed", error);
      ui.setStatus(root, `同步失败：${error.message || error}`);
    }
  }

  function onSettingChange(input) {
    const key = input.dataset.setting;
    state.settings[key] = input.type === "checkbox" ? input.checked
      : input.type === "number" ? Number(input.value)
      : input.value;
    queueSave();
    refreshLots({ notify: false });
    if (key === "autoRefresh") startObserver();
  }

  function onPanelResize(size) {
    state.settings.panelWidth = size.width;
    state.settings.panelHeight = size.height;
    queueSave();
  }

  function onViewModeChange(mode) {
    viewMode = mode;
    state.settings.listViewMode = mode;
    queueSave();
    renderList();
    annotatePageLots();
  }

  function onSortChange(event) {
    sortKey = event.target.value;
    sortDirection = sorting.defaultSortDirection(sortKey);
    state.settings.listSortKey = sortKey;
    state.settings.listSortDirection = sortDirection;
    queueSave();
    renderList();
  }

  function onSortDirectionToggle() {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
    state.settings.listSortDirection = sortDirection;
    queueSave();
    renderList();
  }

  function onFilterChange(event) {
    filterKey = event.target.value || "all";
    state.settings.listFilterKey = filterKey;
    const lots = getDisplayLots();
    if (selectedId && !lots.some((lot) => lot.id === selectedId)) selectedId = lots[0]?.id || null;
    queueSave();
    renderList();
  }

  function onLotClick(event) {
    if (event.target.closest('[data-action="analyze-session"]')) return;
    const button = event.target.closest("[data-lot-id]");
    if (!button) return;
    selectedId = button.dataset.lotId;
    renderList();
  }

  async function onSessionAnalyze(event) {
    const button = event.target.closest('[data-action="analyze-session"]');
    if (!button) return;

    const session = button.dataset.session || "未分场次";
    const lots = getDisplayLots().filter((lot) => sessionKey(lot) === session);
    if (!lots.length) {
      ui.setStatus(root, "这个场次暂时没有可分析的 lot");
      return;
    }

    const provider = aiProviders.getProvider(state.settings.aiProvider);
    ui.setStatus(root, `正在用 ${provider.label} 分析 ${lots.length} 个 lot...`);

    let results = [];
    let fallbackReason = "";
    try {
      results = await aiProviders.analyzeLots(lots, state, { providerId: provider.id });
    } catch (error) {
      console.error("[BetterToBid] AI analysis failed", error);
      fallbackReason = error.message || String(error);
      results = lots.map((lot) => ({ advice: aiProviders.makeFallbackAdvice(lot, state, error), lot }));
    }

    for (const { lot, advice: aiAdvice } of results) {
      const saved = state.lots[lot.id] || {};
      state.lots[lot.id] = {
        ...saved,
        aiAdvice,
        aiAdviceHistory: appendAiHistory(saved.aiAdviceHistory, saved.aiAdvice),
        notes: mergeAiSummaryIntoNotes(saved.notes, aiAdvice),
        tags: mergeAiTags(saved.tags, aiAdvice.tags),
        updatedAt: new Date().toISOString()
      };
    }

    sortKey = "aiAdvice";
    sortDirection = "desc";
    state.settings.listSortKey = sortKey;
    state.settings.listSortDirection = sortDirection;
    queueSave();
    renderList();
    ui.setStatus(root, fallbackReason
      ? `OpenAI 失败，已回退本地规则：${fallbackReason}`
      : `已生成 ${lots.length} 个 ${provider.label} 推荐结果`);
  }

  async function onTestAiProvider() {
    const provider = aiProviders.getProvider(state.settings.aiProvider);
    try {
      ui.setStatus(root, `正在测试 ${provider.label}...`);
      const result = await aiProviders.testProvider(provider.id, state);
      ui.setStatus(root, `${provider.label} 可用 · ${result.model || provider.id} · ${result.elapsedMs || 0}ms`);
    } catch (error) {
      console.error("[BetterToBid] AI provider test failed", error);
      ui.setStatus(root, `AI 测试失败：${error.message || error}`);
    }
  }

  function onOpenAiPage() {
    aiPageOpen = true;
    renderAiPage();
  }

  function onAiPageAction(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "close-ai-page") {
      aiPageOpen = false;
      state.settings.aiPagePinned = false;
      queueSave();
      renderAiPage();
    }
    if (action === "pin-ai-page") {
      state.settings.aiPagePinned = !state.settings.aiPagePinned;
      aiPageOpen = true;
      queueSave();
      renderAiPage();
    }
  }

  function mergeAiSummaryIntoNotes(notes, advice) {
    const manualNotes = String(notes || "").replace(/\n?\[AI[^\]]*\][\s\S]*?(?=\n\n|$)/i, "").trim();
    const tagText = Array.isArray(advice.tags) && advice.tags.length ? ` · 标签: ${advice.tags.join(", ")}` : "";
    const source = advice.providerLabel || advice.model || "AI";
    const aiBlock = `[AI ${source}] ${advice.recommendation.toUpperCase()} · ${advice.score}/100 · ${advice.summary}${tagText}`;
    return [manualNotes, aiBlock].filter(Boolean).join("\n\n");
  }

  function appendAiHistory(history, previousAdvice) {
    const entries = Array.isArray(history) ? history : [];
    if (!previousAdvice) return entries.slice(-4);
    const compact = {
      generatedAt: previousAdvice.generatedAt,
      maxReasonableAllIn: previousAdvice.maxReasonableAllIn,
      model: previousAdvice.model,
      providerId: previousAdvice.providerId,
      providerLabel: previousAdvice.providerLabel,
      recommendation: previousAdvice.recommendation,
      score: previousAdvice.score,
      summary: previousAdvice.summary
    };
    return [...entries, compact].filter((item) => item.generatedAt || item.score !== undefined).slice(-5);
  }

  function onEditorInput(event) {
    const lot = getDisplayLots().find((item) => item.id === selectedId);
    if (!lot || !event.target.name) return;

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    state.lots[lot.id] = {
      ...state.lots[lot.id],
      ...data,
      marketValue: parseMoney(data.marketValue),
      maxAllIn: parseMoney(data.maxAllIn),
      desire: Number(data.desire || 3),
      updatedAt: new Date().toISOString()
    };
    queueSave();
    ui.renderVerdict(root, lot, state.lots[lot.id], state.settings);
  }

  function onPageDetailInput(event) {
    const field = event.target.closest?.(".btb-detail-field");
    if (!field) return;
    const card = field.closest(".btb-detail-card-editor");
    const lotId = card?.dataset.lotId;
    const name = field.dataset.field;
    if (!lotId || !name) return;

    const lot = getAllKnownLots().find((item) => item.id === lotId) || site.scanLots().find((item) => item.id === lotId);
    const saved = state.lots[lotId] || {};
    const value = field.value;
    state.lots[lotId] = {
      ...saved,
      ...(lot ? { snapshot: lot } : {}),
      [name]: value,
      marketValue: name === "marketValue" ? parseMoney(value) : saved.marketValue,
      maxAllIn: name === "maxAllIn" ? parseMoney(value) : saved.maxAllIn,
      desire: name === "desire" ? Number(value || 3) : Number(saved.desire || 3),
      updatedAt: new Date().toISOString()
    };
    queueSave();
    updateDetailCardPreview(card, state.lots[lotId]);
    if (lot && selectedId === lotId) ui.renderVerdict(root, lot, state.lots[lotId], state.settings);
    if (event.type === "change") renderList();
    queueDetailSaveStatus(event.type);
  }

  function updateDetailCardPreview(editor, saved) {
    const card = editor.closest(".btb-detail-card");
    if (!card) return;

    const grid = card.querySelector(".btb-detail-card-grid");
    if (grid) {
      const advice = saved.aiAdvice || {};
      const suggested = Number(advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || 0);
      const chips = [
        saved.maxAllIn ? ["目标", formatMoney(saved.maxAllIn)] : null,
        saved.marketValue ? ["行情", formatMoney(saved.marketValue)] : null,
        saved.desire ? ["意愿", `${saved.desire}/5`] : null,
        suggested ? ["AI 建议", formatMoney(suggested)] : null
      ].filter(Boolean);

      grid.replaceChildren(...chips.map(([label, value]) => makeDetailChip(label, value)));
    }

    const tags = splitTags(saved.tags);
    let tagList = card.querySelector(".btb-detail-card-tags");
    if (!tags.length) {
      tagList?.remove();
      return;
    }

    if (!tagList) {
      tagList = document.createElement("div");
      tagList.className = "btb-detail-card-tags";
      const gradingLine = [...card.querySelectorAll("p")].find((node) => /^评级/.test(node.innerText || node.textContent || ""));
      (gradingLine || editor).insertAdjacentElement("afterend", tagList);
    }
    tagList.replaceChildren(...tags.map((tag) => {
      const item = document.createElement("span");
      item.textContent = tag;
      return item;
    }));
  }

  function makeDetailChip(label, value) {
    const chip = document.createElement("span");
    const strong = document.createElement("b");
    strong.textContent = label;
    chip.append(strong, String(value || ""));
    return chip;
  }

  function splitTags(value) {
    return String(value || "").split(/[,，;；\n]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  }

  function queueDetailSaveStatus(eventType) {
    clearTimeout(detailStatusTimer);
    detailStatusTimer = setTimeout(() => {
      ui.setStatus(root, "详情页记录已保存");
    }, eventType === "change" ? 0 : 700);
  }

  function onExport(format) {
    const lots = format === "session" ? getSelectedSessionLots() : getDisplayLots();
    const selectedSession = format === "session" ? sessionKey(lots[0]) : "";
    exportNotes(format === "session" ? "html" : format, lots, state, (message) => ui.setStatus(root, message), {
      filenameSuffix: selectedSession
    });
  }

  function getSelectedSessionLots() {
    const lots = getDisplayLots();
    const selected = lots.find((lot) => lot.id === selectedId) || lots[0];
    if (!selected) return [];
    return lots.filter((lot) => sessionKey(lot) === sessionKey(selected));
  }

  function onBackupExport() {
    exportBackup(state, (message) => ui.setStatus(root, message));
  }

  function onBackupImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const importedState = parseBackupText(text);
        const preview = previewBackupImport(importedState, state);
        if (!confirmBackupImport(preview)) {
          ui.setStatus(root, "已取消导入");
          return;
        }
        state = mergeBackupState(importedState, state);
        await saveState(state);
        viewMode = state.settings.listViewMode || viewMode;
        filterKey = state.settings.listFilterKey || filterKey;
        sortKey = state.settings.listSortKey || sortKey;
        sortDirection = state.settings.listSortDirection || sortDirection;
        ui.syncSettings(root, state, { onSettingChange });
        refreshLots({ notify: false });
        renderList();
        ui.setStatus(root, `已导入备份：${Object.keys(state.lots || {}).length} 个 lot`);
      } catch (error) {
        console.error("[BetterToBid] Backup import failed", error);
        ui.setStatus(root, `导入失败：${error.message || error}`);
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

  function onOpenBoard() {
    window.open(chrome.runtime.getURL("dashboard.html"), "_blank", "noopener,noreferrer");
  }

  function renderList() {
    ui.render(root, getDisplayLots(), selectedId, state, {
      filterKey,
      mode: viewMode,
      sortDirection,
      sortKey
    });
    annotatePageLots();
    if (aiPageOpen || state.settings.aiPagePinned) renderAiPage();
  }

  function renderAiPage() {
    ui.renderAiPage(root, getDisplayLots(), state, {
      open: aiPageOpen || state.settings.aiPagePinned,
      pinned: state.settings.aiPagePinned
    });
  }

  function annotatePageLots() {
    site.annotateLots?.(state, { mode: state.settings.pageInsightMode || "full" });
  }

  function getDisplayLots() {
    const lots = viewMode === "page" ? [...scannedLots] : getAllKnownLots();
    return sortLots(filterLots(lots));
  }

  function filterLots(lots) {
    if (!filterKey || filterKey === "all") return lots;
    return lots.filter((lot) => lotMatchesFilter(lot));
  }

  function lotMatchesFilter(lot) {
    const saved = state.lots[lot.id] || {};
    const status = String(lot.status || "").toLowerCase();
    if (filterKey === "outbid") return status.includes("outbid");
    if (filterKey === "overTarget") {
      const target = Number(saved.maxAllIn || 0);
      return target > 0 && window.BetterToBid.pricing.currentTotal(lot, state.settings) > target;
    }
    if (filterKey === "missingTarget") return !Number(saved.maxAllIn || 0);
    if (filterKey === "missingMarket") return !Number(saved.marketValue || 0);
    if (filterKey === "missingEstimate") return !Number(lot.estimateLow || 0) && !Number(lot.estimateHigh || 0);
    if (filterKey === "missingCert") return Boolean(lot.gradingCompany || lot.gradingText) && !(lot.gradingCert || lot.pcgs);
    if (filterKey === "missingImage") return !lot.imageUrl;
    if (filterKey === "recentChange") return isRecentChange(saved);
    if (filterKey === "aiAdvice") return Boolean(saved.aiAdvice);
    return true;
  }

  function isRecentChange(saved) {
    const changedAt = Date.parse(saved.lastChangeAt || "");
    if (!Number.isFinite(changedAt)) return false;
    const ageMs = Date.now() - changedAt;
    return ageMs >= 0 && ageMs <= 6 * 60 * 60 * 1000;
  }

  function getAllKnownLots() {
    const merged = new Map();
    for (const item of Object.values(state.lots)) {
      if (item.snapshot?.id) merged.set(item.snapshot.id, item.snapshot);
    }
    for (const lot of scannedLots) {
      merged.set(lot.id, lot);
    }
    return [...merged.values()];
  }

  function sortLots(lots) {
    return sorting.sortLotsBySession(lots, state, { direction: sortDirection, key: sortKey });
  }
})();
