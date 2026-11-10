(() => {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "btb-openai-response") {
      fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${message.apiKey || ""}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message.body || {})
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.error?.message || `OpenAI API error ${response.status}`);
          sendResponse({ ok: true, data });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: error.message || String(error) });
        });

      return true;
    }

    if (message?.type !== "btb-fetch-json") return false;

    fetch(message.url, {
      credentials: "include",
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sendResponse({ ok: true, data: await response.json() });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    return true;
  });
})();
