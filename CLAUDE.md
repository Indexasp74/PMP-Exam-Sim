# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, shareable PMP exam simulator meant to be cloned and run from GitHub. It generates practice questions via a user-selected AI provider (Anthropic, Gemini, or Groq). There is no build step, no package manager, and no test suite — to run it, open `index.html` in a browser (or serve the folder with any static server). To ship a change, edit the source and reload.

## Files

- `index.html` — markup for the five screens; links `styles.css` and `app.js`.
- `styles.css` — all styling; CSS custom properties in `:root` (colors, fonts, domain colors `--people`/`--process`/`--biz`).
- `app.js` — all logic.
- `README.md` / `LICENSE` (MIT) — for GitHub distribution.
- `pmp_exam_sim.html` — the original single-file prototype this was split from. Superseded by the three files above; kept only for reference. Edit the split files, not this.
- `docs/USER_GUIDE.md` / `docs/DEVELOPER_GUIDE.md` — living docs; see "Documentation maintenance" below.

## Architecture

**Screen state machine** — five mutually exclusive views, never separate pages:
- `#startScreen` — config: two `config-card`s (AI provider connection, domain mix), provider/model/length/approach option buttons, the paused-session banner, and the View Test History / Plan My Study Schedule entry points. Toggled via `.hidden`.
- `#examScreen` — holds `#loadingWrap`, `#questionWrap`, and `#errorWrap` (also toggled among themselves). Toggled via `.hidden`.
- `#endScreen` — score summary + on-demand answer review. Toggled via `.show` (reuses the `.end-screen` card pattern).
- `#historyScreen` — list of past sessions, each with an expandable answer review; reached from and returns to `#startScreen`. Toggled via `.show`, same pattern as `#endScreen`.
- `#planScreen` — test-date input, Smart/Date-based mode toggle, generated practice schedule, `.ics` calendar download; reached from and returns to `#startScreen`. Toggled via `.show`, same pattern as `#endScreen`.

**Central `state` object** (top of `app.js`) is the single source of truth: `provider`, `providerConfig` (per-provider saved key/model), `domainWeights`, current question index, generated `questions`, recorded `answers`, per-domain tallies, timer handle, and `history` (the running API conversation, in a neutral role shape). `startExam()` resets the per-session fields; `selectProvider()` swaps `state.apiKey`/`state.model` to mirror whichever provider is active.

**Config persistence:** `loadConfig()` (called at the bottom of `app.js` on load) and `saveConfig()` read/write `localStorage` under the `pmpsim.*` keys (`LS_KEYS`). Persisted: provider, per-provider `{apiKey, model}` map, proxy URL (provider-agnostic), domain mix. A one-time migration seeds the new shape from the old flat `pmpsim.apiKey`/`pmpsim.model` keys if present.

**Session persistence (pause/resume + test history):** two more `LS_KEYS` — `activeSession` (a single in-progress-exam snapshot, written by `saveActiveSession()` only while the current question is unanswered — right after render and every 10s of timer tick — which is what prevents a resume-time double-counted answer) and `testHistory` (an array of concluded exams, capped at `MAX_HISTORY = 30`, written once per exam by `recordHistoryEntry()` inside `showEndScreen()` — the single convergence point for every way an exam can end). `pauseExam()`/`resumeExam()` read/write the snapshot; resuming re-renders the persisted `currentQ` directly rather than calling the AI again. See `docs/DEVELOPER_GUIDE.md`'s *Session persistence* section for the full checkpoint-invariant rationale.

**Ask-before-save API keys:** typing a key no longer auto-persists it — `startExam()` prompts via `confirm()` before writing a new/changed key to `state.providerConfig`, so a declined key lives only in `state.apiKey` for that page session. `refreshSavedKeyNote()` shows a note next to the key field when the typed key matches what's actually saved. Because a declined key isn't in `providerConfig`, the pause/resume snapshot carries `apiKey` directly so `resumeExam()` can restore it after `selectProvider()` would otherwise clobber it.

**Study plan generator:** `generateStudyPlan(examDateStr, mode)` turns a target test date into a recommended practice schedule — cadence/session-length taper banded by days remaining, mock(175) placement that's never within the final 2 days, and a forced light-review day before the exam. `mode` is `'smart'` (boosts the weakest domain from `findWeakestDomain()`'s aggregate of `loadHistory()`) or `'date'` (always the standard mix); mocks always use the standard mix in both modes. Each session's config is encoded into its own deep-link via `buildSessionUrl()` (`?len=&approach=&people=&process=&business=`), applied on page load by `applyDeepLinkParams()` and never persisted. `buildIcsCalendar()`/`downloadIcs()` export the whole plan as a standard `.ics` file — pure client-side string-building, no calendar API. See `docs/DEVELOPER_GUIDE.md`'s *Study plan generator* section for the banding table and algorithm details.

**Provider abstraction (the key design point):** `PROVIDERS` (top of `app.js`) holds one adapter per provider (`anthropic`, `gemini`, `groq`), each implementing `buildRequest`, `parseText`, and optionally `listModels`/`fallbackModels`/`rateLimitNote`. `fetchGeneration()` calls `PROVIDERS[state.provider].buildRequest(...)`, retrying with backoff on HTTP 429, then `provider.parseText(data)`. Direct mode uses each provider's own auth scheme (Anthropic: `x-api-key` + browser-access header; Gemini: `?key=` query param; Groq: `Authorization: Bearer`); proxy mode (when `state.proxyUrl` is set) POSTs the same provider-shaped body with no auth headers, leaving credential injection to the proxy. See `docs/DEVELOPER_GUIDE.md` for the full per-provider request-shape table and the Gemini-capacity-vs-queue reasoning.

**Question lifecycle:** `loadNextQuestion()` builds a system prompt → `fetchGeneration()` → strip accidental markdown fences → `JSON.parse` → `renderQuestion()`. The submit handler grades (branching on `q.type`), records into `state.answers`, and reveals the rationale. `nextBtn` advances or calls `endExam()`.

**Three question types**, weighted ~60/25/15 in `loadNextQuestion`: `multiple_choice`, `multiple_response` (both via `renderChoices`), and `matching` (via `renderMatching`). The model is instructed to return *only* JSON in one of two inline-defined shapes; `q.domain` is re-stamped after parsing to enforce the intended domain.

**Domain weighting** is user-configurable via `state.domainWeights` (default People 42 / Process 50 / Business 8). `pickDomain()` normalizes by the live total (weights need not sum to 100). The same weights drive `endExam()`'s padding of unreached questions as incorrect, so the final percentage reflects the full session length. `refreshMixDisplay()` keeps the on-card percentages in sync.

**Glossary tooltips:** the model returns `glossaryTerms`; `buildGlossaryHtml` wraps the first verbatim occurrence of each term (longest-first, case-insensitive) with a hover/tap tooltip wired by `wireGlossaryTooltips`.

## Documentation maintenance

`docs/USER_GUIDE.md` and `docs/DEVELOPER_GUIDE.md` are living docs derived from the original `.docx` guides. **Whenever app files change, update the relevant guide(s) in the same change** — feature/UX changes go in the User Guide; architecture, state, API, or scoring changes go in the Developer Guide. Bump the Developer Guide version and add a changelog entry for anything user- or developer-visible. The `.docx` originals are superseded; the Markdown files are the source of truth.

## Conventions

- All user/model-supplied text is escaped via `escHtml` before insertion into the DOM — preserve this for any new rendered field.
- Use the existing CSS custom properties for colors/spacing; don't hardcode values.
- Model options are rendered dynamically by `renderModelOptions()` from `PROVIDERS[id].fallbackModels` or a live `listModels()` fetch — don't hardcode model buttons in `index.html`. Re-confirm `fallbackModels` IDs periodically against each provider's current docs (they're a pre-key placeholder, not authoritative).
- Never hardcode an API key into any file — credentials come only from the user via the config screen / localStorage.
- When adding a new AI provider, add one entry to `PROVIDERS` implementing the existing contract (`buildRequest`/`parseText`/optionally `listModels`) rather than branching elsewhere in the code — `selectProvider()`, `fetchGeneration()`, and persistence are all provider-agnostic and shouldn't need changes.
- Verify time-sensitive third-party claims (rate limits, CORS support, free-tier terms) empirically before relying on them — they drift without notice; don't assert from training-data memory.
