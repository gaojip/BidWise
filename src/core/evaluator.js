(() => {
  "use strict";

  const { DEFAULT_PREMIUM } = window.BetterToBid.constants;
  const { formatMoney } = window.BetterToBid.utils;

  function evaluateLot(lot, saved = {}, settings = {}) {
    let note = saved || {};
    if (lot.status === "Bidding" && lot.yourMaxBid && !note.maxAllIn) {
      note = { ...note, maxAllIn: lot.yourMaxBid };
    }

    if (lot.bidUnit === "%") {
      return {
        kind: "btb-neutral",
        label: "按金属价百分比出价",
        reason: "当前价是百分比格式，请结合当日金属现货价和溢价目标手动判断。"
      };
    }

    const premium = Number(note.buyerPremium || lot.buyerPremiumRate || settings.defaultBuyerPremium || DEFAULT_PREMIUM);
    const current = Number(lot.currentBid || 0);
    const allIn = current ? current * (1 + premium / 100) : 0;
    const market = Number(note.marketValue || 0);
    const maxAllIn = Number(note.maxAllIn || 0);
    const desire = Number(note.desire || 3);
    const reference = market || Number(lot.estimateHigh || 0);
    const underBudget = !maxAllIn || !allIn || allIn <= maxAllIn;
    const margin = reference && allIn ? (reference - allIn) / reference : 0;

    if (!current && !reference && !note.notes) {
      return { kind: "btb-neutral", label: "待补充", reason: "缺少当前价和参考价，先补充行情价或笔记。" };
    }
    if (underBudget && desire >= 4 && margin >= 0.12) {
      return { kind: "btb-buy", label: "值得重点考虑", reason: `全包约 ${formatMoney(allIn)}，相对参考价留有 ${Math.round(margin * 100)}% 空间。` };
    }
    if (underBudget && desire >= 3 && margin >= -0.05) {
      return { kind: "btb-watch", label: "可以观察", reason: `全包约 ${formatMoney(allIn)}，价格接近可接受区间。` };
    }
    if (!underBudget) {
      return { kind: "btb-pass", label: "超过心理价", reason: `全包约 ${formatMoney(allIn)}，高于最高愿付 ${formatMoney(maxAllIn)}。` };
    }
    return { kind: "btb-pass", label: "谨慎放弃", reason: `购买意愿 ${desire}/5，价格优势不足。` };
  }

  window.BetterToBid.evaluator = {
    evaluateLot
  };
})();
