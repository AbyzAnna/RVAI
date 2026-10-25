// The Rebuild flow as a component: name an app -> research agents -> features and mods -> model + system -> one file.
// mountRebuild(root, { app }) draws it inside `root`; rebuild.html mounts it full page, the Build with AI chat inline.
import { ARCH_OPTIONS, FORMAT_OPTIONS, OS_OPTIONS, basicBody, buildBody, detectSystem, displayTitle, downloadSpec } from './rebuild-core.js';

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(k => k != null)); return n; };

const RESEARCH_AGENTS = [
  ['product-profiler', 'Product Profiler', 'Official name, site, category and audience'],
  ['feature-mapper', 'Feature Mapper', 'User-visible features, core ones marked'],
  ['stack-detective', 'Stack Detective', 'Likely tech stack from public signals'],
  ['question-asker', 'Question Asker', 'A few questions to fit the app to you'],
  ['link-checker', 'Link Checker', 'Confirms the official site is real and loads'],
];
const BUILD_AGENTS = [
  ['app-planner', 'App Planner', 'Turns your picks and answers into a detailed plan'],
  ['namer', 'Namer', 'Picks an original name'],
  ['app-builder', 'App Builder', 'Writes the app, or designs the game for RVAI’s game engine'],
  ['file-checker', 'File Checker', 'Compiles every script, self-contained, no piracy'],
  ['runtime-check', 'Runtime Check', 'Opens the file in a sandbox and repairs any crash'],
];
const ASK_AGENTS = RESEARCH_AGENTS.filter(([aid]) => aid !== 'link-checker');
const EXAMPLES = ['Notion', 'Minecraft', 'Trello', 'Duolingo', 'Photoshop', 'Spotify'];
const STATUS = { waiting: 'Waiting', working: 'Working', ok: 'Done', fallback: 'Used backup', failed: 'Failed', blocked: 'Blocked' };
/** One line on what an agent found, shown on its card as soon as it finishes. */
function agentSummary(agent, r) {
  if (!r) return '';
  if (agent === 'product-profiler') return r.known === false ? 'Not recognized: using a best guess' : `Found ${r.officialName} · ${r.category}`;
  if (agent === 'feature-mapper') return `${r.features?.length || 0} features mapped, ${(r.features || []).filter(f => f.core).length} core`;
  if (agent === 'stack-detective') return r.likely?.length ? `Likely ${r.likely.slice(0, 3).join(', ')}` : 'No clear public signals';
  if (agent === 'question-asker') return r.questions?.length ? `${r.questions.length} questions for you below` : 'No questions needed';
  return '';
}
/** One line on the plan, e.g. "4 screens · 6 features in detail · 9 starter items". */
function planSummary(plan) {
  const n = (a, word) => `${a.length} ${word}${a.length === 1 ? '' : 's'}`;
  return [n(plan.screens, 'screen'), `${plan.features.length} features in detail`, n(plan.sampleContent, 'starter item')].join(' · ');
}
const planDetails = plan => el('details', { className: 'fine plan' }, el('summary', { textContent: 'See the plan' }),
  el('p', { textContent: plan.pitch }),
  el('b', { textContent: 'Screens' }), el('ul', {}, ...plan.screens.map(s => el('li', { textContent: `${s.name}: ${s.purpose}` }))),
  el('b', { textContent: 'How each feature works' }), el('ul', {}, ...plan.features.map(f => el('li', { textContent: `${f.label}: ${f.behavior}` }))),
  el('b', { textContent: 'Starter content' }), el('ul', {}, ...plan.sampleContent.map(c => el('li', { textContent: c }))));

// Opens the file in a hidden sandbox (no modals, so an alert can't block) and collects what RVAI's watchdog reports.
function runtimeCheck(html, waitMs = 9000) {
  return new Promise(resolve => {
    const frame = el('iframe', { title: 'Runtime check', sandbox: 'allow-scripts allow-forms', srcdoc: previewDoc(html) });
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:1024px;height:768px;border:0;visibility:hidden';
    const errors = [];
    let timer = null;
    const done = () => { clearTimeout(timer); removeEventListener('message', onMsg); frame.remove(); resolve({ ok: !errors.length, errors: [...new Set(errors)].slice(0, 5) }); };
    function onMsg(e) {
      if (e.source !== frame.contentWindow || !e.data?.rvai) return;
      if (e.data.rvai === 'runtime-error') errors.push(String(e.data.message || 'unknown error'));
      // Give late start-up errors a moment to arrive after the page says it is ready.
      if (e.data.rvai === 'ready') { clearTimeout(timer); timer = setTimeout(done, 800); }
    }
    addEventListener('message', onMsg);
    timer = setTimeout(done, waitMs);
    document.body.append(frame);
  });
}
const secs = ms => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

// The preview runs without same-origin access, where localStorage throws; give it an in-memory one.
const STORAGE_SHIM = '<script>try{window.localStorage.getItem("x")}catch(e){const m=new Map();Object.defineProperty(window,"localStorage",{value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}})}<\/script>';
const previewDoc = html => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + STORAGE_SHIM) : STORAGE_SHIM + html;

const TEMPLATE = `
<section class="rb-card" data-part="step-search"><h2><span class="rb-step">1</span>Which app or website?</h2><p class="rb-sub">Type its name. Agents research its official site, docs and reviews in parallel.</p>
<form class="rb-search" data-part="search-form"><input data-part="app-name" aria-label="App or website name" maxlength="80" placeholder="e.g. Notion, Minecraft, Trello, Duolingo" autocomplete="off" required><button class="btn-primary btn-accent big" data-part="research-btn">Research it</button></form>
<div class="rb-chips" data-part="examples"></div><p class="err" data-part="search-err" role="alert"></p></section>
<section class="rb-card" data-part="step-agents" hidden><h2>Agents at work</h2><p class="rb-sub" data-part="agents-sub">Running side by side.</p><div class="agents" data-part="agents"></div></section>
<section class="rb-card" data-part="step-profile" hidden></section>
<section class="rb-card" data-part="step-features" hidden><h2><span class="rb-step">2</span>Which features do you want?</h2><p class="rb-sub">Core features are ticked. Add your own ideas as mods.</p><div class="feat-grid" data-part="features"></div>
<form class="mod-row" data-part="mod-form"><input data-part="mod-input" aria-label="Add a mod" maxlength="80" placeholder="Add a mod: e.g. Pomodoro timer, co-op on LAN, low-spec mode"><button class="btn-secondary">Add mod</button></form><div class="rb-chips" data-part="mods"></div></section>
<section class="rb-card" data-part="step-setup" hidden><h2><span class="rb-step">3</span>A few questions</h2><p class="rb-sub">So the app fits you and runs on your computer.</p>
<div data-part="questions"></div>
<div class="q"><span>Which AI model should build it?</span><div class="opt-grid" data-part="models"></div></div>
<div class="q"><span>Your system <em class="chip ok" data-part="detected">auto-detected</em></span><div class="opt-grid" data-part="os"></div></div>
<div class="q"><span>Processor</span><div class="opt-grid" data-part="arch"></div></div>
<div class="q"><span>What kind of file?</span><div class="opt-grid" data-part="format"></div></div>
<div class="q"><label><span>Anything else? (optional)</span><textarea class="notes" data-part="notes" maxlength="500" placeholder="Look and feel, colors, who it is for…"></textarea></label></div>
<p style="margin-top:18px"><button class="btn-primary btn-accent big" data-part="build-btn" type="button">Build my file</button></p><p class="err" data-part="build-err" role="alert"></p></section>
<section class="rb-card" data-part="step-build" hidden><h2>Building</h2><p class="rb-sub" data-part="build-sub"></p><div class="agents" data-part="build-agents"></div><div data-part="plan"></div></section>
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

/** Draws the flow in `root`. With `app`, research starts right away; `notes` pre-fills "Anything else?". `onFile(file)` is told when a file is ready. */
export async function mountRebuild(root, { app = '', notes = '', onFile } = {}) {
  const id = ++mounts;
  root.classList.add('rb-flow');
  root.innerHTML = TEMPLATE;
  const $ = part => root.querySelector(`[data-part="${part}"]`);
  const state = { profile: null, selected: new Set(), custom: [], answers: {}, model: '', os: 'macos', arch: 'unknown', format: 'html', notes: '' };
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
    ASK_AGENTS.forEach(([aid]) => setAgent(aid, 'working'));
    $('research-btn').disabled = true;
    try {
      // Each agent is its own request, so they really run side by side and each card finishes on its own.
      const parts = {};
      let refusal = null;
      await Promise.all(ASK_AGENTS.map(async ([aid]) => {
        const started = Date.now();
        try {
          const { result, trace } = await post('/api/rebuild/agent', { name, agent: aid });
          if (result?.status === 'refused') { refusal = result; setAgent(aid, 'blocked'); return; }
          const t = (trace || []).find(x => x.step === aid);
          if (result != null) parts[aid] = result;
          setAgent(aid, t?.status || 'ok', secs(Date.now() - started));
          const found = agentSummary(aid, result);
          if (found) root.querySelector(`[data-agent="${aid}"] p`).textContent = found;
        } catch { setAgent(aid, 'failed'); }
      }));
      if (refusal) { $('search-err').textContent = refusal.message; return; }
      setAgent('link-checker', 'working');
      const { result, trace } = await post('/api/rebuild/research', { name, parts });
      const link = (trace || []).find(t => t.step === 'link-checker');
      if (link) setAgent('link-checker', link.status, secs(link.ms));
      if (result.status === 'refused') { RESEARCH_AGENTS.forEach(([aid]) => setAgent(aid, 'blocked')); $('search-err').textContent = result.message; return; }
      if (result.source === 'fallback') RESEARCH_AGENTS.forEach(([aid]) => setAgent(aid, 'fallback', 'no AI key'));
      showProfile(result);
    } catch (err) {
      RESEARCH_AGENTS.forEach(([aid]) => root.querySelector(`[data-agent="${aid}"]`)?.dataset.st === 'working' && setAgent(aid, 'failed'));
      $('search-err').textContent = `Research failed: ${err.message}`;
    } finally { $('research-btn').disabled = false; }
  });

  function showProfile(p) {
    state.profile = p; state.selected = new Set(p.features.filter(f => f.core).map(f => f.id)); state.custom = []; state.answers = {};
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
    $('questions').replaceChildren(...(state.profile.questions || []).map((q, i) => el('div', { className: 'q' }, el('span', { textContent: q.question }),
      el('div', { className: 'opt-grid' }, ...q.options.map(o => el('label', { className: 'opt' },
        el('input', { type: 'radio', name: `rb${id}-q${i}`, value: o, onchange: () => { state.answers[q.question] = o; } }), el('b', { textContent: o })))))));
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
    $('step-result').hidden = true; $('step-build').hidden = false; $('plan').replaceChildren();
    const modelLabel = models.find(m => m.id === state.model)?.label || state.model;
    const started = Date.now();
    let sub = 'Planning the app in detail first.';
    const tick = () => { $('build-sub').textContent = `${sub} ${Math.round((Date.now() - started) / 1000)}s so far.`; };
    tick();
    const timer = setInterval(tick, 1000);
    agentCards($('build-agents'), BUILD_AGENTS); setAgent('app-planner', 'working');
    const describe = (aid, text) => { const p = root.querySelector(`[data-agent="${aid}"] p`); if (p) p.textContent = text; };
    scrollTo('step-build');
    $('build-btn').disabled = true;
    try {
      // 1. Plan: a detailed blueprint the builder follows, shown so the person can see what is coming.
      const planned = await post('/api/rebuild/plan', body);
      if (planned.result?.status === 'refused') { setAgent('app-planner', 'blocked'); $('build-err').textContent = planned.result.message; return; }
      const pt = (planned.trace || []).find(t => t.step === 'app-planner');
      setAgent('app-planner', pt?.status || 'ok', pt?.ms ? secs(pt.ms) : '');
      const plan = planned.result?.plan;
      if (plan) { describe('app-planner', planSummary(plan)); $('plan').replaceChildren(planDetails(plan)); body.plan = plan; }
      else if (planned.result?.engine) describe('app-planner', 'Games are designed for RVAI’s tested game engine');

      // 2. Build the file.
      sub = `${modelLabel} is writing one original file with ${body.features.length} features${plan ? ', following the plan' : ''}. This can take a few minutes.`;
      setAgent('namer', 'working');
      setTimeout(() => { if (root.querySelector('[data-agent="namer"]')?.dataset.st === 'working') { setAgent('namer', 'ok'); setAgent('app-builder', 'working'); } }, 2500);
      const { result, trace } = await post('/api/rebuild/build', body);
      for (const t of trace || []) setAgent(t.step === 'game-designer' ? 'app-builder' : t.step, t.status, secs(t.ms));
      if (result.status === 'refused') { $('build-err').textContent = result.message; return; }
      if (!trace?.some(t => t.step === 'file-checker')) setAgent('file-checker', 'ok', result.source === 'ai' ? 'scripts compile' : 'template');

      // 3. Open it in a hidden sandbox; if it crashes or shows nothing, the Fixer repairs it once.
      if (result.format === 'html') {
        sub = 'Opening the file in a sandbox to check it runs.';
        setAgent('runtime-check', 'working');
        const checkStart = Date.now();
        let check = await runtimeCheck(result.content);
        if (check.ok) setAgent('runtime-check', 'ok', `opens cleanly · ${secs(Date.now() - checkStart)}`);
        else {
          describe('runtime-check', `Found: ${check.errors[0]}. Repairing it now.`);
          sub = `${modelLabel} is repairing ${check.errors.length === 1 ? 'an error' : `${check.errors.length} errors`} it found when opening the file.`;
          try {
            const fixed = await post('/api/rebuild/repair', { target: body.target, content: result.content, errors: check.errors, model: body.model });
            const after = fixed.result?.status === 'ok' ? await runtimeCheck(fixed.result.content) : null;
            if (after?.ok) {
              Object.assign(result, { content: fixed.result.content, bytes: fixed.result.bytes });
              setAgent('runtime-check', 'ok', `repaired · ${secs(Date.now() - checkStart)}`);
              describe('runtime-check', `Fixed: ${check.errors[0]}`);
            } else throw new Error(after?.errors[0] || 'repair did not pass');
          } catch {
            // Still broken: ship a basic version with only the core features rather than a file that crashes.
            sub = 'The full version still crashed, so RVAI is building a basic, reliable version with only the core features.';
            describe('runtime-check', `Still crashed (${check.errors[0]}). Building a basic version instead.`);
            const basic = await post('/api/rebuild/build', basicBody(body, state.profile));
            const ok = basic.result?.status === 'ok' && (await runtimeCheck(basic.result.content)).ok;
            if (ok) {
              Object.assign(result, basic.result, { basic: true });
              setAgent('runtime-check', 'ok', `basic version · ${secs(Date.now() - checkStart)}`);
              describe('runtime-check', 'Shipped the basic version: core features only, checked to open cleanly');
            } else {
              setAgent('runtime-check', 'failed', 'still has an error');
              describe('runtime-check', `Still shows: ${check.errors[0]}. Try building again or pick another model.`);
            }
          }
        }
      }
      showResult(result);
      onFile?.(result);
    } catch (err) {
      for (const [aid] of BUILD_AGENTS) if (root.querySelector(`[data-agent="${aid}"]`)?.dataset.st === 'working') setAgent(aid, 'failed');
      $('build-err').textContent = `Build failed: ${err.message}`;
    } finally { clearInterval(timer); $('build-btn').disabled = false; }
  });

  let lastUrl = null;
  function showResult(file) {
    const spec = downloadSpec(file);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(new Blob([spec.text], { type: spec.type }));
    const by = models.find(m => m.id === file.model)?.label || file.model;
    const label = file.engine ? (file.source === 'ai' ? `Designed by ${by} · RVAI game engine` : 'RVAI game engine') : file.source === 'ai' ? `Built by ${by}` : 'Offline starter template';
    $('file-card').replaceChildren(
      el('div', { className: 'file-head' }, el('span', { className: 'file-icon', textContent: file.format === 'html' ? 'HTML' : 'PY' }),
        el('div', {}, el('span', { className: 'eyebrow', textContent: 'ONE FILE · READY TO RUN' }), el('h3', { textContent: file.displayTitle || displayTitle(file.appName, state.profile.officialName, file.mods || []) }))),
      el('div', { className: 'rb-chips' }, el('span', { className: 'chip', textContent: file.filename }), el('span', { className: 'chip', textContent: `${(file.bytes / 1024).toFixed(1)} KB` }),
        el('span', { className: file.source === 'ai' ? 'chip ok' : 'chip warn', textContent: label }),
        file.basic ? el('span', { className: 'chip warn', title: 'The full version crashed, so this file has only the core features', textContent: 'Basic version · core features only' }) : null),
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
  if (notes) $('notes').value = String(notes).slice(0, 500);
  if (app) { $('app-name').value = String(app).slice(0, 80); $('search-form').requestSubmit(); }
}
