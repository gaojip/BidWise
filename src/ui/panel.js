(() => {
  "use strict";

  const { APP_ID } = window.BetterToBid.constants;
  const { evaluateLot } = window.BetterToBid.evaluator;
  const {
    escapeAttr,
    escapeHtml,
    formatLotPrice,
    formatMoney
  } = window.BetterToBid.utils;
  const pricing = window.BetterToBid.pricing;
  const { scoreAdvice } = window.BetterToBid.ai;
  const sorting = window.BetterToBid.sorting;

  function createPanel(handlers) {
    if (document.getElementById(APP_ID)) return document.getElementById(APP_ID);

    const root = document.createElement("aside");
    root.id = APP_ID;
    root.innerHTML = `
      <button class="btb-toggle" type="button" aria-label="Open BetterToBid">BTB</button>
      <section class="btb-panel" aria-label="BetterToBid reference panel">
        <header class="btb-header">
          <div>
            <strong>BetterToBid</strong>
            <span>参考助手</span>
          </div>
          <button class="btb-icon" data-action="collapse" type="button" title="Collapse">×</button>
        </header>
        <div class="btb-compact-bar">
          <button class="btb-primary-action" data-action="refresh" type="button">刷新</button>
          <details class="btb-actions-menu">
            <summary title="更多操作">更多</summary>
            <div class="btb-menu-popover">
              <label class="btb-menu-setting">AI 来源
                <select data-setting="aiProvider">
                  <option value="local">本地规则</option>
                  <option value="openai">OpenAI API</option>
                </select>
              </label>
              <label class="btb-menu-setting">OpenAI Key
                <input data-setting="aiApiKey" type="password" placeholder="sk-...">
              </label>
              <label class="btb-menu-setting">Model
                <input data-setting="aiModel" type="text" placeholder="gpt-5.4-nano">
              </label>
              <label class="btb-menu-setting">AI 策略
                <select data-setting="aiStrategy">
                  <option value="balanced">均衡</option>
                  <option value="conservative">保守</option>
                  <option value="aggressive">积极</option>
                </select>
              </label>
              <label class="btb-menu-setting">收藏方向
                <input data-setting="aiCollectingFocus" type="text" placeholder="中国纸币, PMG, 银币...">
              </label>
              <button data-action="test-ai-provider" type="button">测试 AI</button>
              <button data-action="sync-all" type="button">同步全部分页</button>
              <button data-action="open-ai-page" type="button">AI 分析页</button>
              <button data-action="open-board" type="button">Kanban</button>
              <button data-action="export-html" type="button">导出 HTML</button>
              <button data-action="export-md" type="button">导出 MD</button>
              <button data-action="export-csv" type="button">导出 CSV</button>
              <button data-action="export-session" type="button">导出当前场次</button>
              <button data-action="export-backup" type="button">导出备份 JSON</button>
              <button data-action="import-backup" type="button">导入备份 JSON</button>
            </div>
          </details>
          <div class="btb-settings">
          <label class="btb-mini-field" title="买方佣金 %"><span>佣</span>
            <input data-setting="defaultBuyerPremium" min="0" max="35" step="0.5" type="number">
          </label>
          <label class="btb-check" title="自动检测列表变化">
            <input data-setting="autoRefresh" type="checkbox">
            <span>自动</span>
          </label>
          <label class="btb-mini-field" title="原网页显示"><span>页</span>
            <select data-setting="pageInsightMode">
              <option value="full">详细</option>
              <option value="badge">只显示AI</option>
              <option value="off">关闭</option>
            </select>
          </label>
          </div>
        </div>
        <div class="btb-status" role="status"></div>
        <div class="btb-list-controls">
          <div class="btb-segment" role="group" aria-label="List scope">
            <button data-view-mode="all" type="button">总列表</button>
            <button data-view-mode="page" type="button">当前页</button>
          </div>
          <label>
            <span>排序</span>
            <select data-list-sort>
              <option value="source">页面顺序</option>
              <option value="session">场次</option>
              <option value="lotNumber">Lot #</option>
              <option value="currentBid">当前 Bid</option>
              <option value="currentTotal">当前总 Bid</option>
              <option value="yourMaxBid">我的出价</option>
              <option value="estimateHigh">高估价</option>
              <option value="status">状态</option>
              <option value="urgency">紧急程度</option>
              <option value="recentChange">最近变化</option>
              <option value="aiAdvice">AI 推荐</option>
              <option value="desire">购买意愿</option>
              <option value="updatedAt">更新时间</option>
            </select>
          </label>
          <label>
            <span>筛选</span>
            <select data-list-filter>
              <option value="all">全部</option>
              <option value="outbid">落后</option>
              <option value="overTarget">超目标</option>
              <option value="missingTarget">缺目标价</option>
              <option value="missingMarket">缺行情价</option>
              <option value="missingEstimate">缺估价</option>
              <option value="missingCert">缺评级编号</option>
              <option value="missingImage">缺图片</option>
              <option value="recentChange">最近变化</option>
              <option value="aiAdvice">有 AI 推荐</option>
            </select>
          </label>
          <button class="btb-sort-dir" data-sort-dir type="button" title="Toggle sort direction">↓</button>
        </div>
        <div class="btb-list-meta"></div>
        <div class="btb-list" aria-live="polite"></div>
        <form class="btb-editor">
          <div class="btb-editor-row">
            <h3><span>购买判断</span></h3>
            <label><span>行情</span>
              <input name="marketValue" inputmode="decimal" placeholder="1200">
            </label>
            <label><span>全包价</span>
              <input name="maxAllIn" inputmode="decimal" placeholder="心理价">
            </label>
            <label><span>意愿</span>
              <select name="desire">
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="4">4</option>
                <option value="2">2</option>
                <option value="1">1</option>
              </select>
            </label>
            <label><span>标签</span>
              <input name="tags" placeholder="稀缺, 品相好">
            </label>
          </div>
          <div class="btb-verdict"></div>
          <label class="btb-note-field">笔记
            <textarea name="notes" rows="5" placeholder="记录瑕疵、版别、来源、比较成交价等"></textarea>
          </label>
        </form>
        <button class="btb-resize-handle" data-action="resize-panel" type="button" title="调整面板大小" aria-label="调整面板大小"></button>
      </section>
      <section class="btb-ai-page is-hidden" aria-label="BetterToBid AI analysis page">
        <header>
          <div>
            <strong>AI 分析</strong>
            <span data-ai-page-meta>暂无分析</span>
          </div>
          <div>
            <button data-action="pin-ai-page" type="button">Pin</button>
            <button data-action="close-ai-page" type="button">×</button>
          </div>
        </header>
        <div class="btb-ai-page-body"></div>
      </section>
    `;

    document.documentElement.appendChild(root);
    root.querySelector(".btb-toggle").addEventListener("click", () => root.classList.add("btb-open"));
    root.querySelector('[data-action="collapse"]').addEventListener("click", () => root.classList.remove("btb-open"));
    root.querySelector('[data-action="refresh"]').addEventListener("click", handlers.onRefresh);
    root.querySelector('[data-action="sync-all"]').addEventListener("click", handlers.onSyncAll);
    root.querySelector('[data-action="open-ai-page"]').addEventListener("click", handlers.onOpenAiPage);
    root.querySelector('[data-action="open-board"]').addEventListener("click", handlers.onOpenBoard);
    root.querySelector('[data-action="export-html"]').addEventListener("click", () => handlers.onExport("html"));
    root.querySelector('[data-action="export-md"]').addEventListener("click", () => handlers.onExport("md"));
    root.querySelector('[data-action="export-csv"]').addEventListener("click", () => handlers.onExport("csv"));
    root.querySelector('[data-action="export-session"]').addEventListener("click", () => handlers.onExport("session"));
    root.querySelector('[data-action="export-backup"]').addEventListener("click", handlers.onBackupExport);
    root.querySelector('[data-action="import-backup"]').addEventListener("click", handlers.onBackupImport);
    root.querySelector('[data-action="test-ai-provider"]').addEventListener("click", handlers.onTestAiProvider);
    root.querySelector(".btb-actions-menu").addEventListener("click", (event) => {
      if (event.target.closest("button")) event.currentTarget.removeAttribute("open");
    });
    root.querySelector(".btb-list").addEventListener("click", handlers.onLotClick);
    root.querySelector(".btb-list").addEventListener("click", handlers.onSessionAnalyze);
    root.querySelector(".btb-ai-page").addEventListener("click", handlers.onAiPageAction);
    root.querySelector(".btb-editor").addEventListener("input", handlers.onEditorInput);
    root.querySelector("[data-list-sort]").addEventListener("change", handlers.onSortChange);
    root.querySelector("[data-list-filter]").addEventListener("change", handlers.onFilterChange);
    root.querySelector("[data-sort-dir]").addEventListener("click", handlers.onSortDirectionToggle);
    bindPanelResize(root, handlers);
    for (const button of root.querySelectorAll("[data-view-mode]")) {
      button.addEventListener("click", () => handlers.onViewModeChange(button.dataset.viewMode));
    }

    return root;
  }

  function bindPanelResize(root, handlers) {
    const handle = root.querySelector('[data-action="resize-panel"]');
    const panel = root.querySelector(".btb-panel");
    if (!handle || !panel) return;

    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const start = {
        height: rect.height,
        width: rect.width,
        x: event.clientX,
        y: event.clientY
      };

      handle.setPointerCapture(event.pointerId);
      root.classList.add("btb-resizing");

      const onMove = (moveEvent) => {
        const size = clampPanelSize({
          height: start.height + (moveEvent.clientY - start.y),
          width: start.width + (start.x - moveEvent.clientX)
        });
        applyPanelSize(root, { settings: { panelHeight: size.height, panelWidth: size.width } });
      };

      const onUp = (upEvent) => {
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        root.classList.remove("btb-resizing");
        const finalRect = panel.getBoundingClientRect();
        handlers.onPanelResize?.(clampPanelSize({ height: finalRect.height, width: finalRect.width }));
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function clampPanelSize(size) {
    const maxWidth = Math.max(360, Math.min(720, window.innerWidth - 32));
    const maxHeight = Math.max(420, window.innerHeight - 80);
    return {
      height: Math.round(Math.max(420, Math.min(maxHeight, Number(size.height) || Math.min(760, window.innerHeight - 120)))),
      width: Math.round(Math.max(340, Math.min(maxWidth, Number(size.width) || 380)))
    };
  }

  function applyPanelSize(root, state) {
    const panel = root.querySelector(".btb-panel");
    if (!panel) return;
    const size = clampPanelSize({
      height: state?.settings?.panelHeight,
      width: state?.settings?.panelWidth
    });
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
  }

  function syncSettings(root, state, handlers) {
    for (const input of root.querySelectorAll("[data-setting]")) {
      const key = input.dataset.setting;
      if (input.type === "checkbox") input.checked = Boolean(state.settings[key]);
      else input.value = state.settings[key] ?? "";
      if (!input.dataset.btbSettingBound) {
        input.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => handlers.onSettingChange(input));
        input.dataset.btbSettingBound = "true";
      }
    }
  }

  function render(root, lots, selectedId, state, viewState = {}) {
    syncListControls(root, lots, viewState);
    const list = root.querySelector(".btb-list");
    list.innerHTML = renderGroupedLots(lots, selectedId, state) || `<p class="btb-empty">当前页面还没有识别到 watch/bid/lot 列表。</p>`;

    renderEditor(root, lots.find((lot) => lot.id === selectedId), state);
  }

  function renderAiPage(root, lots, state, options = {}) {
    const page = root.querySelector(".btb-ai-page");
    if (!page) return;
    page.classList.toggle("is-hidden", !options.open);
    page.classList.toggle("is-pinned", Boolean(options.pinned));

    const analyzed = lots.filter((lot) => state.lots[lot.id]?.aiAdvice);
    const meta = page.querySelector("[data-ai-page-meta]");
    if (meta) {
      const strategy = aiStrategyLabel(state.settings.aiStrategy);
      const focus = state.settings.aiCollectingFocus ? ` · ${state.settings.aiCollectingFocus}` : "";
      meta.textContent = analyzed.length ? `${analyzed.length} 个结果 · ${strategy}${focus}` : `暂无分析 · ${strategy}`;
    }

    const body = page.querySelector(".btb-ai-page-body");
    if (!body) return;
    body.innerHTML = analyzed.length
      ? renderAiGroups(analyzed, state)
      : `<p class="btb-empty">还没有 AI 分析结果。先在某个场次标题点击 AI 分析。</p>`;
  }

  function renderAiGroups(lots, state) {
    const groups = lots.reduce((map, lot) => {
      const session = sessionTitle(lot);
      if (!map.has(session)) map.set(session, []);
      map.get(session).push(lot);
      return map;
    }, new Map());

    return [...groups.entries()].map(([session, sessionLots]) => {
      const sorted = sessionLots.sort((a, b) => scoreAdvice(b, state.lots[b.id] || {}, state.settings) - scoreAdvice(a, state.lots[a.id] || {}, state.settings));
      return `
        <section class="btb-ai-session">
          <h3>${escapeHtml(session)} <span>${sorted.length}</span></h3>
          ${sorted.map((lot, index) => renderAiItem(lot, state.lots[lot.id] || {}, state, index + 1, sorted.length)).join("")}
        </section>
      `;
    }).join("");
  }

  function renderAiItem(lot, saved, state, rank, total) {
    const advice = saved.aiAdvice || {};
    const suggested = Number(advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || 0);
    const tone = priceToneClass(lot, saved, state);
    const toneLabel = pricing.priceToneLabel(lot, saved, state.settings);
    return `
      <article class="btb-ai-item">
        <div class="btb-ai-item-head">
          <strong>AI ${rank}/${total} · Lot ${escapeHtml(lot.lotNumber || "")}</strong>
          <span>${Math.round(scoreAdvice(lot, saved, state.settings))}/100 · ${escapeHtml(advice.recommendation || "watch")} · ${escapeHtml(advice.providerLabel || advice.model || "AI")}</span>
        </div>
        <p>${escapeHtml(lot.title || "")}</p>
        <div class="btb-ai-metrics">
          <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">当前 ${escapeHtml(formatLotPrice(lot))}</span>
          <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">Total ${escapeHtml(pricing.formatCurrentTotal(lot, state.settings))}</span>
          ${suggested ? `<span class="btb-target-price">建议 ${escapeHtml(formatMoney(suggested))}</span>` : ""}
        </div>
        ${Array.isArray(advice.tags) && advice.tags.length ? `<div class="btb-ai-tags">${advice.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${advice.summary ? `<p class="btb-ai-summary">${escapeHtml(advice.summary)}</p>` : ""}
        ${renderAiHistory(saved)}
      </article>
    `;
  }

  function renderAiHistory(saved) {
    const history = Array.isArray(saved.aiAdviceHistory) ? saved.aiAdviceHistory.slice(-3).reverse() : [];
    if (!history.length) return "";
    return `
      <div class="btb-ai-history">
        <strong>历史</strong>
        ${history.map((item) => `
          <span>${escapeHtml(formatShortDate(item.generatedAt))} · ${escapeHtml(item.providerLabel || item.model || "AI")} · ${escapeHtml(String(Math.round(Number(item.score || 0))))}/100${item.maxReasonableAllIn ? ` · ${escapeHtml(formatMoney(item.maxReasonableAllIn))}` : ""}</span>
        `).join("")}
      </div>
    `;
  }

  function renderGroupedLots(lots, selectedId, state) {
    let lastSession = "";
    const aiRanks = buildAiRanks(lots, state);
    const sessionLots = lots.reduce((map, lot) => {
      const key = sessionTitle(lot);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(lot);
      return map;
    }, new Map());

    return lots.map((lot, index) => {
      const session = sessionTitle(lot);
      const header = session !== lastSession ? renderSessionHeader(session, sessionLots.get(session) || [], state) : "";
      lastSession = session;
      return `${header}${renderLotRow(lot, index, selectedId, state, aiRanks.get(lot.id))}`;
    }).join("");
  }

  function buildAiRanks(lots, state) {
    const grouped = lots.reduce((map, lot) => {
      const saved = state.lots[lot.id] || {};
      if (!saved.aiAdvice) return map;
      const key = sessionTitle(lot);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ lot, score: scoreAdvice(lot, saved, state.settings) });
      return map;
    }, new Map());

    const ranks = new Map();
    for (const entries of grouped.values()) {
      entries.sort((a, b) => b.score - a.score || String(a.lot.lotNumber || "").localeCompare(String(b.lot.lotNumber || ""), undefined, { numeric: true, sensitivity: "base" }));
      entries.forEach((entry, index) => {
        ranks.set(entry.lot.id, `${index + 1}/${entries.length}`);
      });
    }
    return ranks;
  }

  function renderSessionHeader(session, lots, state) {
    const summary = summarizeSession(lots, state);
    return `
      <div class="btb-session-header">
        <strong>${escapeHtml(session)}</strong>
        <span>${summary.count} lots</span>
        <button data-action="analyze-session" data-session="${escapeAttr(session)}" type="button">AI 分析</button>
        <div class="btb-session-summary">
          ${renderSessionMetric("已出价", summary.active)}
          ${renderSessionMetric("落后", summary.outbid, "warn")}
          ${renderSessionMetric("超目标", summary.overTarget, summary.overTarget ? "danger" : "")}
          ${renderSessionMetric("AI≥70", summary.aiStrong)}
          ${summary.targetTotal ? renderSessionMetric("目标合计", formatMoney(summary.targetTotal), "target") : ""}
        </div>
      </div>
    `;
  }

  function summarizeSession(lots, state) {
    return lots.reduce((summary, lot) => {
      const saved = state.lots[lot.id] || {};
      const status = String(lot.status || "").toLowerCase();
      const target = Number(saved.maxAllIn || 0);
      summary.count += 1;
      if (lot.yourMaxBid || lot.sourcePage === "bids" || status.includes("bidding")) summary.active += 1;
      if (status.includes("outbid")) summary.outbid += 1;
      if (target && pricing.currentTotal(lot, state.settings) > target) summary.overTarget += 1;
      if (saved.aiAdvice && scoreAdvice(lot, saved, state.settings) >= 70) summary.aiStrong += 1;
      if (target) summary.targetTotal += target;
      return summary;
    }, { active: 0, aiStrong: 0, count: 0, outbid: 0, overTarget: 0, targetTotal: 0 });
  }

  function renderSessionMetric(label, value, tone = "") {
    return `<span class="${tone ? `is-${escapeAttr(tone)}` : ""}"><b>${escapeHtml(label)}</b>${escapeHtml(String(value))}</span>`;
  }

  function renderLotRow(lot, index, selectedId, state, aiRank) {
      const saved = state.lots[lot.id] || {};
      const result = evaluateLot(lot, saved, state.settings);
      const statusText = lot.status || result.label;
      return `
        <div class="btb-lot-row ${lot.id === selectedId ? "is-selected" : ""}">
          <a class="btb-open-link" href="${escapeAttr(lot.url || "#")}" target="_blank" rel="noopener noreferrer" title="Open lot page" aria-label="Open ${escapeAttr(lot.lotNumber || `item ${index + 1}`)}">↗</a>
          <button class="btb-lot" data-lot-id="${escapeAttr(lot.id)}" type="button">
            ${lot.imageUrl ? `<img src="${escapeAttr(lot.imageUrl)}" alt="">` : `<span class="btb-img-empty"></span>`}
            <span>
              <strong>${escapeHtml(lot.lotNumber ? `Lot ${lot.lotNumber}` : lot.title)}${formatAiRankBadge(aiRank, saved) ? ` <span class="btb-ai-rank">${escapeHtml(formatAiRankBadge(aiRank, saved))}</span>` : ""}</strong>
              <em>${escapeHtml(lot.lotNumber ? lot.title : lot.url)}</em>
              ${formatEstimateAndGrading(lot) ? `<small class="btb-lot-extra">${escapeHtml(formatEstimateAndGrading(lot))}</small>` : ""}
              ${renderPriceLine(lot, saved, state, statusText)}
            </span>
          </button>
        </div>
      `;
  }

  function renderPriceLine(lot, saved, state, statusText) {
    const tone = priceToneClass(lot, saved, state);
    const urgency = sorting.urgencyScore(lot, saved, state.settings);
    const toneLabel = pricing.priceToneLabel(lot, saved, state.settings);
    const recentChange = formatRecentChange(saved);
    const qualityBadges = renderQualityBadges(lot, saved);
    return `
      <small class="btb-price-line">
        <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">${escapeHtml(formatLotPrice(lot))}</span>
        <span class="${escapeAttr(tone)}" title="${escapeAttr(toneLabel)}">Total ${escapeHtml(pricing.formatCurrentTotal(lot, state.settings))}</span>
        ${recentChange ? `<span class="btb-change-badge" title="${escapeAttr(recentChange.summary)}">变化 ${escapeHtml(recentChange.label)}</span>` : ""}
        ${qualityBadges}
        ${urgency > 0 ? `<span class="btb-urgency">急 ${escapeHtml(urgency)}</span>` : ""}
        ${saved.aiAdvice ? `<span>AI ${Math.round(Number(saved.aiAdvice.score || 0))}</span>` : ""}
        <span>${escapeHtml(statusText)}</span>
        ${pricing.formatTargetPrice(saved) ? `<span class="btb-target-price">目标 ${escapeHtml(pricing.formatTargetPrice(saved))}</span>` : ""}
        ${saved.desire ? `<span>意愿 ${escapeHtml(saved.desire)}/5</span>` : ""}
      </small>
    `;
  }

  function renderQualityBadges(lot, saved) {
    const badges = [];
    if (!Number(saved.maxAllIn || 0)) badges.push("缺目标");
    if (!Number(saved.marketValue || 0)) badges.push("缺行情");
    if (!Number(lot.estimateLow || 0) && !Number(lot.estimateHigh || 0)) badges.push("缺估价");
    if ((lot.gradingCompany || lot.gradingText) && !(lot.gradingCert || lot.pcgs)) badges.push("缺编号");
    if (!lot.imageUrl) badges.push("缺图片");
    return badges.map((badge) => `<span class="btb-quality-badge">${escapeHtml(badge)}</span>`).join("");
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

  function formatAiRankBadge(aiRank, saved) {
    if (!aiRank) return "";
    const suggested = Number(saved.aiAdvice?.maxReasonableAllIn || saved.aiAdvice?.suggestedAllIn || saved.aiAdvice?.suggestedPrice || 0);
    return `AI ${aiRank}${suggested ? ` ${formatMoney(suggested)}` : ""}`;
  }

  function syncListControls(root, lots, viewState) {
    for (const button of root.querySelectorAll("[data-view-mode]")) {
      button.classList.toggle("is-active", button.dataset.viewMode === viewState.mode);
    }
    const sort = root.querySelector("[data-list-sort]");
    if (sort) sort.value = viewState.sortKey || "source";
    const filter = root.querySelector("[data-list-filter]");
    if (filter) filter.value = viewState.filterKey || "all";
    const dir = root.querySelector("[data-sort-dir]");
    if (dir) dir.textContent = viewState.sortDirection === "asc" ? "↑" : "↓";
    const meta = root.querySelector(".btb-list-meta");
    if (meta) {
      const scope = viewState.mode === "all" ? "总列表" : "当前页";
      const filterLabel = filter?.selectedOptions?.[0]?.textContent || "全部";
      meta.textContent = `${scope} · ${filterLabel} · ${lots.length} 个 lot`;
    }
  }

  function renderEditor(root, lot, state) {
    const editor = root.querySelector(".btb-editor");
    editor.classList.toggle("is-empty", !lot);
    if (!lot) return;

    const saved = state.lots[lot.id] || {};
    for (const field of editor.elements) {
      if (!field.name) continue;
      field.value = saved[field.name] ?? (field.name === "desire" ? "3" : "");
    }
    renderVerdict(root, lot, saved, state.settings);
  }

  function priceToneClass(lot, saved, state) {
    return `btb-price-${pricing.priceTone(lot, saved, state.settings)}`;
  }

  function formatGrading(lot) {
    if (lot.gradingText) return lot.gradingText;
    const parts = [lot.gradingCompany, lot.gradingGrade].filter(Boolean);
    if (lot.gradingCert) parts.push(`Cert ${lot.gradingCert}`);
    if (parts.length) return parts.join(" · ");
    return lot.pcgs ? `PCGS ${lot.pcgs}` : "";
  }

  function formatEstimateAndGrading(lot) {
    return [formatEstimate(lot), formatGrading(lot)].filter(Boolean).join(" · ");
  }

  function formatEstimate(lot) {
    const low = Number(lot.estimateLow || 0);
    const high = Number(lot.estimateHigh || 0);
    if (low && high) return `Estimate: ${formatMoney(low)}-${formatMoney(high)}`;
    if (low || high) return `Estimate: ${formatMoney(low || high)}`;
    return "";
  }

  function sessionTitle(lot) {
    return lot.sale || "未分场次";
  }

  function renderVerdict(root, lot, saved, settings) {
    const verdictNode = root.querySelector(".btb-verdict");
    if (!verdictNode) return;
    const verdict = evaluateLot(lot, saved, settings);
    const advice = saved.aiAdvice || {};
    const suggested = Number(advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || 0);
    verdictNode.innerHTML = `
      <div class="btb-verdict-head">
        <strong class="${escapeAttr(verdict.kind)}">${escapeHtml(verdict.label)}</strong>
        ${advice.score !== undefined ? `<span>AI ${Math.round(Number(advice.score || 0))}/100 · ${escapeHtml(advice.providerLabel || advice.model || "AI")}</span>` : ""}
      </div>
      <div class="btb-verdict-grid">
        <p><b>用户</b>${escapeHtml(userDecisionText(saved))}</p>
        ${advice.score !== undefined ? `<p><b>AI</b>${escapeHtml(aiDecisionText(advice, suggested))}</p>` : ""}
      </div>
      <p class="btb-verdict-reason">${escapeHtml(verdict.reason)}</p>
      ${advice.summary ? `<p class="btb-verdict-summary">${escapeHtml(advice.summary)}</p>` : ""}
      ${renderVerdictChangeHistory(saved)}
      ${renderVerdictAiHistory(saved)}
    `;
  }

  function renderVerdictChangeHistory(saved) {
    const latest = Array.isArray(saved.changeHistory) ? saved.changeHistory.at(-1) : null;
    if (!latest) return "";
    return `
      <p class="btb-verdict-history">
        最近变化: ${escapeHtml(formatShortDate(latest.at))} · ${escapeHtml(latest.summary || "页面信息变化")}
      </p>
    `;
  }

  function renderVerdictAiHistory(saved) {
    const latest = Array.isArray(saved.aiAdviceHistory) ? saved.aiAdviceHistory.at(-1) : null;
    if (!latest) return "";
    return `
      <p class="btb-verdict-history">
        上次 AI: ${escapeHtml(formatShortDate(latest.generatedAt))} · ${escapeHtml(latest.providerLabel || latest.model || "AI")} · ${escapeHtml(String(Math.round(Number(latest.score || 0))))}/100${latest.maxReasonableAllIn ? ` · 建议 ${escapeHtml(formatMoney(latest.maxReasonableAllIn))}` : ""}
      </p>
    `;
  }

  function userDecisionText(saved) {
    return [
      `意愿 ${saved.desire || 3}/5`,
      saved.marketValue ? `行情 ${formatMoney(saved.marketValue)}` : "",
      saved.maxAllIn ? `目标 ${formatMoney(saved.maxAllIn)}` : ""
    ].filter(Boolean).join(" · ");
  }

  function aiDecisionText(advice, suggested) {
    return [
      String(advice.recommendation || "watch").toUpperCase(),
      suggested ? `建议 ${formatMoney(suggested)}` : ""
    ].filter(Boolean).join(" · ");
  }

  function aiStrategyLabel(strategy) {
    if (strategy === "conservative") return "保守";
    if (strategy === "aggressive") return "积极";
    return "均衡";
  }

  function formatShortDate(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "未知时间";
    return date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
  }

  function setStatus(root, message) {
    const status = root.querySelector(".btb-status");
    if (!status) return;
    status.textContent = message;
    clearTimeout(setStatus.timer);
    setStatus.timer = setTimeout(() => {
      status.textContent = "";
    }, 4500);
  }

  window.BetterToBid.ui = {
    applyPanelSize,
    createPanel,
    render,
    renderAiPage,
    renderVerdict,
    setStatus,
    syncSettings
  };
})();
