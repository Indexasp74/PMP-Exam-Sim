// ── Constants ────────────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const LS_KEYS = {
  apiKey: 'pmpsim.apiKey',
  proxyUrl: 'pmpsim.proxyUrl',
  mix: 'pmpsim.domainMix',
  model: 'pmpsim.model',
};
const DEFAULT_MIX = { people: 42, process: 50, business: 8 };

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  sessionLen: 10,
  approach: 'mixed',
  model: 'claude-sonnet-4-6',
  apiKey: '',
  proxyUrl: '',
  domainWeights: { ...DEFAULT_MIX },
  qIndex: 0,
  questions: [],    // generated question objects
  answers: [],      // { correct: bool, domain, userAnswer, correctAnswer, rationale, qText }
  domainCounts: { people: 0, process: 0, business: 0 },
  domainCorrect: { people: 0, process: 0, business: 0 },
  timerInterval: null,
  secondsLeft: 0,
  currentQ: null,
  selectedChoices: new Set(),
  answered: false,
  history: [],      // conversation history for API
};

// ── UI refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Config persistence ───────────────────────────────────────────────────────
function loadConfig() {
  try {
    const key = localStorage.getItem(LS_KEYS.apiKey);
    const proxy = localStorage.getItem(LS_KEYS.proxyUrl);
    const mixRaw = localStorage.getItem(LS_KEYS.mix);
    const model = localStorage.getItem(LS_KEYS.model);
    if (key) { state.apiKey = key; $('apiKeyInput').value = key; }
    if (proxy) { state.proxyUrl = proxy; $('proxyUrlInput').value = proxy; }
    if (mixRaw) {
      const mix = JSON.parse(mixRaw);
      if (mix && typeof mix === 'object') {
        state.domainWeights = { ...DEFAULT_MIX, ...mix };
        $('mixPeople').value = state.domainWeights.people;
        $('mixProcess').value = state.domainWeights.process;
        $('mixBusiness').value = state.domainWeights.business;
      }
    }
    if (model) {
      state.model = model;
      [...$('modelOptions').querySelectorAll('.opt-btn')].forEach(b =>
        b.classList.toggle('active', b.dataset.val === model));
    }
  } catch (_) { /* ignore corrupt storage */ }
  refreshMixDisplay();
}

function saveConfig() {
  try {
    localStorage.setItem(LS_KEYS.apiKey, state.apiKey || '');
    localStorage.setItem(LS_KEYS.proxyUrl, state.proxyUrl || '');
    localStorage.setItem(LS_KEYS.mix, JSON.stringify(state.domainWeights));
    localStorage.setItem(LS_KEYS.model, state.model);
  } catch (_) { /* storage may be unavailable (private mode) */ }
}

// Read domain-mix inputs into state, update the labels under each domain card.
function refreshMixDisplay() {
  const w = state.domainWeights;
  const total = w.people + w.process + w.business;
  const totalEl = $('mixTotal');
  totalEl.textContent = `Total: ${total}` + (total === 100 ? '' : ' (normalized)');
  totalEl.classList.toggle('bad', total <= 0);

  const pct = d => total > 0 ? Math.round((w[d] / total) * 100) : 0;
  $('sd-people').textContent = pct('people') + '%';
  $('sd-process').textContent = pct('process') + '%';
  $('sd-business').textContent = pct('business') + '%';
}

// ── Domain selection ─────────────────────────────────────────────────────────
function pickDomain() {
  const w = state.domainWeights;
  const total = w.people + w.process + w.business;
  if (total <= 0) return 'process';
  const r = Math.random() * total;
  let cum = 0;
  for (const d of ['people', 'process', 'business']) {
    cum += w[d];
    if (r < cum) return d;
  }
  return 'process';
}

// ── Start screen wiring ──────────────────────────────────────────────────────
['lengthOptions','approachOptions','modelOptions'].forEach(groupId => {
  $(groupId).addEventListener('click', e => {
    if (!e.target.classList.contains('opt-btn')) return;
    [...e.target.parentElement.querySelectorAll('.opt-btn')].forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    if (groupId === 'lengthOptions') state.sessionLen = parseInt(e.target.dataset.val);
    else if (groupId === 'modelOptions') { state.model = e.target.dataset.val; saveConfig(); }
    else state.approach = e.target.dataset.val;
  });
});

$('apiKeyInput').addEventListener('input', e => { state.apiKey = e.target.value.trim(); saveConfig(); });
$('proxyUrlInput').addEventListener('input', e => { state.proxyUrl = e.target.value.trim(); saveConfig(); });

['mixPeople','mixProcess','mixBusiness'].forEach(id => {
  $(id).addEventListener('input', () => {
    const v = id === 'mixPeople' ? 'people' : id === 'mixProcess' ? 'process' : 'business';
    const n = Math.max(0, parseInt($(id).value, 10) || 0);
    state.domainWeights[v] = n;
    refreshMixDisplay();
    saveConfig();
  });
});

$('startBtn').addEventListener('click', startExam);

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimer() {
  // 230 min for full; proportional otherwise, min 20 min
  const fullTime = state.sessionLen === 175 ? 230 * 60
    : Math.max(state.sessionLen * 120, 20 * 60); // 2 min/question, accounts for API latency
  state.secondsLeft = fullTime;
  renderTimer();
  state.timerInterval = setInterval(() => {
    state.secondsLeft--;
    renderTimer();
    if (state.secondsLeft <= 0) endExam();
  }, 1000);
}

function renderTimer() {
  const m = Math.floor(state.secondsLeft / 60);
  const s = state.secondsLeft % 60;
  const el = $('timer');
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className = 'timer-wrap';
  if (state.secondsLeft < 300) el.classList.add('danger');
  else if (state.secondsLeft < 600) el.classList.add('warn');
}

// ── Start exam ─────────────────────────────────────────────────────────────
function startExam() {
  // Validate credentials before starting
  if (!state.proxyUrl && !state.apiKey) {
    showStartError('Enter your Anthropic API key (or a proxy URL) above to begin.');
    return;
  }
  if (state.domainWeights.people + state.domainWeights.process + state.domainWeights.business <= 0) {
    showStartError('Set at least one domain weight above zero.');
    return;
  }
  hideStartError();

  state.qIndex = 0;
  state.questions = [];
  state.answers = [];
  state.domainCounts = { people: 0, process: 0, business: 0 };
  state.domainCorrect = { people: 0, process: 0, business: 0 };
  state.history = [];

  $('startScreen').classList.add('hidden');
  $('examScreen').classList.remove('hidden');
  startTimer();
  loadNextQuestion();
}

function showStartError(msg) { const el = $('startError'); el.textContent = msg; el.classList.remove('hidden'); }
function hideStartError() { $('startError').classList.add('hidden'); }

// ── Fetch question from API ────────────────────────────────────────────────
async function loadNextQuestion() {
  showLoading('Generating question...');
  hideError();

  const domain = pickDomain();
  state.currentDomain = domain;

  // Pick question type weighted (60% MC, 25% multi-response, 15% matching)
  const typeRoll = Math.random();
  const qType = typeRoll < 0.6 ? 'multiple_choice'
    : typeRoll < 0.85 ? 'multiple_response'
    : 'matching';

  const domainLabel = domain === 'people' ? 'People'
    : domain === 'process' ? 'Process'
    : 'Business Environment';

  const approachNote = state.approach === 'mixed'
    ? 'The question may involve any of: predictive (waterfall), agile (Scrum/Kanban), or hybrid approaches. Choose randomly but realistically.'
    : `The scenario should be set in a ${state.approach} project context.`;

  const typeInstructions = qType === 'multiple_choice'
    ? `Type: Multiple Choice. Provide exactly 4 options labeled A, B, C, D. Exactly one is correct.`
    : qType === 'multiple_response'
    ? `Type: Multiple Response. Provide exactly 5 options labeled A, B, C, D, E. Exactly 2 or 3 are correct.`
    : `Type: Matching. Provide exactly 4 terms on the left (labeled 1, 2, 3, 4) and 4 definitions on the right (labeled A, B, C, D). Each left item matches exactly one right item.`;

  const usedTopics = state.answers.map(a => a.topic).filter(Boolean).join(', ');

  const systemPrompt = `You are a PMP exam question generator. Generate realistic, scenario-based PMP exam questions aligned with the PMI Exam Content Outline (ECO) current edition. Questions must be:
- Situational (not purely definitional)
- Aligned to the ${domainLabel} domain
- At professional difficulty (like the real exam)
- Avoiding trivial or trick questions
- Testing judgment and application, not memorization
${approachNote}

${usedTopics ? `Avoid repeating these topics already covered: ${usedTopics}` : ''}

${typeInstructions}

GLOSSARY TERMS: Identify any PMP/PMBOK-specific defined terms used in the "scenario" text only (not in options/answers). For each such term, provide a concise 1-sentence definition consistent with PMBOK terminology. Only flag terms that have a specific PMI/PMBOK technical meaning (e.g. "earned value", "scope creep", "risk register", "sprint", "stakeholder", "critical path") — do not flag common English words. Include the exact substring as it appears in the scenario text so it can be matched verbatim.

CRITICAL: Respond ONLY with valid JSON. No preamble, no markdown, no explanation outside the JSON.

For multiple_choice and multiple_response, return:
{
  "type": "multiple_choice" | "multiple_response",
  "domain": "${domain}",
  "topic": "short topic label e.g. Conflict Resolution",
  "scenario": "The full question text (2-4 sentences, realistic scenario)",
  "glossaryTerms": [{"term": "exact substring as it appears in scenario", "definition": "concise 1-sentence definition"}],
  "options": [
    {"key": "A", "text": "..."},
    {"key": "B", "text": "..."},
    {"key": "C", "text": "..."},
    {"key": "D", "text": "..."}
  ],
  "correct": ["A"] for single or ["A","C"] for multiple,
  "rationale": "2-3 sentence explanation of why the correct answer(s) are right and why distractors are wrong"
}

For matching, return:
{
  "type": "matching",
  "domain": "${domain}",
  "topic": "short topic label",
  "scenario": "Match each item on the left with the correct definition on the right.",
  "glossaryTerms": [{"term": "exact substring as it appears in scenario", "definition": "concise 1-sentence definition"}],
  "left": [{"key":"1","text":"..."},{"key":"2","text":"..."},{"key":"3","text":"..."},{"key":"4","text":"..."}],
  "right": [{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],
  "correct": {"1":"B","2":"D","3":"A","4":"C"},
  "rationale": "Brief explanation of each match"
}`;

  const userMsg = `Generate question ${state.qIndex + 1} of ${state.sessionLen} for the ${domainLabel} domain.`;

  // Build conversation: use history for context continuity (keep last 4 turns to avoid bloat)
  const messages = [
    ...state.history.slice(-4),
    { role: 'user', content: userMsg }
  ];

  try {
    // Use the proxy if configured; otherwise call Anthropic directly with the user's key.
    const useProxy = !!state.proxyUrl;
    const url = useProxy ? state.proxyUrl : ANTHROPIC_URL;
    const headers = { 'Content-Type': 'application/json' };
    if (!useProxy) {
      headers['x-api-key'] = state.apiKey;
      headers['anthropic-version'] = ANTHROPIC_VERSION;
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: state.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text || '';

    // Update history
    state.history.push({ role: 'user', content: userMsg });
    state.history.push({ role: 'assistant', content: raw });

    // Parse JSON (strip any accidental fences)
    const clean = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    const q = JSON.parse(clean);
    q.domain = domain; // enforce correct domain
    state.currentQ = q;
    state.selectedChoices = new Set();
    state.answered = false;

    hideLoading();
    renderQuestion(q);

  } catch(err) {
    hideLoading();
    showError(`Failed to generate question: ${err.message}`);
  }
}

// ── Render question ────────────────────────────────────────────────────────
function renderQuestion(q) {
  $('questionWrap').classList.remove('hidden');

  // Domain badge
  const badge = $('domainBadge');
  badge.className = `domain-badge ${q.domain === 'people' ? 'people' : q.domain === 'process' ? 'process' : 'business'}`;
  badge.textContent = `● ${q.domain === 'people' ? 'People' : q.domain === 'process' ? 'Process' : 'Business Environment'}`;

  const typeLabels = { multiple_choice: 'Multiple Choice', multiple_response: 'Multiple Response — Select All That Apply', matching: 'Matching' };
  $('qTypeLabel').textContent = typeLabels[q.type] || q.type;
  $('qNumber').textContent = `Q${state.qIndex + 1} of ${state.sessionLen}`;
  $('qText').innerHTML = buildGlossaryHtml(q.scenario, q.glossaryTerms);
  wireGlossaryTooltips($('qText'));

  $('multiHint').classList.toggle('hidden', q.type !== 'multiple_response');

  // Rationale
  $('rationale').classList.remove('show');
  $('rationaleText').textContent = '';

  const wrap = $('choicesWrap');
  wrap.innerHTML = '';

  if (q.type === 'matching') {
    renderMatching(q, wrap);
  } else {
    renderChoices(q, wrap);
  }

  // Buttons
  $('submitBtn').classList.remove('hidden');
  $('submitBtn').disabled = true;
  $('nextBtn').classList.add('hidden');
  $('skipBtn').classList.remove('hidden');

  // Progress
  const pct = (state.qIndex / state.sessionLen) * 100;
  $('progressFill').style.width = pct + '%';
  $('progressLabel').textContent = `Question ${state.qIndex + 1} of ${state.sessionLen}`;
  updateScoreDisplay();
}

function renderChoices(q, wrap) {
  q.options.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'choice';
    div.dataset.key = opt.key;
    div.innerHTML = `<span class="choice-key">${opt.key}</span><span class="choice-text">${escHtml(opt.text)}</span>`;
    div.addEventListener('click', () => {
      if (state.answered) return;
      if (q.type === 'multiple_choice') {
        wrap.querySelectorAll('.choice').forEach(c => c.classList.remove('selected'));
        state.selectedChoices.clear();
        div.classList.add('selected');
        state.selectedChoices.add(opt.key);
      } else {
        if (div.classList.contains('selected')) {
          div.classList.remove('selected');
          state.selectedChoices.delete(opt.key);
        } else {
          div.classList.add('selected');
          state.selectedChoices.add(opt.key);
        }
      }
      $('submitBtn').disabled = state.selectedChoices.size === 0;
    });
    wrap.appendChild(div);
  });
}

function renderMatching(q, wrap) {
  const table = document.createElement('table');
  table.className = 'match-table';
  table.innerHTML = `<thead><tr><th>#</th><th>Term / Concept</th><th>Match</th></tr></thead>`;
  const tbody = document.createElement('tbody');

  // Build options for selects
  const rightOpts = q.right.map(r => `<option value="${r.key}">${r.key}. ${escHtml(r.text)}</option>`).join('');

  q.left.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:var(--mono);font-size:12px;color:var(--text-muted)">${item.key}</td>
      <td>${escHtml(item.text)}</td>
      <td><select data-leftkey="${item.key}">
        <option value="">— select —</option>
        ${rightOpts}
      </select></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  // Definition reference
  const refDiv = document.createElement('div');
  refDiv.style.cssText = 'margin-top:14px;font-size:12px;color:var(--text-muted);line-height:1.8;font-family:var(--mono);';
  refDiv.innerHTML = '<div style="margin-bottom:4px;text-transform:uppercase;letter-spacing:0.06em;font-size:10px;">Definitions</div>'
    + q.right.map(r => `<div>${r.key}. ${escHtml(r.text)}</div>`).join('');
  wrap.appendChild(refDiv);

  table.addEventListener('change', () => {
    const selects = table.querySelectorAll('select');
    const allFilled = [...selects].every(s => s.value !== '');
    $('submitBtn').disabled = !allFilled;
  });
}

// ── Submit answer ──────────────────────────────────────────────────────────
$('submitBtn').addEventListener('click', () => {
  if (state.answered) return;
  state.answered = true;
  const q = state.currentQ;

  let isCorrect = false;
  let userAnswer = '';
  let correctAnswer = '';

  if (q.type === 'matching') {
    const selects = document.querySelectorAll('#choicesWrap select');
    let allRight = true;
    selects.forEach(s => {
      const lk = s.dataset.leftkey;
      const expected = q.correct[lk];
      if (s.value === expected) {
        s.classList.add('correct-sel');
      } else {
        s.classList.add('incorrect-sel');
        allRight = false;
      }
      s.disabled = true;
    });
    isCorrect = allRight;
    userAnswer = [...selects].map(s => `${s.dataset.leftkey}→${s.value}`).join(', ');
    correctAnswer = Object.entries(q.correct).map(([k,v]) => `${k}→${v}`).join(', ');
  } else {
    const chosen = [...state.selectedChoices].sort();
    const correct = [...q.correct].sort();
    isCorrect = JSON.stringify(chosen) === JSON.stringify(correct);
    userAnswer = chosen.join(', ');
    correctAnswer = correct.join(', ');

    document.querySelectorAll('#choicesWrap .choice').forEach(c => {
      c.classList.add('disabled');
      const k = c.dataset.key;
      if (q.correct.includes(k) && chosen.includes(k)) c.classList.add('correct');
      else if (!q.correct.includes(k) && chosen.includes(k)) c.classList.add('incorrect');
      else if (q.correct.includes(k) && !chosen.includes(k)) c.classList.add('missed');
    });
  }

  // Track scores
  state.domainCounts[q.domain]++;
  if (isCorrect) state.domainCorrect[q.domain]++;

  state.answers.push({
    correct: isCorrect,
    domain: q.domain,
    topic: q.topic,
    userAnswer,
    correctAnswer,
    rationale: q.rationale,
    qText: q.scenario,
    qType: q.type,
  });

  // Show rationale
  $('rationaleText').textContent = q.rationale;
  $('rationale').classList.add('show');

  $('submitBtn').classList.add('hidden');
  $('skipBtn').classList.add('hidden');
  $('nextBtn').classList.remove('hidden');

  updateScoreDisplay();

  // Auto-advance if last question
  if (state.qIndex + 1 >= state.sessionLen) {
    $('nextBtn').textContent = 'View Results →';
  }
});

// ── Next question ──────────────────────────────────────────────────────────
$('nextBtn').addEventListener('click', () => {
  state.qIndex++;
  if (state.qIndex >= state.sessionLen) {
    endExam();
  } else {
    $('questionWrap').classList.add('hidden');
    loadNextQuestion();
  }
});

// ── Skip ───────────────────────────────────────────────────────────────────
$('skipBtn').addEventListener('click', () => {
  // Count as unanswered / incorrect
  const q = state.currentQ;
  state.answers.push({
    correct: false,
    domain: q.domain,
    topic: q.topic,
    userAnswer: '(skipped)',
    correctAnswer: Array.isArray(q.correct) ? q.correct.join(', ') : JSON.stringify(q.correct),
    rationale: q.rationale,
    qText: q.scenario,
    qType: q.type,
    skipped: true,
  });
  state.domainCounts[q.domain]++;
  state.qIndex++;
  $('questionWrap').classList.add('hidden');
  if (state.qIndex >= state.sessionLen) {
    endExam();
  } else {
    loadNextQuestion();
  }
});

// ── End exam ───────────────────────────────────────────────────────────────
['endBtn','endBtn2'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', endExam);
});

function endExam() {
  clearInterval(state.timerInterval);

  // Pad unsubmitted current question (generated but not answered)
  if (state.currentQ && !state.answered) {
    const q = state.currentQ;
    state.answers.push({
      correct: false,
      domain: q.domain,
      topic: q.topic,
      userAnswer: '(not submitted — time expired)',
      correctAnswer: Array.isArray(q.correct) ? q.correct.join(', ') : JSON.stringify(q.correct),
      rationale: q.rationale,
      qText: q.scenario,
      qType: q.type,
      notSubmitted: true,
    });
    state.domainCounts[q.domain]++;
  }

  // Pad unreached questions as incorrect, distributed by the configured domain weights
  const reached = state.answers.length;
  const remaining = state.sessionLen - reached;
  if (remaining > 0) {
    const w = state.domainWeights;
    const total = w.people + w.process + w.business || 1;
    const assigned = { people: 0, process: 0, business: 0 };
    let placed = 0;
    ['people','process','business'].forEach(d => {
      assigned[d] = Math.floor(remaining * w[d] / total);
      placed += assigned[d];
    });
    // Fill rounding gap with the highest-weight domain
    const top = ['people','process','business'].reduce((a, b) => w[a] >= w[b] ? a : b);
    assigned[top] += (remaining - placed);

    ['people','process','business'].forEach(d => {
      for (let i = 0; i < assigned[d]; i++) {
        state.answers.push({
          correct: false,
          domain: d,
          topic: null,
          userAnswer: '(not reached)',
          correctAnswer: '—',
          rationale: '',
          qText: '(Question not reached before time expired)',
          qType: null,
          notReached: true,
        });
        state.domainCounts[d]++;
      }
    });
  }

  $('examScreen').classList.add('hidden');
  showEndScreen();
}

function showEndScreen() {
  $('endScreen').classList.add('show');

  const total = state.sessionLen;
  const totalCorrect = state.answers.filter(a => a.correct).length;
  const pct = Math.round((totalCorrect / total) * 100);

  // Rating logic (approximate PMP proficiency)
  let rating, ratingClass;
  if (pct >= 75) { rating = 'Above Target'; ratingClass = 'rating-above'; }
  else if (pct >= 61) { rating = 'Meeting Target'; ratingClass = 'rating-meeting'; }
  else if (pct >= 45) { rating = 'Below Target'; ratingClass = 'rating-below'; }
  else { rating = 'Needs Improvement'; ratingClass = 'rating-needs'; }

  $('endTitle').textContent = `Exam Complete — ${pct}%`;
  const ratingEl = $('endRating');
  ratingEl.textContent = rating;
  ratingEl.className = `end-rating ${ratingClass}`;

  $('end-total').textContent = pct + '%';
  $('end-total-sub').textContent = `${totalCorrect} of ${total} correct`;

  ['people','process','business'].forEach(d => {
    const c = state.domainCorrect[d];
    const t = state.domainCounts[d];
    const p = t > 0 ? Math.round((c / t) * 100) : 0;
    const id = d === 'business' ? 'biz' : d;
    $(`end-${id}`).textContent = t > 0 ? p + '%' : '—';
    $(`end-${id}-sub`).textContent = t > 0 ? `${c} of ${t} correct` : 'not tested';
  });
}

$('restartBtn').addEventListener('click', () => {
  $('endScreen').classList.remove('show');
  $('reviewSection').classList.add('hidden');
  $('reviewSection').innerHTML = '';
  $('reviewBtn').classList.remove('hidden');
  $('startScreen').classList.remove('hidden');
  $('timer').textContent = '—:——';
});

$('reviewBtn').addEventListener('click', () => {
  const section = $('reviewSection');
  section.classList.remove('hidden');
  section.innerHTML = '<div style="font-size:13px;color:var(--text-muted);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px;">Answer Review</div>';

  state.answers.forEach((a, i) => {
    const div = document.createElement('div');
    div.className = 'review-q';
    const domainColor = a.domain === 'people' ? 'var(--people)' : a.domain === 'process' ? 'var(--accent2)' : 'var(--biz)';
    div.innerHTML = `
      <div class="review-q-header">
        <span style="font-family:var(--mono);font-size:12px;color:var(--text-muted)">Q${i+1}</span>
        <span class="review-result-badge ${a.correct ? 'rbadge-correct' : 'rbadge-incorrect'}">${a.correct ? '✓ Correct' : a.notReached ? '— Not reached' : a.notSubmitted ? '— Not submitted' : a.skipped ? '— Skipped' : '✗ Incorrect'}</span>
        <span style="font-size:11px;color:${domainColor};font-family:var(--mono)">${a.domain.toUpperCase()}</span>
        ${a.topic ? `<span style="font-size:11px;color:var(--text-muted)">${escHtml(a.topic)}</span>` : ''}
      </div>
      <div class="review-q-text">${escHtml(a.qText)}</div>
      <div class="review-answers">
        <span class="correct-ans">✓ Correct: ${escHtml(a.correctAnswer)}</span><br>
        <span class="${a.correct ? 'correct-ans' : 'user-ans'}">You: ${escHtml(a.userAnswer)}</span>
      </div>
      <div class="review-rationale">${escHtml(a.rationale || '')}</div>
    `;
    section.appendChild(div);
  });

  $('reviewBtn').classList.add('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
});

// ── Helpers ────────────────────────────────────────────────────────────────
function showLoading(msg) {
  $('loadingWrap').classList.remove('hidden');
  $('loadingMsg').textContent = msg || 'Loading...';
  $('questionWrap').classList.add('hidden');
  $('errorWrap').classList.add('hidden');
}
function hideLoading() { $('loadingWrap').classList.add('hidden'); }
function showError(msg) {
  $('errorWrap').classList.remove('hidden');
  $('errorMsg').textContent = msg;
}
function hideError() { $('errorWrap').classList.add('hidden'); }

$('retryBtn')?.addEventListener('click', () => { hideError(); loadNextQuestion(); });
$('endBtn2')?.addEventListener('click', endExam);

function updateScoreDisplay() {
  ['people','process','business'].forEach(d => {
    const c = state.domainCorrect[d];
    const t = state.domainCounts[d];
    const id = d === 'business' ? 'biz' : d;
    const pct = t > 0 ? Math.round((c/t)*100) + '%' : '—';
    $(`sc-${id}`).textContent = pct;
    $(`sc-${id}-sub`).textContent = `${c} of ${t}`;
  });

  const answered = state.answers.length;
  const correct = state.answers.filter(a => a.correct).length;
  // Score denominator is sessionLen so partial completion shows true picture
  const pct = answered > 0 ? Math.round((correct / state.sessionLen) * 100) : 0;
  $('scoreLabel').textContent = answered > 0
    ? `Score: ${pct}% · ${correct} correct / ${answered} answered / ${state.sessionLen} total`
    : 'Score: —';
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Wrap occurrences of glossary terms in the scenario text with tooltip spans.
// Matching is case-insensitive, longest-term-first to avoid partial overlaps,
// and only wraps the first occurrence of each term to avoid visual clutter.
function buildGlossaryHtml(scenario, glossaryTerms) {
  const text = escHtml(scenario || '');
  if (!Array.isArray(glossaryTerms) || glossaryTerms.length === 0) return text;

  // Dedupe by term (case-insensitive), keep first definition seen
  const seen = new Map();
  glossaryTerms.forEach(g => {
    if (!g || !g.term) return;
    const key = g.term.toLowerCase();
    if (!seen.has(key)) seen.set(key, g);
  });
  const terms = [...seen.values()]
    .filter(g => g.term.trim().length > 1)
    .sort((a, b) => b.term.length - a.term.length); // longest first

  if (terms.length === 0) return text;

  // Build a single regex alternation, longest terms first, word-boundary aware
  const escapedAlts = terms.map(g => g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${escapedAlts.join('|')})\\b`, 'i');

  let result = '';
  let remaining = text;
  let safety = 0;
  const usedKeys = new Set();

  while (safety++ < 50) {
    const m = remaining.match(re);
    if (!m) { result += remaining; break; }
    const matchedText = m[0];
    const key = matchedText.toLowerCase();
    const before = remaining.slice(0, m.index);
    const after = remaining.slice(m.index + matchedText.length);

    if (usedKeys.has(key)) {
      // Already wrapped once; leave subsequent occurrences plain
      result += before + matchedText;
      remaining = after;
      continue;
    }
    usedKeys.add(key);

    const def = terms.find(g => g.term.toLowerCase() === key);
    const defHtml = escHtml(def ? def.definition : '');
    result += before;
    result += `<span class="glossary-term" tabindex="0">${matchedText}<span class="glossary-tooltip"><span class="tip-label">Definition</span>${defHtml}</span></span>`;
    remaining = after;
  }
  return result;
}

// Hover (desktop) + touch (mobile) toggle behavior for glossary tooltips.
function wireGlossaryTooltips(container) {
  const terms = container.querySelectorAll('.glossary-term');

  terms.forEach(termEl => {
    // Desktop hover
    termEl.addEventListener('mouseenter', () => termEl.classList.add('tip-active'));
    termEl.addEventListener('mouseleave', () => termEl.classList.remove('tip-active'));
    termEl.addEventListener('focus', () => termEl.classList.add('tip-active'));
    termEl.addEventListener('blur', () => termEl.classList.remove('tip-active'));

    // Mobile touch: first tap shows, second tap on same term (or tap elsewhere) hides
    termEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = termEl.classList.contains('tip-active');
      terms.forEach(t => t.classList.remove('tip-active'));
      if (!isActive) termEl.classList.add('tip-active');
    });
  });

  // Tap/click away from any term hides all tooltips (once per question render)
  if (!document._glossaryAwayWired) {
    document.addEventListener('click', () => {
      document.querySelectorAll('.glossary-term.tip-active').forEach(t => t.classList.remove('tip-active'));
    });
    document._glossaryAwayWired = true;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadConfig();
