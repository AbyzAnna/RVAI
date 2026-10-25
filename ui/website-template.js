// RevAI website template. Pure, deterministic string templating — NOT AI generation.
// Produces one self-contained static HTML page from a brief (ui/app.js shape).
// No scripts, no remote resources, no working backend features. All user text is HTML-escaped
// and only ever placed in element text content (never in attributes or CSS).

const GB_BYTES = 1e9; // decimal GB, applied to source bytes only (not an audited installed size)
const MAX_TEXT = 160;
const MAX_FEATURES = 12;
const BACKEND_RE = /\b(form|contact|login|log ?in|sign ?up|account|payment|checkout|shop|store|cart|comment|search|newsletter|subscribe|database|upload)\b/i;

export const TEMPLATE_LIMITATIONS = Object.freeze([
  'Static template filled from your brief — not AI-generated content.',
  'Backend functionality (forms, login, payments, search, databases) is not implemented; such features appear only as placeholder cards.',
  'bytes is the UTF-8 size of the HTML source only, not an audited installed size.',
  'Performance on your device (RAM, GPU, storage) has not been tested.'
]);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]);
}

const clean = (v, fallback) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  return s || fallback;
};

// Returns a byte cap, or null when unknown. null/undefined/''/negative/NaN never become 0.
function capBytes(maxInstallGb) {
  if (maxInstallGb == null || maxInstallGb === '') return null;
  const n = typeof maxInstallGb === 'number' ? maxInstallGb : Number(maxInstallGb);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n * GB_BYTES) : null;
}

function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
}

const CSS = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#12343b;background:#f3fafb;line-height:1.55}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.badge{display:inline-block;font-size:.78rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#0b6e75;background:#d7f1f2;border:1px solid #a9dfe2;border-radius:999px;padding:4px 12px}
header.hero{background:linear-gradient(135deg,#e3f4fb 0%,#d3f0ec 100%);border-bottom:1px solid #cbe7ea;padding:64px 0 56px}
.hero h1{font-size:clamp(1.9rem,4.5vw,3rem);line-height:1.15;margin:16px 0 12px;color:#0d3b4a;overflow-wrap:anywhere}
.hero p{font-size:1.12rem;max-width:62ch;margin:0;color:#2b5561;overflow-wrap:anywhere}
main{padding:44px 0 56px}h2{font-size:1.35rem;margin:0 0 18px;color:#0d3b4a}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:0;margin:0;list-style:none}
.card{background:#fff;border:1px solid #d5e9ec;border-radius:14px;padding:20px;box-shadow:0 1px 2px rgba(13,59,74,.05)}
.card h3{margin:0 0 6px;font-size:1.05rem;color:#0b6e75;overflow-wrap:anywhere}.card p{margin:0;font-size:.94rem;color:#4a6a72}
.card.placeholder{border-style:dashed;background:#f8fcfd}
.note{margin-top:28px;font-size:.9rem;color:#4a6a72;background:#eef7f8;border-left:4px solid #2aa6a8;border-radius:6px;padding:12px 16px}
footer{border-top:1px solid #cbe7ea;background:#e9f5f7;padding:24px 0;font-size:.88rem;color:#3d5f67}
footer strong{color:#0b6e75}footer ul{margin:8px 0 0;padding-left:18px}
@media (max-width:560px){header.hero{padding:44px 0 36px}main{padding:32px 0 40px}}`;

function featureCard(name) {
  const placeholder = BACKEND_RE.test(name);
  const desc = placeholder
    ? 'Placeholder only — this needs a backend that this static template does not include.'
    : 'Describe this part of your site here.';
  return `<li class="card${placeholder ? ' placeholder' : ''}"><h3>${escapeHtml(name)}</h3><p>${desc}</p></li>`;
}

/**
 * @param {{target?:string, purpose?:string, stated_features?:string[], route?:string, category?:string,
 *   constraints?:{os?:string, ram_gb?:number|null, gpu?:string, storage_free_gb?:number|null, max_install_gb?:number|null, internet?:string}|null}} brief
 * @returns {{html:string, filename:string, bytes:number, generated_by:'template', limitations:string[]}}
 * @throws {Error} when constraints.max_install_gb is a known nonnegative cap smaller than the HTML source bytes.
 */
export function createWebsiteTemplate(brief = {}) {
  const b = brief && typeof brief === 'object' ? brief : {};
  const target = clean(b.target, 'My website');
  const purpose = clean(b.purpose, 'A simple starting point for your site.');
  const raw = Array.isArray(b.stated_features) ? b.stated_features : [];
  const seen = new Set();
  const features = raw.map(f => clean(f, '')).filter(f => f && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase())).slice(0, MAX_FEATURES);
  const cards = (features.length ? features : ['Home page', 'About section']).map(featureCard).join('\n');
  const limits = TEMPLATE_LIMITATIONS.map(l => `<li>${escapeHtml(l)}</li>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="RevAI website template">
<title>${escapeHtml(target)} — RevAI website template preview</title>
<style>${CSS}</style>
</head>
<body>
<header class="hero"><div class="wrap">
<span class="badge">RevAI website template preview</span>
<h1>${escapeHtml(target)}</h1>
<p>${escapeHtml(purpose)}</p>
</div></header>
<main><div class="wrap">
<h2>What this site includes</h2>
<ul class="grid">
${cards}
</ul>
<p class="note">This is a static starter template. Replace the placeholder text with your own content. Features marked with a dashed border need a backend and do not work here.</p>
</div></main>
<footer><div class="wrap">
<strong>RevAI website template preview</strong> — a static template, not AI-generated.
<ul>${limits}</ul>
</div></footer>
</body>
</html>
`;

  const bytes = new TextEncoder().encode(html).byteLength;
  const cap = capBytes(b.constraints?.max_install_gb);
  if (cap !== null && bytes > cap) {
    throw new Error(`Website template is ${bytes} bytes of HTML source, which exceeds the max_install_gb cap of ${cap} bytes; no file was produced.`);
  }
  return { html, filename: `revai-template-${slug(target)}.html`, bytes, generated_by: 'template', limitations: [...TEMPLATE_LIMITATIONS] };
}
