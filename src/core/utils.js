(() => {
  "use strict";

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  function formatMoney(value) {
    const amount = Number(value || 0);
    return amount ? money.format(amount) : "-";
  }

  function formatPercent(value) {
    const amount = Number(value || 0);
    return amount ? `${amount.toFixed(amount % 1 ? 1 : 0)}%` : "-";
  }

  function formatLotPrice(lot) {
    if (lot?.bidUnit === "%") return `${Number(lot.currentBid || 0).toFixed(1)}%`;
    return formatMoney(lot?.currentBid);
  }

  function parseMoney(value) {
    const amount = Number(String(value || "").replace(/[$,%\s]/g, ""));
    return Number.isFinite(amount) ? amount : 0;
  }

  function maxNumeric(...values) {
    const numbers = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
    return numbers.length ? Math.max(...numbers) : 0;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function htmlToText(value) {
    const template = document.createElement("template");
    template.innerHTML = String(value || "").replace(/<br\s*\/?>/gi, "\n");
    return cleanText(template.content.textContent || "");
  }

  function absoluteUrl(value) {
    if (!value) return "";
    return new URL(value, location.origin).href;
  }

  function metaContent(property) {
    return document.querySelector(`meta[property="${property}"]`)?.content || "";
  }

  function stableId(value) {
    let hash = 0;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
    }
    return `btb-${Math.abs(hash)}`;
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.BetterToBid.utils = {
    absoluteUrl,
    cleanText,
    escapeAttr: escapeHtml,
    escapeHtml,
    formatLotPrice,
    formatMoney,
    formatPercent,
    htmlToText,
    maxNumeric,
    metaContent,
    naturalCompare,
    parseMoney,
    stableId
  };
})();
