(() => {
  "use strict";

  const { makeMockAdvice } = window.BetterToBid.ai;
  const pricing = window.BetterToBid.pricing;

  const providers = {
    local: {
      id: "local",
      label: "本地规则",
      async analyzeLots(lots, state) {
        return lots.map((lot) => ({
          advice: normalizeAdvice(makeMockAdvice(lot, state.lots?.[lot.id] || {}, state.settings || {}), this),
          lot
        }));
      }
    },
    openai: {
      id: "openai",
      label: "OpenAI API",
      async analyzeLots(lots, state) {
        const apiKey = String(state?.settings?.aiApiKey || "").trim();
        if (!apiKey) throw new Error("请先在更多菜单中填写 OpenAI Key");
        const model = String(state?.settings?.aiModel || "gpt-5.4-nano").trim();
        const payload = await callOpenAi(apiKey, model, lots, state);
        const byId = new Map((payload.results || []).map((item) => [String(item.lotId), item]));
        return lots.map((lot) => ({
          advice: adviceFromOpenAiResult(lot, byId.get(lot.id), state, model),
          lot
        }));
      },
      async test(state) {
        const apiKey = String(state?.settings?.aiApiKey || "").trim();
        if (!apiKey) throw new Error("请先填写 OpenAI Key");
        const model = String(state?.settings?.aiModel || "gpt-5.4-nano").trim();
        const startedAt = Date.now();
        await sendOpenAiRequest(apiKey, {
          input: "Return {\"ok\":true}.",
          instructions: "Return JSON only.",
          max_output_tokens: 80,
          model,
          text: {
            format: {
              name: "better_to_bid_test",
              schema: {
                additionalProperties: false,
                properties: { ok: { type: "boolean" } },
                required: ["ok"],
                type: "object"
              },
              strict: true,
              type: "json_schema"
            }
          }
        });
        return { elapsedMs: Date.now() - startedAt, model };
      }
    }
  };

  function getProvider(id) {
    return providers[id] || providers.local;
  }

  async function analyzeLots(lots, state, options = {}) {
    const provider = getProvider(options.providerId || state?.settings?.aiProvider || "local");
    const results = await provider.analyzeLots(lots, state, options);
    return results.map((result) => ({
      advice: normalizeAdvice(result.advice, provider),
      lot: result.lot
    }));
  }

  async function testProvider(id, state) {
    const provider = getProvider(id || state?.settings?.aiProvider || "local");
    if (provider.test) return provider.test(state);
    return { elapsedMs: 0, model: provider.id };
  }

  function normalizeAdvice(advice = {}, provider) {
    return {
      ...advice,
      generatedAt: advice.generatedAt || new Date().toISOString(),
      model: advice.model || provider.id,
      providerId: provider.id,
      providerLabel: provider.label,
      schemaVersion: 1
    };
  }

  async function callOpenAi(apiKey, model, lots, state) {
    const body = {
      input: makeOpenAiPrompt(lots, state),
      instructions: [
        "You are a reference-only auction collecting assistant.",
        "Do not suggest placing real bids or purchases. Provide only advisory analysis.",
        "Score each lot from 0 to 100 for the user's collecting interest and price discipline.",
        "Respect the user's strategy and collecting focus when ranking lots.",
        "Use concise Chinese summaries and practical tags."
      ].join(" "),
      max_output_tokens: 5000,
      model,
      text: {
        format: {
          name: "better_to_bid_advice",
          schema: adviceSchema(),
          strict: true,
          type: "json_schema"
        }
      }
    };

    const data = await sendOpenAiRequest(apiKey, body);
    return parseOpenAiPayload(data);
  }

  async function sendOpenAiRequest(apiKey, body) {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      const response = await chrome.runtime.sendMessage({ apiKey, body, type: "btb-openai-response" });
      if (!response?.ok) throw new Error(cleanError(response?.error || "OpenAI API request failed"));
      return response.data;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify(body),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cleanError(data?.error?.message || `OpenAI API error ${response.status}`));
    return data;
  }

  function makeOpenAiPrompt(lots, state) {
    const settings = state?.settings || {};
    const items = lots.map((lot) => {
      const saved = state?.lots?.[lot.id] || {};
      return {
        aiScoreBefore: saved.aiAdvice?.score,
        currentBid: lot.currentBid || 0,
        currentTotal: pricing.currentTotal(lot, settings),
        desire: saved.desire || 3,
        estimateHigh: lot.estimateHigh || 0,
        estimateLow: lot.estimateLow || 0,
        grading: lot.gradingText || [lot.gradingCompany, lot.gradingGrade, lot.gradingCert].filter(Boolean).join(" "),
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        marketValue: saved.marketValue || 0,
        maxAllIn: saved.maxAllIn || 0,
        notes: truncate(saved.notes, 600),
        sale: lot.sale,
        status: lot.status,
        tags: saved.tags || "",
        title: lot.title
      };
    });
    return `Analyze these Stack's Bowers lots as a reference-only collecting assistant. Return JSON only.\n\n${JSON.stringify({
      collectingFocus: settings.aiCollectingFocus || "",
      lots: items,
      strategy: strategyInstruction(settings.aiStrategy)
    }, null, 2)}`;
  }

  function strategyInstruction(strategy) {
    if (strategy === "conservative") return "Conservative: penalize over-estimate prices, details-grade risk, missing certification, and lots near or above the user's max all-in target.";
    if (strategy === "aggressive") return "Aggressive: allow stronger scores for scarce, popular, high-fit lots even when prices approach estimate high, but still flag over-target risk.";
    return "Balanced: balance collecting fit, price discipline, grading confidence, and user target price.";
  }

  function adviceSchema() {
    return {
      additionalProperties: false,
      properties: {
        results: {
          items: {
            additionalProperties: false,
            properties: {
              confidence: { maximum: 1, minimum: 0, type: "number" },
              lotId: { type: "string" },
              maxReasonableAllIn: { minimum: 0, type: "number" },
              recommendation: { enum: ["buy", "watch", "avoid"], type: "string" },
              score: { maximum: 100, minimum: 0, type: "number" },
              summary: { maxLength: 260, type: "string" },
              tags: {
                items: { maxLength: 24, type: "string" },
                maxItems: 8,
                type: "array"
              }
            },
            required: ["lotId", "recommendation", "score", "confidence", "maxReasonableAllIn", "summary", "tags"],
            type: "object"
          },
          type: "array"
        }
      },
      required: ["results"],
      type: "object"
    };
  }

  function parseOpenAiPayload(data) {
    const text = data.output_text || extractOutputText(data);
    if (!text) throw new Error("OpenAI API 没有返回可解析文本");
    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new Error("OpenAI 返回 JSON 解析失败");
    }
  }

  function extractOutputText(data) {
    const chunks = [];
    for (const item of data.output || []) {
      for (const content of item.content || []) {
        if (content.type === "output_text" && content.text) chunks.push(content.text);
        if (content.type === "text" && content.text) chunks.push(content.text);
      }
    }
    return chunks.join("\n").trim();
  }

  function adviceFromOpenAiResult(lot, result, state, model) {
    const fallback = makeMockAdvice(lot, state.lots?.[lot.id] || {}, state.settings || {});
    if (!result) return { ...fallback, model, summary: `${fallback.summary}；OpenAI 未返回此 lot，已使用本地规则。` };
    return {
      confidence: Number(result.confidence || 0.65),
      generatedAt: new Date().toISOString(),
      maxReasonableAllIn: Math.round(Number(result.maxReasonableAllIn || fallback.maxReasonableAllIn || 0)),
      model,
      recommendation: result.recommendation || fallback.recommendation,
      score: Math.round(Number(result.score || fallback.score || 0)),
      summary: String(result.summary || fallback.summary || ""),
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 8) : fallback.tags
    };
  }

  function makeFallbackAdvice(lot, state, error) {
    const advice = makeMockAdvice(lot, state.lots?.[lot.id] || {}, state.settings || {});
    return {
      ...advice,
      fallbackReason: cleanError(error?.message || error || "OpenAI API failed"),
      model: "local-fallback",
      providerId: "local-fallback",
      providerLabel: "本地规则 fallback",
      summary: `${advice.summary}；OpenAI 失败，已使用本地规则。`
    };
  }

  function cleanError(message) {
    return String(message || "未知错误").replace(/\s+/g, " ").slice(0, 220);
  }

  function truncate(value, maxLength) {
    const text = String(value || "");
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  window.BetterToBid.aiProviders = {
    analyzeLots,
    getProvider,
    makeFallbackAdvice,
    providers,
    testProvider
  };
})();
