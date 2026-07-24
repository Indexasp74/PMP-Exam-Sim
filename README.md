# PMP Exam Simulator

A free, open-source practice exam for the **Project Management Professional (PMP)®** certification. Questions are generated on the fly by an AI model of your choice — situational, scenario-based, and aligned to the current PMI Exam Content Outline across the three domains: **People (42%)**, **Process (50%)**, and **Business Environment (8%)**.

No accounts, no servers, no tracking. It's a static web app: you bring your own API key for whichever provider you pick, and questions are generated directly in your browser.

## Features

- **AI-generated questions** — never the same exam twice. Multiple choice, multiple response ("select all that apply"), and matching formats.
- **Choice of AI provider** — Anthropic Claude (paid, highest quality), Google Gemini, or Groq (both have free tiers — see caveats below).
- **Realistic domain mix** — defaults to the real PMP weighting; fully adjustable.
- **Approach focus** — practice Predictive, Agile/Scrum, Hybrid, or a mix.
- **Exam timer** and live per-domain scoring.
- **Instant rationale** after each answer, plus a full answer review at the end.
- **Glossary tooltips** — PMP/PMBOK terms in each scenario are defined inline on hover/tap.
- **Pause & resume** — stop mid-session and pick up exactly where you left off, even after closing the browser.
- **Test history** — every completed session is saved locally with its score and domain breakdown, reviewable anytime.
- **Study plan generator** — enter your test date and get a recommended practice schedule (tapering toward full-length mocks), downloadable as a `.ics` calendar with links straight back into the sim.
- **Bring your own key** — your API key is sent directly to the provider you pick, never anywhere else. You choose whether to save it in your browser's `localStorage` for next time, or use it for one session only. Or point it at your own proxy.

## Quick start

1. **Clone or download** this repo:
   ```bash
   git clone https://github.com/<your-username>/PMP-Exam-Sim.git
   cd PMP-Exam-Sim
   ```
2. **Open `index.html` in a browser.** That's it — no build step, no install. (Double-click the file, or serve the folder with any static server, e.g. `python3 -m http.server`.)
3. **Pick a provider and get a key** (see the comparison table below), and paste it into the API key field on the start screen.
4. Pick your session length, model, and domain mix, then **Start Exam**.

## Choosing a provider

| | Anthropic Claude | Google Gemini | Groq |
| --- | --- | --- | --- |
| **Cost** | Paid — see [pricing](https://www.anthropic.com/pricing) | Free tier, then paid | Free tier, then paid |
| **Quality** | Highest | Good | Good (open-weight models) |
| **Free-tier capacity** | N/A | **Limited** — daily request caps (roughly 100–250/day depending on model) mean a Full (175-question) session can use most or all of a day's quota in one sitting. Fine for 10–40 question sessions. | Generally roomier than Gemini's free tier, but still rate-limited — check [Groq's current limits](https://console.groq.com/docs/rate-limits) before a long session. |
| **Get a key** | [console.anthropic.com](https://console.anthropic.com/settings/keys) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | [console.groq.com/keys](https://console.groq.com/keys) |
| **Privacy note** | Paid API inputs/outputs aren't used for training. | **Free-tier inputs/outputs may be used by Google to improve their models (opt-in by default).** Enabling billing on a Gemini project removes free-tier access for that project entirely — free and paid are mutually exclusive per project. Check [Google's terms](https://ai.google.dev/gemini-api/terms) before using the free tier for anything sensitive. | Standard provider terms apply — check [Groq's terms](https://groq.com/terms-of-use/). |

The app shows a model dropdown per provider, fetched live from each provider's current model list when possible (so it doesn't go stale as providers change their lineups) and falls back to a small hardcoded list if that fetch fails or you haven't entered a key yet. If you pick Gemini and select a Full-length (175) session, the app shows an in-app warning about the daily cap.

**OpenAI and Perplexity aren't included** — neither has a persistent free tier (OpenAI gives a one-time trial credit; Perplexity's free product is the consumer chat app, not the API), so they don't serve the "free to practice with" goal this app is built around.

> **Cost (Anthropic):** Each question is a small request (~1K output tokens). Haiku is roughly 4× cheaper than Sonnet — a 40-question session on Haiku typically costs a few cents.

## Configuration

All settings live on the start screen and persist in your browser between sessions, scoped per provider (switching providers doesn't lose a different provider's saved key):

| Setting | What it does |
| --- | --- |
| **AI provider** | Anthropic, Gemini, or Groq. |
| **API key** | Your key for the selected provider. Required unless you use a proxy. You'll be asked whether to save it locally when you start an exam with a new or changed key. |
| **Proxy URL** | Optional. If set, requests go here instead of directly to the provider, and no key is sent from the browser (see below). |
| **Domain mix** | Adjust how questions are distributed across People / Process / Business Environment. Values are normalized, so they needn't sum to 100. |
| **Session length** | 10, 20, 40, or full (175) questions. |
| **Model** | Varies by provider. |
| **Approach focus** | Predictive, Agile/Scrum, Hybrid, or Mixed. |

## Using a proxy (optional)

The browser-key mode sends your key directly to the selected provider (for
Anthropic, using the `anthropic-dangerous-direct-browser-access` header; Gemini
and Groq both allow direct browser calls natively). That's fine for personal,
local use, but if you want to host this for others **without** exposing a key,
run a small backend that holds the key server-side and forwards requests to
that provider's API.

Point the **Proxy URL** field at your backend's endpoint. When a proxy URL is
set, the app sends the same provider-shaped JSON request body but **omits**
the API key and auth headers — your proxy is responsible for injecting them
and matching the selected provider's request/response shape (see the
[Developer's Guide](docs/DEVELOPER_GUIDE.md) for each provider's exact shape).

## Privacy & security

- Your API key never leaves your browser except in direct requests to your selected provider (or to a proxy you explicitly configure).
- Nothing is sent to the author of this project. There is no analytics, no backend, no database.
- Decline the save prompt and your key isn't written to `localStorage` at all — it's used in memory for that session only. If you do save one, clearing your browser data removes it. Don't save a key on a shared/public computer.
- See the provider comparison table above for Gemini's free-tier data-use terms specifically.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — how to set up and practice with the simulator.
- [Developer's Guide](docs/DEVELOPER_GUIDE.md) — architecture, state model, API integration, and extension points.

## Disclaimer

This is an independent study aid. It is **not** affiliated with, endorsed by, or sponsored by the Project Management Institute (PMI). "PMP", "PMBOK", and "Project Management Professional" are marks of PMI. AI-generated questions are for practice and may contain errors — always cross-check against official PMI materials.

## License

[MIT](LICENSE)
