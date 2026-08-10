# PMP Exam Simulator — Developer's Guide

**v1.8**

## Overview

The PMP Exam Simulator is a static, client-side web app with **no build step and no server**. It generates PMP practice questions on demand by calling an AI provider's API once per question — there is no static question bank.

As of v1.2 the app is split into three files and is meant to be cloned from GitHub and opened (or served as static files):

- `index.html` — markup for the five screens; links the CSS and JS.
- `styles.css` — all styling, using CSS custom properties (`--bg`, `--accent`, `--people`, etc.) on `:root`.
- `app.js` — all application logic, vanilla JS, no framework.

Supporting files: `README.md`, `LICENSE` (MIT), `.gitignore`, and `CLAUDE.md` (guidance for Claude Code). The original single-file prototype `pmp_exam_sim.html` is retained for reference only and is superseded by the three files above.

The app **requires a user-supplied API key** for whichever provider is selected (entered on the start screen, stored in the browser, scoped per provider) or a **proxy URL** pointing at a backend that holds the key. As of v1.3 the app supports multiple providers (Anthropic, Gemini, Groq) via an adapter layer — see *Provider abstraction* below; v1.2's Anthropic-only integration has been generalized, not replaced. As of v1.4 in-progress sessions can be paused and resumed, and every completed session is recorded to a local test-history log — see *Session persistence: pause/resume and test history* below. As of v1.6 the app can also generate a recommended practice schedule from a target test date, exportable as a `.ics` calendar — see *Study plan generator* below.

## Architecture

### File structure

Three files, loaded by `index.html`:

1. `<link rel="stylesheet" href="styles.css">` — all CSS.
2. HTML body — five top-level screens: `#startScreen`, `#examScreen`, `#endScreen`, `#historyScreen`, `#planScreen`, toggled via the `.hidden` and `.show` classes.
3. `<script src="app.js">` — all logic. `loadConfig()`, `refreshPausedBanner()`, and `applyDeepLinkParams()` run at the bottom of the file on load.

### Screen flow

`startScreen → examScreen (loops per question) → endScreen → (restart) → startScreen`

`startScreen` also branches to `historyScreen` (View Test History) and `planScreen` (Plan My Study Schedule) and back, and `examScreen` can return to `startScreen` early via Pause (see *Session persistence* below) instead of only via `endScreen`.

Screens are shown/hidden via `classList` toggles on their container divs. There is no router; flow is controlled entirely by direct DOM manipulation in the event handlers.

### State model

All session state lives in a single global object, `state`. Per-session fields are reset in `startExam()`; config fields (`provider`, `apiKey`, `model`, `proxyUrl`, `domainWeights`) are loaded from `localStorage` at startup and persist across sessions. `apiKey`/`model` always reflect the **currently selected** provider — `state.providerConfig` holds the saved values for every provider, and `selectProvider()` copies the relevant slice into `apiKey`/`model` on switch.

```js
let state = {
  sessionLen: 10,              // questions requested this session
  approach: 'mixed',           // 'mixed' | 'predictive' | 'agile' | 'hybrid'
  provider: 'anthropic',       // 'anthropic' | 'gemini' | 'groq', persisted
  providerConfig: {},          // { anthropic: {apiKey, model}, gemini: {...}, groq: {...} }, persisted
  model: 'claude-sonnet-4-6',  // active provider's model string (mirrors providerConfig[provider].model)
  apiKey: '',                  // active provider's key (mirrors providerConfig[provider].apiKey)
  proxyUrl: '',                // optional proxy endpoint, persisted, provider-agnostic
  domainWeights: { people: 33, process: 41, business: 26 }, // configurable, persisted
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
  history: [],                 // API conversation history, capped to last 4 turns, provider-agnostic shape
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

## Configuration & persistence

`loadConfig()` and `saveConfig()` read/write `localStorage` under keys defined in `LS_KEYS`:

```js
const LS_KEYS = {
  provider:       'pmpsim.provider',
  providerConfig: 'pmpsim.providerConfig', // JSON: { anthropic: {apiKey, model}, gemini: {...}, groq: {...} }
  proxyUrl:       'pmpsim.proxyUrl',       // provider-agnostic
  mix:            'pmpsim.domainMix',      // JSON-stringified { people, process, business }
};
```

- `loadConfig()` is called once at the end of `app.js`. It hydrates `state.providerConfig` (with a one-time migration from the pre-v1.3 flat `pmpsim.apiKey`/`pmpsim.model` keys, so a key saved before this version shipped isn't lost), then calls `selectProvider()` to populate the rest of `state` and the UI, and `refreshMixDisplay()`. Wrapped in try/catch so corrupt or unavailable storage (e.g. private-mode lockdown) degrades gracefully.
- `saveConfig()` writes the whole persisted shape; `saveProviderField(field, value)` is a small helper that updates one field (`apiKey` or `model`) within the *current* provider's slot of `state.providerConfig` before calling `saveConfig()` — this is what keeps switching providers from clobbering a different provider's saved key.
- `refreshMixDisplay()` reads `state.domainWeights`, recomputes the normalized percentages, updates the three domain cards (`#sd-people` / `#sd-process` / `#sd-business`) and the "Total" line, and flags a non-positive total. Unchanged from v1.2.

**Security note:** API keys live in `localStorage` in plaintext and are the user's own. Never hardcode a key anywhere in the repo. The README warns users not to enter keys on shared machines.

### Ask-before-save for API keys

As of v1.4, typing a key no longer writes it to `localStorage` immediately. The `#apiKeyInput` `input` handler only updates `state.apiKey` in memory and calls `refreshSavedKeyNote()`; persistence is deferred until `startExam()`.

`startExam()` compares `state.apiKey` against `state.providerConfig[state.provider].apiKey` (the persisted value). If they differ — a brand-new key, or an edited one — and the user hasn't already been asked about this exact value this session (`state.apiKey !== state.keyDecisionFor`), a `confirm()` dialog asks whether to save it. Accepting calls `saveProviderField('apiKey', ...)` as before; declining leaves `providerConfig` untouched and the key lives only in `state.apiKey` for the rest of this page session. Either way, `state.keyDecisionFor` is set to that key value so the same unchanged key doesn't re-prompt on a later `startExam()` call in the same session (e.g. starting a second short drill back-to-back).

`refreshSavedKeyNote()` shows a small note (`#savedKeyNote`, styled via the new `.field-note.saved` class) next to the API key field whenever `state.apiKey` matches what's actually persisted for the active provider — i.e., "this is the key that will be remembered." It's called from `selectProvider()` (provider switch / page load), the key input's `input` handler (live, as the user types), and after the save/decline decision in `startExam()`.

**Interaction with pause/resume:** a declined (unsaved) key only exists in `state.apiKey`, not in `providerConfig` — so `saveActiveSession()` now also stores `apiKey` directly in the session snapshot, and `resumeExam()` restores it explicitly (`state.apiKey = snap.apiKey || state.apiKey`) immediately after `selectProvider(snap.provider)`, which would otherwise overwrite it with whatever (possibly empty) value `providerConfig` holds. This means a declined key still survives a pause/resume cycle — it's scoped to "this session's exam," not to "this browser permanently," and disappears (along with the rest of the snapshot) once the exam concludes or is discarded.

## Session persistence: pause/resume and test history

Two additional `localStorage` keys, separate from `LS_KEYS.provider`/`providerConfig`/`proxyUrl`/`mix` above, since they hold session data rather than config:

```js
activeSession: 'pmpsim.activeSession', // JSON snapshot of an in-progress (paused) exam, or absent
testHistory:   'pmpsim.testHistory',   // JSON array of concluded exams, most recent first
```

### Pause/resume

`pauseExam()` snapshots the full in-flight session (`saveActiveSession()`) and returns to `#startScreen`; `resumeExam()` restores `state` from that snapshot and re-renders the paused question via the existing `renderQuestion()` — it never re-calls the AI, so resuming doesn't cost an API call or risk landing on a different question. The snapshot includes the parsed `currentQ` object itself (question text, options, correct answers, rationale, glossary terms) for exactly this reason.

`refreshPausedBanner()` (called from `loadConfig()`'s init and after `resumeExam()`/discard/restart) shows or hides the `#pausedBanner` card on the start screen, summarizing progress (`Question N of sessionLen · X correct so far · provider · paused <timestamp>`). `startExam()` refuses to start a new session while a paused one exists — the user must Resume or Discard first (`startError` names this explicitly); this avoids silently overwriting an in-progress exam.

**Checkpoint invariant — only ever save while the current question is unanswered.** `saveActiveSession()` is called from exactly two places: right after a new question renders (`loadNextQuestion()`), and every 10 s of timer tick (`startTimer()`'s interval). The Pause button itself (`#pauseBtn`) is hidden the moment an answer is submitted (alongside `#submitBtn`/`#skipBtn`) and only re-shown when the next question renders. This means a paused/resumed session can never resume into an "answered but not yet advanced" state — resuming always shows a fresh, unanswered question. The deliberate cost: a user who closes the tab in the narrow window between Submit and Next (without ever clicking Pause) loses that one answer and re-sees the same question on resume — judged an acceptable edge case, since the alternative (persisting answered-but-pending UI state) risks re-submitting an already-recorded answer on resume and double-counting it in `state.answers`/`domainCorrect`.

`state.history` is trimmed to `.slice(-8)` before being written into the snapshot — generous headroom over the `.slice(-4)` actually sent per request (see *Conversation history management*), without persisting an unbounded array.

### Test history

Every concluded exam — however it ends (full completion, manual End Exam, or timer expiry) — passes through `showEndScreen()`, which is the single point where `recordHistoryEntry()` is called and `clearActiveSession()` runs. This guarantees one history record per concluded exam and guarantees no stale paused snapshot survives past the exam it belonged to. Each entry captures `provider`, `model`, `sessionLen`, `approach`, `domainWeights`, `pct`, `totalCorrect`, `rating`, `domainCounts`, `domainCorrect`, and the full `answers` array (so a past exam's review is byte-for-byte the same as a live one's).

`recordHistoryEntry()` unshifts onto the stored array (most recent first) and truncates to `MAX_HISTORY = 30` entries — a cap chosen because each entry's `answers` array can run to roughly 150 KB for a Full(175) session, and an unbounded history of repeated full-length runs could approach typical browser `localStorage` quotas (5–10 MB). No IndexedDB migration or pagination was built for this — a documented cap is consistent with the project's existing "plain `localStorage`, no build step" persistence approach, and 30 sessions is generous for a personal study tool.

`#historyScreen` (reached via the start screen's "View Test History" button) renders the array via `renderHistoryScreen()`, reusing the `.end-screen` card pattern from `#endScreen`. Each entry is expandable via a "Review Answers ↓" toggle that calls the same `renderAnswerReview(container, answers)` function used by the live post-exam review — this was extracted out of the `reviewBtn` handler specifically so history entries and the live end screen share one rendering path rather than duplicating the review-HTML logic. "Clear History" is gated behind a `confirm()` dialog, since it's the one destructive, hard-to-reverse action in this feature (Discarding a single paused session is not gated behind `confirm()` — it's a lighter-weight, single-item action).

## Provider abstraction

### The `PROVIDERS` registry

`app.js` defines a `PROVIDERS` object (`anthropic`, `gemini`, `groq`), each entry exposing the same contract:

| Field | Purpose |
| --- | --- |
| `label`, `tagline`, `keyHelpUrl`, `keyPlaceholder` | Drive the dynamic provider-selector UI (`updateProviderFields()`). |
| `rateLimitNote` | `null`, or a string shown as an in-app warning when this provider is paired with a Full (175) session (see *Gemini capacity handling* below). Only Gemini has one currently. |
| `fallbackModels: [{id, label}]` | A small curated list shown before a key is entered, or if `listModels()` fails. **Anthropic doesn't have a `listModels` — its fallback list is the only list, hand-maintained, since it isn't the provider with drift risk here.** |
| `listModels({apiKey})` | Async; fetches that provider's *current* models, filters to text-generation-capable ones, and overlays curated labels for known IDs (raw ID shown for anything unrecognized). `null` for Anthropic (not used). Returns `null` on any failure — callers must treat that as "keep the existing list," never as an error to surface. |
| `buildRequest({apiKey, proxyUrl, model, systemPrompt, messages})` | Returns `{ url, headers, body }` in that provider's request shape. |
| `parseText(data)` | Pulls the generated string out of that provider's response shape. |

Per-provider request-shape differences (this is the part that's easy to get subtly wrong when adding a provider):

| | Anthropic | Gemini | Groq |
| --- | --- | --- | --- |
| Auth (direct mode) | `x-api-key` header + `anthropic-version` + `anthropic-dangerous-direct-browser-access: true` | `?key=` query param | `Authorization: Bearer` header |
| System prompt | top-level `system` string | `systemInstruction.parts[].text` | first `messages[]` entry, `role: 'system'` |
| History roles | `user`/`assistant` (matches neutral shape) | `user`/`model` — `buildRequest` renames `assistant`→`model` at request time | `user`/`assistant` (matches neutral shape) |
| Max tokens param | `max_tokens` | `generationConfig.maxOutputTokens` | `max_tokens` |
| Response text path | `data.content[0].text` | `data.candidates[0].content.parts[0].text` | `data.choices[0].message.content` |
| Models-list endpoint | not used | `GET /v1beta/models?key=...` | `GET /openai/v1/models` (`Authorization: Bearer`) |

`state.history` stays in the neutral `{role: 'user'|'assistant', content}` shape regardless of provider — only Gemini's `buildRequest` does a role rename, at the boundary, so switching providers never requires touching how history is stored.

**Adding a new provider:** add an entry to `PROVIDERS` implementing the contract above, add a button to `#providerOptions` in `index.html`, and that's it — `selectProvider()`, `renderModelOptions()`, `fetchGeneration()`, and persistence are all provider-agnostic and read from the registry.

### Live model list with curated fallback

`refreshLiveModels(providerId, apiKey)` is called (a) right after `selectProvider()` if a key is already saved for that provider, and (b) on `blur` of the API key input. It calls `provider.listModels()`, and on success re-renders `#modelOptions` via `renderModelOptions()`. A monotonically increasing `_modelsFetchToken` guards against a stale response landing after the user has since switched providers or re-typed the key — the callback checks `token !== _modelsFetchToken` and bails if so.

This exists specifically because free-tier model lineups drift without notice (see *Known issues*) — live-fetching means the dropdown doesn't silently go stale the way a fully hardcoded list would. Anthropic doesn't get this treatment because (a) it isn't the provider with drift risk in practice, and (b) its existing labels carry curated cost info (`$3/$15 per M`) that a generic model-list response wouldn't include anyway.

### Gemini capacity handling: retry/backoff, not a queue

Gemini's free tier has a **daily** request cap (not just per-minute), which is the actual binding constraint for a long session — Gemini Pro's free tier (~100 req/day) can't complete a single 175-question Full session at all; Flash (~250/day) could, but would consume most of a day's quota doing it. A client-side request queue would help smooth per-minute bursts but **cannot** get around a hard daily ceiling, so one was deliberately not built.

Instead, two lighter mechanisms:

1. **Generic 429 retry-with-backoff** in `fetchGeneration()` — up to 3 attempts, 1s/2s exponential backoff, showing a "Rate limited by X — retrying in Ns..." message via the existing loading UI. This is provider-agnostic and helps any provider's transient rate-limit blips, not just Gemini's.
2. **In-app warning**, not a hard block — `refreshRateLimitWarning()` shows `provider.rateLimitNote` (in the `#rateLimitWarning` element, styled via the existing `.field-note.warn` class) whenever the active provider has a non-null `rateLimitNote` **and** `state.sessionLen === 175`. It's called from `selectProvider()` and from the length-options click handler, so it updates live as either selection changes.

### Request construction & credential handling

Each call to `loadNextQuestion()` builds a fresh system prompt (embedding the target domain, question type, and "avoid repeating these topics" context) and a sliding window of conversation history, then delegates to `fetchGeneration({systemPrompt, messages})`, which loops calling `PROVIDERS[state.provider].buildRequest(...)` (handling the 429 retry above) and returns `provider.parseText(data)`.

- **Direct mode (no proxy):** each provider's own auth scheme, per the table above.
- **Proxy mode (`state.proxyUrl` set):** every provider's `buildRequest` POSTs the same provider-shaped body to the proxy URL with **no** auth headers — the proxy must inject that provider's credentials and return that provider's native response shape. The proxy must match whichever provider is currently selected; there's no provider negotiation.

`startExam()` validates that either a key or a proxy URL is present (naming the active provider in the error message) and that domain weights sum to > 0, surfacing a message in `#startError` otherwise.

### Domain and question-type selection

Selection happens client-side, before the API call, via weighted random rolls:

- `pickDomain()` — weighted random against `state.domainWeights`, **normalized by the live total** (so weights need not sum to 100). Falls back to `process` if the total is ≤ 0. `DEFAULT_MIX` is `{ people: 33, process: 41, business: 26 }`, matching PMI's July 2026 ECO.
- Question type — inline roll in `loadNextQuestion()`: 60% `multiple_choice`, 25% `multiple_response`, 15% `matching`.

Domain and type are determined by the client's RNG, not the model. The system prompt tells the model which to generate; the model does not choose.

As of v1.8, the system prompt also grounds each question in one of that domain's actual ECO tasks, not just the domain label — `DOMAIN_TASKS` (top of `app.js`) holds PMI's current task titles per domain (People: 8 tasks, Process: 10, Business Environment: 8), and `loadNextQuestion()` joins the selected domain's list into the prompt. This exists because third-party prep courses' self-paced content can lag PMI's ECO revisions by months; embedding the task titles directly keeps generation aligned with the current outline regardless of what the model's training data reflects.

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

## Study plan generator

A fifth screen, `#planScreen` (same `.end-screen`/`.show` pattern as `#historyScreen`), lets the user enter a target test date and get a recommended practice schedule, downloadable as a standard `.ics` calendar file. Entirely client-side — no calendar API, no OAuth — consistent with the app's static, no-backend design. Reached via a "Plan My Study Schedule" button next to "View Test History" on the start screen.

### Persistence

`LS_KEYS.studyPlan` stores `{ examDate, mode, sessions }` for the last-generated plan, via `saveStudyPlan()`/`loadStudyPlan()`/`clearStudyPlan()` (same try/catch pattern as the other persistence helpers). Regenerating overwrites it.

### Cadence/taper algorithm

`generateStudyPlan(examDateStr, mode)` computes `daysUntil` (today and the exam date are both normalized to local midnight via `setHours(0,0,0,0)` before subtracting, to avoid timezone drift) and returns `{ error }` if it's under 2 days.

Session day-offsets come from two heuristic generators (banded, not an exact science — documented inline near `pickCadenceOffsets`/`pickMockOffsets`):

- `pickCadenceOffsets(daysUntil)` — practice-session spacing: daily (≤7 days), every other day (8–21), ~3x/week (22–56), 2-3x/week tapering to 3-4x/week in the final 4 weeks (>56). Always excludes the day immediately before the exam, which is reserved for review.
- `pickMockOffsets(daysUntil)` — Full(175) mock placement, **never within the final 2 days** (`maxOffset = daysUntil - 3`) regardless of band: one mock for ≤21-day windows, two for 22–56, two to three beyond that.

The two offset sets are merged with the exam-eve review day, deduped, and sorted. Session length (10/20/40) steps up across the resulting practice offsets in thirds; mocks are always 175 and the final day is always 10 ("light review").

Domain mix per non-mock session comes from `sessionDomainMix(mode, weak)`:
- `mode === 'date'` (or Smart with no history): always `DEFAULT_MIX` (33/41/26).
- `mode === 'smart'`: `findWeakestDomain()` aggregates `domainCorrect`/`domainCounts` across every `loadHistory()` entry to find the lowest-accuracy domain (domains with zero recorded attempts are skipped, not treated as 0% weak); that domain gets boosted to 65%, the other two split the remaining 35% proportional to their normal 33/41/26 ratio. Mock sessions always use the standard mix in both modes — a mock should simulate the real test, never a skewed one.

### Deep-linking via URL query params

`buildSessionUrl(session)` encodes one session's config as `?len=&approach=&people=&process=&business=` against the app's own origin/pathname — this is the link embedded in each calendar event and shown as "Open this session →" in the on-screen plan list.

On load, `applyDeepLinkParams()` (called from the init block, after `loadConfig()`) reads `location.search` via `URLSearchParams`. Each param is validated independently (`len` must be one of the four valid session lengths, `approach` one of the four valid values, the three mix values must be finite 0–100 numbers) — invalid or missing params are simply skipped, never thrown. Valid params overwrite `state` and the corresponding UI (option-button active states, `#mixPeople`/`#mixProcess`/`#mixBusiness` values, `refreshMixDisplay()`) but are **never persisted** via `saveConfig()`/`saveProviderField()` — this is a one-time launch hint, not a config change. `history.replaceState()` strips the query string afterward so a reload or bookmark doesn't replay it.

### `.ics` generation

`buildIcsCalendar(sessions)` is pure string-building (iCalendar is plain text, no library needed): one `VEVENT` per session with an all-day `DTSTART`/`DTEND` (`;VALUE=DATE`, sidestepping timezone handling entirely), a `SUMMARY`, a `DESCRIPTION` combining the session's `focusLabel` and its deep-link, and a `URL` property with the same link. `icsEscape()` handles the four RFC 5545 TEXT-value escapes (`\`, `;`, `,`, newline); `icsFold()` wraps content lines over 75 octets with a continuation line + leading space, per spec. `downloadIcs()` triggers the browser download via `new Blob([...], {type:'text/calendar'})` and a transient `<a download>` click — the same dependency-free pattern used nowhere else in this codebase yet, but standard and consistent with "no build step."

## Scoring logic

`state.answers` is padded to `state.sessionLen` before scoring in `endExam()`:

1. **Unsubmitted current question** — if `state.currentQ` is set but `state.answered` is false, it is pushed as incorrect with its real (already-generated) domain.
2. **Unreached questions** — any gap between `state.answers.length` and `state.sessionLen` is filled with incorrect records, distributed across domains **by the configured `state.domainWeights`** (not a hardcoded ratio). Each domain gets `Math.floor(remaining * weight / total)`; the rounding remainder goes to the **highest-weight domain** (computed dynamically, no longer hardcoded to `process`).

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
- **No prompt caching** — the system prompt is rebuilt and resent in full every call; the largest avoidable cost driver across all providers. Direct browser calls can't persist a cache breakpoint; a proxy could (and could use each provider's native caching mechanism).
- **API keys in `localStorage`** are plaintext — acceptable for personal use, risky on shared machines. Direct mode also exposes keys to the browser/network tab.
- **CORS support is provider-asserted and time-bound, not contractual** — Anthropic, Gemini, and Groq were all confirmed via live preflight checks during development, but CORS is a server-side policy any provider can change without notice. Re-verify (a simple `curl -X OPTIONS` preflight check) before relying on direct-browser mode for a provider, especially after a gap in time.
- **Free-tier rate limits and model lineups drift without notice** — this is exactly why models are live-fetched (`listModels()`) rather than fully hardcoded, but the curated-label overlays and `rateLimitNote` copy in `PROVIDERS` are hand-maintained and should be revisited periodically against each provider's current docs.
- **Gemini's free tier opts inputs/outputs into Google's model-improvement pipeline by default**, and enabling billing on a Gemini project removes free-tier access for that project entirely. Documented in the README/User Guide; not enforced or warned about in-app beyond the capacity `rateLimitNote`.
- **Pause/resume only checkpoints unanswered questions** — pausing or closing the tab in the narrow window between Submit and Next loses that one answer; resuming re-shows the same question fresh. See *Session persistence* above for why.
- **Test history is capped at 30 sessions** (`MAX_HISTORY`) and stored as plain JSON in `localStorage` — a long run of repeated Full(175) sessions could still approach browser storage quotas before hitting the cap, depending on browser/profile.
- **Hotspot and drag-and-drop** question types (on the real exam) are not implemented — only multiple_choice, multiple_response, matching.
- **Glossary definitions are model-generated** at runtime and may drift from official PMBOK wording.
- **Ollama / local models are out of scope** — different shape of problem (no key, needs a running local server, separate CORS config via `OLLAMA_ORIGINS`); see *Extension points*.
- **Study plan cadence is a heuristic**, not a personalized study-science recommendation — it's a reasonable, documented taper schedule, not tuned per-individual beyond the Smart-mode weak-domain boost.
- **Deep-link query params are unauthenticated and unsigned** — anyone with a generated link can open the sim pre-configured with that session's settings. This is by design (no accounts, no backend to verify against) and carries no real risk since the params only set practice preferences, never credentials.

## Changelog

### v1.8
- Updated `DEFAULT_MIX` to `{ people: 33, process: 41, business: 26 }`, matching PMI's PMP Examination Content Outline (ECO), July 2026 edition (previously 42/50/8, an older ECO's ratios). Affects the start-screen defaults, Date-based study-plan mode, and Smart mode's 65/35 boost split.
- Added `DOMAIN_TASKS`, PMI's current per-domain task titles, and wired them into `loadNextQuestion()`'s system prompt so generated questions are grounded in the actual current ECO task list per domain, not just the domain label. See *Domain and question-type selection*.
- Updated start-screen domain-card blurbs (`index.html`) to reflect the current ECO's task emphasis (e.g., sustainability and broadened compliance scope now called out under Business Environment).
- Added a PMP certification eligibility summary to the User Guide (informational only — this app has no eligibility-checking feature).

### v1.7
- Fixed: a verbose AI-generated matching-question definition could stretch the closed `<select>` box wider than its table column (browsers auto-size selects to their widest option), pushing the whole page into horizontal overflow. `renderMatching()` now truncates `<option>` labels to 70 chars with an ellipsis — lossless, since the untruncated text still appears in the Definitions list below the table — and `.match-table select` gets a `max-width: 100%` backstop.

### v1.6
- Added a **study plan generator**: a new `#planScreen` where entering a target test date produces a recommended practice schedule (`generateStudyPlan()`), taper-banded by days remaining, always ending in a light-review day, never scheduling a new mock inside the final 2 days. See *Study plan generator*.
- Added a **Smart mode** toggle that biases early sessions toward the user's weakest-scoring domain using existing test history (`findWeakestDomain()`), alongside a **Date-based** mode that always uses the standard 42/50/8 mix.
- Added **deep-linking**: each planned session's "Open this session" link and calendar event encode that session's config via URL query params, applied on load by `applyDeepLinkParams()` and never persisted.
- Added **`.ics` calendar export** (`buildIcsCalendar()`/`downloadIcs()`) — pure client-side iCalendar generation, no calendar API/OAuth, consistent with the app's static no-backend design.

### v1.5
- Changed API key persistence from immediate (saved on every keystroke) to **ask-before-save**: `startExam()` now prompts via `confirm()` before writing a new or changed key to `localStorage`, and proceeds with the in-memory key either way. See *Ask-before-save for API keys*.
- Added a `#savedKeyNote` indicator next to the API key field showing when the currently-entered key matches one already saved in this browser.
- Fixed a pause/resume gap this introduced: `saveActiveSession()`/`resumeExam()` now carry `apiKey` directly in the session snapshot, since a declined (unsaved) key would otherwise be lost from `state` on resume (`selectProvider()` previously always re-pulled it from `providerConfig`).

### v1.4
- Added **pause/resume**: a Pause button (`#pauseBtn`) on the exam screen snapshots the in-progress session to `localStorage` (`pmpsim.activeSession`) and returns to the start screen; a "paused exam in progress" banner there offers Resume or Discard. Starting a new exam is blocked while a paused session exists. See *Session persistence: pause/resume and test history*.
- Added **test history**: every concluded exam (regardless of how it ended) is recorded to `pmpsim.testHistory`, capped at the most recent `MAX_HISTORY = 30` sessions. A new `#historyScreen` (View Test History button on the start screen) lists past sessions with score/domain breakdown and an expandable answer review per entry; Clear History is confirm-gated.
- Refactored answer-review rendering into a shared `renderAnswerReview(container, answers)` function, used by both the live post-exam review and the test-history screen's per-entry review.
- Checkpoint design deliberately saves only while the current question is unanswered (Pause is hidden between Submit and Next), preventing a resume-time double-counted answer at the cost of losing at most one in-flight answer in that narrow window.

### v1.3
- Added multi-provider support: Google Gemini and Groq alongside Anthropic, via a `PROVIDERS` adapter registry (`buildRequest`/`parseText`/`listModels` per provider) — see *Provider abstraction*.
- Added live model-list fetching (`listModels()`) for Gemini/Groq with a curated-label overlay and hardcoded fallback; Anthropic keeps its hand-maintained list (no drift risk there, and existing labels carry cost info a generic listing wouldn't).
- Added generic HTTP 429 retry-with-backoff (`fetchGeneration()`) and a start-screen rate-limit warning (`rateLimitNote`) for Gemini + Full(175) sessions — deliberately not a request queue, since Gemini's binding constraint is a daily cap a queue can't get around.
- Changed persistence to per-provider scoping (`providerConfig` keyed by provider id) so switching providers doesn't clobber a different provider's saved key; added a one-time migration from the pre-v1.3 flat `pmpsim.apiKey`/`pmpsim.model` keys.
- Generalized start-screen validation and the Connect-to-provider UI (provider selector, dynamic key-field label/placeholder/help-link, dynamic model buttons) to be provider-driven instead of Anthropic-only.
- Excluded OpenAI and Perplexity: neither has a persistent free tier (one-time trial credit / consumer-app-only respectively), so neither serves this change's actual goal.

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

1. **Ollama / local-model support** — a different shape of problem from the hosted providers above: no key field (replace with a Base URL field, default `http://localhost:11434`), needs the user to set `OLLAMA_ORIGINS` so their local server accepts browser-origin requests, and a potential mixed-content wrinkle if this site is ever served over `https://` while Ollama listens on plain `http://localhost`. Deliberately not built in v1.3 — scoped out to keep that change to hosted free-tier options, which is what was actually asked for.
2. **Server-side prompt caching** — moving the proxy from optional to a first-class caching backend would cut the largest cost driver; static HTML can't persist a cache breakpoint, but a proxy can use each provider's native caching mechanism.
3. **Schema validation** — even simple `typeof`/`Array.isArray` guards on the parsed response before rendering would convert silent rendering failures into Retry-eligible errors.
4. **Optional verified-glossary mode** — a start-screen toggle between "model knowledge" (current, cheap) and an embedded PMBOK excerpt (more tokens, more accurate) for tooltip definitions.
5. **Mid-answer pause** — extending the checkpoint to also cover the "answered but not yet advanced" state (would need to persist `state.answered`/`selectedChoices`/submission UI, and resolve the double-count risk noted in *Session persistence* before relaxing the current invariant).
6. **Study plan personalization beyond weak-domain boosting** — e.g. letting the user override session count/days-per-week directly rather than only picking a date, or factoring in per-topic (not just per-domain) weak spots once `topic` data is tracked at that granularity.
