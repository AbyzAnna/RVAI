// Rebuild page: name an app -> research agents -> pick features and mods -> model + system -> one downloadable file.
import { ARCH_OPTIONS, FORMAT_OPTIONS, OS_OPTIONS, buildBody, detectSystem, displayTitle, downloadSpec } from './rebuild-core.js';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(k => k != null)); return n; };

const RESEARCH_AGENTS = [
  ['product-profiler', 'Product Profiler', 'Official name, site, category and audience'],
  ['feature-mapper', 'Feature Mapper', 'User-visible features, core ones marked'],
  ['stack-detective', 'Stack Detective', 'Likely tech stack from public signals'],
  ['link-checker', 'Link Checker', 'Confirms the official site is real and loads'],
];
const BUILD_AGENTS = [
  ['namer', 'Namer', 'Picks an original name'],
  ['app-builder', 'App Builder', 'Writes the whole app in one file'],
  ['file-checker', 'File Checker', 'Complete, self-contained, no piracy'],
];
const EXAMPLES = ['Notion', 'Minecraft', 'Trello', 'Duolingo', 'Photoshop', 'Spotify'];
const STATUS = { waiting: 'Waiting', working: 'Working', ok: 'Done', fallback: 'Used backup', failed: 'Failed', blocked: 'Blocked' };

const state = { profile: null, selected: new Set(), custom: [], model: '', os: 'macos', arch: 'unknown', format: 'html', notes: '' };

function agentCards(container, agents) {
  container.replaceChildren(...agents.map(([id, name, role]) => el('div', { className: 'agent', id: `agent-${id}` }, el('b', { textContent: name }), el('p', { textContent: role }), el('span', { className: 'st', textContent: STATUS.waiting }))));
}
function setAgent(id, st, detail) {
  const card = $(`agent-${id}`); if (!card) return;
  card.dataset.st = st;
  card.querySelector('.st').textContent = STATUS[st] + (detail ? ` · ${detail}` : '');
}
const secs = ms => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- step 1: research ----------
$('examples').replaceChildren(...EXAMPLES.map(name => el('button', { type: 'button', className: 'chip', textContent: name, onclick: () => { $('app-name').value = name; $('search-form').requestSubmit(); } })));

$('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('app-name').value.trim(); if (!name) return;
  $('search-err').textContent = '';
  ['step-profile', 'step-features', 'step-setup', 'step-build', 'step-result'].forEach(id => { $(id).hidden = true; });
  $('step-agents').hidden = false; $('agents-sub').textContent = `Researching “${name}” from public sources, side by side.`;
  agentCards($('agents'), RESEARCH_AGENTS);
  RESEARCH_AGENTS.slice(0, 3).forEach(([id]) => setAgent(id, 'working'));
  $('research-btn').disabled = true;
  try {
    const { result, trace } = await post('/api/rebuild/research', { name });
    for (const t of trace || []) setAgent(t.step, t.status, secs(t.ms));
    if (result.status === 'refused') { RESEARCH_AGENTS.forEach(([id]) => setAgent(id, 'blocked')); $('search-err').textContent = result.message; return; }
    if (result.source === 'fallback') RESEARCH_AGENTS.forEach(([id]) => setAgent(id, 'fallback', 'no AI key'));
    showProfile(result);
  } catch (err) {
    RESEARCH_AGENTS.forEach(([id]) => $(`agent-${id}`).dataset.st === 'working' && setAgent(id, 'failed'));
    $('search-err').textContent = `Research failed: ${err.message}`;
  } finally { $('research-btn').disabled = false; }
});

function showProfile(p) {
  state.profile = p; state.selected = new Set(p.features.filter(f => f.core).map(f => f.id)); state.custom = [];
  const stack = p.stack.likely.length
    ? el('div', {}, el('p', { className: 'q', innerHTML: '' }, el('span', { textContent: `Likely tech stack · ${p.stack.confidence} confidence` })),
        el('div', { className: 'rb-chips' }, ...p.stack.likely.map(s => el('span', { className: 'chip', textContent: s }))),
        p.stack.signals.length ? el('details', { className: 'fine', style: 'margin-top:10px' }, el('summary', { textContent: 'Why we think so' }), el('ul', {}, ...p.stack.signals.map(s => el('li', { textContent: `${s.signal}: ${s.inference}` })))) : null)
    : null;
  $('step-profile').replaceChildren(
    el('div', { className: 'profile-head' }, el('div', { style: 'flex:1;min-width:240px' },
      el('span', { className: 'eyebrow', textContent: 'WHAT WE FOUND' }), el('h3', { textContent: p.officialName }),
      el('div', { className: 'rb-chips' }, el('span', { className: 'chip', textContent: p.category }),
        p.officialUrl ? el('a', { className: 'chip ok', href: p.officialUrl, target: '_blank', rel: 'noopener noreferrer', textContent: `✓ ${new URL(p.officialUrl).hostname}` }) : el('span', { className: 'chip warn', textContent: 'Official site not confirmed' }),
        el('span', { className: 'chip', textContent: `${p.features.length} features` })),
      el('p', { className: 'lead', style: 'margin:12px 0 0;font-size:15px', textContent: p.summary }))),
    stack, el('p', { className: 'fine', textContent: p.notice }));
  $('step-profile').hidden = false;
  renderFeatures(); renderSetup();
  $('step-features').hidden = false; $('step-setup').hidden = false;
  $('step-profile').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- step 2: features and mods ----------
function renderFeatures() {
  $('features').replaceChildren(...state.profile.features.map(f => {
    const box = el('input', { type: 'checkbox', checked: state.selected.has(f.id), onchange: () => { box.checked ? state.selected.add(f.id) : state.selected.delete(f.id); } });
    return el('label', { className: 'feat' }, box, el('span', {}, el('b', {}, f.label, f.core ? el('span', { className: 'tag', textContent: 'core' }) : null), el('small', { textContent: f.description })));
  }));
  renderMods();
}
function renderMods() {
  $('mods').replaceChildren(...state.custom.map((m, i) => el('button', { type: 'button', className: 'chip ok', title: 'Remove', textContent: `＋ ${m}  ✕`, onclick: () => { state.custom.splice(i, 1); renderMods(); } })));
}
$('mod-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('mod-input').value.trim();
  if (v && !state.custom.includes(v) && state.custom.length < 5) { state.custom.push(v); renderMods(); }
  $('mod-input').value = '';
});

// ---------- step 3: model and system ----------
function radios(container, name, options, current, onPick) {
  container.replaceChildren(...options.map(o => {
    const input = el('input', { type: 'radio', name, value: o.id, checked: o.id === current, onchange: () => onPick(o.id) });
    return el('label', { className: 'opt' }, input, el('b', { textContent: o.label }), o.note ? el('small', { textContent: o.note }) : null);
  }));
}
let models = [];
async function loadModels() {
  try { models = (await (await fetch('/api/rebuild/models')).json()).models; } catch { models = [{ id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', note: 'Recommended' }]; }
  state.model = state.model || models[0].id;
}
function webglRenderer() {
  try { const gl = document.createElement('canvas').getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; }
}
async function detect() {
  let uaData = navigator.userAgentData || null;
  try { if (uaData?.getHighEntropyValues) uaData = { platform: uaData.platform, ...(await uaData.getHighEntropyValues(['architecture'])) }; } catch {}
  Object.assign(state, detectSystem(navigator.userAgent, uaData, webglRenderer()));
}
function renderSetup() {
  radios($('models'), 'model', models, state.model, v => { state.model = v; });
  radios($('os'), 'os', OS_OPTIONS, state.os, v => { state.os = v; });
  radios($('arch'), 'arch', ARCH_OPTIONS, state.arch, v => { state.arch = v; });
  radios($('format'), 'format', FORMAT_OPTIONS.map(f => ({ ...f, label: `${f.label} (${f.file})` })), state.format, v => { state.format = v; });
  $('detected').textContent = `auto-detected: ${OS_OPTIONS.find(o => o.id === state.os)?.label}${state.arch !== 'unknown' ? `, ${state.arch}` : ''}`;
}

// ---------- step 4: build and download ----------
$('build-btn').addEventListener('click', async () => {
  state.notes = $('notes').value;
  const body = buildBody(state.profile, state);
  $('build-err').textContent = '';
  if (!body.features.length) { $('build-err').textContent = 'Pick at least one feature or add a mod.'; return; }
  $('step-result').hidden = true; $('step-build').hidden = false;
  const modelLabel = models.find(m => m.id === state.model)?.label || state.model;
  const started = Date.now(), sub = `${modelLabel} is writing one original file with ${body.features.length} features. This can take a few minutes.`;
  $('build-sub').textContent = sub;
  const timer = setInterval(() => { $('build-sub').textContent = `${sub} ${Math.round((Date.now() - started) / 1000)}s so far.`; }, 1000);
  agentCards($('build-agents'), BUILD_AGENTS); setAgent('namer', 'working');
  setTimeout(() => { if ($('agent-namer').dataset.st === 'working') { setAgent('namer', 'ok'); setAgent('app-builder', 'working'); } }, 2500);
  $('step-build').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('build-btn').disabled = true;
  try {
    const { result, trace } = await post('/api/rebuild/build', body);
    for (const t of trace || []) setAgent(t.step, t.status, secs(t.ms));
    if (result.status === 'refused') { $('build-err').textContent = result.message; return; }
    setAgent('file-checker', 'ok', result.source === 'ai' ? 'passed' : 'template');
    showResult(result);
  } catch (err) {
    setAgent('app-builder', 'failed'); $('build-err').textContent = `Build failed: ${err.message}`;
  } finally { clearInterval(timer); $('build-btn').disabled = false; }
});

// The preview runs without same-origin access, where localStorage throws; give it an in-memory one.
const STORAGE_SHIM = '<script>try{window.localStorage.getItem("x")}catch(e){const m=new Map();Object.defineProperty(window,"localStorage",{value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}})}<\/script>';
const previewDoc = html => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + STORAGE_SHIM) : STORAGE_SHIM + html;

let lastUrl = null;
function showResult(file) {
  const spec = downloadSpec(file);
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(new Blob([spec.text], { type: spec.type }));
  const ext = file.format === 'html' ? 'HTML' : 'PY';
  $('file-card').replaceChildren(
    el('div', { style: 'display:flex;gap:14px;align-items:center' }, el('span', { className: 'file-icon', textContent: ext }),
      el('div', {}, el('span', { className: 'eyebrow', textContent: 'ONE FILE · READY TO RUN' }), el('h3', { textContent: file.displayTitle || displayTitle(file.appName, state.profile.officialName, file.mods || []) }))),
    el('div', { className: 'rb-chips' }, el('span', { className: 'chip', textContent: file.filename }), el('span', { className: 'chip', textContent: `${(file.bytes / 1024).toFixed(1)} KB` }),
      el('span', { className: file.source === 'ai' ? 'chip ok' : 'chip warn', textContent: file.source === 'ai' ? `Built by ${models.find(m => m.id === file.model)?.label || file.model}` : 'Offline starter template' })),
    el('a', { className: 'btn-primary btn-accent dl', href: lastUrl, download: spec.name, textContent: `⬇ Download ${file.filename}` }),
    el('b', { textContent: 'How to open it' }), el('ol', {}, ...file.instructions.map(s => el('li', { textContent: s }))));
  if (file.format === 'html') {
    $('preview').replaceChildren(el('div', { className: 'bar', textContent: 'Live preview · runs sandboxed in this page' }), el('iframe', { title: 'Preview of your app', sandbox: 'allow-scripts allow-modals allow-forms', srcdoc: previewDoc(file.content) }));
  } else {
    $('preview').replaceChildren(el('div', { className: 'bar', textContent: `${file.filename} · Python source` }), el('pre', { textContent: file.content }));
  }
  $('step-result').hidden = false;
  $('step-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

await Promise.all([loadModels(), detect()]);
const q = new URLSearchParams(location.search).get('app');
if (q) { $('app-name').value = q.slice(0, 80); $('search-form').requestSubmit(); }
