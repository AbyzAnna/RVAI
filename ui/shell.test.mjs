// Run: node --test ui/shell.test.mjs
// Static checks for the four-section shell. Browser behavior (focus, dialog, hash history) still needs a manual/browser pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('./index.html');
const shellSrc = read('./shell.js');
const appSrc = read('./app.js');
// No package.json "type": "module"; load ESM source via data: URL. DOM init is skipped when `document` is undefined.
const shell = await import('data:text/javascript;base64,' + Buffer.from(shellSrc).toString('base64'));
const catalog = JSON.parse(read('../data/alternatives.json'));
const taxonomy = JSON.parse(read('../data/taxonomy.json'));

const count = (s, re) => (s.match(re) || []).length;
const tagWithId = id => html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0] || '';
const sectionText = id => {
  const start = html.indexOf(`id="${id}"`), end = html.indexOf('</section>', html.indexOf('class="page"', start));
  return html.slice(start, end).replace(/<[^>]+>/g, ' ');
};

// Every ID app.js reads via $('...'), plus the structural IDs the core chat depends on.
const appIds = [...new Set([...appSrc.matchAll(/\$\(['`]([a-z-]+)['`]\)/g)].map(m => m[1]))];
const CORE_IDS = [...new Set([...appIds, 'chat-nav', 'catalog-nav', 'catalog-size', 'chat-scroll', 'welcome', 'messages', 'quick-replies',
  'chat-form', 'message-input', 'send', 'composer-hint', 'demo-note', 'mode-badge', 'project-title', 'workspace-toggle', 'workspace-close',
  'workspace-title', 'project-workspace', 'menu-toggle', 'new-chat', 'api-url', 'live-mode',
  ...['brief', 'alternatives', 'plan', 'preview'].flatMap(t => [`tab-${t}`, `panel-${t}`])])];

test('every core chat ID (incl. all IDs app.js reads) exists exactly once', () => {
  assert.ok(appIds.length >= 10, 'sanity: extracted IDs from app.js');
  for (const id of CORE_IDS) assert.equal(count(html, new RegExp(`\\bid="${id}"`, 'g')), 1, `#${id}`);
});

test('all element IDs in index.html are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.filter((v, i) => ids.indexOf(v) !== i), []);
});

test('global nav: four links in order with exact labels, About current by default', () => {
  const nav = html.match(/<nav aria-label="Main sections">[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'labelled main nav');
  const links = [...nav.matchAll(/<a href="#(\w+)" data-route="(\w+)"([^>]*)>([^<]+)<\/a>/g)];
  assert.deepEqual(links.map(m => [m[1], m[2], m[4]]), [['about', 'about', 'About'], ['alternatives', 'alternatives', 'Alternatives'],
    ['innovate', 'innovate', 'Innovate'], ['opensource', 'opensource', 'RVAI OpenSource']]);
  assert.deepEqual(links.filter(m => /aria-current="page"/.test(m[3])).map(m => m[1]), ['about']);
  assert.equal(count(html, /data-route="/g), 4);
});

test('four views exist once; only About is visible in static HTML, others hidden + inert', () => {
  for (const r of shell.ROUTES) {
    const tag = tagWithId(`view-${r}`);
    assert.ok(tag.includes(`data-view="${r}"`), r);
    assert.equal(count(html, new RegExp(`data-view="${r}"`, 'g')), 1, r);
    assert.equal(/\bhidden\b/.test(tag) && /\binert\b/.test(tag), r !== 'about', `${r} hidden/inert state`);
    assert.ok(/tabindex="-1"/.test(tag), `${r} focusable for route focus`);
  }
});

test('core chat is nested inside the Innovate view, not another view', () => {
  const start = html.indexOf('id="view-innovate"'), end = html.indexOf('id="view-opensource"');
  for (const id of ['chat-form', 'message-input', 'messages', 'project-workspace', 'new-chat', 'handoff-chip']) {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > start && at < end, `#${id} inside Innovate`);
  }
});

test('both modules load; app.js before shell.js; shell has no imports', () => {
  const app = html.indexOf('<script type="module" src="app.js">'), sh = html.indexOf('<script type="module" src="shell.js">');
  assert.ok(app > 0 && sh > app);
  assert.ok(/import \{ createWebsiteTemplate \} from '\.\/website-template\.js'/.test(appSrc), 'core still imports the template module');
  assert.ok(!/^\s*import\s/m.test(shellSrc));
});

test('router helpers: fresh URL and unknown hashes resolve to About; gate is demo-only', () => {
  assert.equal(shell.resolveRoute(''), 'about');
  assert.equal(shell.resolveRoute('#'), 'about');
  assert.equal(shell.resolveRoute('#nope'), 'about');
  assert.equal(shell.resolveRoute('#OpenSource'), 'opensource');
  assert.equal(shell.resolveRoute('#/innovate'), 'innovate');
  assert.equal(shell.needsGate('about', null), false);
  assert.equal(shell.needsGate('opensource', null), false);
  assert.equal(shell.needsGate('innovate', null), true);
  assert.equal(shell.needsGate('alternatives', null), true);
  assert.equal(shell.needsGate('innovate', { via: 'preview' }), false);
});

test('no real auth: no password/secret inputs, no storage, cookies or outbound requests from the shell', () => {
  for (const tag of html.match(/<input[^>]*>/g)) {
    assert.ok(!/type="password"/i.test(tag), tag);
    assert.ok(!/password|secret|token/i.test(tag), tag);
  }
  const form = html.match(/<form id="signup-form"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form && !/\b(action|method)=/.test(form), 'sign-up form has no action/method');
  assert.ok(!/\bname="/.test(form), 'sign-up inputs carry no submittable names');
  assert.ok(!/\brequired\b/.test(form), 'sign-up fields optional');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest|WebSocket/.test(shellSrc));
  const fetches = [...shellSrc.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]);
  assert.deepEqual(fetches, ['`../data/${f}`'], 'only static catalog files are fetched');
  assert.ok(/Continue to demo/.test(form));
  assert.ok(/id="preview-demo"[^>]*>Preview demo/.test(html));
});

test('service chooser: Innovate primary, Alternatives secondary', () => {
  const chooser = html.match(/<section id="start-chooser"[\s\S]*?<\/section>/)?.[0];
  assert.ok(/class="choice choice-primary" data-choose="innovate"/.test(chooser));
  assert.ok(/class="choice" data-choose="alternatives"/.test(chooser));
  assert.ok(chooser.indexOf('data-choose="innovate"') < chooser.indexOf('data-choose="alternatives"'));
});

test('About and OpenSource copy: no invented statistics; evidence marked pending; empty library', () => {
  const about = sectionText('view-about'), os = sectionText('view-opensource');
  for (const text of [about, os]) {
    assert.ok(!/\d[\d,.]*\s*(%|\+|k\b|users|students|people|downloads|stars|projects|million|billion)/i.test(text), 'no numeric claims');
    assert.ok(!/testimonial|★/i.test(text));
  }
  assert.equal(count(about, /Team research\/source pending/g), 3);
  assert.ok(/No published projects yet/.test(os));
  assert.ok(!/class="[^"]*\b(alt-card|project-card)\b/.test(html.slice(html.indexOf('id="view-opensource"'), html.indexOf('<dialog'))), 'no project cards in OpenSource');
});

test('try-first: hero primary CTA opens Innovate demo; visible brand is RVAI in the shell files', () => {
  const hero = html.match(/<div class="about-hero">[\s\S]*?<\/div>/)?.[0];
  assert.ok(/<button[^>]*class="btn-primary[^"]*"[^>]*data-try="innovate"/.test(hero), 'primary hero CTA uses data-try="innovate"');
  assert.ok(!/data-try="alternatives"/.test(html), 'Alternatives stays behind the sign-up/preview choice');
  assert.ok(/<title>RVAI\b/.test(html));
  assert.ok(!/RevAI/.test(html) && !/RevAI/.test(shellSrc), 'no old brand in index.html or shell.js');
});

test('game starter removed from prominent UI; data-example only cad/website', () => {
  const examples = [...html.matchAll(/data-example="(\w+)"/g)].map(m => m[1]);
  assert.ok(examples.length >= 2);
  assert.deepEqual([...new Set(examples)].sort(), ['cad', 'website']);
});

test('catalog filter + handoff helpers behave on the real data', () => {
  assert.equal(shell.filterCatalog(catalog).length, catalog.length);
  assert.deepEqual(shell.filterCatalog(catalog, { category: 'cad' }).map(i => i.id).sort(), ['freecad', 'openscad']);
  assert.deepEqual(shell.filterCatalog(catalog, { q: 'video', category: 'video_editor' }).map(i => i.id).sort(), ['kdenlive', 'shotcut']);
  assert.deepEqual(shell.filterCatalog(catalog, { q: 'stl export' }).map(i => i.id), ['openscad']);
  assert.equal(shell.filterCatalog(catalog, { q: 'website builder' }).length, 0);
  assert.ok(shell.isWebsiteQuery('portfolio website') && !shell.isWebsiteQuery('cad'));
  assert.deepEqual(shell.sortCategories(taxonomy.categories).map(c => c.id), ['cad', 'video_editor', 'voxel_game']);
  const fc = catalog.find(i => i.id === 'freecad'), prompt = shell.handoffPrompt(fc, '3D CAD & design');
  assert.ok(prompt.includes('FreeCAD') && prompt.includes('cad'), 'keeps category keyword for app.js routing');
  assert.ok(/so that: $/.test(prompt), 'prompt is left open for the user to finish');
});
