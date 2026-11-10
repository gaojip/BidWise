# BetterToBid

BetterToBid is a reference-only browser extension for Stack's Bowers watch and bid pages.

It helps you review lots you are watching or have bid on, add your own market value, purchase intent, budget, tags, and notes, then export those notes with text and lot images. It does not place bids, change bids, buy items, or automate any checkout flow.

## Features

- Detects Stack's Bowers lot cards, rows, watched lots, bid lists, and lot detail pages.
- Saves per-lot notes in local browser storage.
- Tracks market/reference price, maximum all-in price, buyer premium, tags, and purchase intent.
- Uses nuanced price tones for below-estimate, in-estimate, above-estimate, and over-target situations.
- Captures grading service, grade, available certification numbers, and lookup links for PCGS, NGC, PMG, and similar holders.
- Estimates whether a lot is worth considering, only as a personal reference signal.
- Refresh button for manual checks.
- Sync-all button that follows Stack's Bowers pagination API and captures the full current watch/bid list.
- Optional automatic page-change detection using a MutationObserver.
- Highlights recently changed lots with a short change summary after refresh or sync, and keeps a compact recent change history per lot.
- Independent saved-lot list that combines scanned watchlist and bid-sheet lots.
- Sorts saved lots by session, lot number, current bid, estimated current total bid, your max bid, estimate, status, urgency, recent change, purchase intent, or update time.
- Filters the saved list by outbid lots, over-target lots, missing target price, missing market price, missing estimate, missing grading cert, missing image, recent changes, or AI-analyzed lots.
- Marks lots with missing target price, market price, estimate, grading cert, or image so incomplete records are easy to clean up.
- Keeps the BTB page list grouped by auction session first, then applies the selected sort inside each session.
- Shows compact per-session summaries for active bids, outbid lots, over-target lots, strong AI picks, and target budget total.
- Supports AI recommendation ranking through saved `aiAdvice.score` data, so a session can be sorted by AI priority after an API advisor is connected.
- Supports urgency sorting that combines auction timing, bidding/outbid state, AI score, purchase intent, and target-price fit.
- Provides a per-session `AI 分析` button that currently generates local mock advice and can later be swapped for a real AI API advisor.
- Provides an AI provider layer with a default local-rule provider and an optional OpenAI API provider using the Responses API.
- Supports configurable AI strategy and collecting focus, used by both local-rule and OpenAI analysis.
- Keeps recent AI analysis history per lot and shows it in the AI page, lot verdict, Kanban detail, and note exports.
- Appends the AI summary into each lot note as an `[AI ...]` block without overwriting manually written notes.
- Generates AI tags during session analysis and merges them with manually entered tags.
- Embeds AI rank and suggested all-in price badges next to visible lot numbers on Stack's Bowers pages after AI analysis.
- Embeds configurable BetterToBid annotations into Stack's Bowers lot rows: detailed insight blocks, AI-only badges, or no page annotations.
- Adds a pinned on-page AI analysis panel for reviewing all AI summaries, rankings, suggested prices, and tags by session.
- Adds an enriched BetterToBid record card on lot detail pages with inline editing for market price, target price, intent, notes, tags, grading lookup, AI advice, and AI history.
- Opens the original Stack's Bowers lot page from each saved item.
- Resizable BTB page panel and resizable Kanban detail panel, with preferred sizes saved locally.
- Kanban dashboard page for upcoming, active, outbid, and completed bid records, with search, sort, filters, editable status, and notes.
- Exports HTML, Markdown, or CSV notes with text, lot links, image URLs, AI history, and change history captured from the page.
- Can export only the currently selected auction session from the BTB menu.
- Exports and imports full JSON backups for lots, notes, tags, AI advice, Kanban status, and settings.
- Shows a JSON backup import preview before merging imported lots and settings.

## Install locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select this repository folder.
5. Visit `https://stacksbowers.com` or `https://www.stacksbowers.com`.

## Usage

Open a Stack's Bowers lot, watchlist, or bids page. Click the `BTB` button on the right side of the page. Use `刷新` to rescan the current page after the site updates content. Use `同步全部` on watchlist or bids pages to capture every paginated lot in that list.

Use `总列表` to see every lot that has been scanned and saved locally. Use `当前页` to inspect only lots found on the page you are viewing. The sort controls can order lots by lot number, current bid, your max bid, high estimate, status, urgency, recent change, purchase intent, or update time. The arrow link beside each lot opens its original Stack's Bowers page.

Select a lot, add your market value, all-in budget, purchase intent, tags, and notes, then export HTML, Markdown, CSV, or just the selected session when needed.

Use `导出备份 JSON` and `导入备份 JSON` in the BTB menu, or `备份` / `导入` on the Kanban dashboard, to move the full local dataset between browsers or restore it after reinstalling. Import shows a preview with added lots, overwritten lots, and changed settings before merging.

To use OpenAI analysis, open `更多`, choose `OpenAI API`, enter your API key and model, then use `测试 AI` before running `AI 分析` on a session. You can also choose an AI strategy (`均衡`, `保守`, or `积极`) and add collecting focus terms such as `中国纸币, PMG, 银币`. The default model is `gpt-5.4-nano`, intended for low-cost extraction, ranking, and classification work. If OpenAI analysis fails, BetterToBid falls back to local rules and records the fallback source. The API key is stored locally in `chrome.storage.local` and is omitted from JSON backups.

## Kanban dashboard

Click `Kanban` in the BTB panel to open the standalone dashboard. The dashboard groups locally saved lots into upcoming/watch, active bid, outbid, and completed columns. Select a card to edit its manual Kanban status, market value, all-in budget, purchase intent, tags, and notes. It can also export or import a full JSON backup. It can be bookmarked from the browser address bar after opening.

Because the dashboard reads `chrome.storage.local`, it must be opened as an extension page (`chrome-extension://.../dashboard.html`) rather than as a plain `file://` HTML file. Browser bookmark, Chrome app shortcut, and macOS desktop URL shortcut workflows can all point to that extension URL after the extension is loaded.

## Architecture

The extension intentionally has no build step. Manifest V3 loads small browser scripts in order:

- `src/core/constants.js`: shared constants and storage keys.
- `src/core/utils.js`: formatting, parsing, escaping, and URL helpers.
- `src/core/pricing.js`: shared current-total, target, suggested-price, and price-tone helpers.
- `src/core/storage.js`: local storage loading, migration, and debounced saving.
- `src/ai/mockAdvisor.js`: local mock AI scoring, suggested price, summary, and tag generation.
- `src/ai/providers.js`: AI provider registry and shared session-analysis interface.
- `src/core/sorting.js`: shared session grouping, lot sorting, default direction, and tie-breaker rules.
- `src/core/evaluator.js`: reference-only purchase evaluation rules.
- `src/sites/stacksbowers.js`: Stack's Bowers page adapters for lot detail, watched lots, and bid sheet pages.
- `src/background.js`: privileged JSON fetch bridge used by full pagination sync.
- `src/export/notes.js`: HTML and Markdown note exporters.
- `src/ui/panel.js`: injected panel UI, rendering, and UI events.
- `src/dashboard.js`: standalone Kanban dashboard for local saved lots.
- `src/content.js`: small coordinator that wires storage, scanning, UI, refresh, and export together.

Future site support should add another file under `src/sites/` with the same `scanLots()` shape, then select the adapter in `src/content.js`.

## Privacy and safety

All custom data is stored locally through `chrome.storage.local`. BetterToBid only reads page content that is already visible in your browser. The extension intentionally has no code path for real bidding, purchasing, or checkout automation.
