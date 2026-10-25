// RVAI global shell: four hash-routed sections (About / Alternatives / Innovate / RVAI OpenSource),
// prototype sign-up + preview-demo gate, try-Innovate-first shortcut, service chooser, third-party catalog
// page and Innovate handoff.
// UI-only: no accounts, no storage, no network beyond reading the static catalog files. Real sign-up,
// authorization and search belong to Anna's backend. Talks to app.js only through existing element IDs.
export const ROUTES = ['about', 'alternatives', 'innovate', 'opensource'];
const TITLES = { about: 'About', alternatives: 'Alternatives', innovate: 'Innovate', opensource: 'RVAI OpenSource' };
const GATED = new Set(['alternatives', 'innovate']);
const CATEGORY_ORDER = ['cad', 'video_editor', 'voxel_game'];
const WEBSITE_RE = /\b(web ?sites?|web ?pages?|landing pages?|portfolios?|homepages?|blogs?|html)\b/i;
const VERIFY = { source_reviewed_not_runtime_tested: 'Sources reviewed · not run-tested' };
const words = s => String(s).replace(/_/g, ' ');

export const resolveRoute = hash => {
  const r = String(hash || '').replace(/^#\/?/, '').toLowerCase();
  return ROUTES.includes(r) ? r : 'about';
};
// Gate = "has the visitor chosen sign-up or preview demo in this page session". Not authentication.
export const needsGate = (route, demoActive) => GATED.has(route) && !demoActive;
export const isWebsiteQuery = q => WEBSITE_RE.test(String(q));
export const sortCategories = cats => [...cats].sort((a, b) => rank(a.id) - rank(b.id));
const rank = id => (CATEGORY_ORDER.indexOf(id) + 1 || 99);
export function filterCatalog(items, { q = '', category = '' } = {}, featLabel = words) {
  const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(i => {
    if (category && i.category !== category) return false;
    const hay = [i.name, words(i.category), i.license, ...(i.features || []).map(f => `${words(f)} ${featLabel(f)}`), ...(i.keywords || [])].join(' ').toLowerCase();
    return terms.every(t => hay.includes(t));
  });
}
// Category label is included so app.js keyword routing recognizes the goal (e.g. "3d cad", "video edit").
export const handoffPrompt = (item, catLabel) => `I want to start from ${item.name} (${catLabel.toLowerCase()}, ${item.license}) and customize it so that: `;

if (typeof document !== 'undefined') init();

function init() {
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const safeLink = (url, text) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') return el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', text });
    } catch { /* fall through */ }
    return el('span', { text: `${text}: no valid link` });
  };

  // demo: null | { via: 'signup' | 'preview' } — in-memory UI selection only, cleared on reload.
  const ui = { demo: null, pending: null, catalog: [], cats: [], loaded: false, error: null, category: '' };
  let current = null;
  const dialog = $('start-dialog');

  // ---------- router ----------
  function show(route, focus) {
    current = route;
    document.querySelectorAll('[data-view]').forEach(v => { const on = v.dataset.view === route; v.hidden = !on; v.inert = !on; });
    document.querySelectorAll('#global-nav [data-route]').forEach(a => {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${TITLES[route]} · RVAI`;
    if (focus) $(`view-${route}`).focus({ preventScroll: true });
  }
  function navigate(route, focus = true) {
    if (resolveRoute(location.hash) !== route || !location.hash) history.pushState(null, '', `#${route}`);
    show(route, focus);
  }
  function request(route, extra = {}) {
    if (needsGate(route, ui.demo)) { ui.pending = { route, ...extra }; return openStart(); }
    if (extra.handoff) return applyHandoff(extra.handoff);
    navigate(route);
  }
  function onHash(focus = true) {
    const route = resolveRoute(location.hash);
    if (needsGate(route, ui.demo)) {
      if (!current) show('about', false);
      history.replaceState(null, '', `#${current}`);
      ui.pending = { route };
      return openStart();
    }
    show(route, focus);
  }
  window.addEventListener('hashchange', () => onHash(true));

  // ---------- sign-up / preview demo / chooser ----------
  function setStep(step) {
    $('start-signup').hidden = step !== 'signup';
    $('start-chooser').hidden = step !== 'chooser';
    dialog.setAttribute('aria-labelledby', step === 'signup' ? 'start-title' : 'chooser-title');
    const first = step === 'signup' ? $('signup-name') : dialog.querySelector('[data-choose="innovate"]');
    first.focus();
  }
  function openStart(step) {
    if (!dialog.open) dialog.showModal();
    setStep(step || (ui.demo ? 'chooser' : 'signup'));
  }
  function activateDemo(via) {
    ui.demo = { via };
    $('demo-status').hidden = false;
    $('gnav-start').textContent = 'Choose service';
  }
  function startDemo(via) {
    activateDemo(via);
    $('chooser-note').textContent = via === 'signup'
      ? 'No account created; authentication will connect later. What you typed was not saved or sent.'
      : 'Preview demo — no account, nothing saved. Authentication will connect later.';
    const h = ui.pending?.handoff;
    $('chooser-handoff').hidden = !h;
    if (h) $('chooser-handoff').textContent = `Choose Innovate to continue customizing ${h.item.name}.`;
    setStep('chooser');
  }
  $('signup-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    e.target.reset(); // values are never read, stored or transmitted
    startDemo('signup');
  });
  // Preview from an Innovate entry point skips the chooser: the visitor already picked Innovate.
  $('preview-demo').addEventListener('click', () => {
    const p = ui.pending;
    if (p?.route !== 'innovate') return startDemo('preview');
    activateDemo('preview');
    dialog.close();
    if (p.handoff) applyHandoff(p.handoff); else navigate('innovate');
  });
  document.querySelectorAll('[data-choose]').forEach(b => b.addEventListener('click', () => {
    const route = b.dataset.choose, h = ui.pending?.handoff;
    ui.pending = null;
    dialog.close();
    if (route === 'innovate' && h) applyHandoff(h); else navigate(route);
  }));
  $('start-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { ui.pending = null; });
  $('gnav-start').addEventListener('click', () => openStart());
  $('choose-service').addEventListener('click', () => openStart('chooser'));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => request(b.dataset.go)));
  document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => openStart()));
  // Try-first: enter Innovate in preview-demo mode without the sign-up step. Still no account; the header
  // shows "Preview demo · no account" and the Innovate badge/notes keep labeling the scripted demo.
  document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
    if (!ui.demo) activateDemo('preview');
    navigate(b.dataset.try);
  }));

  // ---------- Innovate handoff (prefill only; never auto-sends) ----------
  function applyHandoff(h) {
    navigate('innovate', false);
    const box = $('message-input'), chip = $('handoff-chip'), inProgress = $('messages').children.length > 0;
    box.value = h.prompt;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    chip.dataset.handoff = JSON.stringify({ kind: 'third_party_catalog', id: h.item.id, name: h.item.name, license: h.item.license, source_repository: h.item.source_repository });
    chip.replaceChildren(
      el('span', {}, el('b', { text: 'Starting from: ' }), `${h.item.name} · third-party open-source project. Finish the sentence, then press send.`),
      inProgress ? el('small', { text: 'A project is already open — press “New project” first for a fresh start.' }) : null,
      el('button', { type: 'button', class: 'icon-button', 'aria-label': 'Remove starting point', text: '×', onclick: clearHandoff }));
    chip.hidden = false;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
  function clearHandoff() {
    const chip = $('handoff-chip');
    chip.hidden = true;
    delete chip.dataset.handoff;
    chip.replaceChildren();
  }
  $('new-chat').addEventListener('click', clearHandoff); // app.js still owns the reset itself

  // ---------- Alternatives (third-party curated catalog) ----------
  const catLabel = id => ui.cats.find(c => c.id === id)?.label || words(id);
  const featLabel = f => ui.cats.flatMap(c => c.features).find(x => x.id === f)?.label || words(f);
  function renderFilters() {
    const opts = [['', 'All'], ...sortCategories(ui.cats).map(c => [c.id, c.label])];
    $('alt-filters').replaceChildren(...opts.map(([id, text]) => el('button', {
      type: 'button', class: 'filter-chip', 'aria-pressed': String(ui.category === id), text,
      onclick: () => { ui.category = id; renderFilters(); renderCatalog(); } })));
  }
  function card(item) {
    return el('article', { class: 'alt-card' },
      el('div', { class: 'alt-card-head' }, el('h2', { text: item.name }), el('span', { class: 'tag', text: catLabel(item.category) })),
      el('div', { class: 'tags' }, [item.license || 'License not declared', VERIFY[item.verification_status] || words(item.verification_status || 'unverified'),
        item.last_verified ? `Sources checked ${item.last_verified}` : 'Check date unknown'].map(t => el('span', { class: 'tag', text: t }))),
      el('p', { class: 'alt-features', text: `Documented features: ${(item.features || []).map(featLabel).join(', ') || 'none recorded'}` }),
      el('p', { class: 'alt-platforms', text: `Listed platforms: ${(item.supported_platforms || []).join(', ') || 'unknown'} · hardware fit unverified` }),
      el('div', { class: 'source-links' }, safeLink(item.official_url, 'Official site'), safeLink(item.source_repository, 'Source code'), safeLink(item.license_source_url, 'License')),
      (item.notes || []).length ? el('details', {}, el('summary', { text: 'Notes & caveats' }), item.notes.map(n => el('p', { text: n }))) : null,
      el('button', { type: 'button', class: 'btn-secondary small', text: 'Customize in Innovate →',
        onclick: () => request('innovate', { handoff: { item, prompt: handoffPrompt(item, catLabel(item.category)) } }) }));
  }
  function renderCatalog() {
    const out = $('alt-results'), q = $('alt-search').value;
    if (ui.error) return out.replaceChildren(el('p', { class: 'note error-text', text: `The curated catalog could not be loaded (${ui.error}). Serve the repository root over HTTP and open /ui/.` }));
    if (!ui.loaded) return out.replaceChildren(el('p', { class: 'note', text: 'Loading the curated catalog…' }));
    const hits = filterCatalog(ui.catalog, { q, category: ui.category }, featLabel);
    $('alt-count').textContent = `Showing ${hits.length} of ${ui.catalog.length} curated entries`;
    if (hits.length) return out.replaceChildren(...hits.map(card));
    out.replaceChildren(el('div', { class: 'empty-state small' },
      el('h2', { text: isWebsiteQuery(q) ? 'No website builders in this sample yet' : 'Nothing in this sample matches' }),
      el('p', { text: isWebsiteQuery(q)
        ? 'This small curated list doesn’t include website tools yet. That’s a gap in our sample, not evidence that none exist. You can plan an original website in Innovate.'
        : 'This is a small hand-reviewed sample, so a miss here doesn’t mean no free alternative exists. Try another word, clear the filter, or build it in Innovate.' }),
      el('button', { type: 'button', class: 'btn-primary', text: 'Go to Innovate', onclick: () => request('innovate') })));
  }
  $('alt-search').addEventListener('input', renderCatalog);
  async function loadCatalog() {
    try {
      const get = async f => { const r = await fetch(`../data/${f}`); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); };
      const [tax, alts] = await Promise.all([get('taxonomy.json'), get('alternatives.json')]);
      if (!Array.isArray(tax?.categories) || !Array.isArray(alts)) throw new Error('unexpected catalog shape');
      ui.cats = tax.categories; ui.catalog = alts;
    } catch (e) { ui.error = e.message; }
    ui.loaded = true;
    renderFilters();
    renderCatalog();
  }

  // ---------- boot: fresh URL (no hash) lands on About ----------
  renderCatalog();
  loadCatalog();
  if (location.hash) onHash(false); else show('about', false);
}
