// ── Provider registry ───────────────────────────────────────────────────────
// Each provider adapts the same { systemPrompt, messages, model } shape into its own
// request format, and extracts generated text back out of its own response format.
// fallbackModels/listModels: free-tier rate limits and model lineups drift without
// notice (Anthropic doesn't have this problem the same way, so it isn't live-fetched).
// fallbackModels is only a pre-key placeholder; listModels() is authoritative once a
// real key is entered. Re-confirm fallback IDs periodically against provider docs.
const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    tagline: 'Paid · highest quality',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    rateLimitNote: null,
    fallbackModels: [
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — best quality' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — cheaper' },
    ],
    listModels: null, // no live fetch — curated fallback list is used as-is
    buildRequest({ apiKey, proxyUrl, model, systemPrompt, messages }) {
      const useProxy = !!proxyUrl;
      const headers = { 'Content-Type': 'application/json' };
      if (!useProxy) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
      }
      return {
        url: useProxy ? proxyUrl : 'https://api.anthropic.com/v1/messages',
        headers,
        body: { model, max_tokens: 1000, system: systemPrompt, messages },
      };
    },
    parseText(data) { return data.content?.[0]?.text || ''; },
  },

  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    tagline: 'Free tier · rate-limited',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    rateLimitNote: "Gemini's free tier has a daily request cap (Flash: roughly 250/day, Pro: roughly 100/day) — a Full (175) session can use most or all of a day's quota in one sitting. Better suited to shorter sessions; for Full-length practice, consider Anthropic or Groq.",
    fallbackModels: [
      { id: 'gemini-3.5-flash', label: 'Flash — recommended for free tier' },
      { id: 'gemini-3.1-flash-lite', label: 'Flash-Lite — highest free-tier limits' },
    ],
    async listModels({ apiKey }) {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      const curated = {
        'gemini-3.5-flash': 'Flash — recommended for free tier',
        'gemini-3.1-flash-lite': 'Flash-Lite — highest free-tier limits',
      };
      const models = (data.models || [])
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => {
          const id = (m.name || '').replace(/^models\//, '');
          return id ? { id, label: curated[id] || m.displayName || id } : null;
        })
        .filter(Boolean);
      return models.length ? models : null;
    },
    buildRequest({ apiKey, proxyUrl, model, systemPrompt, messages }) {
      const useProxy = !!proxyUrl;
      const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 1000 },
      };
      if (useProxy) return { url: proxyUrl, headers: { 'Content-Type': 'application/json' }, body: { ...body, model } };
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        headers: { 'Content-Type': 'application/json' },
        body,
      };
    },
    parseText(data) { return data.candidates?.[0]?.content?.parts?.[0]?.text || ''; },
  },

  groq: {
    id: 'groq',
    label: 'Groq',
    tagline: 'Free tier · open-weight models · fast',
    keyHelpUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    rateLimitNote: null,
    fallbackModels: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — recommended' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — fastest, highest free limits' },
    ],
    async listModels({ apiKey }) {
      const resp = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!resp.ok) return null;
      const data = await resp.json();
      const curated = {
        'llama-3.3-70b-versatile': 'Llama 3.3 70B — recommended',
        'llama-3.1-8b-instant': 'Llama 3.1 8B — fastest, highest free limits',
      };
      const models = (data.data || [])
        .map(m => m.id)
        .filter(id => id && !/whisper|tts|guard|moderation/i.test(id))
        .map(id => ({ id, label: curated[id] || id }));
      return models.length ? models : null;
    },
    buildRequest({ apiKey, proxyUrl, model, systemPrompt, messages }) {
      const useProxy = !!proxyUrl;
      const headers = { 'Content-Type': 'application/json' };
      if (!useProxy) headers['Authorization'] = `Bearer ${apiKey}`;
      return {
        url: useProxy ? proxyUrl : 'https://api.groq.com/openai/v1/chat/completions',
        headers,
        body: { model, max_tokens: 1000, messages: [{ role: 'system', content: systemPrompt }, ...messages] },
      };
    },
    parseText(data) { return data.choices?.[0]?.message?.content || ''; },
  },
};

// ── Constants ────────────────────────────────────────────────────────────────
const LS_KEYS = {
  provider: 'pmpsim.provider',
  providerConfig: 'pmpsim.providerConfig', // JSON: { anthropic: {apiKey, model}, gemini: {...}, groq: {...} }
  proxyUrl: 'pmpsim.proxyUrl',
  mix: 'pmpsim.domainMix',
  activeSession: 'pmpsim.activeSession', // JSON snapshot of an in-progress (paused) exam
  testHistory: 'pmpsim.testHistory',     // JSON array of concluded exams, most recent first
  studyPlan: 'pmpsim.studyPlan',         // JSON { examDate, mode, sessions } — last generated plan
};
const DEFAULT_MIX = { people: 33, process: 41, business: 26 };
const MAX_HISTORY = 30; // cap so a long run of Full(175) sessions can't blow localStorage's quota

// Task titles per domain, from PMI's PMP Examination Content Outline (July 2026 edition).
// Grounds question generation in the current ECO rather than the model's stale training data.
const DOMAIN_TASKS = {
  people: [
    'Develop a common vision', 'Manage conflicts', 'Lead the project team', 'Engage stakeholders',
    'Align stakeholder expectations', 'Manage stakeholder expectations', 'Help ensure knowledge transfer',
    'Plan and manage communication',
  ],
  process: [
    'Develop an integrated project management plan and plan delivery', 'Develop and manage project scope',
    'Help ensure value-based delivery', 'Plan and manage resources', 'Plan and manage procurement',
    'Plan and manage finance', 'Plan and optimize quality of products/deliverables', 'Plan and manage schedule',
    'Evaluate project status', 'Manage project closure',
  ],
  business: [
    'Define and establish project governance', 'Plan and manage project compliance', 'Manage and control changes',
    'Remove impediments and manage issues', 'Plan and manage risk', 'Continuous improvement',
    'Support organizational change', 'Evaluate external business environment changes',
  ],
};

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  sessionLen: 10,
  approach: 'mixed',
  provider: 'anthropic',
  providerConfig: {}, // per-provider saved { apiKey, model }, loaded from localStorage
  model: 'claude-sonnet-4-6',
  apiKey: '',
  keyDecisionFor: null, // apiKey value the user already made a save/don't-save choice for, this session
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
  let savedProvider = 'anthropic';
  try {
    savedProvider = localStorage.getItem(LS_KEYS.provider) || savedProvider;
    const proxy = localStorage.getItem(LS_KEYS.proxyUrl);
    const mixRaw = localStorage.getItem(LS_KEYS.mix);
    const configRaw = localStorage.getItem(LS_KEYS.providerConfig);

    if (configRaw) {
      try { state.providerConfig = JSON.parse(configRaw) || {}; } catch (_) { state.providerConfig = {}; }
    } else {
      // One-time migration from the pre-v1.3 flat single-provider keys, so a key
      // already saved before this version shipped isn't lost.
      const oldKey = localStorage.getItem('pmpsim.apiKey');
      const oldModel = localStorage.getItem('pmpsim.model');
      if (oldKey || oldModel) {
        state.providerConfig = { anthropic: { apiKey: oldKey || '', model: oldModel || '' } };
      }
    }

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
  } catch (_) { /* ignore corrupt storage */ }

  selectProvider(PROVIDERS[savedProvider] ? savedProvider : 'anthropic', { persist: false });
  refreshMixDisplay();
}

function saveConfig() {
  try {
    localStorage.setItem(LS_KEYS.provider, state.provider);
    localStorage.setItem(LS_KEYS.providerConfig, JSON.stringify(state.providerConfig));
    localStorage.setItem(LS_KEYS.proxyUrl, state.proxyUrl || '');
    localStorage.setItem(LS_KEYS.mix, JSON.stringify(state.domainWeights));
  } catch (_) { /* storage may be unavailable (private mode) */ }
}

function saveProviderField(field, value) {
  if (!state.providerConfig[state.provider]) state.providerConfig[state.provider] = {};
  state.providerConfig[state.provider][field] = value;
  saveConfig();
}

// ── Active session (pause/resume) ───────────────────────────────────────────
// Snapshot the in-progress exam so it survives a Pause click, a closed tab, or
// a crash. Saved at each new-question render and every 10s of timer tick — never
// while a question is in the "answered, not yet advanced" state, so resuming
// always lands on a fresh unanswered question and can't double-count a score.
function saveActiveSession() {
  try {
    const snap = {
      provider: state.provider,
      apiKey: state.apiKey, // the key actually in use, even if the user declined to save it permanently
      model: state.model,
      sessionLen: state.sessionLen,
      approach: state.approach,
      domainWeights: { ...state.domainWeights },
      qIndex: state.qIndex,
      answers: state.answers,
      domainCounts: { ...state.domainCounts },
      domainCorrect: { ...state.domainCorrect },
      history: state.history.slice(-8), // only the last few turns are ever used per request
      currentQ: state.currentQ,
      secondsLeft: state.secondsLeft,
      pausedAt: new Date().toISOString(),
    };
    localStorage.setItem(LS_KEYS.activeSession, JSON.stringify(snap));
  } catch (_) { /* storage may be unavailable (private mode, quota) */ }
}

function loadActiveSession() {
  try {
    const raw = localStorage.getItem(LS_KEYS.activeSession);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function clearActiveSession() {
  try { localStorage.removeItem(LS_KEYS.activeSession); } catch (_) { /* ignore */ }
}

function refreshPausedBanner() {
  const snap = loadActiveSession();
  const banner = $('pausedBanner');
  if (snap && snap.currentQ) {
    const providerLabel = (PROVIDERS[snap.provider] && PROVIDERS[snap.provider].label) || snap.provider;
    const correctSoFar = snap.answers.filter(a => a.correct).length;
    $('pausedBannerText').textContent =
      `Question ${snap.qIndex + 1} of ${snap.sessionLen} · ${correctSoFar} correct so far · ${providerLabel} · paused ${new Date(snap.pausedAt).toLocaleString()}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ── Test history ─────────────────────────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEYS.testHistory);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

function recordHistoryEntry(entry) {
  try {
    const list = loadHistory();
    list.unshift(entry);
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    localStorage.setItem(LS_KEYS.testHistory, JSON.stringify(list));
  } catch (_) { /* storage may be unavailable */ }
}

function clearHistory() {
  try { localStorage.removeItem(LS_KEYS.testHistory); } catch (_) { /* ignore */ }
}

// ── Study plan ────────────────────────────────────────────────────────────────
function saveStudyPlan(plan) {
  try { localStorage.setItem(LS_KEYS.studyPlan, JSON.stringify(plan)); } catch (_) { /* ignore */ }
}
function loadStudyPlan() {
  try {
    const raw = localStorage.getItem(LS_KEYS.studyPlan);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function clearStudyPlan() {
  try { localStorage.removeItem(LS_KEYS.studyPlan); } catch (_) { /* ignore */ }
}

const DOMAIN_LABELS = { people: 'People', process: 'Process', business: 'Business Environment' };

// Aggregates domainCounts/domainCorrect across all history entries to find the
// weakest-accuracy domain. Returns null if there's no history yet, or no domain
// has any recorded attempts.
function findWeakestDomain() {
  const list = loadHistory();
  if (list.length === 0) return null;
  const counts = { people: 0, process: 0, business: 0 };
  const correct = { people: 0, process: 0, business: 0 };
  list.forEach(entry => {
    Object.keys(counts).forEach(d => {
      counts[d] += (entry.domainCounts && entry.domainCounts[d]) || 0;
      correct[d] += (entry.domainCorrect && entry.domainCorrect[d]) || 0;
    });
  });
  let weakest = null, weakestAcc = Infinity;
  Object.keys(counts).forEach(d => {
    if (counts[d] === 0) return; // no attempts recorded for this domain — can't judge it
    const acc = correct[d] / counts[d];
    if (acc < weakestAcc) { weakestAcc = acc; weakest = d; }
  });
  return weakest ? { domain: weakest, accuracy: weakestAcc } : null;
}

// Domain mix for one non-mock session. Smart mode boosts the weakest domain
// found above; date-based mode (or no history yet, even in Smart mode) always
// uses the standard exam-weighted mix.
function sessionDomainMix(mode, weak) {
  if (mode !== 'smart' || !weak) return { ...DEFAULT_MIX };
  const boosted = weak.domain;
  const others = Object.keys(DEFAULT_MIX).filter(d => d !== boosted);
  const othersTotal = others.reduce((s, d) => s + DEFAULT_MIX[d], 0);
  const mix = { people: 0, process: 0, business: 0 };
  mix[boosted] = 65;
  others.forEach(d => { mix[d] = Math.round(35 * (DEFAULT_MIX[d] / othersTotal)); });
  return mix;
}

// Practice-session day offsets (days from today), excluding the final
// light-review day and any mock days (merged in by the caller). Cadence bands
// are a heuristic, not an exact science — chosen to build momentum early
// without burning out, similar in spirit to the timer-budget heuristic above.
function pickCadenceOffsets(daysUntil) {
  const offsets = [];
  const last = daysUntil - 1; // reserved for the light-review day
  if (daysUntil <= 7) {
    for (let d = 1; d < last; d++) offsets.push(d); // daily
  } else if (daysUntil <= 21) {
    for (let d = 1; d < last; d += 2) offsets.push(d); // ~every other day
  } else if (daysUntil <= 56) {
    for (let d = 1; d < last; d += 2) offsets.push(d); // ~3x/week
  } else {
    // 2-3x/week early on, stepping up to 3-4x/week in the final 4 weeks
    const finalStretch = Math.max(1, daysUntil - 28);
    for (let d = 1; d < finalStretch; d += 3) offsets.push(d);
    for (let d = finalStretch; d < last; d += 2) offsets.push(d);
  }
  return offsets;
}

// Mock-exam (Full 175) day offsets. Never inside the final 2 days before the
// exam — that invariant holds across every band.
function pickMockOffsets(daysUntil) {
  const maxOffset = daysUntil - 3; // leaves at least 2 full days of runway before the exam
  if (daysUntil < 5 || maxOffset < 1) return [];
  if (daysUntil <= 7) return [maxOffset];
  if (daysUntil <= 21) return [Math.max(1, Math.min(maxOffset, daysUntil - 6))]; // ~5-7 days out
  if (daysUntil <= 56) {
    const mid = Math.round(daysUntil / 2);
    const late = daysUntil - 7;
    return [...new Set([mid, late])].filter(o => o >= 1 && o <= maxOffset);
  }
  const step = Math.floor(daysUntil / 4);
  return [...new Set([step, step * 2, daysUntil - 10])].filter(o => o >= 1 && o <= maxOffset);
}

function generateStudyPlan(examDateStr, mode) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const examDate = examDateStr ? new Date(examDateStr + 'T00:00:00') : null;
  const daysUntil = examDate ? Math.round((examDate - today) / 86400000) : NaN;
  if (!examDateStr || isNaN(daysUntil) || daysUntil < 2) {
    return { error: "Pick a test date at least 2 days from today so there's time to schedule sessions." };
  }

  const cadenceOffsets = pickCadenceOffsets(daysUntil);
  const mockOffsets = pickMockOffsets(daysUntil);
  const reviewOffset = daysUntil - 1;
  const mockSet = new Set(mockOffsets);
  const allOffsets = [...new Set([...cadenceOffsets, ...mockOffsets, reviewOffset])].sort((a, b) => a - b);

  const weak = mode === 'smart' ? findWeakestDomain() : null;
  const note = mode === 'smart' && !weak
    ? 'No test history yet — using the standard domain mix until you have some.'
    : null;

  const practiceOffsets = allOffsets.filter(o => o !== reviewOffset && !mockSet.has(o));
  const n = practiceOffsets.length;

  const sessions = allOffsets.map(offset => {
    const date = new Date(today); date.setDate(today.getDate() + offset);
    const isReview = offset === reviewOffset;
    const isMock = !isReview && mockSet.has(offset);
    let sessionLen;
    if (isReview) sessionLen = 10;
    else if (isMock) sessionLen = 175;
    else {
      const i = practiceOffsets.indexOf(offset);
      sessionLen = i < n / 3 ? 10 : i < (2 * n) / 3 ? 20 : 40;
    }
    const domainWeights = (isMock || isReview) ? { ...DEFAULT_MIX } : sessionDomainMix(mode, weak);
    let focusLabel;
    if (isReview) focusLabel = 'Light review before your exam';
    else if (isMock) focusLabel = 'Full-length mock exam';
    else if (mode === 'smart' && weak) focusLabel = `${DOMAIN_LABELS[weak.domain]}-focused drill — your weakest area so far (${Math.round(weak.accuracy * 100)}% accuracy)`;
    else focusLabel = 'Standard mixed-domain practice';

    return { date: date.toISOString().slice(0, 10), sessionLen, approach: 'mixed', domainWeights, focusLabel, isMock };
  });

  return { examDate: examDateStr, mode, sessions, note };
}

// Encodes one session's config into the exam sim's own URL so clicking a
// calendar event's link lands pre-configured for that specific session.
function buildSessionUrl(session) {
  const params = new URLSearchParams({
    len: session.sessionLen,
    approach: session.approach,
    people: session.domainWeights.people,
    process: session.domainWeights.process,
    business: session.domainWeights.business,
  });
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545 line-folding: content lines over 75 octets get continued on the
// next line with a leading space.
function icsFold(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    out += '\r\n ' + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

function icsTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildIcsCalendar(sessions) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PMP Exam Simulator//Study Plan//EN', 'CALSCALE:GREGORIAN'];
  sessions.forEach((s, i) => {
    const dateStamp = s.date.replace(/-/g, '');
    const url = buildSessionUrl(s);
    const title = s.isMock
      ? 'PMP Practice: Full-Length Mock Exam (175Q)'
      : `PMP Practice: ${s.focusLabel.split(' — ')[0]} (${s.sessionLen}Q)`;
    const desc = `${s.focusLabel}\nOpen the exam sim, pre-configured for this session: ${url}`;
    const nextDay = new Date(s.date + 'T00:00:00'); nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStamp = nextDay.toISOString().slice(0, 10).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:pmpsim-${dateStamp}-${i}@local`,
      `DTSTAMP:${icsTimestamp()}`,
      `DTSTART;VALUE=DATE:${dateStamp}`,
      `DTEND;VALUE=DATE:${nextDayStamp}`,
      icsFold(`SUMMARY:${icsEscape(title)}`),
      icsFold(`DESCRIPTION:${icsEscape(desc)}`),
      `URL:${url}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadIcs(sessions) {
  const ics = buildIcsCalendar(sessions);
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pmp-study-plan.ics';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Provider selection ───────────────────────────────────────────────────────
let _modelsFetchToken = 0;

function selectProvider(providerId, opts = {}) {
  const provider = PROVIDERS[providerId];
  state.provider = providerId;
  const saved = state.providerConfig[providerId] || {};
  state.apiKey = saved.apiKey || '';
  state.model = saved.model || (provider.fallbackModels[0] && provider.fallbackModels[0].id) || '';

  [...$('providerOptions').querySelectorAll('.opt-btn')].forEach(b =>
    b.classList.toggle('active', b.dataset.val === providerId));

  updateProviderFields(provider);
  renderModelOptions(providerId, provider.fallbackModels);
  refreshRateLimitWarning();
  refreshSavedKeyNote();

  if (opts.persist !== false) saveConfig();
  if (state.apiKey) refreshLiveModels(providerId, state.apiKey);
}

function updateProviderFields(provider) {
  $('apiKeyLabel').textContent = `${provider.label} API key`;
  $('apiKeyInput').placeholder = provider.keyPlaceholder;
  $('apiKeyInput').value = state.apiKey;
  const helpLink = $('providerKeyHelp');
  helpLink.href = provider.keyHelpUrl;
  helpLink.textContent = provider.tagline.toLowerCase().includes('free') ? 'Get a free key here.' : 'Get a key here.';
}

// Shows/hides a note near the API key field when the typed key matches one
// already saved in localStorage for the active provider.
function refreshSavedKeyNote() {
  const saved = (state.providerConfig[state.provider] || {}).apiKey || '';
  const note = $('savedKeyNote');
  if (saved && saved === state.apiKey) {
    const article = /^[aeiou]/i.test(PROVIDERS[state.provider].label) ? 'an' : 'a';
    note.textContent = `🔒 Using ${article} ${PROVIDERS[state.provider].label} key saved in this browser.`;
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }
}

function renderModelOptions(providerId, models) {
  const container = $('modelOptions');
  container.innerHTML = '';
  const list = (models && models.length) ? models : PROVIDERS[providerId].fallbackModels;
  if (!list.some(m => m.id === state.model)) state.model = list[0]?.id || '';
  list.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn' + (m.id === state.model ? ' active' : '');
    btn.dataset.val = m.id;
    btn.textContent = m.label;
    container.appendChild(btn);
  });
}

// Fetches the provider's current model list once a key is present; silently keeps
// the existing (fallback or previous live) list on failure — never blocks the UI.
async function refreshLiveModels(providerId, apiKey) {
  const provider = PROVIDERS[providerId];
  if (!provider.listModels || !apiKey) return;
  const token = ++_modelsFetchToken;
  try {
    const models = await provider.listModels({ apiKey });
    if (token !== _modelsFetchToken || state.provider !== providerId) return; // stale
    if (models && models.length) renderModelOptions(providerId, models);
  } catch (_) { /* keep whatever list is already shown */ }
}

function refreshRateLimitWarning() {
  const note = PROVIDERS[state.provider].rateLimitNote;
  const el = $('rateLimitWarning');
  if (note && state.sessionLen === 175) {
    el.textContent = note;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
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
$('providerOptions').addEventListener('click', e => {
  if (!e.target.classList.contains('opt-btn')) return;
  selectProvider(e.target.dataset.val);
});

['lengthOptions','approachOptions','modelOptions'].forEach(groupId => {
  $(groupId).addEventListener('click', e => {
    if (!e.target.classList.contains('opt-btn')) return;
    [...e.target.parentElement.querySelectorAll('.opt-btn')].forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    if (groupId === 'lengthOptions') { state.sessionLen = parseInt(e.target.dataset.val); refreshRateLimitWarning(); }
    else if (groupId === 'modelOptions') { state.model = e.target.dataset.val; saveProviderField('model', state.model); }
    else state.approach = e.target.dataset.val;
  });
});

$('apiKeyInput').addEventListener('input', e => { state.apiKey = e.target.value.trim(); refreshSavedKeyNote(); });
$('apiKeyInput').addEventListener('blur', () => { if (state.apiKey) refreshLiveModels(state.provider, state.apiKey); });
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

$('resumeBtn').addEventListener('click', resumeExam);
$('discardPausedBtn').addEventListener('click', () => { clearActiveSession(); refreshPausedBanner(); });

$('historyBtn').addEventListener('click', () => {
  $('startScreen').classList.add('hidden');
  renderHistoryScreen();
  $('historyScreen').classList.add('show');
});
$('historyBackBtn').addEventListener('click', () => {
  $('historyScreen').classList.remove('show');
  $('startScreen').classList.remove('hidden');
});
$('clearHistoryBtn').addEventListener('click', () => {
  if (!confirm('Clear all saved test history? This cannot be undone.')) return;
  clearHistory();
  renderHistoryScreen();
});

$('planBtn').addEventListener('click', () => {
  $('startScreen').classList.add('hidden');
  renderPlanScreen();
  $('planScreen').classList.add('show');
});
$('planBackBtn').addEventListener('click', () => {
  $('planScreen').classList.remove('show');
  $('startScreen').classList.remove('hidden');
});
$('planModeOptions').addEventListener('click', e => {
  if (!e.target.classList.contains('opt-btn')) return;
  [...e.target.parentElement.querySelectorAll('.opt-btn')].forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
});
$('generatePlanBtn').addEventListener('click', () => {
  const examDateStr = $('examDateInput').value;
  const mode = $('planModeOptions').querySelector('.opt-btn.active')?.dataset.val || 'date';
  const result = generateStudyPlan(examDateStr, mode);
  if (result.error) {
    $('planError').textContent = result.error;
    $('planError').classList.remove('hidden');
    $('planList').innerHTML = '';
    $('downloadIcsBtn').classList.add('hidden');
    return;
  }
  $('planError').classList.add('hidden');
  saveStudyPlan(result);
  renderPlanList(result);
});
$('downloadIcsBtn').addEventListener('click', () => {
  const plan = loadStudyPlan();
  if (plan && plan.sessions) downloadIcs(plan.sessions);
});

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimer(resumeSeconds) {
  // 230 min for full; proportional otherwise, min 20 min
  const fullTime = resumeSeconds != null ? resumeSeconds
    : state.sessionLen === 175 ? 230 * 60
    : Math.max(state.sessionLen * 120, 20 * 60); // 2 min/question, accounts for API latency
  state.secondsLeft = fullTime;
  renderTimer();
  state.timerInterval = setInterval(() => {
    state.secondsLeft--;
    renderTimer();
    if (state.secondsLeft > 0 && state.secondsLeft % 10 === 0) saveActiveSession();
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
  if (loadActiveSession()) {
    showStartError('You have a paused exam in progress — resume or discard it above before starting a new one.');
    return;
  }
  // Validate credentials before starting
  if (!state.proxyUrl && !state.apiKey) {
    showStartError(`Enter your ${PROVIDERS[state.provider].label} API key (or a proxy URL) above to begin.`);
    return;
  }
  if (state.domainWeights.people + state.domainWeights.process + state.domainWeights.business <= 0) {
    showStartError('Set at least one domain weight above zero.');
    return;
  }
  hideStartError();

  // New or changed key for this provider, not yet saved (or declined) this session — ask once.
  if (!state.proxyUrl && state.apiKey) {
    const saved = (state.providerConfig[state.provider] || {}).apiKey || '';
    if (state.apiKey !== saved && state.apiKey !== state.keyDecisionFor) {
      const wantsSave = confirm(
        `Save this ${PROVIDERS[state.provider].label} API key in this browser for next time?\n\n` +
        `Click Cancel to use it for this session only — it won't be remembered.`
      );
      if (wantsSave) saveProviderField('apiKey', state.apiKey);
      state.keyDecisionFor = state.apiKey;
      refreshSavedKeyNote();
    }
  }

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

// ── Pause / resume ───────────────────────────────────────────────────────────
function pauseExam() {
  saveActiveSession();
  clearInterval(state.timerInterval);
  $('examScreen').classList.add('hidden');
  $('startScreen').classList.remove('hidden');
  $('timer').textContent = '—:——';
  refreshPausedBanner();
}

function resumeExam() {
  const snap = loadActiveSession();
  if (!snap || !snap.currentQ) return;

  selectProvider(snap.provider);
  // selectProvider() pulls apiKey from providerConfig, which won't have it if the
  // user declined to save it — restore the exact key that was actually in use.
  state.apiKey = snap.apiKey || state.apiKey;
  $('apiKeyInput').value = state.apiKey;
  refreshSavedKeyNote();
  state.model = snap.model;
  saveProviderField('model', state.model);

  state.sessionLen = snap.sessionLen;
  state.approach = snap.approach;
  state.domainWeights = { ...snap.domainWeights };
  state.qIndex = snap.qIndex;
  state.answers = snap.answers;
  state.domainCounts = snap.domainCounts;
  state.domainCorrect = snap.domainCorrect;
  state.history = snap.history;
  state.currentQ = snap.currentQ;
  state.answered = false;
  state.selectedChoices = new Set();

  $('startScreen').classList.add('hidden');
  $('examScreen').classList.remove('hidden');
  hideError();
  startTimer(snap.secondsLeft);
  renderQuestion(state.currentQ);
}

// Calls the active provider's adapter, retrying with backoff on HTTP 429 — this
// smooths brief rate-limit blips but can't get around a hard daily cap (see
// PROVIDERS.gemini.rateLimitNote and the start-screen warning for that case).
async function fetchGeneration({ systemPrompt, messages }) {
  const provider = PROVIDERS[state.provider];
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { url, headers, body } = provider.buildRequest({
      apiKey: state.apiKey, proxyUrl: state.proxyUrl, model: state.model, systemPrompt, messages,
    });
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (resp.status === 429 && attempt < maxAttempts) {
      const waitMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
      showLoading(`Rate limited by ${provider.label} — retrying in ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data = await resp.json();
    return provider.parseText(data);
  }
}

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
  const domainTasks = DOMAIN_TASKS[domain].join('; ');

  const systemPrompt = `You are a PMP exam question generator. Generate realistic, scenario-based PMP exam questions aligned with the PMI Exam Content Outline (ECO), July 2026 edition. Questions must be:
- Situational (not purely definitional)
- Aligned to the ${domainLabel} domain, and to one of these current ECO tasks for that domain: ${domainTasks}
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
    const raw = await fetchGeneration({ systemPrompt, messages });

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
    saveActiveSession();

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
  $('pauseBtn').classList.remove('hidden');

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

  // Build options for selects. Truncated here only — the full text still
  // appears in the Definitions list below, so a verbose AI-generated
  // definition can't stretch the closed <select> box (and the page) wider
  // than the table column; browsers auto-size selects to their widest option.
  const truncate = (text, max = 70) => text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
  const rightOpts = q.right.map(r => `<option value="${r.key}">${r.key}. ${escHtml(truncate(r.text))}</option>`).join('');

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
  $('pauseBtn').classList.add('hidden');
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
$('pauseBtn').addEventListener('click', pauseExam);

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

  recordHistoryEntry({
    id: Date.now(),
    endedAt: new Date().toISOString(),
    provider: state.provider,
    model: state.model,
    sessionLen: state.sessionLen,
    approach: state.approach,
    domainWeights: { ...state.domainWeights },
    pct,
    totalCorrect,
    rating,
    domainCounts: { ...state.domainCounts },
    domainCorrect: { ...state.domainCorrect },
    answers: state.answers,
  });
  clearActiveSession();

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
  refreshPausedBanner();
});

// Shared between the post-exam review and a history entry's expanded review.
function renderAnswerReview(container, answers) {
  container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px;">Answer Review</div>';

  answers.forEach((a, i) => {
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
    container.appendChild(div);
  });
}

$('reviewBtn').addEventListener('click', () => {
  const section = $('reviewSection');
  section.classList.remove('hidden');
  renderAnswerReview(section, state.answers);
  $('reviewBtn').classList.add('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
});

// ── Test history screen ─────────────────────────────────────────────────────
function ratingClassFor(rating) {
  if (rating === 'Above Target') return 'rating-above';
  if (rating === 'Meeting Target') return 'rating-meeting';
  if (rating === 'Below Target') return 'rating-below';
  return 'rating-needs';
}
function pctOf(c, t) { return t > 0 ? Math.round((c / t) * 100) + '%' : '—'; }

function renderHistoryScreen() {
  const list = loadHistory();
  const container = $('historyList');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px 0;">No completed exams yet.</div>';
    return;
  }

  list.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'review-q';
    const date = new Date(entry.endedAt).toLocaleString();
    const providerLabel = (PROVIDERS[entry.provider] && PROVIDERS[entry.provider].label) || entry.provider;
    card.innerHTML = `
      <div class="review-q-header" style="justify-content:space-between;">
        <div>
          <span style="font-family:var(--mono);font-size:12px;color:var(--text-muted)">${escHtml(date)}</span>
          <span style="font-size:12px;color:var(--text-muted);margin-left:10px;">${escHtml(providerLabel)} · ${escHtml(entry.model)} · ${entry.sessionLen}Q</span>
        </div>
        <span class="end-rating ${ratingClassFor(entry.rating)}" style="margin:0;">${escHtml(entry.rating)}</span>
      </div>
      <div style="display:flex;gap:18px;margin:10px 0;font-family:var(--mono);font-size:13px;flex-wrap:wrap;">
        <span>${entry.pct}% (${entry.totalCorrect}/${entry.sessionLen})</span>
        <span style="color:var(--people)">People ${pctOf(entry.domainCorrect.people, entry.domainCounts.people)}</span>
        <span style="color:var(--accent2)">Process ${pctOf(entry.domainCorrect.process, entry.domainCounts.process)}</span>
        <span style="color:var(--biz)">Biz Env ${pctOf(entry.domainCorrect.business, entry.domainCounts.business)}</span>
      </div>
      <button class="btn btn-secondary" data-history-review="${entry.id}" style="font-size:12px;padding:8px 14px;">Review Answers ↓</button>
      <div class="review-section hidden" id="hist-review-${entry.id}" style="margin-top:14px;"></div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('[data-history-review]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.historyReview;
      const entry = list.find(e => String(e.id) === String(id));
      const section = $(`hist-review-${id}`);
      if (section.classList.contains('hidden')) {
        renderAnswerReview(section, entry.answers);
        section.classList.remove('hidden');
        btn.textContent = 'Hide Review ↑';
      } else {
        section.classList.add('hidden');
        btn.textContent = 'Review Answers ↓';
      }
    });
  });
}

function renderPlanScreen() {
  const saved = loadStudyPlan();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  $('examDateInput').min = tomorrow.toISOString().slice(0, 10);
  $('examDateInput').value = (saved && saved.examDate) || '';

  const hasHistory = loadHistory().length > 0;
  const mode = (saved && saved.mode) || (hasHistory ? 'smart' : 'date');
  [...$('planModeOptions').querySelectorAll('.opt-btn')].forEach(b =>
    b.classList.toggle('active', b.dataset.val === mode));
  $('planModeNote').textContent = hasHistory
    ? ''
    : 'No test history yet — Smart mode will fall back to the standard mix until you have some.';

  $('planError').classList.add('hidden');
  $('downloadIcsBtn').classList.add('hidden');
  $('planList').innerHTML = '';

  if (saved && saved.sessions && saved.sessions.length) renderPlanList(saved);
}

function renderPlanList(plan) {
  const container = $('planList');
  container.innerHTML = '';

  if (plan.note) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'field-note warn';
    noteDiv.style.marginBottom = '12px';
    noteDiv.textContent = plan.note;
    container.appendChild(noteDiv);
  }

  plan.sessions.forEach(s => {
    const card = document.createElement('div');
    card.className = 'review-q';
    const dateLabel = new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const isReview = s.focusLabel === 'Light review before your exam';
    const tag = s.isMock ? 'FULL MOCK' : isReview ? 'REVIEW' : 'PRACTICE';
    const badgeClass = s.isMock ? 'process' : isReview ? 'business' : 'people';
    const url = buildSessionUrl(s);
    card.innerHTML = `
      <div class="review-q-header" style="justify-content:space-between;">
        <span style="font-family:var(--mono);font-size:13px;">${escHtml(dateLabel)}</span>
        <span class="domain-badge ${badgeClass}" style="font-size:10px;">${escHtml(tag)}</span>
      </div>
      <div style="margin:8px 0;font-size:13px;">${escHtml(s.focusLabel)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${s.sessionLen} questions · People ${s.domainWeights.people} / Process ${s.domainWeights.process} / Biz ${s.domainWeights.business}</div>
      <a href="${escHtml(url)}" class="btn btn-secondary" style="font-size:12px;padding:8px 14px;display:inline-block;text-decoration:none;">Open this session →</a>
    `;
    container.appendChild(card);
  });

  $('downloadIcsBtn').classList.remove('hidden');
}

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

// One-time launch hint: a study-plan calendar event's link (see buildSessionUrl)
// can pre-configure a specific session via URL params. Applied on top of the
// normal loaded config, never persisted to localStorage, and the query string
// is stripped afterward so a reload/bookmark doesn't keep re-applying it.
function applyDeepLinkParams() {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length === 0) return;

  const len = parseInt(params.get('len'), 10);
  if ([10, 20, 40, 175].includes(len)) {
    state.sessionLen = len;
    [...$('lengthOptions').querySelectorAll('.opt-btn')].forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.val, 10) === len));
  }

  const approach = params.get('approach');
  if (['mixed', 'predictive', 'agile', 'hybrid'].includes(approach)) {
    state.approach = approach;
    [...$('approachOptions').querySelectorAll('.opt-btn')].forEach(b =>
      b.classList.toggle('active', b.dataset.val === approach));
  }

  const people = parseInt(params.get('people'), 10);
  const process = parseInt(params.get('process'), 10);
  const business = parseInt(params.get('business'), 10);
  if ([people, process, business].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) {
    state.domainWeights = { people, process, business };
    $('mixPeople').value = people;
    $('mixProcess').value = process;
    $('mixBusiness').value = business;
    refreshMixDisplay();
  }

  history.replaceState(null, '', location.pathname);
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadConfig();
refreshPausedBanner();
applyDeepLinkParams();
