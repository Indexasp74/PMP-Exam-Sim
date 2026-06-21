# PMP Exam Simulator — User Guide

*How to Practice for the PMP Exam*

## What This Tool Does

The PMP Exam Simulator generates realistic, scenario-based practice questions modeled on the PMI Exam Content Outline (ECO). Each question is created fresh by an AI model (Anthropic's Claude) when you take it — there is no fixed question bank, so no two sessions are exactly alike.

By default it covers all three PMP exam domains in the same proportions as the real exam (you can change this — see *Domain mix* below):

- **People — 42%** (leadership, conflict resolution, team building, stakeholder engagement)
- **Process — 50%** (risk, schedule, scope, quality, procurement, earned value management)
- **Business Environment — 8%** (compliance, benefits realization, organizational change)

It is a study aid, **not** an official PMI product. Questions are AI-generated and are not sourced from PMI's actual exam item bank.

## Getting Started

### Opening the simulator

The simulator is a small set of static files. **Download or clone** the project, keeping the files together (`index.html`, `styles.css`, `app.js`), then open **`index.html`** in any modern browser — Chrome, Edge, Firefox, or Safari. No installation or account is required.

```bash
git clone https://github.com/<your-username>/PMP-Exam-Sim.git
cd PMP-Exam-Sim
# then open index.html in your browser, or serve the folder:
python3 -m http.server
```

> If you open the file from inside a cloud-drive preview pane, it may show only a static page. Download the files first and open your local copy (or serve the folder) for full interactivity.

### Connecting to Claude (one-time setup)

Because questions are generated live, the app needs access to Anthropic's Claude API. You have two options, set on the start screen:

1. **Your own API key (simplest).** Get a key from the [Anthropic Console](https://console.anthropic.com/settings/keys) and paste it into the **Anthropic API key** field. Your key is stored only in your browser and sent directly to Anthropic — never to anyone else.
2. **A proxy URL (for self-hosters).** If you or your team runs a small backend that holds the key, enter its address in the **Proxy URL** field. The app then sends requests there instead, and no key leaves your browser.

Your settings are remembered between visits, so you only enter them once per browser.

> **Cost:** You pay Anthropic directly for usage. Each question is a small request (~1,000 output tokens). Haiku is roughly 4–5× cheaper than Sonnet — a 40-question drill on Haiku typically costs a few cents. See current rates at [anthropic.com/pricing](https://www.anthropic.com/pricing).
>
> **Don't enter your key on a shared or public computer** — it's stored in that browser. Clearing your browser data removes it.

### Starting a session

On the start screen, set up your session:

- **Domain mix** — how questions are split across People / Process / Business Environment. Defaults match the real exam (42 / 50 / 8); adjust the numbers to drill a weak domain. Values are normalized, so they don't have to add up to exactly 100.
- **Session length** — 10, 20, or 40 questions for a quick drill, or **Full (175)** to mirror real exam length and timing.
- **Model** — Sonnet (higher quality, more nuanced scenarios) or Haiku (faster, cheaper). See *Model Choice* below.
- **Approach focus** — Mixed (a realistic blend of predictive, agile, and hybrid), or a single approach to drill one area.

Click **Start Exam** to begin. The first question takes a few seconds to generate. (If you haven't entered a key or proxy URL, the app will prompt you before starting.)

## Taking the Exam

### Question types

Three formats, matching the real exam:

- **Multiple Choice** — four options, select the one best answer.
- **Multiple Response** — five options, select all that apply (usually 2 or 3 correct). A reminder banner appears for this type.
- **Matching** — match terms on the left to definitions on the right using dropdown menus.

### Defined-term tooltips

Some questions include PMP-specific terminology (for example, "earned value" or "critical path"), shown underlined in the question text.

- **On a computer:** hover over the term to see its definition; move away to dismiss.
- **On a phone or tablet:** tap the term once to see it; tap again, or tap elsewhere, to dismiss.

Tooltips appear only in the question text, not in the answer choices.

### Answering and reviewing

Select your answer(s) and click **Submit Answer**. The simulator immediately shows:

- Correct choice(s) highlighted in **green**
- Your incorrect selection(s) in **red**
- Any correct choice you **missed** in light green
- A short **rationale** explaining the answer

Click **Next Question** to continue, or **Skip** to move on without answering (a skip counts as incorrect, same as the real exam).

### Ending early

The **End Exam** button (lower-left of the question screen) stops the session and jumps to your results. Questions you haven't reached are counted as incorrect — exactly as unanswered questions are scored on the real PMP exam.

## Understanding Your Results

### Live scoring

While the exam runs, a panel shows your accuracy by domain (People, Process, Business Environment), updated after each question.

### Timer

A countdown runs top-right. The simulator allocates roughly 2 minutes per question (Full 175-question mode uses the real exam's 230-minute limit). If it reaches zero, the exam ends automatically and remaining questions score as incorrect.

### Final score screen

When the exam ends (all questions done, End Exam, or timeout), you'll see:

- Your **overall percentage**, based on the full session length you chose — not just the questions you answered
- A **proficiency rating**: Above Target, Meeting Target, Below Target, or Needs Improvement
- A **per-domain breakdown**

Click **Review Answers** to see every question, your answer, the correct answer, and the rationale — useful for spotting weak areas before your next session.

## Model Choice: Sonnet vs. Haiku

A quality-versus-cost tradeoff:

| | **Sonnet 4.6** | **Haiku 4.5** |
| --- | --- | --- |
| **Question quality** | Higher — more nuanced, realistic | Good — simpler, less nuance |
| **Speed** | Slightly slower per question | Faster |
| **Relative cost** | Baseline | ~4–5× cheaper per question |
| **Best for** | Final exam prep, realistic practice | Quick drills, high volume |

If unsure, start with Sonnet for your first few sessions to calibrate against real difficulty, then switch to Haiku for high-volume repetition.

## Privacy

- Your API key is stored only in your browser (`localStorage`) and sent only to Anthropic (or to a proxy you explicitly configure).
- There is no analytics, no backend, and no database in this app — nothing is sent to the project's author.
- Clearing your browser data removes your saved key and settings.

## Known Limitations

- **Hotspot and drag-and-drop** question types from the real exam are not supported — only multiple choice, multiple response, and matching.
- Questions are **AI-generated** from the ECO and PMBOK Guide, not drawn from PMI's actual item bank. Treat this as supplemental practice, not a score predictor.
- An **internet connection** is required, since each question is generated live.
- **Definition tooltips** are AI-generated at question time and may occasionally differ from official PMBOK wording.
- **Usage costs money** — you pay Anthropic for API calls (see *Cost* above).

## Tips for Best Results

- Run full-length (175-question) sessions periodically to build stamina and get an honest proficiency read.
- Use shorter 10–20 question sessions to drill a single approach or a single domain (via the domain mix) after a weak result.
- Review every rationale, even on questions you got right — the reasoning is often more valuable than the score.
- Don't treat one session's percentage as a precise predictor; watch the trend across sessions.

## Disclaimer

This is an independent study aid, not affiliated with or endorsed by the Project Management Institute (PMI). "PMP", "PMBOK", and "Project Management Professional" are marks of PMI.
