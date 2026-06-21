# PMP Exam Simulator — Developer's Guide

**v1.2**

## Overview

The PMP Exam Simulator is a static, client-side web app with **no build step and no server**. It generates PMP practice questions on demand by calling the Anthropic Messages API once per question — there is no static question bank.

As of v1.2 the app is split into three files and is meant to be cloned from GitHub and opened (or served as static files):

- `index.html` — markup for the three screens; links the CSS and JS.
- `styles.css` — all styling, using CSS custom properties (`--bg`, `--accent`, `--people`, etc.) on `:root`.
- `app.js` — all application logic, vanilla JS, no framework.

Supporting files: `README.md`, `LICENSE` (MIT), `.gitignore`, and `CLAUDE.md` (guidance for Claude Code). The original single-file prototype `pmp_exam_sim.html` is retained for reference only and is superseded by the three files above.

The app **requires a user-supplied Anthropic API key** (entered on the start screen, stored in the browser) or a **proxy URL** pointing at a backend that holds the key. Unlike v1.1, this version **does** persist configuration in `localStorage`.

## Architecture

### File structure

Three files, loaded by `index.html`:

1. `<link rel="stylesheet" href="styles.css">` — all CSS.
2. HTML body — three top-level screens: `#startScreen`, `#examScreen`, `#endScreen`, toggled via the `.hidden` and `.show` classes.
3. `<script src="app.js">` — all logic. `loadConfig()` runs at the bottom of the file on load.

### Screen flow

`startScreen → examScreen (loops per question) → endScreen → (restart) → startScreen`

Screens are shown/hidden via `classList` toggles on their container divs. There is no router; flow is controlled entirely by direct DOM manipulation in the event handlers.

### State model

All session state lives in a single global object, `state`. Per-session fields are reset in `startExam()`; config fields (`apiKey`, `proxyUrl`, `domainWeights`, `model`) are loaded from `localStorage` at startup and persist across sessions.

```js
let state = {
  sessionLen: 10,              // questions requested this session
  approach: 'mixed',           // 'mixed' | 'predictive' | 'agile' | 'hybrid'
  model: 'claude-sonnet-4-6',  // API model string, persisted
  apiKey: '',                  // user's Anthropic key, persisted (localStorage)
  proxyUrl: '',                // optional proxy endpoint, persisted
  domainWeights: { people: 42, process: 50, business: 8 }, // configurable, persisted
  qIndex: 0,                   // 0-based index of current question
  questions: [],               // currently unused (legacy field)
  answers: [],                 // array of answer-record objects, see below
  domainCounts: { people: 0, process: 0, business: 0 },
  domainCorrect: { people: 0, process: 0, business: 0 },
  timerInterval: null,         // setInterval handle
  secondsLeft: 0,
  currentQ: null,              // the parsed question JSON for the active question
  selectedChoices: new Set(),  // user's current selections (MC/MR only)
  answered: false,             // has the current question been submitted
  history: [],                 // API conversation history, capped to last 4 turns
};
```

### Answer record shape

Each completed, skipped, unsubmitted, or unreached question is pushed into `state.answers`:

```js
{
  correct: boolean,
  domain: 'people' | 'process' | 'business',
  topic: string | null,
  userAnswer: string,        // human-readable, e.g. "A, C" or "1→B, 2→D"
  correctAnswer: string,
  rationale: string,
  qText: string,
  qType: 'multiple_choice' | 'multiple_response' | 'matching' | null,
  skipped?: true,
  notSubmitted?: true,       // timer expired mid-question
  notReached?: true,         // session ended before question was generated
}
```

This array is the single source of truth for scoring. Both `updateScoreDisplay()` (live) and `showEndScreen()` (final) derive all numbers from it plus `state.domainCounts` / `state.domainCorrect`.

## Configuration & persistence (new in v1.2)

`loadConfig()` and `saveConfig()` read/write `localStorage` under keys defined in `LS_KEYS`:

```js
const LS_KEYS = {
  apiKey:   'pmpsim.apiKey',
  proxyUrl: 'pmpsim.proxyUrl',
  mix:      'pmpsim.domainMix',   // JSON-stringified { people, process, business }
  model:    'pmpsim.model',
};
```

- `loadConfig()` is called once at the end of `app.js`. It hydrates `state`, populates the start-screen inputs, marks the active model button, and calls `refreshMixDisplay()`. It is wrapped in try/catch so corrupt or unavailable storage (e.g. private-mode lockdown) degrades gracefully.
- `saveConfig()` is called on every relevant `input`/click event (key field, proxy field, mix inputs, model selection). All writes are try/caught.
- `refreshMixDisplay()` reads `state.domainWeights`, recomputes the normalized percentages, updates the three domain cards (`#sd-people` / `#sd-process` / `#sd-business`) and the "Total" line, and flags a non-positive total.

**Security note:** the API key lives in `localStorage` in plaintext and is the user's own key. Never hardcode a key anywhere in the repo. The README warns users not to enter their key on shared machines.

## Anthropic API integration

### Request construction & credential handling (changed in v1.2)

Each call to `loadNextQuestion()` builds a fresh system prompt (it embeds the target domain, question type, and the "avoid repeating these topics" context) and sends it with a sliding window of conversation history. Credential handling branches on whether a proxy URL is configured:

```js
const useProxy = !!state.proxyUrl;
const url = useProxy ? state.proxyUrl : 'https://api.anthropic.com/v1/messages';
const headers = { 'Content-Type': 'application/json' };
if (!useProxy) {
  headers['x-api-key'] = state.apiKey;
  headers['anthropic-version'] = '2023-06-01';
  headers['anthropic-dangerous-direct-browser-access'] = 'true';
}

fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: state.model,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [...state.history.slice(-4), { role: 'user', content: userMsg }],
  }),
});
```

- **Direct mode (no proxy):** the user's key is sent as `x-api-key`, with `anthropic-version` and the `anthropic-dangerous-direct-browser-access: true` header that permits browser-origin calls. (The v1.1 artifact-proxy assumption no longer applies — this version is standalone.)
- **Proxy mode (proxy URL set):** the same JSON body is POSTed to the proxy with **no** key/version headers. The proxy is responsible for injecting `x-api-key` and `anthropic-version`, and must return Anthropic's standard Messages API response shape (`{ "content": [{ "text": "..." }] }`).

`startExam()` validates that either a key or a proxy URL is present (and that domain weights sum to > 0) before starting, surfacing a message in `#startError` otherwise.

### Domain and question-type selection

Selection happens client-side, before the API call, via weighted random rolls:

- `pickDomain()` — weighted random against `state.domainWeights`, **normalized by the live total** (so weights need not sum to 100). Falls back to `process` if the total is ≤ 0.
- Question type — inline roll in `loadNextQuestion()`: 60% `multiple_choice`, 25% `multiple_response`, 15% `matching`.

Domain and type are determined by the client's RNG, not the model. The system prompt tells the model which to generate; the model does not choose.

### Response schema

The system prompt instructs the model to return **only JSON**, no markdown fences, no preamble. Two shapes:

**multiple_choice / multiple_response**
```json
{
  "type": "multiple_choice" | "multiple_response",
  "domain": "people" | "process" | "business",
  "topic": "short topic label",
  "scenario": "question text, 2–4 sentences",
  "glossaryTerms": [{ "term": "exact substring from scenario", "definition": "1-sentence definition" }],
  "options": [{ "key": "A", "text": "..." }],
  "correct": ["A"],
  "rationale": "2–3 sentence explanation"
}
```

**matching**
```json
{
  "type": "matching",
  "domain": "...", "topic": "...", "scenario": "...",
  "glossaryTerms": [],
  "left":  [{ "key": "1", "text": "..." }],
  "right": [{ "key": "A", "text": "..." }],
  "correct": { "1": "B", "2": "D", "3": "A", "4": "C" },
  "rationale": "..."
}
```

`glossaryTerms` is tolerated as empty/missing — `buildGlossaryHtml` returns escaped plain text when absent.

### Response parsing

```js
const clean = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
const q = JSON.parse(clean);
q.domain = domain; // enforce client-selected domain regardless of model output
```

The client overwrites the model's `domain` with the one it requested — a guard against drift, but it means a mismatched model response is silently discarded rather than surfaced. No schema validation library is used: malformed JSON throws (caught by the surrounding try/catch → error screen with Retry), but a structurally-valid object missing a required field (e.g. `options`) can break rendering with no caught exception. There is no defensive null-checking on individual fields before rendering.

### Conversation history management

`state.history` accumulates `{ role, content }` pairs after each successful generation, but only the last 4 entries (2 Q/A pairs) are sent per call via `.slice(-4)`, bounding token growth. Topic deduplication beyond that window is handled separately: `state.answers.map(a => a.topic)` is joined into an "avoid repeating these topics" instruction in every system prompt — this is the actual cross-session repeat-avoidance mechanism, not the history window.

## Scoring logic

`state.answers` is padded to `state.sessionLen` before scoring in `endExam()`:

1. **Unsubmitted current question** — if `state.currentQ` is set but `state.answered` is false, it is pushed as incorrect with its real (already-generated) domain.
2. **Unreached questions** — any gap between `state.answers.length` and `state.sessionLen` is filled with incorrect records, distributed across domains **by the configured `state.domainWeights`** (not the hardcoded 42/50/8). Each domain gets `Math.floor(remaining * weight / total)`; the rounding remainder goes to the **highest-weight domain** (computed dynamically, no longer hardcoded to `process`).

All denominators (live score label, per-domain cards, end-screen totals) use `state.sessionLen`, so a session ended early shows a truthful percentage. Unreached-question domain attribution is an estimate, not ground truth — the real domain was never rolled.

## Glossary tooltip implementation

`buildGlossaryHtml(scenario, glossaryTerms)` does client-side regex matching to wrap model-identified terms:

- Terms deduplicated case-insensitively (first definition wins).
- Sorted longest-first so a longer term isn't shadowed by a shorter substring.
- Matching uses `\b` word boundaries, case-insensitive.
- Only the **first** occurrence of each term is wrapped; later repeats render plain.

This is exact-substring matching against whatever the model echoed in `glossaryTerms[].term` — no semantic matching. If the model's term doesn't exactly (case-insensitively) appear in `scenario`, the tooltip silently fails to wrap. The prompt asks for "the exact substring as it appears," but this is not enforced client-side.

`wireGlossaryTooltips(container)` attaches per-term listeners on every render (fresh DOM nodes, no leakage):

- `mouseenter`/`mouseleave` toggle `.tip-active` (desktop hover).
- `focus`/`blur` do the same (keyboard accessibility).
- `click` toggles `.tip-active` and `stopPropagation()`s so the term's own click doesn't trigger dismiss.
- A single document-level click listener (wired once, guarded by `document._glossaryAwayWired`) clears all `.tip-active` — the "tap away to dismiss" behavior.

Definitions come from the model's own knowledge at generation time — there is no embedded PMBOK glossary file.

## Timer

`startTimer()` computes the budget once at session start:

```js
const fullTime = state.sessionLen === 175
  ? 230 * 60                                    // full exam: 230 min, matches real PMP
  : Math.max(state.sessionLen * 120, 20 * 60);  // 2 min/question, 20 min floor
```

The 120 s/question figure deliberately overallocates vs. the real exam's ~79 s/question to absorb API latency. On expiry (`secondsLeft <= 0`), `endExam()` runs — same path as the manual End Exam button.

## Known issues and limitations

- **No schema validation** on API responses — a structurally-valid but incomplete object can break rendering without a caught error.
- **Glossary matching is exact-substring**, not semantic — model term strings that don't precisely match the scenario silently drop their tooltip.
- **Unreached-question domain attribution** is a proportional estimate based on configured weights, not the true domain.
- **No prompt caching** — the system prompt is rebuilt and resent in full every call; the largest avoidable cost driver. Direct browser calls can't persist a cache breakpoint; a proxy could.
- **API key in `localStorage`** is plaintext — acceptable for personal use, risky on shared machines. Direct mode also exposes the key to the browser/network tab.
- **CORS / browser calls** rely on the `anthropic-dangerous-direct-browser-access` header; behavior is subject to Anthropic's policy for that header.
- **No session persistence** — refreshing mid-session loses exam state (only config is persisted, not in-progress answers).
- **Hotspot and drag-and-drop** question types (on the real exam) are not implemented — only multiple_choice, multiple_response, matching.
- **Glossary definitions are model-generated** at runtime and may drift from official PMBOK wording.

## Changelog

### v1.2
- Split the single-file prototype into `index.html` + `styles.css` + `app.js` for GitHub distribution; added `README.md`, MIT `LICENSE`, `.gitignore`, `CLAUDE.md`.
- Added **bring-your-own-key** support: direct browser calls now send `x-api-key`, `anthropic-version`, and `anthropic-dangerous-direct-browser-access: true` (the v1.1 artifact-proxy assumption is gone).
- Added optional **proxy URL** mode: when set, requests route to the proxy with no key sent from the browser.
- Added **`localStorage` persistence** (`pmpsim.*` keys) for API key, proxy URL, domain mix, and model selection (v1.1 used no storage).
- Added **configurable domain mix** on the start screen; `pickDomain()` and end-exam padding now use `state.domainWeights` (normalized) instead of hardcoded 42/50/8.
- Added start-screen validation (requires key or proxy; requires positive domain total).
- Fixed: "Review Answers" button now reappears when starting a new exam after a review.

### v1.1
- Fixed scoring denominator to use full session length; unanswered/unreached questions pad the answer set as incorrect.
- Increased per-question timer allocation from 78 s to 120 s to reduce premature expiry from API latency.
- Moved End Exam control to lower-left; grouped Submit/Next/Skip lower-right.
- Added model selector (Sonnet 4.6 / Haiku 4.5).
- Added glossary term tooltips (`glossaryTerms` schema field; hover/tap interaction).

### v1.0
- Initial build: domain-weighted question generation, three question types, live and end-of-session scoring, answer review.

## Extension points

In rough priority order:

1. **Server-side prompt caching** — moving the proxy from optional to a first-class caching backend would cut the largest cost driver; static HTML can't persist a cache breakpoint, but a proxy can use Anthropic's caching headers.
2. **Schema validation** — even simple `typeof`/`Array.isArray` guards on the parsed response before rendering would convert silent rendering failures into Retry-eligible errors.
3. **Optional verified-glossary mode** — a start-screen toggle between "model knowledge" (current, cheap) and an embedded PMBOK excerpt (more tokens, more accurate) for tooltip definitions.
4. **In-progress session persistence** — config is now persisted; extending to resume an interrupted exam would mean writing `answers`/`qIndex`/timer state to `localStorage` too.
