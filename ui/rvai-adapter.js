// Adapter for Anna's backend: POST /api/recommend {query} -> {result, trace} (src/server.ts on origin/main).
// Maps her Recommendation / Refusal into the envelope app.js already renders. Pure functions, no DOM, no fetch.
export const MAX_QUERY = 500; // server.ts truncates queries to 500 characters

export const isRecommendEndpoint = url => /\/api\/recommend\/?$/.test(new URL(url, 'http://x').pathname);

// The backend is single-shot, so each request carries only the person's latest message. Folding in the
// earlier ones let one refused message (e.g. a piracy question) block every later request in the chat,
// and mixed unrelated topics together.
export function recommendQuery(messages) {
  const said = messages.filter(m => m.role === 'user' && typeof m.content === 'string').map(m => m.content.trim()).filter(Boolean);
  return said.length ? said[said.length - 1].slice(0, MAX_QUERY) : '';
}

// Earlier messages go along separately as `context`, so the backend can read a follow-up ("which of these works
// offline?") with its topic. Messages the backend refused are left out, and it only ever guards the latest one.
export function recommendContext(messages) {
  const said = messages.filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim());
  return said.slice(0, -1).filter(m => !m.refused).slice(-2).map(m => m.content.trim().slice(0, MAX_QUERY));
}

// Anna's errors are {error: "text"} (400/404) or {error, trace} (500 from a failed step).
export function recommendError(data) {
  return data && typeof data.error === 'string' && data.error.trim() ? data.error.trim() : null;
}

const GAP = { missing: 'Missing', partial: 'Partial', plugin: 'Via plug-in' };
const pct = n => `${Math.round(n * 100)}%`;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isStr = v => typeof v === 'string' && v.trim() !== '';

function traceSteps(trace) {
  if (!Array.isArray(trace)) return null;
  const steps = trace.filter(t => isStr(t?.step) && isStr(t?.status))
    .map(t => ({ label: t.step, status: isStr(t.detail) ? `${t.status} (${t.detail})` : t.status }));
  return steps.length ? steps : null;
}

function pickCard(p, source, target) {
  const gaps = Array.isArray(p.gaps) ? p.gaps : [];
  return {
    project: {
      id: `rvai:${slug(p.name)}`, name: p.name, license: p.license, official_url: p.url, alternative_to: target || undefined,
      pricing_type: p.openSource ? 'free_open_source' : 'Free, not open source',
      verification_status: source === 'discovered' ? 'Found live · links checked, not reviewed by a person' : 'From RVAI seed catalog',
      features: [], notes: isStr(p.notes) ? [p.notes] : []
    },
    compatibility_status: p.platformMatch ? 'Runs on your platform' : 'Platform not confirmed',
    summary_lines: [
      `Score ${p.score.toFixed(2)} · covers ${pct(p.mustHaveCoverage)} of your must-haves`,
      ...gaps.map(g => `${GAP[g.status] || g.status}: ${g.label}${isStr(g.workaround) ? ` — workaround: ${g.workaround}` : ''}`)
    ],
    warnings: [p.why, ...(isStr(p.notes) ? [p.notes] : [])].filter(isStr)
  };
}

function legalCard(a) {
  return {
    project: { id: `rvai:${slug(a.name)}`, name: a.name, license: a.license, official_url: a.url, verification_status: 'Legal option suggested by RVAI', features: [], notes: [] },
    summary_lines: [], warnings: []
  };
}

const discountLines = ds => (Array.isArray(ds) ? ds : []).map(d => `${d.name} (${d.eligibility}): ${d.url}`);

function buildPlanSteps(bp) {
  return [
    { title: 'Why build something new', detail: bp.reason },
    { title: 'Concept', detail: bp.concept },
    { title: 'Features to build', detail: bp.featuresToBuild.join(', ') },
    { title: 'Suggested foundation', detail: bp.suggestedFoundation.join(' ') },
    ...bp.steps.map((s, i) => ({ title: `Step ${i + 1}`, detail: s })),
    { title: 'Clean-room rules', detail: bp.cleanRoomRules.join(' ') }
  ];
}

const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };
const discountItems = ds => (Array.isArray(ds) ? ds : []).filter(d => isStr(d?.name)).map(d => ({ name: d.name, eligibility: d.eligibility || '', url: safeUrl(d.url) }));

/** The build plan as a Markdown file the person can download, instead of being told where to find it. */
export function buildPlanMarkdown(bp, target) {
  const list = xs => (xs || []).map(x => `- ${x}`).join('\n');
  return [`# Plan for an original tool${target ? ` (instead of ${target})` : ''}`, '', `**Why:** ${bp.reason}`, '', bp.concept, '',
    '## Features to build', list(bp.featuresToBuild), '', '## Foundation', list(bp.suggestedFoundation), '',
    '## Steps', (bp.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n'), '', '## Clean-room rules', list(bp.cleanRoomRules), ''].join('\n');
}

// What the chat draws as cards, chips and badges (app.js visualReply). Text stays in assistant_message for logs.
function visualOf(r) {
  const items = Array.isArray(r.threats?.items) ? r.threats.items : [];
  return {
    headline: r.target?.name ? `Free alternatives to ${r.target.name}` : r.picks.length ? 'Free alternatives' : 'Nothing free fits well yet',
    live: r.source === 'discovered',
    picks: r.picks.map(p => ({ name: p.name, alternativeTo: r.target?.name || null, url: safeUrl(p.url), license: p.license, openSource: !!p.openSource, coverage: p.mustHaveCoverage,
      platformMatch: !!p.platformMatch, gaps: (p.gaps || []).slice(0, 3).map(g => ({ label: g.label, status: g.status })), notes: isStr(p.notes) ? p.notes : null })),
    discounts: discountItems(r.discounts),
    risks: items.slice(0, 4).map(t => ({ severity: t.severity, subject: t.subject, advice: t.advice })),
    riskLevel: r.threats?.level || null,
    plan: r.buildPlan ? { reason: r.buildPlan.reason, markdown: buildPlanMarkdown(r.buildPlan, r.target?.name) } : null
  };
}

// What the Brief tab shows for a live answer: the request as the backend read it and the best free option.
function briefOf(r) {
  const top = r.picks[0];
  return {
    request: r.query, replaces: r.target?.name || null,
    best_option: top ? `${top.name} (${top.license})` : null,
    covers: top ? `${pct(top.mustHaveCoverage)} of your must-haves` : null,
    gaps: top ? (top.gaps || []).map(g => g.label) : [],
    route: r.buildPlan ? 'create' : r.picks.length ? 'find' : null
  };
}

/** Convert Anna's {result, trace} into the envelope applyAgent() understands. Throws on an unknown shape. */
export function fromRecommend(data) {
  const r = data?.result, steps = traceSteps(data?.trace);
  if (r?.status === 'refused') {
    const alts = r.legalOptions?.alternatives || [], discounts = discountLines(r.legalOptions?.discounts);
    return {
      stage: 'refused', route: null, steps,
      assistant_message: [r.message, discounts.length ? `Official discounts:\n${discounts.map(d => `• ${d}`).join('\n')}` : null].filter(Boolean).join('\n\n'),
      discovery: alts.length ? { title: 'Legal options', recommendations: alts.map(legalCard), excluded: [], limitations: [`Declined: ${r.reason}`] } : null,
      plan: null,
      visual: { refused: true, headline: r.message, live: false, picks: alts.map(a => ({ name: a.name, url: safeUrl(a.url), license: a.license, openSource: a.license !== 'Freeware', coverage: null, platformMatch: true, gaps: [], notes: null })),
        discounts: discountItems(r.legalOptions?.discounts), risks: [], riskLevel: null, plan: null }
    };
  }
  if (r?.status !== 'ok' || !Array.isArray(r.picks)) throw new Error('response was not an RVAI recommendation or refusal');
  const live = r.source === 'discovered', target = r.target?.name;
  const discounts = discountLines(r.discounts);
  const lines = [
    target ? `Free alternatives to ${target}${live ? ' (found live, not reviewed by a person)' : ''}:` : `Free alternatives${live ? ' (found live, not reviewed by a person)' : ''}:`,
    ...(r.picks.length ? r.picks.map(p => `${p.rank}. ${p.name} — ${pct(p.mustHaveCoverage)} of must-haves, ${p.license}${p.platformMatch ? '' : ', platform not confirmed'}`) : ['No free alternative matched this request.']),
    discounts.length ? `\nOfficial discounts on the original:\n${discounts.map(d => `• ${d}`).join('\n')}` : null,
    r.buildPlan ? `\nNothing free covers enough of what you need, so there’s a plan for an original tool in the Plan tab.\n${r.buildPlan.reason}` : null,
    Array.isArray(r.threats?.items) && r.threats.items.length
      ? `\nThreats and risks (${r.threats.summary}):\n${r.threats.items.slice(0, 5).map(t => `• [${t.severity}] ${t.subject}: ${t.detail} ${t.advice}`).join('\n')}`
      : null
  ].filter(v => v != null);
  return {
    stage: live ? 'discovered' : 'recommended',
    route: r.buildPlan ? 'create' : r.picks.length ? 'find' : null,
    assistant_message: lines.join('\n'),
    steps,
    discovery: {
      title: target ? `Alternatives to ${target}` : 'Alternatives',
      recommendations: r.picks.map(p => pickCard(p, r.source, target)), excluded: [],
      limitations: [r.attribution, live ? 'Found live by Claude: links were checked, but no person has reviewed these entries.' : null].filter(isStr)
    },
    plan: r.buildPlan ? { steps: buildPlanSteps(r.buildPlan) } : null,
    brief: briefOf(r),
    visual: visualOf(r)
  };
}
