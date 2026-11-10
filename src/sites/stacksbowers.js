(() => {
  "use strict";

  const { APP_ID } = window.BetterToBid.constants;
  const {
    absoluteUrl,
    cleanText,
    formatMoney,
    htmlToText,
    maxNumeric,
    metaContent,
    naturalCompare,
    parseMoney,
    stableId
  } = window.BetterToBid.utils;

  const PRICE_RE = /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
  const LOT_RE = /\bLot\s*#?\s*([A-Z0-9-]+)/i;
  const GRADING_COMPANY_RE = /\b(PCGS|NGC|PMG|ANACS|ICG|CACG)\b/i;
  const BID_LABEL_RE = /\b(Current Bid|Opening Bid|BIDDING)\s+\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?%?)/i;
  const ESTIMATE_RE = /\bEst(?:imate)?:\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*[-–]\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const DETAIL_MAX_BID_RE = /\bMax:\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const MAX_BID_RE = /\bYour Max Bid:\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const WATCHLIST_LOT_RE = /^\s*([0-9]{3,7}[A-Z]?)\b/;
  const FIELD_LABELS = {
    currentBid: ["current bid", "high bid", "bid", "opening bid", "estimate"],
    estimate: ["estimate", "est."],
    sale: ["auction", "session", "sale"]
  };

  function matches(url = location.href) {
    return /(^|\.)stacksbowers\.com\//i.test(new URL(url).hostname + "/");
  }

  function scanLots() {
    const viewVarsLots = scanViewVarsLots();
    if (viewVarsLots.length) return viewVarsLots;

    const viewVarsLot = scanViewVarsLot();
    if (viewVarsLot) return [viewVarsLot];

    const detailLot = scanDomLotDetail();
    if (detailLot) return [detailLot];

    const watchListLots = scanDomWatchList();
    if (watchListLots.length) return watchListLots;

    return scanGenericLots();
  }

  function annotateLots(state = {}, options = {}) {
    clearAnnotations();
    const mode = options.mode || "full";
    if (mode === "off") return;

    const rankMap = buildVisibleRankMap(state);
    const lots = scanLots();
    const hasDetailCard = mode === "full" && lots.length === 1 && annotateDetailLot(lots[0], state, rankMap.get(lots[0].id));

    for (const lot of lots) {
      const saved = state.lots?.[lot.id] || {};
      if (mode === "full" && !hasInlineInsight(saved)) continue;
      if (mode === "badge" && !saved.aiAdvice) continue;
      if (hasDetailCard && lot.id === lots[0]?.id) continue;
      const target = findLotNumberTarget(lot);
      if (!target) continue;
      const container = findAnnotationContainer(target, lot);
      if (!container) continue;
      const annotation = document.createElement("div");
      annotation.className = "btb-page-annotation";
      if (saved.aiAdvice) annotation.appendChild(makeAiBadge(rankMap.get(lot.id), saved.aiAdvice));
      if (mode === "full") {
        const insight = makeInlineInsight(lot, saved, rankMap.get(lot.id));
        if (insight) annotation.appendChild(insight);
      }
      if (!annotation.childElementCount) continue;
      container.classList.add("btb-page-annotated-lot");
      container.appendChild(annotation);
    }
  }

  function clearAnnotations() {
    for (const container of document.querySelectorAll(".btb-page-annotated-lot")) container.classList.remove("btb-page-annotated-lot");
    for (const annotation of document.querySelectorAll(".btb-page-annotation")) annotation.remove();
    for (const badge of document.querySelectorAll(".btb-page-ai-badge")) badge.remove();
    for (const insight of document.querySelectorAll(".btb-page-insight")) insight.remove();
    for (const card of document.querySelectorAll(".btb-detail-card")) card.remove();
  }

  function hasInlineInsight(saved = {}) {
    return Boolean(saved.aiAdvice || saved.maxAllIn || saved.marketValue || saved.desire || saved.tags || saved.notes);
  }

  function buildVisibleRankMap(state) {
    const visible = scanLots();
    const groups = new Map();
    for (const lot of visible) {
      const saved = state.lots?.[lot.id] || {};
      if (!saved.aiAdvice) continue;
      const key = lot.sale || "未分场次";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ lot, score: Number(saved.aiAdvice.score || 0) });
    }

    const ranks = new Map();
    for (const entries of groups.values()) {
      entries.sort((a, b) => b.score - a.score || naturalCompare(a.lot.lotNumber, b.lot.lotNumber));
      entries.forEach((entry, index) => ranks.set(entry.lot.id, `${index + 1}/${entries.length}`));
    }
    return ranks;
  }

  function makeAiBadge(rank, advice) {
    const badge = document.createElement("span");
    const suggested = Number(advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || 0);
    badge.className = "btb-page-ai-badge";
    badge.textContent = [rank ? `AI ${rank}` : "", suggested ? formatMoney(suggested) : ""].filter(Boolean).join(" ");
    badge.title = advice.summary || "BetterToBid AI reference";
    return badge;
  }

  function makeInlineInsight(lot, saved, rank) {
    const advice = saved.aiAdvice || {};
    const suggested = Number(advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || 0);
    const parts = [];
    if (saved.maxAllIn) parts.push(["目标", formatMoney(saved.maxAllIn), "target"]);
    if (saved.marketValue) parts.push(["行情", formatMoney(saved.marketValue), "neutral"]);
    if (saved.desire) parts.push(["意愿", `${saved.desire}/5`, "neutral"]);
    if (advice.score !== undefined) parts.push(["AI", `${rank ? `${rank} · ` : ""}${Math.round(Number(advice.score || 0))}/100`, "ai"]);
    if (suggested) parts.push(["建议", formatMoney(suggested), "target"]);
    if (!parts.length && !advice.summary && !saved.tags) return null;

    const wrapper = document.createElement("div");
    wrapper.className = "btb-page-insight";
    wrapper.innerHTML = `
      <div class="btb-page-insight-chips">
        ${parts.map(([label, value, tone]) => `<span class="btb-page-insight-chip ${tone}"><b>${escapeInline(label)}</b>${escapeInline(value)}</span>`).join("")}
      </div>
      ${saved.tags ? `<div class="btb-page-insight-tags">${splitTags(saved.tags).map((tag) => `<span>${escapeInline(tag)}</span>`).join("")}</div>` : ""}
      ${advice.summary ? `<div class="btb-page-insight-summary">${escapeInline(advice.summary)}</div>` : ""}
    `;
    return wrapper;
  }

  function annotateDetailLot(lot, state, rank) {
    const saved = state.lots?.[lot.id] || {};
    if (!hasInlineInsight(saved) && !lot.gradingUrl) return;
    const anchor = findDetailInsertAnchor();
    if (!anchor) return false;
    anchor.insertAdjacentElement("beforebegin", makeDetailCard(lot, saved, rank));
    return true;
  }

  function makeDetailCard(lot, saved, rank) {
    const advice = saved.aiAdvice || {};
    const suggested = Number(advice.maxReasonableAllIn || advice.suggestedAllIn || advice.suggestedPrice || 0);
    const grading = lot.gradingText || [lot.gradingCompany, lot.gradingGrade, lot.gradingCert ? `Cert ${lot.gradingCert}` : ""].filter(Boolean).join(" · ");
    const history = Array.isArray(saved.aiAdviceHistory) ? saved.aiAdviceHistory.slice(-3).reverse() : [];
    const changeHistory = Array.isArray(saved.changeHistory) ? saved.changeHistory.slice(-3).reverse() : [];
    const card = document.createElement("section");
    card.className = "btb-detail-card";
    card.innerHTML = `
      <div class="btb-detail-card-head">
        <strong>BetterToBid 记录</strong>
        ${rank && advice.score !== undefined ? `<span>AI ${escapeInline(rank)} · ${Math.round(Number(advice.score || 0))}/100</span>` : ""}
      </div>
      <div class="btb-detail-card-grid">
        ${saved.maxAllIn ? `<span><b>目标</b>${formatMoney(saved.maxAllIn)}</span>` : ""}
        ${saved.marketValue ? `<span><b>行情</b>${formatMoney(saved.marketValue)}</span>` : ""}
        ${saved.desire ? `<span><b>意愿</b>${escapeInline(saved.desire)}/5</span>` : ""}
        ${suggested ? `<span><b>AI 建议</b>${formatMoney(suggested)}</span>` : ""}
      </div>
      <div class="btb-detail-card-editor" data-lot-id="${escapeInline(lot.id)}">
        <label>行情
          <input class="btb-detail-field" data-field="marketValue" inputmode="decimal" value="${escapeInline(saved.marketValue ?? "")}" placeholder="参考价">
        </label>
        <label>目标
          <input class="btb-detail-field" data-field="maxAllIn" inputmode="decimal" value="${escapeInline(saved.maxAllIn ?? "")}" placeholder="全包价">
        </label>
        <label>意愿
          <select class="btb-detail-field" data-field="desire">
            ${[5, 4, 3, 2, 1].map((value) => `<option value="${value}" ${Number(saved.desire || 3) === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label class="wide">标签
          <input class="btb-detail-field" data-field="tags" value="${escapeInline(saved.tags || "")}" placeholder="稀缺, 品相好">
        </label>
        <label class="wide">笔记
          <textarea class="btb-detail-field" data-field="notes" rows="3" placeholder="记录瑕疵、版别、比较成交价等">${escapeInline(saved.notes || "")}</textarea>
        </label>
      </div>
      ${grading ? `<p><b>评级</b>${lot.gradingUrl ? `<a href="${escapeInline(lot.gradingUrl)}" target="_blank" rel="noopener noreferrer">${escapeInline(grading)}</a>` : escapeInline(grading)}</p>` : ""}
      ${saved.tags ? `<div class="btb-detail-card-tags">${splitTags(saved.tags).map((tag) => `<span>${escapeInline(tag)}</span>`).join("")}</div>` : ""}
      ${advice.summary ? `<p>${escapeInline(advice.summary)}</p>` : ""}
      ${changeHistory.length ? `<div class="btb-detail-card-history"><b>变化历史</b>${changeHistory.map((item) => `<span>${escapeInline(formatShortDate(item.at))} · ${escapeInline(item.summary || "页面信息变化")}</span>`).join("")}</div>` : ""}
      ${history.length ? `<div class="btb-detail-card-history"><b>AI 历史</b>${history.map((item) => `<span>${escapeInline(formatShortDate(item.generatedAt))} · ${escapeInline(item.providerLabel || item.model || "AI")} · ${Math.round(Number(item.score || 0))}/100</span>`).join("")}</div>` : ""}
    `;
    return card;
  }

  function findDetailInsertAnchor() {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,strong,div,span")]
      .filter((node) => !node.closest(`#${APP_ID}`))
      .filter((node) => /^LOT DESCRIPTION$/i.test(cleanText(node.innerText || node.textContent || "")));
    if (headings[0]) return headings[0].closest("section,div,article") || headings[0];
    return document.querySelector("[class*='description' i], [id*='description' i]") || document.body?.firstElementChild;
  }

  function truncateText(value, maxLength) {
    const text = cleanText(value || "");
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function formatShortDate(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "未知时间";
    return date.toLocaleDateString();
  }

  function splitTags(value) {
    return String(value || "").split(/[,，;；\n]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  }

  function escapeInline(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function findLotNumberTarget(lot) {
    const lotNumber = String(lot.lotNumber || "").trim();
    if (!lotNumber) return null;
    const candidates = [...document.querySelectorAll("h1,h2,h3,strong,span,a,div")]
      .filter((node) => !node.closest(`#${APP_ID}`) && !node.closest(".btb-page-annotation,.btb-page-ai-badge,.btb-page-insight"))
      .map((node) => ({ node, text: cleanText(node.innerText || node.textContent || "") }))
      .filter((item) => item.text === lotNumber || item.text.startsWith(`${lotNumber} `) || item.text.startsWith(`${lotNumber}★`) || item.text.startsWith(`${lotNumber} ★`))
      .sort((a, b) => a.text.length - b.text.length);
    return candidates[0]?.node || null;
  }

  function findAnnotationContainer(target, lot) {
    const lotNumber = String(lot.lotNumber || "").trim();
    let node = target;
    while (node && node !== document.body) {
      if (node.closest?.(`#${APP_ID}`)) return null;
      const text = cleanText(node.innerText || node.textContent || "");
      const rect = node.getBoundingClientRect?.();
      const hasLotText = lotNumber && text.includes(lotNumber);
      const hasLotContext = node.querySelector?.("img") || /(Current Bid|Opening Bid|BIDDING|Outbid|Your Max Bid|Estimate)\b/i.test(text);
      const isUsableBox = rect && rect.width >= 260 && rect.height >= 64;
      if (hasLotText && hasLotContext && isUsableBox) return node;
      node = node.parentElement;
    }
    return target.closest("tr,li,article,[class*='lot' i],[id*='lot' i],.card,.item") || target.parentElement;
  }

  async function scanAllLots({ maxPages = 20 } = {}) {
    const viewVars = readViewVars();
    const firstPageLots = viewVars?.lots?.result_page;
    if (!Array.isArray(firstPageLots) || !firstPageLots.length) return scanLots();

    const lots = firstPageLots.map((lot) => normalizeLot(lot, viewVars)).filter(Boolean);
    const seen = new Set(lots.map((lot) => lot.id));
    let nextUrl = viewVars.lots?.query_info?.next_page || "";
    let pagesRead = 1;

    while (nextUrl && pagesRead < maxPages) {
      const page = await fetchAuctionPage(nextUrl);
      const pageLots = Array.isArray(page?.result_page) ? page.result_page : [];
      for (const lot of pageLots.map((item) => normalizeLot(item, viewVars)).filter(Boolean)) {
        if (seen.has(lot.id)) continue;
        seen.add(lot.id);
        lots.push(lot);
      }
      nextUrl = page?.query_info?.next_page || "";
      pagesRead += 1;
    }

    return lots;
  }

  async function fetchAuctionPage(url) {
    const response = await chrome.runtime.sendMessage({
      type: "btb-fetch-json",
      url: absoluteUrl(url)
    });
    if (!response?.ok) throw new Error(response?.error || "Unable to fetch next page");
    return response.data || {};
  }

  function scanViewVarsLots() {
    const viewVars = readViewVars();
    const lots = viewVars?.lots?.result_page;
    if (!Array.isArray(lots) || !lots.length) return [];
    return lots.map((lot) => normalizeLot(lot, viewVars)).filter(Boolean);
  }

  function scanViewVarsLot() {
    const viewVars = readViewVars();
    const lot = viewVars?.lot;
    return normalizeLot(lot, viewVars);
  }

  function normalizeLot(lot, viewVars = {}) {
    if (!lot?.lot_number || !lot?.title) return null;

    const percentageBid = lot.timed_auction_bid?.amount_percentage || lot.highest_live_bid?.amount_percentage || lot.absentee_bid?.max_bid_percentage;
    const currentBid = percentageBid || maxNumeric(lot.timed_auction_bid?.amount, lot.highest_live_bid?.amount, lot.sold_price, lot.starting_price);
    const yourMaxBid = lot.absentee_bid?.max_bid_percentage || lot.absentee_bid?.max_bid || 0;
    const images = Array.isArray(lot.images) ? lot.images : [];
    const image = images.find((item) => item.detail_url) || images.find((item) => item.thumbnail_url);
    const lotNumber = `${lot.lot_number}${lot.lot_number_extension || ""}`;
    const grading = extractGrading(lot, [lot.title, lot.description, lot.truncated_description, lot.coin_pcgs].join(" "));

    return {
      id: `lot-${lotNumber}`,
      rowId: lot.row_id || "",
      lotNumber,
      title: cleanText(lot.title),
      url: absoluteUrl(lot._detail_url || location.href),
      imageUrl: absoluteUrl(image?.detail_url || image?.thumbnail_url || lot.cover_thumbnail || metaContent("og:image") || ""),
      currentBid: Number(currentBid || 0),
      currentBidType: lot.timed_auction_bid || lot.highest_live_bid ? "BIDDING" : "",
      yourMaxBid: Number(yourMaxBid || 0),
      bidUnit: percentageBid ? "%" : "USD",
      estimateLow: Number(lot.estimate_low || 0),
      estimateHigh: Number(lot.estimate_high || 0),
      buyerPremiumRate: extractBuyerPremiumRate(lot),
      buyersPremiumAmount: Number(lot.buyers_premium_amount || 0),
      sale: cleanText(lot.auction?.title || ""),
      auctionStart: lot.auction?.time_start_live_auction || lot.auction?.time_start || "",
      auctionEnd: lot.auction?.effective_end_time || "",
      auctionType: lot.auction?.auction_type || "",
      sourcePage: viewVars.lotsType || viewVars.currentRouteName || "",
      description: htmlToText(lot.description || lot.truncated_description || ""),
      gradingCompany: grading.company,
      gradingGrade: grading.grade,
      gradingCert: grading.cert,
      gradingText: grading.text,
      gradingUrl: grading.url,
      pcgs: cleanText(lot.coin_pcgs || grading.text || ""),
      status: extractLotStatus(lot),
      currencyCode: lot.currency_code || "USD",
      watched: Boolean(lot.is_watched),
      capturedAt: new Date().toISOString(),
      hash: stableId([lot.row_id, lot.lot_number, lot.title, grading.text, grading.cert, currentBid, yourMaxBid, lot.estimate_low, lot.estimate_high, lot.last_updated].join("|"))
    };
  }

  function extractGrading(lot = {}, text = "") {
    const rawSource = cleanText([
      text,
      lot.title,
      lot.description,
      lot.truncated_description,
      lot.coin_pcgs,
      lot.coin_grade,
      lot.coin_grading_service
    ].filter(Boolean).join(" "));
    const source = cleanText(htmlToText(rawSource));
    const company = cleanText(lot.coin_grading_service || (source.match(GRADING_COMPANY_RE) || [])[1] || "").toUpperCase();
    const grade = cleanText(lot.coin_grade || extractGradeAfterCompany(source, company));
    const cert = cleanText(extractCert(rawSource, company) || extractCert(source, company));
    const url = extractCertUrl(rawSource) || buildCertUrl(company, cert);
    const pcgs = cleanText(lot.coin_pcgs || "");
    const textParts = [company, grade].filter(Boolean);
    if (cert) textParts.push(`Cert ${cert}`);
    else if (pcgs && company === "PCGS") textParts.push(pcgs.replace(/^#\s*/i, "PCGS #"));
    return {
      cert,
      company,
      grade,
      text: cleanText(textParts.join(" · ")),
      url
    };
  }

  function extractGradeAfterCompany(text, company) {
    if (!company) return "";
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`\\b${escaped}\\b\\s*([^.;\\n]{1,80})`, "i"));
    if (!match) return "";
    return cleanText(match[1]
      .replace(/\b(?:cert(?:ification)?|details?|click here)\b.*$/i, "")
      .replace(/\s+\|\s*Stacks Bowers.*$/i, ""));
  }

  function extractCert(text, company = "") {
    const pcgs = text.match(/\bpcgs\.com\/cert\/([0-9A-Z-]+)/i);
    if (pcgs) return pcgs[1];
    const certLookup = text.match(/\b(?:ngccoin|pmgnotes)\.com\/certlookup\/([0-9A-Z-]+)/i);
    if (certLookup) return certLookup[1];
    const label = text.match(/\b(?:cert(?:ification)?|certification\s+number|cert\s*(?:#|no\.?|number)?)\s*[:#]?\s*([0-9A-Z-]{5,})\b/i);
    if (label) return label[1];
    if (company === "PCGS") {
      const pcgsNumber = text.match(/\bPCGS\s*#\s*([0-9A-Z-]{3,})\b/i);
      if (pcgsNumber) return pcgsNumber[1];
    }
    return "";
  }

  function extractCertUrl(text) {
    const match = String(text || "").match(/https?:\\?\/\\?\/(?:www\.)?(?:pcgs\.com\/cert\/[0-9A-Z-]+|ngccoin\.com\/certlookup\/[0-9A-Z-\/]+|pmgnotes\.com\/certlookup\/[0-9A-Z-\/]+)/i);
    return match ? match[0].replace(/\\/g, "") : "";
  }

  function buildCertUrl(company, cert) {
    if (!company || !cert) return "";
    if (company === "PCGS") return `https://www.pcgs.com/cert/${encodeURIComponent(cert)}`;
    if (company === "NGC") return `https://www.ngccoin.com/certlookup/${encodeURIComponent(cert)}/`;
    if (company === "PMG") return `https://www.pmgnotes.com/certlookup/${encodeURIComponent(cert)}/`;
    return "";
  }

  function readViewVars() {
    for (const script of document.scripts) {
      const text = script.textContent || "";
      const start = text.indexOf("viewVars = ");
      if (start === -1) continue;
      const json = extractAssignedObject(text, start + "viewVars = ".length);
      if (!json) continue;
      try {
        return JSON.parse(json);
      } catch (error) {
        console.warn("[BetterToBid] Could not parse viewVars", error);
      }
    }
    return null;
  }

  function extractAssignedObject(text, startIndex) {
    const firstBrace = text.indexOf("{", startIndex);
    if (firstBrace === -1) return "";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = firstBrace; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(firstBrace, index + 1);
      }
    }
    return "";
  }

  function extractBuyerPremiumRate(lot) {
    const premiumTable = lot.auction?.default_buyers_premium;
    if (!premiumTable || typeof premiumTable !== "object") return 0;
    const firstRate = Number(Object.values(premiumTable)[0]);
    return Number.isFinite(firstRate) ? firstRate * 100 : 0;
  }

  function extractLotStatus(lot) {
    if (lot.sold_price) return "Sold";
    if (lot.status && lot.status !== "active") return lot.status;
    const current = maxNumeric(lot.timed_auction_bid?.amount, lot.highest_live_bid?.amount, lot.timed_auction_bid?.amount_percentage, lot.highest_live_bid?.amount_percentage);
    const own = Number(lot.absentee_bid?.max_bid_percentage || lot.absentee_bid?.max_bid || 0);
    if (own && current > own) return "Outbid";
    if (lot.winning_bid_id || lot.timed_auction_bid || lot.highest_live_bid) return "Bidding";
    return "";
  }

  function scanDomLotDetail() {
    const bodyText = document.body?.innerText || "";
    if (!/\bLOT DESCRIPTION\b/i.test(bodyText) && !/\bBACK TO WATCHED LOTS\b/i.test(bodyText)) return null;

    const header = extractDetailHeader();
    if (!header.lotNumber || !header.title) return null;
    const compact = cleanText(bodyText);
    const currentBidMatch = compact.match(BID_LABEL_RE);
    const estimateMatch = compact.match(ESTIMATE_RE);
    const maxBidMatch = compact.match(DETAIL_MAX_BID_RE);
    const description = extractDetailDescription(bodyText, header.title);
    const grading = extractGrading({}, `${header.title} ${description} ${bodyText}`);

    return {
      id: `lot-${header.lotNumber}`,
      lotNumber: header.lotNumber,
      title: header.title,
      url: location.href,
      imageUrl: findLargestPageImage(),
      currentBid: currentBidMatch ? parseMoney(currentBidMatch[2]) : 0,
      currentBidType: currentBidMatch ? currentBidMatch[1] : "",
      yourMaxBid: maxBidMatch ? parseMoney(maxBidMatch[1]) : 0,
      bidUnit: currentBidMatch && currentBidMatch[2].includes("%") ? "%" : "USD",
      estimateLow: estimateMatch ? parseMoney(estimateMatch[1]) : 0,
      estimateHigh: estimateMatch ? parseMoney(estimateMatch[2]) : 0,
      sale: extractDetailSale(bodyText),
      description,
      gradingCompany: grading.company,
      gradingGrade: grading.grade,
      gradingCert: grading.cert,
      gradingText: grading.text,
      gradingUrl: grading.url,
      pcgs: grading.company === "PCGS" ? grading.cert || grading.text : "",
      status: extractWatchListStatus(compact),
      capturedAt: new Date().toISOString(),
      hash: stableId([header.lotNumber, header.title, grading.text, grading.cert, currentBidMatch?.[0] || "", estimateMatch?.[0] || ""].join("|"))
    };
  }

  function extractDetailHeader() {
    const candidates = [...document.querySelectorAll("header, h1, h2, h3, section, div")]
      .filter((node) => !node.closest(`#${APP_ID}`))
      .map((node) => cleanText(node.innerText || node.textContent || ""))
      .filter((text) => text.length >= 24 && text.length <= 600);

    for (const text of candidates) {
      const match = text.match(/^([0-9]{3,7}[A-Z]?)\s+(.+?)(?:\s+WATCHING\b|\s+LOT DESCRIPTION\b|\s+BACK TO WATCHED LOTS\b|$)/i);
      if (!match) continue;
      const title = cleanText(match[2].replace(/\s+WATCHING\b.*$/i, ""));
      if (title.length >= 12) return { lotNumber: match[1], title };
    }

    const body = cleanText(document.body?.innerText || "");
    const fallback = body.match(/\b([0-9]{3,7}[A-Z]?)\s+(\(?[a-z]\)?\s*[A-Z0-9][^]+?)\s+(?:WATCHING|Bidding|Current Bid|Opening Bid|LOT DESCRIPTION)\b/i);
    return fallback ? { lotNumber: fallback[1], title: cleanText(fallback[2]) } : { lotNumber: "", title: "" };
  }

  function extractDetailDescription(bodyText, title) {
    const lines = bodyText.split(/\n+/).map(cleanText).filter(Boolean);
    const start = lines.findIndex((line) => /^LOT DESCRIPTION$/i.test(line));
    if (start === -1) return "";
    const collected = [];
    for (const line of lines.slice(start + 1)) {
      if (/^(LIVE AUCTION|Show Auction Info|Return to|Back to)/i.test(line)) break;
      if (/^\(t\)\s*\(i\)/i.test(line)) break;
      if (line === title || /^Estimate:\s*/i.test(line) || /^Est:\s*/i.test(line)) continue;
      collected.push(line);
      if (collected.join(" ").length > 900) break;
    }
    return collected.join("\n");
  }

  function extractDetailSale(bodyText) {
    const lines = bodyText.split(/\n+/).map(cleanText).filter(Boolean);
    const liveIndex = lines.findIndex((line) => /^LIVE AUCTION$/i.test(line));
    if (liveIndex !== -1 && lines[liveIndex + 1]) return lines[liveIndex + 1];
    return lines.find((line) => /Auction\b/i.test(line) && /\bLots?\s+[0-9]/i.test(line)) || "";
  }

  function findLargestPageImage() {
    const images = [...document.images].filter((image) => {
      if (image.closest(`#${APP_ID}`)) return false;
      const src = image.currentSrc || image.src || "";
      const alt = image.alt || "";
      if (!src || /logo|spacer|icon/i.test(src) || /logo/i.test(alt)) return false;
      return (image.naturalWidth || image.clientWidth || 0) >= 80 && (image.naturalHeight || image.clientHeight || 0) >= 80;
    });
    images.sort((a, b) => ((b.naturalWidth || b.clientWidth || 0) * (b.naturalHeight || b.clientHeight || 0)) - ((a.naturalWidth || a.clientWidth || 0) * (a.naturalHeight || a.clientHeight || 0)));
    return images[0] ? new URL(images[0].currentSrc || images[0].src, location.href).href : "";
  }

  function scanDomWatchList() {
    const rows = collectWatchListRows();
    const lots = [];
    const seen = new Set();
    for (const row of rows) {
      const lot = extractWatchListLot(row);
      if (!lot || seen.has(lot.id)) continue;
      seen.add(lot.id);
      lots.push(lot);
    }
    return lots.sort((a, b) => naturalCompare(a.lotNumber || a.title, b.lotNumber || b.title));
  }

  function collectWatchListRows() {
    const rows = [];
    for (const node of document.querySelectorAll("tr, li, article, div")) {
      if (node.closest(`#${APP_ID}`)) continue;
      const compact = cleanText(node.innerText || node.textContent || "");
      const hasBidControl = /(PLACE BID|EDIT)\b/i.test(compact);
      const hasBidLabel = /(Current Bid|Opening Bid|BIDDING|Outbid|Your Max Bid)\b/i.test(compact);
      if (node.querySelector("img") && hasBidControl && hasBidLabel && WATCHLIST_LOT_RE.test(compact)) rows.push(node);
    }
    return rows.filter((node) => !rows.some((other) => other !== node && node.contains(other)));
  }

  function extractWatchListLot(row) {
    const text = cleanText(row.innerText || row.textContent || "");
    const lotNumber = (text.match(WATCHLIST_LOT_RE) || [])[1] || "";
    if (!lotNumber) return null;
    const currentBidMatch = text.match(BID_LABEL_RE);
    const estimateMatch = text.match(ESTIMATE_RE);
    const maxBidMatch = text.match(MAX_BID_RE);
    const link = row.querySelector("a[href*='Lot'], a[href*='lot'], a[href*='Auction'], a[href]");
    const image = row.querySelector("img");
    const title = extractWatchListTitle(text, lotNumber);
    const grading = extractGrading({}, text);

    return {
      id: `lot-${lotNumber}`,
      lotNumber,
      title,
      url: link ? new URL(link.getAttribute("href"), location.href).href : location.href,
      imageUrl: image ? new URL(image.currentSrc || image.src, location.href).href : "",
      currentBid: currentBidMatch ? parseMoney(currentBidMatch[2]) : 0,
      currentBidType: currentBidMatch ? currentBidMatch[1] : "",
      yourMaxBid: maxBidMatch ? parseMoney(maxBidMatch[1]) : 0,
      bidUnit: currentBidMatch && currentBidMatch[2].includes("%") ? "%" : "USD",
      estimateLow: estimateMatch ? parseMoney(estimateMatch[1]) : 0,
      estimateHigh: estimateMatch ? parseMoney(estimateMatch[2]) : 0,
      sale: findNearestAuctionTitle(row),
      gradingCompany: grading.company,
      gradingGrade: grading.grade,
      gradingCert: grading.cert,
      gradingText: grading.text,
      gradingUrl: grading.url,
      pcgs: grading.company === "PCGS" ? grading.cert || grading.text : "",
      status: extractWatchListStatus(text),
      capturedAt: new Date().toISOString(),
      hash: stableId([lotNumber, grading.text, grading.cert, text.slice(0, 400)].join("|"))
    };
  }

  function extractWatchListTitle(text, lotNumber) {
    return cleanText(text
      .replace(new RegExp(`^\\s*${lotNumber}\\s*★?\\s*`), "")
      .replace(/\bPCGS\s*#\s*[0-9]+\b.*$/i, "")
      .replace(/\b(Current Bid|Opening Bid|BIDDING|Outbid|Your Max Bid)\b.*$/i, ""));
  }

  function extractWatchListStatus(text) {
    if (/\bOutbid\b/i.test(text)) return "Outbid";
    if (/\bBIDDING\b/i.test(text)) return "Bidding";
    return "";
  }

  function findNearestAuctionTitle(row) {
    let cursor = row.previousElementSibling;
    while (cursor) {
      const text = cleanText(cursor.innerText || cursor.textContent || "");
      if (/Auction\b/i.test(text) && /\bLots?\s+[0-9]/i.test(text)) return text;
      cursor = cursor.previousElementSibling;
    }
    const match = cleanText(row.parentElement?.innerText || "").match(/(?:[A-Z][^\n]*?Auction[^\n]*?Lots?\s+[0-9-]+)/i);
    return match ? cleanText(match[0]) : "";
  }

  function scanGenericLots() {
    const lots = [];
    const seen = new Set();
    for (const node of collectCandidateNodes()) {
      const lot = extractGenericLot(node);
      if (!lot || seen.has(lot.id)) continue;
      seen.add(lot.id);
      lots.push(lot);
    }
    return lots.sort((a, b) => naturalCompare(a.lotNumber || a.title, b.lotNumber || b.title));
  }

  function collectCandidateNodes() {
    const nodes = new Set();
    for (const selector of ["tr", "article", "li", "[class*='lot' i]", "[id*='lot' i]", ".card", ".item"]) {
      for (const node of document.querySelectorAll(selector)) {
        const text = cleanText(node.innerText || node.textContent || "");
        const hasLotText = LOT_RE.test(text);
        const hasLotLink = Boolean(node.querySelector("a[href*='Lot'], a[href*='lot'], a[href*='Auction']"));
        if ((hasLotText || hasLotLink) && text.length > 20 && !node.closest(`#${APP_ID}`)) nodes.add(node);
      }
    }
    return [...nodes].filter((node) => ![...nodes].some((other) => other !== node && node.contains(other)));
  }

  function extractGenericLot(node) {
    const text = cleanText(node.innerText || node.textContent || "");
    const link = node.querySelector("a[href*='Lot'], a[href*='lot'], a[href*='Auction'], a[href]");
    const href = link ? new URL(link.getAttribute("href"), location.href).href : location.href;
    const lotNumber = (text.match(LOT_RE) || [])[1] || (href.match(/(?:lot|Lot)[=/_-]?([A-Z0-9-]+)/i) || [])[1] || "";
    const title = extractGenericTitle(node, link, text, lotNumber);
    if (!title && !lotNumber) return null;
    const prices = extractPrices(text);
    const currentBid = labeledPrice(text, FIELD_LABELS.currentBid) || prices[0] || 0;
    const estimate = extractEstimate(text, FIELD_LABELS.estimate, prices);
    const image = node.querySelector("img");
    const grading = extractGrading({}, text);
    return {
      id: lotNumber ? `lot-${lotNumber}` : stableId(href || title),
      lotNumber,
      title,
      url: href,
      imageUrl: image ? new URL(image.currentSrc || image.src, location.href).href : "",
      currentBid,
      estimateLow: estimate.low,
      estimateHigh: estimate.high,
      sale: labeledText(text, FIELD_LABELS.sale),
      gradingCompany: grading.company,
      gradingGrade: grading.grade,
      gradingCert: grading.cert,
      gradingText: grading.text,
      gradingUrl: grading.url,
      pcgs: grading.company === "PCGS" ? grading.cert || grading.text : "",
      capturedAt: new Date().toISOString(),
      hash: stableId([title, grading.text, grading.cert, currentBid, estimate.low, estimate.high, text.slice(0, 400)].join("|"))
    };
  }

  function extractGenericTitle(node, link, text, lotNumber) {
    const heading = node.querySelector("h1,h2,h3,h4,[class*='title' i],[class*='name' i]");
    const raw = heading?.innerText || link?.innerText || text.split(/\n| {3,}/)[0] || "";
    return cleanText(raw.replace(LOT_RE, "").replace(lotNumber, ""));
  }

  function extractPrices(text) {
    return [...text.matchAll(PRICE_RE)].map((match) => Number(match[1].replace(/,/g, ""))).filter(Number.isFinite);
  }

  function labeledPrice(text, labels) {
    const lower = text.toLowerCase();
    for (const label of labels) {
      const index = lower.indexOf(label);
      if (index === -1) continue;
      const prices = extractPrices(text.slice(index, index + 140));
      if (prices.length) return prices[0];
    }
    return 0;
  }

  function extractEstimate(text, labels, prices) {
    const lower = text.toLowerCase();
    for (const label of labels) {
      const index = lower.indexOf(label);
      if (index === -1) continue;
      const estimatePrices = extractPrices(text.slice(index, index + 180));
      if (estimatePrices.length >= 2) return { low: estimatePrices[0], high: estimatePrices[1] };
      if (estimatePrices.length === 1) return { low: estimatePrices[0], high: estimatePrices[0] };
    }
    return { low: prices[1] || 0, high: prices[2] || prices[1] || 0 };
  }

  function labeledText(text, labels) {
    return text.split(/\n+/).map(cleanText).filter(Boolean).find((line) => labels.some((label) => line.toLowerCase().includes(label))) || "";
  }

  window.BetterToBid.sites = window.BetterToBid.sites || {};
  window.BetterToBid.siteAdapters = window.BetterToBid.siteAdapters || [];
  window.BetterToBid.sites.stacksbowers = {
    annotateLots,
    matches,
    scanAllLots,
    scanLots
  };
  window.BetterToBid.siteAdapters.push(window.BetterToBid.sites.stacksbowers);
})();
