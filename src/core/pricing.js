(() => {
  "use strict";

  const { formatMoney } = window.BetterToBid.utils;

  function currentTotal(lot, settings = {}) {
    const bid = Number(lot?.currentBid || 0);
    if (lot?.bidUnit === "%") return bid;
    const premium = Number(lot?.buyersPremiumAmount || 0);
    if (premium > 0) return bid + premium;
    return bid * (1 + Number(lot?.buyerPremiumRate || settings.defaultBuyerPremium || 0) / 100);
  }

  function formatCurrentTotal(lot, settings = {}) {
    if (lot?.bidUnit === "%") return `${Number(lot.currentBid || 0).toFixed(1)}%`;
    return formatMoney(currentTotal(lot, settings));
  }

  function priceTone(lot, saved = {}, settings = {}) {
    const total = currentTotal(lot, settings);
    const target = Number(saved.maxAllIn || 0);
    const estimateLow = Number(lot?.estimateLow || 0);
    const estimateHigh = Number(lot?.estimateHigh || 0);
    if (target && total > target) return "danger";
    if (lot?.bidUnit === "%") return "neutral";
    if (estimateLow && total < estimateLow) return "bargain";
    if (estimateLow && estimateHigh && total >= estimateLow && total <= estimateHigh) return "good";
    if (!estimateLow && estimateHigh && total <= estimateHigh) return "good";
    if (estimateHigh && total > estimateHigh && (!target || total <= target)) return "caution";
    return "neutral";
  }

  function priceToneLabel(lot, saved = {}, settings = {}) {
    const tone = priceTone(lot, saved, settings);
    if (tone === "bargain") return "低于估价低位";
    if (tone === "good") return "估价区间内";
    if (tone === "caution") return "高于估价";
    if (tone === "danger") return "超过目标价";
    return "参考价";
  }

  function formatTargetPrice(saved = {}) {
    const target = Number(saved.maxAllIn || 0);
    return target ? formatMoney(target) : "";
  }

  function suggestedAllInPrice(lot, saved = {}, score, settings = {}) {
    const total = currentTotal(lot, settings);
    const estimateHigh = Number(lot?.estimateHigh || 0);
    const maxAllIn = Number(saved.maxAllIn || 0);
    const anchor = maxAllIn || estimateHigh || total;
    const multiplier = score >= 78 ? 1 : score >= 52 ? 0.92 : 0.78;
    return Math.round(Math.max(0, anchor * multiplier));
  }

  window.BetterToBid.pricing = {
    currentTotal,
    formatCurrentTotal,
    formatTargetPrice,
    priceTone,
    priceToneLabel,
    suggestedAllInPrice
  };
})();
