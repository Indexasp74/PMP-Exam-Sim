# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, shareable PMP exam simulator meant to be cloned and run from GitHub. It generates practice questions via Anthropic's Claude API. There is no build step, no package manager, and no test suite — to run it, open `index.html` in a browser (or serve the folder with any static server). To ship a change, edit the source and reload.

## Files

- `index.html` — markup for the three screens; links `styles.css` and `app.js`.
- `styles.css` — all styling; CSS custom properties in `:root` (colors, fonts, domain colors `--people`/`--process`/`--biz`).
- `app.js` — all logic.
- `README.md` / `LICENSE` (MIT) — for GitHub distribution.
- `pmp_exam_sim.html` — the original single-file prototype this was split from. Superseded by the three files above; kept only for reference. Edit the split files, not this.

## Architecture

**Screen state machine** — three mutually exclusive views toggled via `.hidden` / `.show` classes, never separate pages:
- `#startScreen` — config: two `config-card`s (Claude connection, domain mix) plus model/length/approach option buttons.
- `#examScreen` — holds `#loadingWrap`, `#questionWrap`, and `#errorWrap` (also toggled among themselves).
- `#endScreen` — score summary + on-demand answer review.

**Central `state` object** (top of `app.js`) is the single source of truth: credentials, `domainWeights`, current question index, generated `questions`, recorded `answers`, per-domain tallies, timer handle, and `history` (the running API conversation). `startExam()` resets the per-session fields.

**Config persistence:** `loadConfig()` (called at the bottom of `app.js` on load) and `saveConfig()` read/write `localStorage` under the `pmpsim.*` keys (`LS_KEYS`). Persisted: API key, proxy URL, domain mix, model. Start-screen inputs save on every `input` event.

**API access (the key design point):** `loadNextQuestion()` branches on whether a proxy URL is set in state.
- No proxy → POST directly to `ANTHROPIC_URL` with `x-api-key`, `anthropic-version`, and `anthropic-dangerous-direct-browser-access: true` (the header that allows browser-origin calls).
- Proxy set → POST the same body to the proxy URL with **no** key/version headers; the proxy is expected to inject them and return the standard Messages API response shape.

**Question lifecycle:** `loadNextQuestion()` builds a system prompt → fetch → strip accidental markdown fences → `JSON.parse` → `renderQuestion()`. The submit handler grades (branching on `q.type`), records into `state.answers`, and reveals the rationale. `nextBtn` advances or calls `endExam()`.

**Three question types**, weighted ~60/25/15 in `loadNextQuestion`: `multiple_choice`, `multiple_response` (both via `renderChoices`), and `matching` (via `renderMatching`). The model is instructed to return *only* JSON in one of two inline-defined shapes; `q.domain` is re-stamped after parsing to enforce the intended domain.

**Domain weighting** is user-configurable via `state.domainWeights` (default People 42 / Process 50 / Business 8). `pickDomain()` normalizes by the live total (weights need not sum to 100). The same weights drive `endExam()`'s padding of unreached questions as incorrect, so the final percentage reflects the full session length. `refreshMixDisplay()` keeps the on-card percentages in sync.

**Glossary tooltips:** the model returns `glossaryTerms`; `buildGlossaryHtml` wraps the first verbatim occurrence of each term (longest-first, case-insensitive) with a hover/tap tooltip wired by `wireGlossaryTooltips`.

## Documentation maintenance

`docs/USER_GUIDE.md` and `docs/DEVELOPER_GUIDE.md` are living docs derived from the original `.docx` guides. **Whenever app files change, update the relevant guide(s) in the same change** — feature/UX changes go in the User Guide; architecture, state, API, or scoring changes go in the Developer Guide. Bump the Developer Guide version and add a changelog entry for anything user- or developer-visible. The `.docx` originals are superseded; the Markdown files are the source of truth.

## Conventions

- All user/model-supplied text is escaped via `escHtml` before insertion into the DOM — preserve this for any new rendered field.
- Use the existing CSS custom properties for colors/spacing; don't hardcode values.
- Model IDs are literal strings in `#modelOptions` (`index.html`). Keep them in sync with current Anthropic model IDs.
- Never hardcode an API key into any file — credentials come only from the user via the config screen / localStorage.
