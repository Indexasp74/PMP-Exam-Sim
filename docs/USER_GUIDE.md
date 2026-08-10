# PMP Exam Simulator — User Guide

*How to Practice for the PMP Exam*

## What This Tool Does

The PMP Exam Simulator generates realistic, scenario-based practice questions modeled on the PMI Exam Content Outline (ECO). Each question is created fresh by an AI model — your choice of Anthropic Claude, Google Gemini, or Groq — when you take it. There is no fixed question bank, so no two sessions are exactly alike.

By default it covers all three PMP exam domains in the same proportions as PMI's current Exam Content Outline (ECO), July 2026 edition (you can change this — see *Domain mix* below):

- **People — 33%** (vision, conflict management, team leadership, stakeholder engagement, knowledge transfer, communication)
- **Process — 41%** (integrated planning, scope, value-based delivery, resources, procurement, finance, quality, schedule, project closure)
- **Business Environment — 26%** (governance, compliance, sustainability, change control, risk, continuous improvement, organizational change)

Question generation is also grounded in the specific task list PMI defines for each domain, not just the domain label, so practice questions track the same job-task structure as the real exam.

It is a study aid, **not** an official PMI product. Questions are AI-generated and are not sourced from PMI's actual exam item bank.

## PMP Certification Eligibility

Taking practice exams here doesn't require any credentials, but sitting the real PMP exam does. PMI requires one of the following before you can apply:

| Education | Required project-leading experience (within the last 10 years) |
|---|---|
| Secondary school / high school diploma (or equivalent) | 60 months (5 years) |
| Associate's degree or equivalent post-secondary award | 48 months (4 years) |
| Bachelor's degree (or equivalent) | 36 months (3 years) |
| Bachelor's or postgraduate degree from a PMI GAC-accredited program | 24 months (2 years) |

Experience must be non-overlapping and accrued in the 10 years prior to your application; PMI may audit applications and request documentation of both the education level and the experience. See PMI's official PMP Handbook for the full, current eligibility rules before applying.

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

### Connecting to an AI provider (one-time setup)

Because questions are generated live, the app needs access to an AI model. Pick a provider on the start screen, then connect to it one of two ways:

1. **Your own API key (simplest).** Get a key from your chosen provider's console and paste it into the API key field. It's sent directly to that provider — never to anyone else — and you choose whether to save it in your browser for next time (see *Saving your key* below).
2. **A proxy URL (for self-hosters).** If you or your team runs a small backend that holds the key, enter its address in the **Proxy URL** field. The app then sends requests there instead, and no key leaves your browser.

Settings are remembered per provider between visits, so switching providers doesn't lose a different provider's saved key.

**Saving your key:** typing a key doesn't save it right away. When you click **Start Exam**, if the key is new or changed, you'll be asked whether to save it in this browser for next time — click OK to remember it, or Cancel to use it for this session only (it won't be there next time you open the simulator). If a key for the current provider is already saved and matches what's in the field, a small note appears under the field confirming that.

**Which provider should you pick?**

| Provider | Best for | Where to get a key |
| --- | --- | --- |
| **Anthropic Claude** | Highest-quality scenarios; the only one without free-tier capacity limits — best for Full-length (175-question) sessions. | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Google Gemini** | Free, short-to-medium drills (10–40 questions). Its free tier has a **daily request cap**, so a Full session can burn through most of a day's quota — the app warns you if you pick Gemini + Full. | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Groq** | Free, fast, open-weight models — generally roomier free-tier limits than Gemini, but still capped; check Groq's current limits before a long session. | [console.groq.com/keys](https://console.groq.com/keys) |

> **Cost (Anthropic):** You pay Anthropic directly for usage. Each question is a small request (~1,000 output tokens). Haiku is roughly 4–5× cheaper than Sonnet — a 40-question drill on Haiku typically costs a few cents. See current rates at [anthropic.com/pricing](https://www.anthropic.com/pricing).
>
> **Privacy note (Gemini):** Gemini's free tier may use your inputs/outputs to improve Google's models (opt-in by default) — enabling billing removes free-tier access for that project entirely, so a free Gemini key stays free only as long as you never enable billing on it. If that matters to you, use Anthropic or Groq instead, or check Gemini's terms directly.
>
> **Don't enter your key on a shared or public computer.** Declining the save prompt keeps it out of long-term storage, but note: if you **Pause** that exam, the key is temporarily written to your browser as part of the paused-session snapshot (needed so Resume works), and clears automatically once you finish, end, or discard that exam.

### Starting a session

On the start screen, set up your session:

- **Domain mix** — how questions are split across People / Process / Business Environment. Defaults match the current PMI ECO (33 / 41 / 26); adjust the numbers to drill a weak domain. Values are normalized, so they don't have to add up to exactly 100.
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

### Pausing and resuming

Need to stop mid-session? Click **⏸ Pause** (next to End Exam). This saves your exact progress — question number, score so far, and the current question itself — and returns you to the start screen. Nothing is lost, and your spot is preserved even if you close the browser tab or restart your computer before resuming.

Next time you open the simulator, a **"Paused exam in progress"** banner appears at the top of the start screen showing your progress and when you paused. Click **Resume Exam** to pick up exactly where you left off (the same question, no new one generated), or **Discard** to abandon it and start fresh. You can't start a new exam while a paused one exists — resume or discard it first.

One limitation: Pause is only available while a question is unanswered. If you submit an answer and close the browser before clicking Next, that one answer isn't saved — you'll see the same question again on resume.

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

### Test history

Every completed exam is saved locally so you can track progress over time. From the start screen, click **View Test History** to see a list of past sessions — each showing date, provider/model, overall score, proficiency rating, and a per-domain breakdown. Click **Review Answers** on any entry to see that session's full question-by-question review, same as right after taking it.

History is stored in your browser only (nothing is sent anywhere) and keeps your most recent 30 sessions. Use **Clear History** on the Test History screen to wipe it (you'll be asked to confirm — this can't be undone).

## Planning Your Study Schedule

Click **Plan My Study Schedule** on the start screen, pick your test date, and the simulator builds a recommended practice schedule between now and then:

- **Frequency tapers to your timeline** — daily short drills if your test is close, spacing out to a few sessions a week if it's further out, picking up again in the final weeks.
- **One or more full-length (175-question) mock exams** are scheduled with enough runway before your test — never inside the final 2 days, so you're not cramming on the eve of the exam.
- **The day before your test is always a light, 10-question review** — never a new mock, never a heavy drill.

**Schedule mode:**
- **Smart** — biases earlier practice sessions toward whichever domain you've scored weakest on in your saved test history. If you don't have any history yet, it falls back to the standard mix and tells you so.
- **Date-based only** — always uses the standard People 33% / Process 41% / Business 26% mix, regardless of past scores.

Each session in the plan shows its date, focus, length, and domain mix, plus an **"Open this session →"** link that opens the simulator pre-configured with that session's exact settings — no manual reconfiguring needed.

Click **Download Calendar (.ics)** to save the whole schedule as a calendar file you can import into Google Calendar, Outlook, Apple Calendar, or any app that accepts `.ics` files. Each calendar event includes the session's focus and the same pre-configured link, so you can jump straight into that day's practice from your calendar.

Your plan is remembered until you generate a new one (changing the date or mode and clicking **Generate Plan** again replaces it).

## Model Choice

Within whichever provider you've selected, the Model section lets you pick a specific model — the app fetches each provider's current model list live where it can (falling back to a small default list if that fails), so the exact options you see may shift over time as providers update their lineups. As a rule of thumb, larger/"Pro"-class models are higher quality but slower and more rate-limited; smaller/"Flash"/"Lite"/"Instant"-class models are faster, cheaper (or have roomier free-tier limits), and slightly less nuanced.

If unsure, start with the largest model your provider offers for your first few sessions to calibrate against real difficulty, then switch to a smaller one for high-volume repetition.

## Privacy

- Your API key is sent only to the provider you selected (or to a proxy you explicitly configure) — never anywhere else. Whether it's saved in your browser (`localStorage`, scoped per provider) is your choice, made each time you enter a new or changed key.
- There is no analytics, no backend, and no database in this app — nothing is sent to the project's author.
- Clearing your browser data removes your saved keys, settings, any paused exam, your test history, and your study plan.
- **Gemini specifically:** its free tier may use your inputs/outputs to improve Google's models (opt-in by default), and enabling billing removes free-tier access for that project entirely. See *Connecting to an AI provider* above.

## Known Limitations

- **Hotspot and drag-and-drop** question types from the real exam are not supported — only multiple choice, multiple response, and matching.
- Questions are **AI-generated** from the ECO and PMBOK Guide, not drawn from PMI's actual item bank. Treat this as supplemental practice, not a score predictor.
- An **internet connection** is required, since each question is generated live.
- **Definition tooltips** are AI-generated at question time and may occasionally differ from official PMBOK wording.
- **Usage may cost money**, depending on your provider and tier (see the provider table above).
- **Free-tier rate limits drift** — providers change their free-tier limits and model lineups without notice. If you hit a rate-limit error, wait a bit, switch models, or switch providers.
- **Pause only works between questions** — if you submit an answer and close the browser before clicking Next, that answer isn't saved.
- **Test history is capped at the most recent 30 sessions.**
- **The study plan schedule is a heuristic**, not a personalized study-science recommendation — treat it as a sensible starting structure, not a guarantee.

## Tips for Best Results

- Run full-length (175-question) sessions periodically to build stamina and get an honest proficiency read.
- Use shorter 10–20 question sessions to drill a single approach or a single domain (via the domain mix) after a weak result.
- Review every rationale, even on questions you got right — the reasoning is often more valuable than the score.
- Don't treat one session's percentage as a precise predictor; watch the trend across sessions.

## Disclaimer

This is an independent study aid, not affiliated with or endorsed by the Project Management Institute (PMI). "PMP", "PMBOK", and "Project Management Professional" are marks of PMI.
