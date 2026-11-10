(() => {
  "use strict";

  const { STATE_VERSION } = window.BetterToBid.constants;
  const { evaluateLot } = window.BetterToBid.evaluator;
  const {
    escapeAttr,
    escapeHtml,
    formatLotPrice,
    formatMoney,
    formatPercent
  } = window.BetterToBid.utils;
  const pricing = window.BetterToBid.pricing;

  function exportNotes(format, lots, state, setStatus, options = {}) {
    const extension = format === "html" ? "html" : format === "csv" ? "csv" : "md";
    const suffix = options.filenameSuffix ? `-${safeFilename(options.filenameSuffix)}` : "";
    const filename = `better-to-bid${suffix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    const content = format === "html" ? makeHtmlExport(lots, state)
      : format === "csv" ? makeCsvExport(lots, state)
      : makeMarkdownExport(lots, state);
    const type = format === "html" ? "text/html" : format === "csv" ? "text/csv" : "text/markdown";
    downloadText(filename, content, type);
    setStatus(`已导出 ${filename}`);
  }

  function exportBackup(state, setStatus) {
    const filename = `better-to-bid-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = {
      app: "BetterToBid",
      exportedAt: new Date().toISOString(),
      state: sanitizeState(state),
      type: "backup",
      version: STATE_VERSION
    };
    downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
    setStatus(`已导出完整备份 ${filename}`);
  }

  function importBackupText(text, currentState = {}) {
    return mergeBackupState(parseBackupText(text), currentState);
  }

  function parseBackupText(text) {
    const parsed = JSON.parse(text);
    const importedState = parsed?.state || parsed;
    if (!importedState || typeof importedState !== "object" || typeof importedState.lots !== "object") {
      throw new Error("不是有效的 BetterToBid 备份文件");
    }
    return importedState;
  }

  function previewBackupImport(importedState, currentState = {}) {
    const currentLots = currentState.lots || {};
    const importedLots = importedState.lots || {};
    const currentSettings = currentState.settings || {};
    const importedSettings = importedState.settings || {};
    const importedIds = Object.keys(importedLots);
    return {
      addedLots: importedIds.filter((id) => !currentLots[id]).length,
      changedSettings: Object.keys(importedSettings).filter((key) => key !== "aiApiKey" && importedSettings[key] !== currentSettings[key]).length,
      importedLots: importedIds.length,
      overwrittenLots: importedIds.filter((id) => currentLots[id]).length
    };
  }

  function mergeBackupState(importedState, currentState = {}) {
    return {
      ...currentState,
      lots: {
        ...(currentState.lots || {}),
        ...(importedState.lots || {})
      },
      settings: {
        ...(currentState.settings || {}),
        ...(importedState.settings || {})
      },
      version: importedState.version || STATE_VERSION
    };
  }

  function sanitizeState(state = {}) {
    const settings = { ...(state.settings || {}) };
    delete settings.aiApiKey;
    return {
      version: state.version || STATE_VERSION,
      lots: state.lots || {},
      settings
    };
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function makeHtmlExport(lots, state) {
    const rows = lots.map((lot) => {
      const saved = state.lots[lot.id] || {};
      const result = evaluateLot(lot, saved, state.settings);
      const grading = formatGrading(lot);
      return `
        <article>
          <h2>${escapeHtml(lot.lotNumber ? `Lot ${lot.lotNumber} - ${lot.title}` : lot.title)}</h2>
          ${lot.imageUrl ? `<img src="${escapeAttr(lot.imageUrl)}" alt="${escapeAttr(lot.title)}">` : ""}
          <p><a href="${escapeAttr(lot.url)}">${escapeHtml(lot.url)}</a></p>
          <ul>
            <li>当前价: ${escapeHtml(formatLotPrice(lot))}</li>
            <li>价格判断: ${escapeHtml(pricing.priceToneLabel(lot, saved, state.settings))}</li>
            <li>你的最高出价: ${formatMoney(lot.yourMaxBid)}</li>
            <li>买方佣金率: ${formatPercent(lot.buyerPremiumRate)}</li>
            <li>当前买方佣金: ${formatMoney(lot.buyersPremiumAmount)}</li>
            <li>估价: ${formatMoney(lot.estimateLow)} - ${formatMoney(lot.estimateHigh)}</li>
            <li>评级: ${lot.gradingUrl ? `<a href="${escapeAttr(lot.gradingUrl)}">${escapeHtml(grading)}</a>` : escapeHtml(grading)}</li>
            <li>评级公司: ${escapeHtml(lot.gradingCompany || "")}</li>
            <li>评级等级: ${escapeHtml(lot.gradingGrade || "")}</li>
            <li>评级编号: ${escapeHtml(lot.gradingCert || lot.pcgs || "")}</li>
            <li>行情/参考价: ${formatMoney(saved.marketValue)}</li>
            <li>最高愿付全包价: ${formatMoney(saved.maxAllIn)}</li>
            <li>购买意愿: ${escapeHtml(String(saved.desire || 3))}/5</li>
            <li>判断: ${escapeHtml(result.label)} - ${escapeHtml(result.reason)}</li>
            <li>标签: ${escapeHtml(saved.tags || "")}</li>
          </ul>
          ${makeChangeHistoryHtml(saved)}
          ${makeAiHistoryHtml(saved)}
          ${lot.description ? `<p>${escapeHtml(lot.description).replace(/\n/g, "<br>")}</p>` : ""}
          <p>${escapeHtml(saved.notes || "").replace(/\n/g, "<br>")}</p>
        </article>
      `;
    }).join("\n");

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>BetterToBid Notes</title>
  <style>
    body { color: #1f2933; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; }
    article { border-bottom: 1px solid #d8dee8; margin-bottom: 28px; padding-bottom: 28px; }
    img { border-radius: 6px; display: block; max-height: 260px; max-width: 420px; object-fit: contain; }
    h1, h2 { line-height: 1.2; }
  </style>
</head>
<body>
  <h1>BetterToBid Notes</h1>
  <p>导出时间: ${escapeHtml(new Date().toLocaleString())}</p>
  ${rows}
</body>
</html>`;
  }

  function makeMarkdownExport(lots, state) {
    const lines = [`# BetterToBid Notes`, "", `导出时间: ${new Date().toLocaleString()}`, ""];
    for (const lot of lots) {
      const saved = state.lots[lot.id] || {};
      const result = evaluateLot(lot, saved, state.settings);
      lines.push(`## ${lot.lotNumber ? `Lot ${lot.lotNumber} - ` : ""}${lot.title}`);
      if (lot.imageUrl) lines.push(`![${lot.title}](${lot.imageUrl})`);
      lines.push(`- 链接: ${lot.url}`);
      lines.push(`- 当前价: ${formatLotPrice(lot)}`);
      lines.push(`- 价格判断: ${pricing.priceToneLabel(lot, saved, state.settings)}`);
      lines.push(`- 你的最高出价: ${formatMoney(lot.yourMaxBid)}`);
      lines.push(`- 买方佣金率: ${formatPercent(lot.buyerPremiumRate)}`);
      lines.push(`- 当前买方佣金: ${formatMoney(lot.buyersPremiumAmount)}`);
      lines.push(`- 估价: ${formatMoney(lot.estimateLow)} - ${formatMoney(lot.estimateHigh)}`);
      if (formatGrading(lot)) lines.push(`- 评级: ${formatGrading(lot)}`);
      if (lot.gradingUrl) lines.push(`- 评级查询: ${lot.gradingUrl}`);
      if (lot.gradingCompany) lines.push(`- 评级公司: ${lot.gradingCompany}`);
      if (lot.gradingGrade) lines.push(`- 评级等级: ${lot.gradingGrade}`);
      if (lot.gradingCert || lot.pcgs) lines.push(`- 评级编号: ${lot.gradingCert || lot.pcgs}`);
      lines.push(`- 行情/参考价: ${formatMoney(saved.marketValue)}`);
      lines.push(`- 最高愿付全包价: ${formatMoney(saved.maxAllIn)}`);
      lines.push(`- 购买意愿: ${saved.desire || 3}/5`);
      lines.push(`- 判断: ${result.label} - ${result.reason}`);
      if (saved.tags) lines.push(`- 标签: ${saved.tags}`);
      appendChangeHistoryMarkdown(lines, saved);
      appendAiHistoryMarkdown(lines, saved);
      if (lot.description) lines.push("", lot.description);
      if (saved.notes) lines.push("", saved.notes);
      lines.push("");
    }
    return lines.join("\n");
  }

  function makeCsvExport(lots, state) {
    const headers = [
      "Lot",
      "Title",
      "Session",
      "Status",
      "Current Bid",
      "Current Total",
      "Estimate Low",
      "Estimate High",
      "Price Tone",
      "Your Max Bid",
      "Market Value",
      "Target All-In",
      "Desire",
      "AI Score",
      "AI Recommendation",
      "AI Suggested",
      "Last Change At",
      "Last Change Summary",
      "Grading",
      "Cert",
      "Tags",
      "Notes",
      "URL"
    ];
    const rows = lots.map((lot) => {
      const saved = state.lots[lot.id] || {};
      const advice = saved.aiAdvice || {};
      return [
        lot.lotNumber || "",
        lot.title || "",
        lot.sale || "",
        lot.status || "",
        lot.currentBid || "",
        pricing.formatCurrentTotal(lot, state.settings),
        lot.estimateLow || "",
        lot.estimateHigh || "",
        pricing.priceToneLabel(lot, saved, state.settings),
        lot.yourMaxBid || "",
        saved.marketValue || "",
        saved.maxAllIn || "",
        saved.desire || "",
        advice.score ?? "",
        advice.recommendation || "",
        advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || "",
        saved.lastChangeAt || "",
        saved.changeSummary || "",
        formatGrading(lot),
        lot.gradingCert || lot.pcgs || "",
        saved.tags || "",
        saved.notes || "",
        lot.url || ""
      ];
    });
    return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, "\"\"").replace(/\r?\n/g, " ").trim()}"`;
  }

  function safeFilename(value) {
    return String(value || "").replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }

  function formatGrading(lot) {
    if (lot.gradingText) return lot.gradingText;
    const parts = [lot.gradingCompany, lot.gradingGrade].filter(Boolean);
    if (lot.gradingCert) parts.push(`Cert ${lot.gradingCert}`);
    if (parts.length) return parts.join(" · ");
    return lot.pcgs ? `PCGS ${lot.pcgs}` : "";
  }

  function makeAiHistoryHtml(saved) {
    const history = Array.isArray(saved.aiAdviceHistory) ? saved.aiAdviceHistory.slice(-5).reverse() : [];
    if (!history.length) return "";
    return `
      <section>
        <h3>AI 历史</h3>
        <ul>
          ${history.map((item) => `<li>${escapeHtml(formatHistoryItem(item))}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function makeChangeHistoryHtml(saved) {
    const history = Array.isArray(saved.changeHistory) ? saved.changeHistory.slice(-5).reverse() : [];
    if (!history.length) return "";
    return `
      <section>
        <h3>变化历史</h3>
        <ul>
          ${history.map((item) => `<li>${escapeHtml(formatChangeHistoryItem(item))}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function appendAiHistoryMarkdown(lines, saved) {
    const history = Array.isArray(saved.aiAdviceHistory) ? saved.aiAdviceHistory.slice(-5).reverse() : [];
    if (!history.length) return;
    lines.push(`- AI 历史:`);
    for (const item of history) lines.push(`  - ${formatHistoryItem(item)}`);
  }

  function appendChangeHistoryMarkdown(lines, saved) {
    const history = Array.isArray(saved.changeHistory) ? saved.changeHistory.slice(-5).reverse() : [];
    if (!history.length) return;
    lines.push(`- 变化历史:`);
    for (const item of history) lines.push(`  - ${formatChangeHistoryItem(item)}`);
  }

  function formatHistoryItem(item = {}) {
    return [
      formatShortDate(item.generatedAt),
      item.providerLabel || item.model || "AI",
      item.recommendation || "watch",
      `${Math.round(Number(item.score || 0))}/100`,
      item.maxReasonableAllIn ? `建议 ${formatMoney(item.maxReasonableAllIn)}` : ""
    ].filter(Boolean).join(" · ");
  }

  function formatChangeHistoryItem(item = {}) {
    return [
      formatShortDate(item.at),
      item.summary || "页面信息变化"
    ].filter(Boolean).join(" · ");
  }

  function formatShortDate(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "未知时间";
    return date.toLocaleDateString();
  }

  window.BetterToBid.exporters = {
    exportBackup,
    exportNotes,
    importBackupText,
    mergeBackupState,
    makeCsvExport,
    makeHtmlExport,
    makeMarkdownExport,
    parseBackupText,
    previewBackupImport
  };
})();
