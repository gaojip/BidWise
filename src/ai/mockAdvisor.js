(() => {
  "use strict";

  const { currentTotal, suggestedAllInPrice } = window.BetterToBid.pricing;

  function scoreAdvice(lot, saved = {}, settings = {}) {
    const advice = saved.aiAdvice || {};
    const explicit = Number(advice.score ?? advice.rankScore ?? advice.priorityScore);
    if (Number.isFinite(explicit)) return explicit;

    const recommendation = String(advice.recommendation || "").toLowerCase();
    const recommendationScore = recommendation.includes("buy") ? 80
      : recommendation.includes("watch") ? 55
      : recommendation.includes("avoid") || recommendation.includes("pass") ? 15
      : 0;
    const confidence = Number(advice.confidence || 0);
    if (recommendationScore) return recommendationScore + Math.min(20, Math.max(0, confidence * 20));

    const desire = Number(saved.desire || 0) * 10;
    const budgetFit = Number(saved.maxAllIn || 0) && currentTotal(lot, settings) <= Number(saved.maxAllIn || 0) ? 15 : 0;
    return desire + budgetFit;
  }

  function makeMockAdvice(lot, saved = {}, settings = {}) {
    const total = currentTotal(lot, settings);
    const estimateHigh = Number(lot.estimateHigh || 0);
    const estimateLow = Number(lot.estimateLow || 0);
    const maxAllIn = Number(saved.maxAllIn || 0);
    const desireScore = Number(saved.desire || 3) * 12;
    const budgetScore = maxAllIn ? (total <= maxAllIn ? 18 : -14) : 0;
    const estimateScore = estimateHigh ? Math.max(-20, Math.min(18, ((estimateHigh - total) / estimateHigh) * 24)) : 0;
    const ratingScore = lot.gradingCompany ? 8 : 0;
    const certScore = lot.gradingCert || lot.gradingUrl ? 4 : 0;
    const statusPenalty = /outbid/i.test(lot.status || "") ? -8 : 0;
    const preferenceScore = preferenceMatchScore(lot, settings);
    const strategyAdjustment = strategyScoreAdjustment(settings, total, estimateHigh, maxAllIn);
    const score = clampScore(42 + desireScore + budgetScore + estimateScore + ratingScore + certScore + statusPenalty + preferenceScore + strategyAdjustment);

    return {
      confidence: 0.45,
      generatedAt: new Date().toISOString(),
      maxReasonableAllIn: suggestedAllInPrice(lot, saved, score, settings),
      model: "local-mock",
      recommendation: score >= 78 ? "buy" : score >= 52 ? "watch" : "avoid",
      score,
      summary: makeMockSummary(lot, score, total, estimateLow, estimateHigh, maxAllIn, settings),
      tags: makeMockTags(lot, score, total, estimateHigh, maxAllIn, settings)
    };
  }

  function makeMockTags(lot, score, total, estimateHigh, maxAllIn, settings = {}) {
    const tags = [];
    const text = `${lot.title || ""} ${lot.description || ""} ${lot.sale || ""}`.toLowerCase();
    tags.push(score >= 78 ? "AI优先" : score >= 52 ? "AI观察" : "AI谨慎");
    if (maxAllIn) tags.push(total <= maxAllIn ? "预算内" : "超预算");
    if (estimateHigh && total > estimateHigh) tags.push("高于估价");
    if (estimateHigh && total <= estimateHigh * 0.75) tags.push("估价内空间");
    if (lot.gradingCompany) tags.push(lot.gradingCompany);
    else tags.push("未评级");
    if (lot.gradingCompany && !(lot.gradingCert || lot.gradingUrl)) tags.push("缺少证书号");
    if (/paper money|yuan|bank|note|PMG/i.test(text)) tags.push("纸币");
    if (/silver|dollar|coin|pcgs|ngc|cents?|cash/i.test(text)) tags.push("硬币");
    if (/china|hong kong|macau|taiwan|people's republic|communist/i.test(text)) tags.push("中国");
    if (/rare|scarce|seldom|popular/i.test(text)) tags.push("题材热");
    if (/details|cleaned|damage|repaired|stained|engraved/i.test(text)) tags.push("品相风险");
    if (preferenceMatchScore(lot, settings) > 0) tags.push("匹配偏好");
    const strategy = strategyLabel(settings.aiStrategy);
    if (strategy) tags.push(strategy);
    return uniqueTags(tags).slice(0, 8);
  }

  function makeMockSummary(lot, score, total, estimateLow, estimateHigh, maxAllIn, settings = {}) {
    const parts = [];
    if (estimateHigh) parts.push(`当前总价约 ${Math.round(total)}，估价区间 ${Math.round(estimateLow)}-${Math.round(estimateHigh)}`);
    if (maxAllIn) parts.push(total <= maxAllIn ? "低于你的最高全包价" : "高于你的最高全包价");
    if (preferenceMatchScore(lot, settings) > 0) parts.push("匹配你的收藏方向");
    if (settings.aiStrategy && settings.aiStrategy !== "balanced") parts.push(`策略 ${strategyLabel(settings.aiStrategy)}`);
    if (lot.gradingCompany) parts.push(`评级 ${lot.gradingText || lot.gradingCompany}`);
    parts.push(`mock 分数 ${score}`);
    return parts.join("；");
  }

  function preferenceMatchScore(lot, settings = {}) {
    const focus = splitTags(settings.aiCollectingFocus);
    if (!focus.length) return 0;
    const text = `${lot.title || ""} ${lot.description || ""} ${lot.sale || ""} ${lot.gradingText || ""} ${lot.gradingCompany || ""}`.toLowerCase();
    const matches = focus.filter((term) => text.includes(term.toLowerCase())).length;
    return Math.min(14, matches * 5);
  }

  function strategyScoreAdjustment(settings = {}, total, estimateHigh, maxAllIn) {
    const strategy = settings.aiStrategy || "balanced";
    if (strategy === "conservative") {
      let adjustment = -4;
      if (maxAllIn && total > maxAllIn * 0.9) adjustment -= 6;
      if (estimateHigh && total > estimateHigh) adjustment -= 8;
      return adjustment;
    }
    if (strategy === "aggressive") {
      let adjustment = 4;
      if (estimateHigh && total <= estimateHigh * 1.15) adjustment += 5;
      if (!maxAllIn || total <= maxAllIn * 1.05) adjustment += 3;
      return adjustment;
    }
    return 0;
  }

  function strategyLabel(strategy) {
    if (strategy === "conservative") return "保守策略";
    if (strategy === "aggressive") return "积极策略";
    return "";
  }

  function mergeAiTags(existing, aiTags = []) {
    return uniqueTags([...splitTags(existing), ...aiTags]).join(", ");
  }

  function splitTags(value) {
    return String(value || "").split(/[,，;；\n]+/).map((tag) => tag.trim()).filter(Boolean);
  }

  function uniqueTags(tags) {
    const seen = new Set();
    const result = [];
    for (const tag of tags.map((item) => String(item || "").trim()).filter(Boolean)) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(tag);
    }
    return result;
  }

  function clampScore(value) {
    return Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
  }

  window.BetterToBid.ai = {
    makeMockAdvice,
    mergeAiTags,
    scoreAdvice
  };
})();
