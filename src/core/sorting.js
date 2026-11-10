(() => {
  "use strict";

  const { naturalCompare } = window.BetterToBid.utils;
  const pricing = window.BetterToBid.pricing;
  const ai = window.BetterToBid.ai;

  const ASC_KEYS = new Set(["source", "session", "lotNumber", "lot", "auction", "status"]);

  function defaultSortDirection(key) {
    return ASC_KEYS.has(key) ? "asc" : "desc";
  }

  function sortLotsBySession(lots, state, options = {}) {
    const key = options.key || "source";
    const direction = options.direction || defaultSortDirection(key);
    const groups = groupBySession(lots);
    groups.sort((a, b) => compareSessionMeta(a, b));
    return groups.flatMap((group) => sortLotsWithinSession(group.lots, state, { key, direction }));
  }

  function sortLotsWithinSession(lots, state, options = {}) {
    const key = options.key || "source";
    if (key === "source") return [...lots];
    if (key === "session") return [...lots].sort((a, b) => compareLotNumber(a, b));
    const direction = options.direction === "asc" ? 1 : -1;
    return [...lots].sort((a, b) => compareLotByKey(a, b, state, key) * direction || compareLotNumber(a, b));
  }

  function compareLotByKey(a, b, state, key) {
    const savedA = state?.lots?.[a.id] || {};
    const savedB = state?.lots?.[b.id] || {};
    const settings = state?.settings || {};
    if (key === "lotNumber" || key === "lot") return compareLotNumber(a, b);
    if (key === "auction") return compareAuctionTime(a, b);
    if (key === "session") return compareSession(a, b);
    if (key === "currentBid" || key === "current") return numberValue(a.currentBid) - numberValue(b.currentBid);
    if (key === "currentTotal") return pricing.currentTotal(a, settings) - pricing.currentTotal(b, settings);
    if (key === "yourMaxBid") return numberValue(a.yourMaxBid) - numberValue(b.yourMaxBid);
    if (key === "estimateHigh") return numberValue(a.estimateHigh) - numberValue(b.estimateHigh);
    if (key === "status") return String(a.status || "").localeCompare(String(b.status || ""), undefined, { numeric: true, sensitivity: "base" });
    if (key === "urgency") return urgencyScore(a, savedA, settings) - urgencyScore(b, savedB, settings);
    if (key === "aiAdvice") return ai.scoreAdvice(a, savedA, settings) - ai.scoreAdvice(b, savedB, settings);
    if (key === "desire") return numberValue(savedA.desire) - numberValue(savedB.desire);
    if (key === "recentChange" || key === "changedAt") return dateValue(savedA.lastChangeAt) - dateValue(savedB.lastChangeAt);
    if (key === "updatedAt" || key === "updated") return dateValue(savedA.updatedAt || a.capturedAt) - dateValue(savedB.updatedAt || b.capturedAt);
    return 0;
  }

  function compareDashboardLots(a, b, state, key) {
    const direction = defaultSortDirection(key) === "asc" ? 1 : -1;
    return compareLotByKey(a, b, state, key) * direction || compareSession(a, b) || compareLotNumber(a, b);
  }

  function groupBySession(lots) {
    const groups = new Map();
    for (const lot of lots) {
      const key = sessionTitle(lot);
      if (!groups.has(key)) groups.set(key, { key, lots: [] });
      groups.get(key).lots.push(lot);
    }
    return [...groups.values()];
  }

  function compareSession(a, b) {
    return compareSessionText(a, b)
      || sessionTime(a) - sessionTime(b)
      || compareLotNumber(a, b);
  }

  function compareAuctionTime(a, b) {
    return sessionTime(a) - sessionTime(b)
      || compareSessionText(a, b)
      || compareLotNumber(a, b);
  }

  function compareSessionMeta(a, b) {
    const firstA = a.lots[0] || {};
    const firstB = b.lots[0] || {};
    return sessionTime(firstA) - sessionTime(firstB)
      || compareSessionText(firstA, firstB);
  }

  function compareSessionText(a, b) {
    return naturalCompare(sessionTitle(a), sessionTitle(b));
  }

  function compareLotNumber(a, b) {
    return naturalCompare(a?.lotNumber, b?.lotNumber);
  }

  function urgencyScore(lot, saved = {}, settings = {}) {
    const status = String(lot?.status || "").toLowerCase();
    if (/(sold|passed|ended|closed)/i.test(status)) return -100;

    const total = pricing.currentTotal(lot, settings);
    const target = numberValue(saved.maxAllIn);
    const aiScore = ai.scoreAdvice(lot, saved, settings);
    const desire = numberValue(saved.desire);
    let score = 0;

    if (status.includes("outbid")) score += 35;
    if (status.includes("bidding") || status.includes("live")) score += 24;
    if (lot?.yourMaxBid || lot?.sourcePage === "bids") score += 10;

    score += timeUrgency(lot);
    score += Math.min(20, Math.max(0, aiScore / 5));
    score += Math.min(15, Math.max(0, desire * 3));

    if (target) {
      if (total > target) score -= 22;
      else if (total >= target * 0.9) score += 12;
      else score += 8;
    }

    return Math.round(score);
  }

  function timeUrgency(lot) {
    const now = Date.now();
    const start = dateValue(lot?.auctionStart);
    const end = dateValue(lot?.auctionEnd);
    const relevant = end && end >= now ? end : start;
    if (!relevant) return 0;

    const msUntil = relevant - now;
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    if (msUntil <= 0) return 26;
    if (msUntil <= 2 * hour) return 30;
    if (msUntil <= 12 * hour) return 24;
    if (msUntil <= day) return 18;
    if (msUntil <= 3 * day) return 10;
    if (msUntil <= 7 * day) return 5;
    return 0;
  }

  function sessionTitle(lot) {
    return String(lot?.sale || "未分场次");
  }

  function sessionTime(lot) {
    return dateValue(lot?.auctionStart || lot?.auctionEnd || lot?.capturedAt);
  }

  function dateValue(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function numberValue(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  window.BetterToBid.sorting = {
    compareDashboardLots,
    compareAuctionTime,
    compareLotByKey,
    compareLotNumber,
    compareSession,
    defaultSortDirection,
    groupBySession,
    urgencyScore,
    sortLotsBySession,
    sortLotsWithinSession
  };
})();
