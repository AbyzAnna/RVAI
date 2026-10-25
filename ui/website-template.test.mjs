// Run: node --test ui/website-template.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// No package.json "type": "module", so load the ESM .js source via a data: URL.
const src = readFileSync(new URL('./website-template.js', import.meta.url), 'utf8');
const { createWebsiteTemplate, escapeHtml } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const EVIL = `<script>alert("x")</script>' onload=alert(1) & "quoted" <img src=x onerror=alert(2)>`;
const brief = (constraints = null) => ({
  target: EVIL, purpose: `Purpose </style><style>body{background:url(https://evil.test)}</style>`,
  stated_features: ['Gallery', EVIL, 'Contact form'], route: 'build', category: 'website',
  constraints: constraints ?? { os: 'windows', ram_gb: 4, gpu: 'none', storage_free_gb: null, max_install_gb: null, internet: 'limited' }
});

test('escapeHtml covers &, <, >, quotes', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapes malicious user content; no scripts, handlers, or network sources', () => {
  const { html } = createWebsiteTemplate(brief());
  assert.ok(!/<script/i.test(html), 'no script tags');
  assert.ok(!/<img|<link|<iframe/i.test(html), 'no injected/remote elements');
  assert.ok(!/<[^>]*\son\w+\s*=/i.test(html), 'no tag contains an on* attribute');
  assert.ok(!/<[^>]*\b(src|href|action|srcset|poster|data)\s*=/i.test(html), 'no resource/link attributes');
  for (const tag of html.match(/<[^>]+>/g)) assert.ok(!/https?:|\/\/|url\(/i.test(tag), `no URL inside markup: ${tag}`);
  assert.equal((html.match(/<style>/g) || []).length, 1, 'user text cannot open a style block');
  assert.equal((html.match(/<\/style>/g) || []).length, 1, 'user text cannot close the style block');
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.ok(!/@import|url\(|https?:/i.test(css), 'no remote CSS');
  // Inert, escaped URL text in element content is allowed and proves the payload was escaped, not dropped.
  assert.ok(html.includes('&lt;/style&gt;&lt;style&gt;body{background:url(https://evil.test)}&lt;/style&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39; onload=alert(1) &amp; &quot;quoted&quot;'));
  assert.ok(!/<form|<input|<button/i.test(html), 'no fake working forms');
});

test('CSP meta present and visible preview marking', () => {
  const { html } = createWebsiteTemplate(brief());
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`));
  assert.ok((html.match(/RevAI website template preview/g) || []).length >= 3);
});

test('result shape and accurate UTF-8 byte count', () => {
  const r = createWebsiteTemplate({ target: 'Café 日本 🚀', purpose: 'p', stated_features: [] });
  assert.equal(r.generated_by, 'template');
  assert.equal(r.bytes, Buffer.byteLength(r.html, 'utf8'));
  assert.ok(r.bytes > r.html.length, 'multibyte chars counted as bytes');
  assert.equal(r.filename, 'revai-template-cafe.html');
  const has = re => assert.ok(r.limitations.some(l => re.test(l)), `limitation matching ${re}`);
  has(/template/i); has(/not AI/i);
  has(/backend/i); has(/not implemented/i);
  has(/source only|not an audited installed size/i);
  has(/device/i); has(/not(?: been)? tested|untested/i);
});

test('cap enforcement: known cap smaller than source throws', () => {
  assert.throws(() => createWebsiteTemplate(brief({ max_install_gb: 0 })), /exceeds the max_install_gb cap of 0 bytes/);
  assert.throws(() => createWebsiteTemplate(brief({ max_install_gb: 1e-6 })), /cap of \d+ bytes; no file/);
  assert.ok(createWebsiteTemplate(brief({ max_install_gb: 1 })).bytes > 0);
});

test('unknown cap never becomes zero', () => {
  for (const max_install_gb of [null, undefined, '', NaN, -1]) {
    assert.ok(createWebsiteTemplate(brief({ max_install_gb })).html.length > 0, String(max_install_gb));
  }
  assert.ok(createWebsiteTemplate({ target: 'x', constraints: null }).bytes > 0);
});
