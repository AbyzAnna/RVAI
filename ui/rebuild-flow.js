// The Rebuild flow as a component: name an app -> research agents -> features and mods -> model + system -> one file.
// mountRebuild(root, { app }) draws it inside `root`; rebuild.html mounts it full page, the Build with AI chat inline.
import { ARCH_OPTIONS, FORMAT_OPTIONS, OS_OPTIONS, buildBody, detectSystem, displayTitle, downloadSpec } from './rebuild-core.js';

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
const secs = ms => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

// The preview runs without same-origin access, where localStorage throws; give it an in-memory one.
const STORAGE_SHIM = '<script>try{window.localStorage.getItem("x")}catch(e){const m=new Map();Object.defineProperty(window,"localStorage",{value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}})}<\/script>';
const previewDoc = html => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + STORAGE_SHIM) : STORAGE_SHIM + html;

const TEMPLATE = `
<section class="rb-card" data-part="step-search"><h2><span class="rb-step">1</span>Which app or website?</h2><p class="rb-sub">Type its name. Agents research its official site, docs and reviews in parallel.</p>
<form class="rb-search" data-part="search-form"><label class="sr-only">App or website name<input data-part="app-name" maxlength="80" placeholder="e.g. Notion, Minecraft, Trello, Duolingo" autocomplete="off" required></label><button class="btn-primary btn-accent big" data-part="research-btn">Research it</button></form>
<div class="rb-chips" data-part="examples"></div><p class="err" data-part="search-err" role="alert"></p></section>
<section class="rb-card" data-part="step-agents" hidden><h2>Agents at work</h2><p class="rb-sub" data-part="agents-sub">Running side by side.</p><div class="agents" data-part="agents"></div></section>
<section class="rb-card" data-part="step-profile" hidden></section>
<section class="rb-card" data-part="step-features" hidden><h2><span class="rb-step">2</span>Which features do you want?</h2><p class="rb-sub">Core features are ticked. Add your own ideas as mods.</p><div class="feat-grid" data-part="features"></div>
<form class="mod-row" data-part="mod-form"><label class="sr-only">Add a mod<input data-part="mod-input" maxlength="80" placeholder="Add a mod: e.g. Pomodoro timer, co-op on LAN, low-spec mode"></label><button class="btn-secondary">Add mod</button></form><div class="rb-chips" data-part="mods"></div></section>
<section class="rb-card" data-part="step-setup" hidden><h2><span class="rb-step">3</span>A few questions</h2><p class="rb-sub">So the file runs on your computer.</p>
<div class="q"><span>Which AI model should build it?</span><div class="opt-grid" data-part="models"></div></div>
<div class="q"><span>Your system <em class="chip ok" data-part="detected">auto-detected</em></span><div class="opt-grid" data-part="os"></div></div>
<div class="q"><span>Processor</span><div class="opt-grid" data-part="arch"></div></div>
<div class="q"><span>What kind of file?</span><div class="opt-grid" data-part="format"></div></div>
<div class="q"><label><span>Anything else? (optional)</span><textarea class="notes" data-part="notes" maxlength="500" placeholder="Look and feel, colors, who it is for…"></textarea></label></div>
<p style="margin-top:18px"><button class="btn-primary btn-accent big" data-part="build-btn" type="button">Build my file</button></p><p class="err" data-part="build-err" role="alert"></p></section>
<section class="rb-card" data-part="step-build" hidden><h2>Building</h2><p class="rb-sub" data-part="build-sub"></p><div class="agents" data-part="build-agents"></div></section>
<section class="rb-card" data-part="step-result" hidden><h2><span class="rb-step">4</span>Your file is ready</h2><div class="result"><div class="file-card" data-part="file-card"></div><div class="preview" data-part="preview"></div></div></section>`;

let models = null, system = null, mounts = 0;
async function loadModels() {
  if (models) return models;
  try { models = (await (await fetch('/api/rebuild/models')).json()).models; } catch { /* offline */ }
  if (!Array.isArray(models) || !models.length) models = [{ id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', note: 'Recommended' }];
  return models;
}
function webglRenderer() {
  try { const gl = document.createElement('canvas').getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; }
}
async function detect() {
  if (system) return system;
  let uaData = navigator.userAgentData || null;
  try { if (uaData?.getHighEntropyValues) uaData = { platform: uaData.platform, ...(await uaData.getHighEntropyValues(['architecture'])) }; } catch { /* not exposed */ }
  return (system = detectSystem(navigator.userAgent, uaData, webglRenderer()));
}
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Draws the flow in `root`. With `app`, research starts right away. `onFile(file)` is told when a file is ready. */
export async function mountRebuild(root, { app = '', onFile } = {}) {
  const id = ++mounts;
  root.classList.add('rb-flow');
  root.innerHTML = TEMPLATE;
  const $ = part => root.querySelector(`[data-part="${part}"]`);
  const state = { profile: null, selected: new Set(), custom: [], model: '', os: 'macos', arch: 'unknown', format: 'html', notes: '' };
  const scrollTo = part => $(part).scrollIntoView({ behavior: 'smooth', block: 'start' });

  function agentCards(container, agents) {
    container.replaceChildren(...agents.map(([aid, name, role]) => el('div', { className: 'agent' }, el('b', { textContent: name }), el('p', { textContent: role }), el('span', { className: 'st', textContent: STATUS.waiting }))));
    agents.forEach(([aid], i) => { container.children[i].dataset.agent = aid; });
  }
  function setAgent(aid, st, detail) {
    const card = root.querySelector(`[data-agent="${aid}"]`); if (!card) return;
    card.dataset.st = st;
    card.querySelector('.st').textContent = STATUS[st] + (detail ? ` · ${detail}` : '');
  }

  // ---------- step 1: research ----------
  $('examples').replaceChildren(...EXAMPLES.map(name => el('button', { type: 'button', className: 'chip', textContent: name, onclick: () => { $('app-name').value = name; $('search-form').requestSubmit(); } })));
  $('search-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('app-name').value.trim(); if (!name) return;
    $('search-err').textContent = '';
    ['step-profile', 'step-features', 'step-setup', 'step-build', 'step-result'].forEach(p => { $(p).hidden = true; });
    $('step-agents').hidden = false; $('agents-sub').textContent = `Researching “${name}” from public sources, side by side.`;
    agentCards($('agents'), RESEARCH_AGENTS);
    RESEARCH_AGENTS.slice(0, 3).forEach(([aid]) => setAgent(aid, 'working'));
    $('research-btn').disabled = true;
    try {
      const { result, trace } = await post('/api/rebuild/research', { name });
      for (const t of trace || []) setAgent(t.step, t.status, secs(t.ms));
      if (result.status === 'refused') { RESEARCH_AGENTS.forEach(([aid]) => setAgent(aid, 'blocked')); $('search-err').textContent = result.message; return; }
      if (result.source === 'fallback') RESEARCH_AGENTS.forEach(([aid]) => setAgent(aid, 'fallback', 'no AI key'));
      showProfile(result);
    } catch (err) {
      RESEARCH_AGENTS.forEach(([aid]) => root.querySelector(`[data-agent="${aid}"]`)?.dataset.st === 'working' && setAgent(aid, 'failed'));
      $('search-err').textContent = `Research failed: ${err.message}`;
    } finally { $('research-btn').disabled = false; }
  });

  function showProfile(p) {
    state.profile = p; state.selected = new Set(p.features.filter(f => f.core).map(f => f.id)); state.custom = [];
    const stack = p.stack.likely.length
      ? el('div', { className: 'q' }, el('span', { textContent: `Likely tech stack · ${p.stack.confidence} confidence` }),
          el('div', { className: 'rb-chips' }, ...p.stack.likely.map(s => el('span', { className: 'chip', textContent: s }))),
          p.stack.signals.length ? el('details', { className: 'fine' }, el('summary', { textContent: 'Why we think so' }), el('ul', {}, ...p.stack.signals.map(s => el('li', { textContent: `${s.signal}: ${s.inference}` })))) : null)
      : null;
    $('step-profile').replaceChildren(
      el('span', { className: 'eyebrow', textContent: 'WHAT WE FOUND' }), el('h3', { className: 'rb-name', textContent: p.officialName }),
      el('div', { className: 'rb-chips' }, el('span', { className: 'chip', textContent: p.category }),
        p.officialUrl ? el('a', { className: 'chip ok', href: p.officialUrl, target: '_blank', rel: 'noopener noreferrer', textContent: `✓ ${new URL(p.officialUrl).hostname}` }) : el('span', { className: 'chip warn', textContent: 'Official site not confirmed' }),
        el('span', { className: 'chip', textContent: `${p.features.length} features` })),
      el('p', { className: 'rb-summary', textContent: p.summary }), stack, el('p', { className: 'fine', textContent: p.notice }));
    $('step-profile').hidden = false;
    renderFeatures(); renderSetup();
    $('step-features').hidden = false; $('step-setup').hidden = false;
    scrollTo('step-profile');
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
      const input = el('input', { type: 'radio', name: `rb${id}-${name}`, value: o.id, checked: o.id === current, onchange: () => onPick(o.id) });
      return el('label', { className: 'opt' }, input, el('b', { textContent: o.label }), o.note ? el('small', { textContent: o.note }) : null);
    }));
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
    setTimeout(() => { if (root.querySelector('[data-agent="namer"]')?.dataset.st === 'working') { setAgent('namer', 'ok'); setAgent('app-builder', 'working'); } }, 2500);
    scrollTo('step-build');
    $('build-btn').disabled = true;
    try {
      const { result, trace } = await post('/api/rebuild/build', body);
      for (const t of trace || []) setAgent(t.step, t.status, secs(t.ms));
      if (result.status === 'refused') { $('build-err').textContent = result.message; return; }
      setAgent('file-checker', 'ok', result.source === 'ai' ? 'passed' : 'template');
      showResult(result);
      onFile?.(result);
    } catch (err) {
      setAgent('app-builder', 'failed'); $('build-err').textContent = `Build failed: ${err.message}`;
    } finally { clearInterval(timer); $('build-btn').disabled = false; }
  });

  let lastUrl = null;
  function showResult(file) {
    const spec = downloadSpec(file);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(new Blob([spec.text], { type: spec.type }));
    const label = file.source === 'ai' ? `Built by ${models.find(m => m.id === file.model)?.label || file.model}` : 'Offline starter template';
    $('file-card').replaceChildren(
      el('div', { className: 'file-head' }, el('span', { className: 'file-icon', textContent: file.format === 'html' ? 'HTML' : 'PY' }),
        el('div', {}, el('span', { className: 'eyebrow', textContent: 'ONE FILE · READY TO RUN' }), el('h3', { textContent: file.displayTitle || displayTitle(file.appName, state.profile.officialName, file.mods || []) }))),
      el('div', { className: 'rb-chips' }, el('span', { className: 'chip', textContent: file.filename }), el('span', { className: 'chip', textContent: `${(file.bytes / 1024).toFixed(1)} KB` }),
        el('span', { className: file.source === 'ai' ? 'chip ok' : 'chip warn', textContent: label })),
      el('a', { className: 'btn-primary btn-accent dl', href: lastUrl, download: spec.name, textContent: `⬇ Download ${file.filename}` }),
      el('b', { textContent: 'How to open it' }), el('ol', {}, ...file.instructions.map(s => el('li', { textContent: s }))));
    $('preview').replaceChildren(...(file.format === 'html'
      ? [el('div', { className: 'bar', textContent: 'Live preview · runs sandboxed in this page' }), el('iframe', { title: 'Preview of your app', sandbox: 'allow-scripts allow-modals allow-forms', srcdoc: previewDoc(file.content) })]
      : [el('div', { className: 'bar', textContent: `${file.filename} · Python source` }), el('pre', { textContent: file.content })]));
    $('step-result').hidden = false;
    scrollTo('step-result');
  }

  await loadModels();
  Object.assign(state, await detect());
  state.model = models[0].id;
  if (app) { $('app-name').value = String(app).slice(0, 80); $('search-form').requestSubmit(); }
}
