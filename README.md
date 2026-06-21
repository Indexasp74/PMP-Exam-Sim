# PMP Exam Simulator

A free, open-source practice exam for the **Project Management Professional (PMP)®** certification. Questions are generated on the fly by Anthropic's Claude — situational, scenario-based, and aligned to the current PMI Exam Content Outline across the three domains: **People (42%)**, **Process (50%)**, and **Business Environment (8%)**.

No accounts, no servers, no tracking. It's a static web app: you bring your own Claude API key, and questions are generated directly in your browser.

## Features

- **AI-generated questions** — never the same exam twice. Multiple choice, multiple response ("select all that apply"), and matching formats.
- **Realistic domain mix** — defaults to the real PMP weighting; fully adjustable.
- **Approach focus** — practice Predictive, Agile/Scrum, Hybrid, or a mix.
- **Exam timer** and live per-domain scoring.
- **Instant rationale** after each answer, plus a full answer review at the end.
- **Glossary tooltips** — PMP/PMBOK terms in each scenario are defined inline on hover/tap.
- **Bring your own key** — your API key is stored only in your browser's `localStorage` and sent directly to Anthropic. Or point it at your own proxy.

## Quick start

1. **Clone or download** this repo:
   ```bash
   git clone https://github.com/<your-username>/PMP-Exam-Sim.git
   cd PMP-Exam-Sim
   ```
2. **Open `index.html` in a browser.** That's it — no build step, no install. (Double-click the file, or serve the folder with any static server, e.g. `python3 -m http.server`.)
3. **Get an Anthropic API key** from the [Anthropic Console](https://console.anthropic.com/settings/keys) and paste it into the "Anthropic API key" field on the start screen.
4. Pick your session length, model, and domain mix, then **Start Exam**.

> **Cost:** You pay Anthropic directly for API usage. Each question is a small request (~1K output tokens). Haiku is roughly 4× cheaper than Sonnet — a 40-question session on Haiku typically costs a few cents. Check current pricing at [anthropic.com/pricing](https://www.anthropic.com/pricing).

## Configuration

All settings live on the start screen and persist in your browser between sessions:

| Setting | What it does |
| --- | --- |
| **Anthropic API key** | Your key, stored locally. Required unless you use a proxy. |
| **Proxy URL** | Optional. If set, requests go here instead of directly to Anthropic, and no key is sent from the browser (see below). |
| **Domain mix** | Adjust how questions are distributed across People / Process / Business Environment. Values are normalized, so they needn't sum to 100. |
| **Session length** | 10, 20, 40, or full (175) questions. |
| **Model** | Sonnet 4.6 (best quality) or Haiku 4.5 (cheaper). |
| **Approach focus** | Predictive, Agile/Scrum, Hybrid, or Mixed. |

## Using a proxy (optional)

The browser-key mode sends your key directly to Anthropic using the
`anthropic-dangerous-direct-browser-access` header. That's fine for personal,
local use, but if you want to host this for others **without** exposing a key,
run a small backend that holds the key server-side and forwards requests to
`https://api.anthropic.com/v1/messages`.

Point the **Proxy URL** field at your backend's endpoint. When a proxy URL is
set, the app sends the same JSON request body but **omits** the API key and
Anthropic headers — your proxy is responsible for adding
`x-api-key` and `anthropic-version`. The proxy must return Anthropic's standard
Messages API response shape (`{ "content": [{ "text": "..." }] }`).

## Privacy & security

- Your API key never leaves your browser except in direct requests to Anthropic (or to a proxy you explicitly configure).
- Nothing is sent to the author of this project. There is no analytics, no backend, no database.
- Because the key is stored in `localStorage`, don't enter it on a shared/public computer. Clearing your browser data removes it.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — how to set up and practice with the simulator.
- [Developer's Guide](docs/DEVELOPER_GUIDE.md) — architecture, state model, API integration, and extension points.

## Disclaimer

This is an independent study aid. It is **not** affiliated with, endorsed by, or sponsored by the Project Management Institute (PMI). "PMP", "PMBOK", and "Project Management Professional" are marks of PMI. AI-generated questions are for practice and may contain errors — always cross-check against official PMI materials.

## License

[MIT](LICENSE)
