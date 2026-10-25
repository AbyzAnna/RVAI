// RevAI chat shell. Scripted local interview + real catalog discovery (mirrors catalog/__init__.py 0.1).
// No AI generation happens here. Live mode talks to Anna's POST /api/recommend (ui/rvai-adapter.js); any other
// endpoint gets the 0.2-draft PROPOSED envelope (docs/conversational-product-contract.md).
import { createWebsiteTemplate } from './website-template.js';
import { isRecommendEndpoint, recommendQuery, recommendContext, recommendError, fromRecommend } from './rvai-adapter.js';
import { rebuildIntent, targetFrom } from './rebuild-core.js';
import { mountRebuild } from './rebuild-flow.js';
const $ = id => document.getElementById(id);
const DATA_BASE = '../data/';
const CONTRACT = '0.2-draft';
const EXAMPLES = {
  cad: 'I want something like Fusion 360 for 3D CAD, with an AI helper for modeling',
  voxel_game: 'I want my own block-building game, like Minecraft',
  website: 'I want a website for my school project'
};
const WEBSITE_RE = /\b(web ?site|web ?page|landing page|portfolio|homepage|blog)\b/i;
const AI_RE = /\b(ai|a\.i\.|assistant|copilot)\b/i;
// Demo-only refusal for explicit cracking/piracy/licence-bypass requests. Backend enforcement is Anna's.
const CRACK_RE = /\b(crack|cracked|keygen|warez|nulled)\b|\bpirat(e|ed|ing)\b|\bbypass\w*\s+(the\s+|its\s+)?(licen[cs]\w*|activation|drm|paywall|subscription)|\b(serial|license|licence|activation)\s+key\s+(generator|hack)/i;
const FRIENDLY = { free_open_source: 'Free & open source', source_reviewed_not_runtime_tested: 'Sources reviewed · not run-tested', needs_verification: 'Needs verification', declared_license_only: 'Declared license only', matches: 'options found', no_match: 'no verified option' };
const friendly = v => FRIENDLY[v] || words(v);
const WEBSITE_CHIPS = ['Home page', 'About section', 'Gallery', 'Contact form', 'Blog / updates'];
const OS = [['', 'Not sure'], ['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux'], ['android', 'Android'], ['ios', 'iOS / iPadOS'], ['web', 'Browser only']];
const GPU = [['', 'Not sure'], ['none', 'No GPU / basic'], ['integrated', 'Integrated'], ['dedicated', 'Dedicated']];
const NET = [['', 'Not sure'], ['offline', 'Mostly offline'], ['limited', 'Limited / metered'], ['reliable', 'Reliable']];
const REASONS = { license_requires_review: 'license declaration missing or needs review', outside_curated_free_open_source_scope: 'not free and open source', platform_incompatible: 'not listed for your OS' };
const ADAPTER_LIMIT = 'Curated discovery adapter only; no LLM, build, install, or runtime verification.';
const NOT_EVALUATED = 'RAM, GPU, storage, size limit and internet are recorded but not evaluated by discovery 0.1.';
const ROUTES = { find: ['Find', 'Use an existing open alternative as-is.'], extend: ['Extend', 'Start from an open project; plan an original add-on for unproven features.'], create: ['Create', 'Scope an original prototype from your brief.'] };
const label = (pairs, v) => (pairs.find(p => p[0] === v) || [, v])[1];
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } } };
const newId = () => 'c_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));

let taxonomy = { categories: [] }, catalog = [], dataError = null, dataLoaded = false, busy = false, catalogView = false, formCount = 0;
let agentStatus = 'off'; // off | selected | ok | failed
let state = fresh();
function fresh() {
  return { conversation_id: newId(), messages: [], step: 'target', revising: false, target: '', category: null, purpose: '', featuresText: '',
    featureIds: [], proposedIds: [], customFeatures: [], constraints: null, route: null, baseId: null, discovery: null, agentBrief: null, agentPlan: null,
    artifact: null, artifactError: null, lastTarget: '',
    provenance: { brief: 'scripted_demo', discovery: 'scripted_demo', plan: 'scripted_demo' } };
}

// ---------- DOM helpers (text-only, never innerHTML) ----------
const kidsOf = kids => kids.flat(Infinity).filter(k => k != null && k !== false).map(k => (k instanceof Node ? k : String(k)));
const put = (node, ...kids) => node.replaceChildren(...kidsOf(kids));
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  n.append(...kidsOf(kids));
  return n;
}
function link(url, text) {
  if (!url) return null; // nothing recorded: show nothing instead of a loud placeholder
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
    return el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer' }, text);
  } catch { return el('span', { text: `${text} (invalid link)` }); }
}
const words = s => String(s).replace(/_/g, ' ');
const cats = () => taxonomy.categories;
const catOf = id => cats().find(c => c.id === id);
const catLabel = () => state.category === 'website' ? 'Website' : (catOf(state.category)?.label || 'Uncategorized idea');
const featLabel = id => id === 'ai_modeling_assistant' ? 'AI modeling assistant' : cats().flatMap(c => c.features).find(f => f.id === id)?.label || words(id);
const splitList = t => String(t).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
const liveMode = () => $('live-mode').checked;
const isStr = v => typeof v === 'string' && v.trim() !== '';

// ---------- chat ----------
function addMessage(role, text, { tag, error, extras = [], log = true } = {}) {
  $('welcome').classList.add('hidden');
  if (log) state.messages.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
  const node = el('div', { class: `message ${role}` },
    role === 'bot' ? el('div', { class: 'avatar', 'aria-hidden': 'true', text: '✳' }) : null,
    el('div', { class: 'message-body' },
      el('div', { class: 'message-label', text: role === 'user' ? 'You' : tag || 'RevAI · scripted demo (no AI)' }),
      el('p', { class: `message-text${error ? ' error-text' : ''}`, text }), extras));
  $('messages').append(node);
  requestAnimationFrame(() => { $('chat-scroll').scrollTop = $('chat-scroll').scrollHeight; });
  return node;
}
const bot = (text, opts) => addMessage('bot', text, opts);
const actions = list => el('div', { class: 'message-actions' }, list.map(([t, fn], i) => el('button', { type: 'button', class: `small-button${i ? '' : ' primary'}`, text: t, onclick: fn })));
const routeActions = () => actions(Object.entries(ROUTES).map(([r, [t]]) => [t, () => chooseRoute(r)]));
const REVISIONS = [['Change features', () => revise('features')], ['Change device limits', () => revise('device')], ['Change purpose', () => revise('purpose')]];
const reviseActions = () => actions(REVISIONS);

function setQuick(items) {
  put($('quick-replies'), items.map(([t, fn]) => el('button', { type: 'button', text: t, onclick: fn })));
  updateControls();
}
function appendToInput(l) {
  const box = $('message-input'), parts = splitList(box.value);
  if (!parts.some(p => p.toLowerCase() === l.toLowerCase())) parts.push(l);
  box.value = parts.join(', ');
  box.focus();
}
function updateControls() {
  const off = busy || !dataLoaded;
  $('send').disabled = off;
  $('message-input').disabled = off;
  document.querySelectorAll('#quick-replies button, [data-example], #new-chat').forEach(b => { b.disabled = off; });
  $('composer-hint').textContent = !dataLoaded ? '… Loading catalog' : busy ? '… Waiting for the selected agent' : dataError ? '⚠ Catalog failed to load — local demo unavailable' : '✧ Find, extend, or build — together';
}
function setBusy(on) { busy = on; updateControls(); }

async function send(raw, { retry = false, plan = false } = {}) {
  const text = raw.trim();
  if (busy || !dataLoaded || !text) return;
  if (!retry) { addMessage('user', text); $('message-input').value = ''; }
  setQuick([]);
  const intent = CRACK_RE.test(text) ? null : rebuildIntent(text);
  if (intent) return startRebuild(intent.target || contextTarget(), intent.notes);
  if (liveMode()) return sendLive(text, plan);
  if (dataError) return bot(`The catalog could not be loaded (${dataError}), so the scripted demo cannot search. Serve the repository root over HTTP and reload the page.`, { error: true, tag: 'Catalog error', log: false });
  if (CRACK_RE.test(text)) return bot('I can’t help crack software, bypass licensing or activation, or find pirated copies. I can help you find a free or open alternative, extend an open project, or plan an original tool that does what you need. What do you want to be able to do?',
    { tag: 'RevAI · scripted demo · declined' });
  interview(text);
}

// ---------- rebuild hand-off: "make my own version" runs the Rebuild flow right in the chat ----------
/** The product the conversation is about: the last recommendation's target, else the latest "like X" the person wrote. */
function contextTarget() {
  if (state.lastTarget) return state.lastTarget;
  for (const m of [...state.messages].reverse()) if (m.role === 'user') { const t = targetFrom(m.content); if (t) return t; }
  return '';
}
function startRebuild(target, notes = '') {
  const holder = el('div', { class: 'rebuild-inline' });
  bot(target
    ? `Let’s build your own version of ${target}${notes ? ` (${notes})` : ''}. Agents are researching it now. Then pick the features and mods you want, the AI model and your system, and you’ll get one file to download.`
    : 'Let’s build your own version. Type the app or website it should be like, and agents will research it. Then pick features and mods, the AI model and your system, and you’ll get one file to download.',
  { tag: 'RVAI · Rebuild an app', extras: [holder] });
  mountRebuild(holder, { app: target, notes, onFile: f => { state.messages.push({ role: 'assistant', content: `Built ${f.displayTitle} as ${f.filename}.` }); } });
}

// ---------- live adapter (proposed 0.2-draft envelope; not an implemented backend contract) ----------
function request() {
  const b = brief(), c = b.compatibility;
  return { contract_version: CONTRACT, conversation_id: state.conversation_id, mode: 'live', messages: state.messages, brief: b,
    discovery_spec: catOf(state.category) ? { category: state.category, platform: c.platform, budget: 0, required_features: state.featureIds } : null };
}
async function sendLive(text, plan = false) {
  setBusy(true);
  try {
    const url = endpoint();
    const data = isRecommendEndpoint(url) ? fromRecommend(await callAgent(url, { query: recommendQuery(state.messages), context: recommendContext(state.messages), ...(plan ? { plan: true } : {}) })) : await callAgent(url, request());
    const found = /^Alternatives to (.+)$/.exec(data?.discovery?.title || '')?.[1];
    if (found) state.lastTarget = found;
    agentStatus = 'ok';
    applyAgent(data);
  } catch (e) {
    agentStatus = 'failed';
    bot(`Agent request failed: ${e.message}. Nothing was generated and no scripted fallback was used. Your brief is preserved.`,
      { tag: 'Connection error', error: true, log: false, extras: [actions([['Retry', () => send(text, { retry: true, plan })]])] });
  } finally { setBusy(false); updateMode(); renderAll(); $('message-input').focus(); }
}
// Relative paths (e.g. /api/recommend through scripts/dev_server.py) resolve against the page.
function endpoint() {
  const raw = $('api-url').value.trim();
  let url;
  try { if (!raw) throw new Error(); url = new URL(raw, location.href); } catch { throw new Error('endpoint URL is missing or invalid'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('endpoint must use http or https');
  return url;
}
async function callAgent(url, body) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    let data = null;
    try { data = await res.json(); } catch { if (res.ok) throw new Error('response was not valid JSON'); }
    if (data?.error?.message) throw new Error(`${data.error.code || 'error'}: ${data.error.message}`);
    if (recommendError(data)) throw new Error(`${res.status === 500 ? 'backend step failed' : `HTTP ${res.status}`}: ${recommendError(data)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('response was not a JSON object');
    if (data.stage === 'error') throw new Error('agent reported stage "error" without an error message');
    return data;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('request timed out after 60 s') : e;
  } finally { clearTimeout(timer); }
}
const validDiscovery = d => d && typeof d === 'object' && Array.isArray(d.recommendations) && d.recommendations.every(m => isStr(m?.project?.name)) && (d.excluded == null || Array.isArray(d.excluded));
const validPlan = p => p && typeof p === 'object' && Array.isArray(p.steps) && p.steps.every(s => isStr(s?.title));
// ---------- visual replies: cards, chips and badges instead of a wall of text ----------
const RISK_LABEL = { high: 'High risk', medium: 'Check this', low: 'Low risk' };
const hostName = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function pickTile(p, i) {
  const pctTxt = p.coverage == null ? null : `${Math.round(p.coverage * 100)}%`;
  return el('article', { class: 'pick-card' },
    el('div', { class: 'pick-head' },
      el('span', { class: 'pick-avatar', 'aria-hidden': 'true', text: (p.name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase() }),
      el('div', { class: 'pick-title' }, el('b', { text: `${i + 1}. ${p.name}` }), p.alternativeTo ? el('small', { class: 'alt-of', text: `Alternative to ${p.alternativeTo}` }) : null, p.url ? el('small', { text: hostName(p.url) }) : null),
      pctTxt ? el('span', { class: 'pick-pct', text: pctTxt, title: 'Share of your must-have features' }) : null),
    pctTxt ? el('div', { class: 'cov-bar', role: 'img', 'aria-label': `Covers ${pctTxt} of your must-haves` }, el('span', { style: `width:${pctTxt}` })) : null,
    el('div', { class: 'chip-row' },
      el('span', { class: `chip-tag${p.openSource ? '' : ' warn'}`, text: p.openSource ? p.license : `${p.license} · not open source` }),
      el('span', { class: `chip-tag${p.platformMatch ? '' : ' warn'}`, text: p.platformMatch ? 'Runs on your device' : 'Platform not confirmed' })),
    p.gaps.length ? el('ul', { class: 'pick-gaps' }, p.gaps.map(g => el('li', {}, el('span', { class: `gap-dot ${g.status}`, 'aria-hidden': 'true' }), `${g.status === 'missing' ? 'Missing' : g.status === 'plugin' ? 'Via plug-in' : 'Partial'}: ${g.label}`))) : null,
    p.url ? el('a', { class: 'small-button primary pick-open', href: p.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open official site ↗' }) : null);
}
function visualReply(v, steps) {
  const parts = [];
  if (v.live) parts.push(el('div', { class: 'callout info', text: 'Found live by AI. Links were checked; licenses weren’t reviewed by a person.' }));
  if (v.picks.length) parts.push(el('div', { class: 'pick-grid' }, v.picks.map(pickTile)));
  if (v.discounts.length) parts.push(el('div', { class: 'callout discount' }, el('b', { text: 'Want the original? Official discounts' }),
    el('ul', {}, v.discounts.map(dc => el('li', {}, dc.url ? el('a', { href: dc.url, target: '_blank', rel: 'noopener noreferrer', text: dc.name }) : dc.name, dc.eligibility ? el('small', { text: ` · ${dc.eligibility}` }) : null)))));
  if (v.risks.length) parts.push(el('div', { class: 'risk-list' }, el('b', { text: 'Risks to check' }),
    v.risks.map(t => el('div', { class: `risk-item sev-${t.severity}` }, el('span', { class: 'risk-badge', text: RISK_LABEL[t.severity] || t.severity }), el('span', {}, el('strong', { text: t.subject }), ` ${t.advice}`)))));
  if (v.plan) parts.push(el('div', { class: 'callout plan' }, el('b', { text: 'A plan for your own tool' }), el('p', { text: v.plan.reason }),
    el('div', { class: 'message-actions' },
      el('button', { type: 'button', class: 'small-button primary', text: 'Build it for me', onclick: () => startRebuild(contextTarget()) }),
      el('button', { type: 'button', class: 'small-button', text: 'Download plan (.md)', onclick: () => download('rvai-plan.md', v.plan.markdown, 'text/markdown') }),
      el('button', { type: 'button', class: 'small-button', text: 'Open the Plan tab', onclick: () => openWorkspace('plan') }))));
  if (steps) parts.push(el('details', { class: 'agent-steps' }, el('summary', { text: `How RVAI got this · ${steps.length} steps` }),
    el('ol', {}, steps.map(s => el('li', { class: /fallback|failed|blocked/.test(s.status || '') ? 'warn' : '' }, el('span', { text: s.label }), s.status ? el('small', { text: s.status }) : null)))));
  return parts;
}

function applyAgent(d) {
  // A refused message is never sent again as context for a later question.
  if (d.stage === 'refused') { const last = state.messages.findLast(m => m.role === 'user'); if (last) last.refused = true; }
  // Each live answer replaces the last one: a plan or alternatives from an earlier answer must not linger.
  if ('plan' in d && d.plan == null) state.agentPlan = null;
  if ('discovery' in d && d.discovery == null) state.discovery = null;
  const q = d.clarifying_question;
  const text = isStr(d.assistant_message) ? d.assistant_message : isStr(q?.prompt) ? q.prompt : null;
  const ignored = [];
  if (d.brief != null) { if (typeof d.brief === 'object' && !Array.isArray(d.brief)) { state.agentBrief = d.brief; state.provenance.brief = 'live'; } else ignored.push('brief'); }
  if (d.discovery != null) { if (validDiscovery(d.discovery)) { state.discovery = d.discovery; state.provenance.discovery = 'live'; } else ignored.push('discovery'); }
  if (d.plan != null) { if (validPlan(d.plan)) { state.agentPlan = d.plan; state.provenance.plan = 'live'; } else ignored.push('plan'); }
  if (d.route in ROUTES) state.route = d.route;
  if (d.artifact != null) ignored.push('artifact (not supported in this UI checkpoint)');
  // Agent-reported steps: rendered only when every entry is {label, status?} with strings. Never invented locally.
  let steps = null;
  if (d.steps != null) {
    if (Array.isArray(d.steps) && d.steps.every(s => isStr(s?.label) && (s.status == null || isStr(s.status)))) steps = d.steps;
    else ignored.push('steps');
  }
  const notes = [Array.isArray(d.limitations) && d.limitations.filter(isStr).length ? `Limitations: ${d.limitations.filter(isStr).join('; ')}` : null,
    ignored.length ? `Ignored invalid/unsupported fields: ${ignored.join(', ')}` : null].filter(Boolean);
  if (!text) return bot(`The agent responded, but with no assistant_message or clarifying_question.prompt.${notes.length ? '\n' + notes.join('\n') : ''}`, { tag: 'Agent response problem', error: true, log: false });
  const tag = { refused: 'Selected agent · declined', needs_info: 'Selected agent · needs more information', clarifying: 'Selected agent · question', recommended: 'RVAI backend · catalog recommendation', discovered: 'RVAI backend · found live, not reviewed by a person' }[d.stage] || `Selected agent · ${isStr(d.stage) ? d.stage : 'reply'}`;
  if (d.visual && typeof d.visual === 'object' && Array.isArray(d.visual.picks)) {
    bot(d.visual.headline || text, { tag, error: d.stage === 'refused', extras: visualReply(d.visual, steps) });
  } else {
    bot(notes.length ? `${text}\n\n${notes.join('\n')}` : text, { tag, error: d.stage === 'refused',
      extras: steps ? [el('details', { class: 'agent-steps' }, el('summary', { text: `How RVAI got this · ${steps.length} steps` }), el('ol', {}, steps.map(s => el('li', {}, el('span', { text: s.label }), s.status ? el('small', { text: s.status }) : null))))] : [] });
  }
  if (Array.isArray(q?.options)) setQuick(q.options.filter(isStr).map(o => [o, () => send(o)]));
  if (state.discovery || state.agentPlan) autoOpenWorkspace(state.agentPlan ? 'plan' : 'alternatives');
}

// ---------- scripted interview ----------
function detect(text) {
  const t = text.toLowerCase();
  if (WEBSITE_RE.test(t)) return 'website';
  return cats().find(c => c.keywords.some(k => t.includes(k)))?.id || null;
}
function setFeatures(text) {
  state.featuresText = text;
  const feats = catOf(state.category)?.features || [], ids = new Set(), custom = [];
  for (const item of splitList(text)) {
    const t = item.toLowerCase();
    const f = feats.find(f => t.includes(f.label.toLowerCase()) || f.label.toLowerCase().includes(t) || t.includes(words(f.id)));
    if (f) ids.add(f.id); else custom.push(item);
  }
  state.featureIds = [...ids];
  state.customFeatures = custom;
  state.proposedIds = state.category === 'cad' && AI_RE.test(`${state.target} ${text}`) ? ['ai_modeling_assistant'] : [];
}
function ask(step) {
  state.step = step;
  if (step === 'purpose') bot('What is it for? Who will use it, and what do you want to do that you can’t today?');
  if (step === 'features') {
    const chips = state.category === 'website' ? WEBSITE_CHIPS : (catOf(state.category)?.features || []).map(f => f.label);
    bot('Which features matter most? Separate them with commas — tap a suggestion or write your own. Features the catalog doesn’t track are kept and marked unverified.');
    setQuick(chips.map(c => [c, () => appendToInput(c)]));
    if (state.revising) $('message-input').value = state.featuresText;
  }
  if (step === 'device') bot('Tell me about the device you’ll use. Leave anything you don’t know as “Not sure” or blank — unknowns stay unknown.', { extras: [deviceForm(state.constraints)] });
}
function interview(text) {
  const step = state.step;
  if (step === 'target') {
    state.target = text;
    state.category = detect(text);
    $('project-title').textContent = text.length > 48 ? text.slice(0, 47) + '…' : text;
    bot(state.category === 'website'
      ? 'This sounds like a website. I’ll check what this curated catalog has before planning anything new.'
      : state.category
        ? `This looks like “${catLabel()}”. After a few questions I’ll search the curated catalog. A category match is a routing hint, not a claim that anything is equivalent to the tool you named.`
        : `I couldn’t match this to a catalog category (it covers ${cats().map(c => c.label).join(', ')}). I’ll keep your goal exactly as written.`);
    ask('purpose');
  } else if (step === 'purpose') {
    state.purpose = text;
    state.revising ? recompute('Purpose updated.') : ask('features');
  } else if (step === 'features') {
    setFeatures(text);
    state.revising ? recompute('Features updated; discovery and plan recomputed.') : ask('device');
  } else if (step === 'device') {
    bot('Please complete the device form above (blank fields are fine) and press “Use these limits”.');
  } else {
    bot('This scripted demo can’t interpret free-form follow-ups. Use a guided revision below, pick a route, or download the brief/plan. Select an agent in Connection settings for open conversation.', { extras: [reviseActions()] });
    setQuick(REVISIONS);
  }
  renderAll();
}
function revise(field) {
  if (busy || liveMode() || state.step !== 'done') return;
  state.revising = true;
  addMessage('user', `Change ${field === 'device' ? 'device limits' : field}`);
  setQuick([]);
  ask(field);
}

function deviceForm(prev) {
  const id = ++formCount, p = prev || {};
  const sel = (name, pairs, v) => el('select', { id: `${name}-${id}`, name }, pairs.map(([o, t]) => el('option', { value: o, text: t, selected: (v ?? '') === o })));
  const num = (name, min, max, step, ph, v) => el('input', { id: `${name}-${id}`, name, type: 'number', inputmode: 'decimal', min, max, step, placeholder: ph, value: v ?? null });
  const field = (name, text, control) => el('label', { for: `${name}-${id}` }, text, control);
  const form = el('form', { class: 'device-card', 'aria-label': 'Device and limits' },
    el('h3', { text: 'Your device & limits' }),
    el('fieldset', { style: 'border:0;padding:0;margin:0;min-width:0' },
      el('legend', { class: 'sr-only', text: 'Device and limits' }),
      el('div', { class: 'device-grid' },
        field('os', 'Operating system', sel('os', OS, p.platform)),
        field('ram', 'RAM (GB)', num('ram', 0.5, 1024, 0.5, 'e.g. 8', p.ram_gb)),
        field('gpu', 'Graphics', sel('gpu', GPU, p.gpu)),
        field('storage', 'Free storage (GB)', num('storage', 0, 100000, 0.1, 'e.g. 20', p.storage_free_gb)),
        field('max', 'Max install / project size (GB)', num('max', 0, 10000, 0.1, 'e.g. 2', p.max_project_install_gb)),
        field('net', 'Internet', sel('net', NET, p.internet))),
      el('button', { type: 'submit', class: 'small-button primary', text: 'Use these limits' })));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = n => form.elements.namedItem(n).value.trim(), num = n => (v(n) === '' ? null : Number(v(n)));
    form.elements.namedItem('max').setCustomValidity(num('max') != null && num('storage') != null && num('max') > num('storage') ? 'Max size cannot exceed free storage.' : '');
    if (busy || state.step !== 'device' || !form.reportValidity()) return;
    state.constraints = { platform: v('os') || null, ram_gb: num('ram'), gpu: v('gpu') || null, storage_free_gb: num('storage'), max_project_install_gb: num('max'), internet: v('net') || null };
    form.querySelector('fieldset').disabled = true;
    addMessage('user', `Device: ${deviceSummary(state.constraints)}`);
    recompute(state.revising ? 'Device limits updated; discovery and plan recomputed.' : null);
  });
  return form;
}

// Mirrors find_candidate_projects() in catalog/__init__.py (schema 0.1). Unknown OS = needs verification, not excluded.
function discover() {
  const platform = state.constraints?.platform || null, required = state.featureIds;
  if (!catOf(state.category)) return { schema_version: '0.1', status: 'no_match', recommendations: [], excluded: [],
    limitations: [state.category === 'website' ? 'This curated catalog has no website-builder entries yet.' : 'No category in this curated catalog matched the goal.', ADAPTER_LIMIT] };
  const recommendations = [], excluded = [], seen = new Set();
  for (const item of catalog) {
    if (seen.has(item.id) || item.category !== state.category) continue;
    seen.add(item.id);
    const reasons = [];
    if (!item.license || item.license_review_status !== 'declared_license_only') reasons.push('license_requires_review');
    if (item.pricing_type !== 'free_open_source') reasons.push('outside_curated_free_open_source_scope');
    if (platform && !(item.supported_platforms || []).includes(platform)) reasons.push('platform_incompatible');
    if (reasons.length) { excluded.push({ id: item.id, reasons }); continue; }
    const supported = required.filter(f => item.features.includes(f));
    recommendations.push({ project: item, supported_features: supported, unknown_features: required.filter(f => !item.features.includes(f)), missing_features: [],
      feature_coverage: required.length ? supported.length / required.length : null, compatibility_status: 'needs_verification',
      warnings: [...(item.notes || []), 'Hardware and offline suitability are unverified.', 'Declared license is not a completed compliance audit.'] });
  }
  recommendations.sort((a, b) => (b.feature_coverage || 0) - (a.feature_coverage || 0) || a.project.id.localeCompare(b.project.id));
  return { schema_version: '0.1', recommendations, excluded, status: recommendations.length ? 'matches' : 'no_match', limitations: [ADAPTER_LIMIT, NOT_EVALUATED] };
}
const extraUnknowns = () => [...state.proposedIds, ...state.customFeatures];
function suggestedRoute(d) {
  const top = d.recommendations[0];
  if (!top) return 'create';
  return top.unknown_features.length || extraUnknowns().length ? 'extend' : 'find';
}

const baseOf = () => state.discovery?.recommendations?.find(m => m.project.id === state.baseId) || null;
const projName = id => catalog.find(c => c.id === id)?.name || id;

// Any change to goal/purpose/features/device lands here: rediscover, drop stale artifact, drop an invalid base.
function recompute(prefix) {
  state.step = 'done';
  state.revising = false;
  state.discovery = discover();
  state.provenance.discovery = 'scripted_demo';
  const notices = [];
  if (state.artifact || state.artifactError) notices.push('The previous website template was discarded because the brief changed — create it again to get an up-to-date preview.');
  state.artifact = null; state.artifactError = null;
  if (state.baseId && !baseOf()) {
    const x = state.discovery.excluded.find(e => e.id === state.baseId);
    notices.push(`${projName(state.baseId)} is no longer a valid base${x ? ` (${x.reasons.map(r => REASONS[r] || words(r)).join(', ')})` : ''}, so your ${state.route ? ROUTES[state.route][0] : ''} route was reset.`);
    state.baseId = null;
    if (state.route !== 'create') state.route = null;
  }
  if (notices.length) prefix = [prefix, ...notices].filter(Boolean).join('\n');
  const d = state.discovery, top = d.recommendations[0], os = label(OS, state.constraints?.platform);
  let msg;
  if (state.category === 'website' || !catOf(state.category)) {
    msg = `${state.category === 'website' ? 'This curated catalog has no website-builder entries yet' : 'No category in this curated catalog matched your goal'} (it covers ${cats().map(c => c.label).join(', ')}), so I can’t point you to a verified existing option from it. That doesn’t mean none exist elsewhere. Would you like a scoped original ${state.category === 'website' ? 'website ' : ''}plan instead?`;
    bot(prefix ? `${prefix}\n\n${msg}` : msg, { extras: [actions([[state.category === 'website' ? 'Plan an original website' : 'Plan an original prototype (Create)', () => chooseRoute('create')], ...REVISIONS])] });
  } else if (!top) {
    const why = d.excluded.map(x => `${projName(x.id)}: ${x.reasons.map(r => REASONS[r] || words(r)).join(', ')}`).join('; ');
    msg = `We don’t know of a verified option in this catalog${state.constraints?.platform ? ` for ${os}` : ''}. Excluded — ${why || 'no entries in this category'}. Create is available as a proposal; feasibility is not asserted.`;
    bot(prefix ? `${prefix}\n\n${msg}` : msg, { extras: [actions([['Create (proposal)', () => chooseRoute('create')], ...REVISIONS])] });
  } else {
    const unk = [...top.unknown_features.map(featLabel), ...extraUnknowns()];
    msg = `${d.recommendations.length} catalog option${d.recommendations.length === 1 ? '' : 's'} in “${catLabel()}”${d.excluded.length ? `, ${d.excluded.length} excluded (see Alternatives)` : ''}. Best feature evidence: ${top.project.name} (${top.supported_features.length}/${state.featureIds.length} of your recognized features).${unk.length ? ` Not evidenced in the catalog (unverified, not missing): ${unk.join(', ')}.` : ''} Hardware fit and offline use are unverified for every entry.\n\nSuggested route: ${ROUTES[suggestedRoute(d)][0]}. Pick a base project with “Use this project” or “Extend this project” in Alternatives, or choose a route here:`;
    bot(prefix ? `${prefix}\n\n${msg}` : msg, { extras: [routeActions(), reviseActions()] });
    autoOpenWorkspace('alternatives');
  }
  setQuick(REVISIONS);
  renderAll();
}
// baseId: explicit per-card choice. Chat buttons without a choice fall back to the top-ranked option and say so.
function chooseRoute(r, baseId) {
  if (busy) return;
  if (liveMode() && state.provenance.discovery === 'live') return chooseLiveRoute(r, baseId);
  const recs = state.discovery?.recommendations || [];
  if (r !== 'create' && !recs.length) return bot('There is no catalog option to find or extend — choose Create instead.', { extras: [actions([['Create (proposal)', () => chooseRoute('create')]])] });
  let note = '';
  if (r === 'create') {
    state.baseId = null;
    note = state.category === 'website'
      ? ' Review the plan, then press “Create demo website template” if you want a static starter page. Nothing is made until you press it.'
      : ' This is a proposal: the scripted demo generates nothing. Turn on the connected agent in Connection settings for an AI plan.';
  } else {
    const explicit = baseId && recs.some(m => m.project.id === baseId);
    state.baseId = explicit ? baseId : baseOf() ? state.baseId : recs[0].project.id;
    note = ` Base project: ${projName(state.baseId)}${explicit ? '' : ' (top-ranked; pick another with the buttons on its card in Alternatives)'}.`;
  }
  state.route = r;
  state.artifact = null; state.artifactError = null;
  const extra = r === 'create' && state.category === 'website' ? [actions([['Create demo website template', makeTemplate], ...REVISIONS])] : [reviseActions()];
  bot(`Route set to ${ROUTES[r][0]}. The plan reflects your features, device limits and an acceptance check.${note}`, { extras: extra });
  setQuick(REVISIONS);
  renderAll();
  openWorkspace('plan');
}

// With the AI connected, Find just marks the option to start from; Extend and Create ask the backend for a plan
// (a normal chat turn, so the request is read together with the earlier messages).
function chooseLiveRoute(r, baseId) {
  const recs = state.discovery?.recommendations || [];
  const base = recs.find(m => m.project.id === baseId) || recs[0];
  if (r !== 'create' && !base) return bot('There is no free option here to start from, so choose Create for a plan of your own tool.', { tag: 'RVAI' });
  if (r === 'find') {
    state.route = 'find'; state.baseId = base.project.id;
    bot(`Start with ${base.project.name}: open its official site from the card in Alternatives and try your must-haves there.`, { tag: 'RVAI' });
    renderAll();
    return openWorkspace('alternatives');
  }
  send(r === 'extend' ? `Plan an add-on for ${base.project.name} that fills the gaps` : 'Plan how to build this myself', { plan: true });
}

// Local template: only after an explicit click, only for the website Create route. Not AI generation.
function templateBrief() {
  const c = state.constraints;
  return { target: state.target, purpose: state.purpose, stated_features: splitList(state.featuresText), route: state.route, category: state.category,
    constraints: c ? { os: c.platform, ram_gb: c.ram_gb, gpu: c.gpu, storage_free_gb: c.storage_free_gb, max_install_gb: c.max_project_install_gb, internet: c.internet } : null };
}
function makeTemplate() {
  if (busy || state.category !== 'website' || state.route !== 'create' || state.step !== 'done') return bot('The demo website template is only available after you choose the original website plan.');
  const input = templateBrief();
  try {
    const t = createWebsiteTemplate(input);
    state.artifact = { ...t, source: 'local_template', created_at: new Date().toISOString(), briefKey: JSON.stringify(input) };
    state.artifactError = null;
    bot(`Template preview created (${t.bytes.toLocaleString()} bytes of HTML source). This is a static template filled from your brief — not AI-generated. Review it in Preview before downloading.`, { tag: 'RevAI · local template (not AI)' });
  } catch (e) {
    state.artifact = null;
    state.artifactError = e.message;
    bot(`No template was produced: ${e.message}`, { tag: 'Template error', error: true });
  }
  renderAll();
  openWorkspace('preview');
}

// ---------- brief & plan ----------
function deviceSummary(c) {
  if (!c) return 'not provided yet';
  return [c.platform ? label(OS, c.platform) : 'OS unknown', c.ram_gb != null ? `${c.ram_gb} GB RAM` : 'RAM unknown', c.gpu ? `${label(GPU, c.gpu)} graphics` : 'GPU unknown',
    c.storage_free_gb != null ? `${c.storage_free_gb} GB free` : 'free storage unknown', c.max_project_install_gb != null ? `max ${c.max_project_install_gb} GB install/project` : 'no size limit given',
    c.internet ? `internet: ${label(NET, c.internet).toLowerCase()}` : 'internet unknown'].join(' · ');
}
function brief() {
  const c = state.constraints || {};
  return { contract_version: CONTRACT, source: state.provenance.brief === 'live' ? 'live_agent' : 'scripted_demo',
    goal: state.category, target: state.target || null, purpose: state.purpose || null, stated_features: splitList(state.featuresText),
    custom_features: state.customFeatures, feature_ids: [...state.featureIds, ...state.proposedIds], proposed_feature_ids: state.proposedIds,
    compatibility: { platform: c.platform ?? null, ram_gb: c.ram_gb ?? null, gpu: c.gpu ?? null, storage_free_gb: c.storage_free_gb ?? null, max_project_install_gb: c.max_project_install_gb ?? null, internet: c.internet ?? null },
    budget: null, route: state.route, base_project_id: state.baseId };
}
function planSteps() {
  const c = state.constraints || {}, top = baseOf(), feats = splitList(state.featuresText);
  const featText = feats.length ? feats.join(', ') : 'none stated yet';
  const limit = c.max_project_install_gb != null ? `Stay under ${c.max_project_install_gb} GB.` : 'No size limit given.';
  const dev = `Your device: ${deviceSummary(state.constraints)}.`;
  const accept = ['Acceptance check', `Done only when: ${featText} each work on your device (${deviceSummary(state.constraints)}); ${limit.toLowerCase()} the license is reviewed; and you approve the result. Untested items stay unverified.`];
  if (!state.route) return [['Choose a route', 'Pick Find, Extend or Create in the Alternatives tab or the chat.']];
  if (state.route !== 'create' && !top) return [['Choose a base project', 'Your previous base is no longer valid. Pick one in Alternatives, or choose Create.']];
  if (state.route === 'find' && top) return [
    [`Review ${top.project.name}`, `Read the declared license (${top.project.license}) and notes. Status: ${friendly(top.project.verification_status)}.`],
    ['Check device fit', `Hardware needs are unverified in the catalog. ${dev}`],
    ['Install from the official source', `${top.project.official_url} — avoid third-party mirrors. ${limit}`],
    ['Try your features', featText], accept];
  const gaps = [...(top?.unknown_features || []).map(featLabel), ...extraUnknowns()];
  if (state.route === 'extend' && top) return [
    [`Start from ${top.project.name}`, `Original add-on built on ${top.project.source_repository}. Goal in your words: “${state.target}”.`],
    ['Features to add or verify', gaps.length ? `${gaps.join(', ')} — not evidenced in the catalog for ${top.project.name}; verify before building, they may already exist.` : 'All recognized features have catalog evidence; confirm any other wishes.'],
    ['Find extension points', 'Check the project’s plugin/mod documentation before writing code.'],
    ['Prototype within limits', `${dev} ${limit}`],
    ['License check', `Your add-on must respect ${top.project.license}; assets need separate review.`], accept];
  if (state.category === 'website') return [
    ['Define the site', `Goal: “${state.target}”. Purpose: “${state.purpose || 'not stated'}”.`],
    ['Pages & sections', feats.length ? featText : 'Home, About, Contact (suggestion — confirm or change).'],
    ['Build original static pages', `Plain HTML/CSS, no paid services. ${c.internet === 'offline' ? 'Editable fully offline; no external fonts or CDNs.' : 'Keep dependencies minimal.'} ${limit}`],
    ['Content & assets', 'Use your own text and images, or assets whose licenses you have checked.'],
    ['Publish later', 'Pick a free static host when ready. Nothing is published by this demo.'], accept];
  return [
    ['Original scope', `“${state.target}” — for: ${state.purpose || 'not stated'}.`],
    ['Core features', featText + (extraUnknowns().length ? ` (unverified: ${extraUnknowns().map(featLabel).join(', ')})` : '')],
    ['Fit your device', `${dev} ${limit}`],
    ['Proposal status', `This is a proposal for a ${catLabel().toLowerCase()} project. The scripted demo generates no code or assets.`], accept];
}
function plan() {
  if (state.agentPlan) return { source: 'live_agent', ...state.agentPlan };
  const top = state.route === 'create' ? null : baseOf();
  return { contract_version: CONTRACT, source: 'scripted_demo', status: 'proposal', route: state.route, base_project_id: top?.project.id ?? null,
    steps: planSteps().map(([title, detail], i) => ({ id: `s${i + 1}`, title, detail, status: 'proposed' })),
    gaps: [...(top?.unknown_features || []), ...state.proposedIds], custom_features: state.customFeatures,
    unverified: ['hardware fit', 'install/project size', 'offline use', 'runtime behavior'], legal_notes: ['Declared license only; review before redistribution.'],
    review: { requires_user_approval: true, approved: false }, brief: brief() };
}
function download(name, obj, type = 'application/json') {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- workspace rendering ----------
const srcLabel = s => (s === 'live' ? 'From the selected agent’s response' : 'Scripted demo — assembled from your answers, no AI');
function renderAll() { renderBrief(); renderAlternatives(); renderPlan(); renderPreview(); }

function renderBrief() {
  const f = (k, v) => el('div', { class: 'brief-field' }, el('span', { text: k }), el('strong', { text: v || 'Not provided yet' }));
  const b = state.agentBrief;
  if (state.provenance.brief === 'live' && b) return put($('panel-brief'),
    el('h3', { text: 'Project brief' }),
    f('Your request', b.request), f('Replaces', b.replaces || 'No paid product named'),
    f('Best free option', b.best_option || 'None fits well yet'), f('Covers', b.covers), f('Gaps to fill', (b.gaps || []).join(', ') || (b.best_option ? 'None found' : '')),
    f('Route', state.route && ROUTES[state.route][0]), f('Starting from', state.route === 'create' ? 'An original tool of your own' : baseOf()?.project.name || b.best_option),
    el('p', { class: 'note', text: 'From the RVAI backend’s answer to your latest message.' }),
    el('button', { type: 'button', class: 'small-button', text: 'Download brief (JSON)', onclick: () => download('rvai-brief.json', b) }));
  put($('panel-brief'),
    el('h3', { text: 'Project brief' }),
    f('Goal (your words)', state.target), f('Category', state.target ? catLabel() : ''), f('Purpose', state.purpose),
    f('Features (your words)', state.featuresText), f('Recognized features', state.featureIds.map(featLabel).join(', ')),
    f('Other features (unverified)', extraUnknowns().map(featLabel).join(', ')),
    f('Device & limits', state.constraints && deviceSummary(state.constraints)), f('Route', state.route && ROUTES[state.route][0]),
    f('Base project', state.route === 'create' ? 'None — original work' : baseOf()?.project.name),
    el('p', { class: 'note', text: 'Scripted demo — assembled from your answers, no AI.' }),
    state.agentBrief ? [el('h3', { text: 'Revised brief from selected agent' }), el('pre', { class: 'code-view', text: JSON.stringify(state.agentBrief, null, 2) })] : null,
    el('button', { type: 'button', class: 'small-button', text: 'Download brief (JSON)', onclick: () => download('revai-brief.json', { ...brief(), agent_brief: state.agentBrief,
      artifact: state.artifact && { filename: state.artifact.filename, bytes: state.artifact.bytes, generated_by: state.artifact.generated_by, source: state.artifact.source, created_at: state.artifact.created_at } }) }));
}

function fitLines(m) {
  const c = state.constraints, a = m.project;
  if (!c) return [];
  const out = [];
  if (c.platform) out.push((a.supported_platforms || []).includes(c.platform) ? [true, `Lists ${label(OS, c.platform)} support`, a.platform_source_url] : [false, `${label(OS, c.platform)} not listed`]);
  else out.push([false, 'OS unknown — needs verification']);
  out.push([false, `Hardware fit unverified (no catalog RAM/GPU minimum)${c.ram_gb != null ? ` for your ${c.ram_gb} GB RAM` : ''}`]);
  if (c.max_project_install_gb != null) out.push([false, `Install size not in catalog — check against your ${c.max_project_install_gb} GB limit`]);
  if (c.internet === 'offline' || c.internet === 'limited') out.push([false, 'Offline use unverified — important for your connection']);
  return out;
}
function altCard(m) {
  const a = m.project, sup = m.supported_features || [], unk = [...(m.unknown_features || []), ...(catalogView ? [] : extraUnknowns())];
  const chosen = !catalogView && state.baseId === a.id && state.route !== 'create';
  return el('article', { class: chosen ? 'project-card chosen' : 'project-card' },
    el('h3', {}, a.name, a.alternative_to ? el('span', { class: 'alt-of', text: ` (alternative to ${a.alternative_to})` }) : null),
    el('div', { class: 'tags' }, [chosen ? `Selected base · ${ROUTES[state.route][0]}` : null, a.license || 'license not declared', a.pricing_type && friendly(a.pricing_type), a.verification_status && friendly(a.verification_status), m.compatibility_status && friendly(m.compatibility_status)].filter(Boolean).map(t => el('span', { class: 'tag', text: t }))),
    (a.features || []).map(f => el('div', { class: 'feature-line' }, `${sup.includes(f) ? '✓ Requested · ' : '• '}${featLabel(f)} — `, link(a.feature_evidence?.[f], 'evidence'))),
    unk.map(f => el('div', { class: 'feature-line unknown', text: `? Not evidenced in catalog (unverified): ${featLabel(f)}` })),
    (m.summary_lines || []).filter(isStr).map(t => el('div', { class: `feature-line${/^(Missing|Partial)/.test(t) ? ' unknown' : ''}`, text: t })),
    catalogView || state.provenance.discovery !== 'scripted_demo' ? null : el('div', { class: 'message-actions' },
      el('button', { type: 'button', class: `small-button${chosen && state.route === 'find' ? ' primary' : ''}`, 'aria-pressed': String(chosen && state.route === 'find'), text: 'Use this project', onclick: () => chooseRoute('find', a.id) }),
      el('button', { type: 'button', class: `small-button${chosen && state.route === 'extend' ? ' primary' : ''}`, 'aria-pressed': String(chosen && state.route === 'extend'), text: 'Extend this project', onclick: () => chooseRoute('extend', a.id) })),
    catalogView ? null : fitLines(m).map(([ok, t, src]) => el('div', { class: `feature-line${ok ? '' : ' unknown'}` }, `${ok ? '✓' : '?'} ${t}`, src ? [' — ', link(src, 'source')] : null)),
    el('div', { class: 'source-links' }, link(a.official_url, 'Official site'), link(a.source_repository, 'Source code'), link(a.license_source_url, 'License')),
    el('details', {}, el('summary', { text: `Unknowns & notes${a.last_verified ? ` · last verified ${a.last_verified}` : ''}` }),
      a.unknowns?.length ? el('p', { text: `Unknown: ${a.unknowns.map(words).join(', ')}` }) : null,
      (m.warnings || a.notes || []).filter(isStr).map(n => el('p', { text: n }))));
}
function renderAlternatives() {
  const p = $('panel-alternatives'), d = state.discovery;
  if (catalogView) return put(p, el('h3', { text: `Reviewed picks · ${catalog.length}` }),
    el('p', { text: 'Hand-checked against their sources.' }),
    el('a', { class: 'small-button primary', href: '#alternatives', text: `See all ${$('catalog-size').textContent} in Find software →` }),
    catalog.map(a => altCard({ project: a, warnings: a.notes })));
  if (!d) return put(p, el('h3', { text: 'Alternatives' }), el('p', { class: 'note', text: 'Answer the questions in the chat and I’ll search the curated catalog here.' }));
  const name = projName;
  put(p,
    el('h3', { text: `${isStr(d.title) ? d.title : catLabel()} · ${d.recommendations.length ? `${d.recommendations.length} option${d.recommendations.length === 1 ? '' : 's'}` : friendly('no_match')}` }),
    el('p', { class: 'note', text: srcLabel(state.provenance.discovery) }),
    el('div', { class: 'route-cards' }, Object.entries(ROUTES).map(([r, [t, desc]]) =>
      el('button', { type: 'button', class: `route-card${state.route === r ? ' selected' : ''}`, 'aria-pressed': String(state.route === r), disabled: r !== 'create' && !d.recommendations.length, onclick: () => chooseRoute(r) }, el('b', { text: t }), el('span', { text: desc })))),
    d.recommendations.length ? d.recommendations.map(altCard) : el('p', { class: 'note', text: state.category === 'website' ? 'This curated catalog has no website-builder entries yet.' : 'We don’t know of a verified option in this curated catalog for these constraints.' }),
    d.excluded?.length ? [el('h3', { text: 'Excluded' }), el('ul', {}, d.excluded.map(x => el('li', { text: `${name(x.id)} — ${(x.reasons || []).map(r => REASONS[r] || words(r)).join(', ')}` })))] : null,
    d.limitations?.length ? [el('h3', { text: 'Limitations' }), el('ul', {}, d.limitations.filter(isStr).map(l => el('li', { text: l })))] : null);
}
function renderPlan() {
  const steps = state.agentPlan ? state.agentPlan.steps.map(s => [s.title, isStr(s.detail) ? s.detail : (s.status ? `Status: ${s.status}` : '')]) : state.target ? planSteps() : [];
  put($('panel-plan'),
    el('h3', { text: state.route ? `Plan · ${ROUTES[state.route][0]}` : 'Plan' }),
    el('p', { class: 'note', text: `${srcLabel(state.provenance.plan)}. Proposal only — nothing is built, installed or tested.` }),
    steps.length ? steps.map(([t, d], i) => el('div', { class: 'plan-step' }, el('span', { text: String(i + 1).padStart(2, '0') }), el('p', {}, el('b', { text: t }), d)))
      : el('p', { class: 'note', text: 'Your plan appears here as you answer.' }),
    steps.length ? el('button', { type: 'button', class: 'small-button', text: 'Download plan (JSON)', onclick: () => download('revai-plan.json', plan()) }) : null,
    canTemplate() ? el('button', { type: 'button', class: 'small-button primary', text: 'Create demo website template', onclick: makeTemplate }) : null);
}
const canTemplate = () => !state.agentPlan && state.category === 'website' && state.route === 'create' && state.step === 'done';
function renderPreview() {
  const p = $('panel-preview'), a = state.artifact;
  // Stale guard: an artifact only renders if it was made from the current brief.
  if (a && a.briefKey !== JSON.stringify(templateBrief())) state.artifact = null;
  if (state.artifact) return put(p,
    el('h3', { text: 'Template preview — not AI-generated' }),
    el('p', { class: 'note', text: `Static template filled from your brief by local code. ${a.bytes.toLocaleString()} bytes of HTML source (source size only, not an audited install size). Scripts are blocked in the preview and the page loads no remote resources.` }),
    el('iframe', { class: 'artifact-frame', sandbox: true, referrerpolicy: 'no-referrer', title: 'Website template preview (sandboxed, no scripts)', srcdoc: a.html }),
    el('button', { type: 'button', class: 'small-button primary', text: `Download ${a.filename}`, onclick: () => download(a.filename, a.html, 'text/html') }),
    el('ul', {}, a.limitations.map(l => el('li', { text: l }))),
    el('details', {}, el('summary', { text: 'View HTML source' }), el('pre', { class: 'code-view', text: a.html })));
  if (state.artifactError) return put(p, el('h3', { text: 'Preview' }), el('p', { class: 'note error-text', text: `No template was produced: ${state.artifactError}` }));
  put(p, el('h3', { text: 'Preview' }),
    el('p', { class: 'note', text: canTemplate()
      ? 'Review the plan, then create the demo website template. Nothing is made until you press the button.'
      : state.route === 'create' && state.category !== 'website'
        ? (state.provenance.plan === 'live' ? 'The plan is in the Plan tab. RVAI doesn’t generate the app itself yet; follow the steps and clean-room rules there.' : 'No artifact. The scripted demo does not generate apps, games or CAD tools; turn on the connected agent for an AI plan.')
        : 'No artifact yet. Only the original website plan can produce a local demo template; other builds need the connected agent.' }),
    canTemplate() ? el('button', { type: 'button', class: 'small-button primary', text: 'Create demo website template', onclick: makeTemplate }) : null);
}

// ---------- workspace / nav ----------
function showTab(name) {
  document.querySelectorAll('.workspace-tabs [role=tab]').forEach(t => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`panel-${t.dataset.tab}`).hidden = !on;
  });
}
// After a reply the workspace opens by itself only where it sits beside the chat; on a phone it would cover the
// answer, so it just switches to the right tab for when the person opens it.
function autoOpenWorkspace(tab) {
  if (window.matchMedia('(min-width: 901px)').matches) return openWorkspace(tab);
  showTab(tab);
}
function openWorkspace(tab) {
  document.querySelector('.work-area').classList.add('workspace-open');
  $('workspace-toggle').setAttribute('aria-expanded', 'true');
  if (tab) showTab(tab);
}
function closeWorkspace() {
  document.querySelector('.work-area').classList.remove('workspace-open');
  $('workspace-toggle').setAttribute('aria-expanded', 'false');
}
function setNav(catalogOn) {
  catalogView = catalogOn;
  $('catalog-nav').classList.toggle('active', catalogOn);
  $('chat-nav').classList.toggle('active', !catalogOn);
  $('workspace-title').textContent = catalogOn ? 'Explore the catalog.' : 'Your idea, taking shape.';
  renderAlternatives();
}
function resetProject() {
  if (busy) return;
  state = fresh();
  put($('messages'));
  $('welcome').classList.remove('hidden');
  $('message-input').value = '';
  $('project-title').textContent = 'New project';
  setQuick([]);
  setNav(false);
  renderAll();
  closeWorkspace();
  showTab('brief');
  $('message-input').focus();
}
function updateMode() {
  if (!liveMode()) agentStatus = 'off';
  else if (agentStatus === 'off') agentStatus = 'selected';
  const text = { off: ' Scripted demo', selected: ' Agent selected · unverified', ok: ' Agent responded', failed: ' Agent selected · last request failed' }[agentStatus];
  put($('mode-badge'), el('i'), text);
  $('demo-note').textContent = liveMode() ? 'Messages go to the endpoint you entered; replies are labeled with their source.' : 'Scripted demo · no AI model or backend connected.';
}

$('chat-form').addEventListener('submit', e => { e.preventDefault(); send($('message-input').value); });
$('message-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy && dataLoaded) $('chat-form').requestSubmit(); }
});
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {
  if (busy || !dataLoaded) return;
  if (state.step !== 'target') resetProject();
  document.querySelector('.sidebar').classList.remove('open');
  send(EXAMPLES[b.dataset.example] || b.textContent);
}));
$('new-chat').addEventListener('click', resetProject);
$('chat-nav').addEventListener('click', () => { setNav(false); if (state.discovery) openWorkspace('alternatives'); else closeWorkspace(); });
// The full catalog lives on the Find software page (search, filters, every entry), so the sidebar link goes there.
$('catalog-nav').addEventListener('click', () => { location.hash = '#alternatives'; });
$('workspace-toggle').addEventListener('click', () => (document.querySelector('.work-area').classList.contains('workspace-open') ? closeWorkspace() : openWorkspace()));
$('workspace-close').addEventListener('click', closeWorkspace);
$('menu-toggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelectorAll('.workspace-tabs [role=tab]').forEach((t, i, all) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { const next = all[(i + d + all.length) % all.length]; showTab(next.dataset.tab); next.focus(); }
  });
});
$('live-mode').addEventListener('change', () => { store.set('revai.live', $('live-mode').checked ? '1' : '0'); agentStatus = 'off'; updateMode(); });
// Served by the RVAI backend (npm run web, or Vercel)? Then use the connected agent by default, unless the
// person switched it off before. GET /api/health only exists on that backend.
async function detectBackend() {
  if (store.get('revai.live') === '0') return;
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (!r.ok || !(await r.json())?.ok) return;
    if (!$('api-url').value.trim()) $('api-url').value = '/api/recommend';
    $('live-mode').checked = true;
    agentStatus = 'selected';
    updateMode();
  } catch { /* static hosting: stay on the scripted demo */ }
}
$('api-url').value = store.get('revai.apiUrl') || '/api/recommend';
$('api-url').addEventListener('change', () => { store.set('revai.apiUrl', $('api-url').value.trim()); if (liveMode()) { agentStatus = 'selected'; updateMode(); } });

async function loadData() {
  try {
    const get = async f => { const r = await fetch(DATA_BASE + f); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); };
    const [tax, alts] = await Promise.all([get('taxonomy.json'), get('alternatives.json')]);
    if (!Array.isArray(tax?.categories) || !Array.isArray(alts)) throw new Error('catalog files have an unexpected shape');
    taxonomy = tax; catalog = alts;
    // Same count as the Alternatives page: reviewed entries plus the backend's seed catalog (deduplicated by site).
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
    const seed = await get('catalog.json').catch(() => null);
    // Tag each reviewed entry with the paid products it replaces, so cards read "Luanti (alternative to Minecraft)".
    const REPLACES = { voxel_game: ['Minecraft'], cad: ['Autodesk AutoCAD', 'Fusion 360'], video_editor: ['Adobe Premiere Pro'] };
    for (const a of alts) {
      const names = (seed?.products || []).filter(p => p.alternatives.some(x => host(x.url) === host(a.official_url))).map(p => p.name);
      const all = [...new Set([...names, ...(REPLACES[a.category] || [])])];
      if (all.length) a.alternative_to = all.join(' / ');
    }
    const sites = new Set([...alts.map(a => host(a.official_url)), ...(seed?.products || []).flatMap(p => p.alternatives.map(a => host(a.url)))]);
    $('catalog-size').textContent = String(sites.size);
  } catch (e) {
    dataError = e.message;
    $('catalog-size').textContent = '!';
    bot(`Catalog failed to load (${dataError}). The scripted demo can’t search until this is fixed — serve the repository root over HTTP and open /ui/. A selected agent can still be used.`, { tag: 'Catalog error', error: true, log: false });
  } finally { dataLoaded = true; updateControls(); }
}
updateMode();
showTab('brief');
renderAll();
updateControls();
loadData().then(renderAll);
detectBackend();
