// Adapter for Anna's backend: POST /api/recommend {query} -> {result, trace} (src/server.ts on origin/main).
// Maps her Recommendation / Refusal into the envelope app.js already renders. Pure functions, no DOM, no fetch.
export const MAX_QUERY = 500; // server.ts truncates queries to 500 characters

export const isRecommendEndpoint = url => /\/api\/recommend\/?$/.test(new URL(url, 'http://x').pathname);

// The backend is single-shot, so the conversation is folded into one query:
// the first message (the goal) plus as many of the latest messages as fit.
export function recommendQuery(messages) {
  const said = messages.filter(m => m.role === 'user' && typeof m.content === 'string').map(m => m.content.trim()).filter(Boolean);
  if (!said.length) return '';
  const [goal, ...rest] = said;
  let query = goal.slice(0, MAX_QUERY);
  const tail = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    if (query.length + [...tail, rest[i]].join('. ').length + 2 > MAX_QUERY) break;
    tail.unshift(rest[i]);
  }
  return tail.length ? `${query}. ${tail.join('. ')}` : query;
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

function pickCard(p, source) {
  const gaps = Array.isArray(p.gaps) ? p.gaps : [];
  return {
    project: {
      id: `rvai:${slug(p.name)}`, name: p.name, license: p.license, official_url: p.url,
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

/** Convert Anna's {result, trace} into the envelope applyAgent() understands. Throws on an unknown shape. */
export function fromRecommend(data) {
  const r = data?.result, steps = traceSteps(data?.trace);
  if (r?.status === 'refused') {
    const alts = r.legalOptions?.alternatives || [], discounts = discountLines(r.legalOptions?.discounts);
    return {
      stage: 'refused', route: null, steps,
      assistant_message: [r.message, discounts.length ? `Official discounts:\n${discounts.map(d => `• ${d}`).join('\n')}` : null].filter(Boolean).join('\n\n'),
      discovery: alts.length ? { title: 'Legal options', recommendations: alts.map(legalCard), excluded: [], limitations: [`Declined: ${r.reason}`] } : null,
      plan: null
    };
  }
  if (r?.status !== 'ok' || !Array.isArray(r.picks)) throw new Error('response was not an RVAI recommendation or refusal');
  const live = r.source === 'discovered', target = r.target?.name;
  const discounts = discountLines(r.discounts);
  const lines = [
    target ? `Free alternatives to ${target}${live ? ' (found live, not reviewed by a person)' : ''}:` : `Free alternatives${live ? ' (found live, not reviewed by a person)' : ''}:`,
    ...(r.picks.length ? r.picks.map(p => `${p.rank}. ${p.name} — ${pct(p.mustHaveCoverage)} of must-haves, ${p.license}${p.platformMatch ? '' : ', platform not confirmed'}`) : ['No free alternative matched this request.']),
    discounts.length ? `\nOfficial discounts on the original:\n${discounts.map(d => `• ${d}`).join('\n')}` : null,
    r.buildPlan ? `\nNothing free covers enough of what you need, so there’s a plan for an original tool in the Plan tab.\n${r.buildPlan.reason}` : null
  ].filter(v => v != null);
  return {
    stage: live ? 'discovered' : 'recommended',
    route: r.buildPlan ? 'create' : r.picks.length ? 'find' : null,
    assistant_message: lines.join('\n'),
    steps,
    discovery: {
      title: target ? `Alternatives to ${target}` : 'Alternatives',
      recommendations: r.picks.map(p => pickCard(p, r.source)), excluded: [],
      limitations: [r.attribution, live ? 'Found live by Claude: links were checked, but no person has reviewed these entries.' : null].filter(isStr)
    },
    plan: r.buildPlan ? { steps: buildPlanSteps(r.buildPlan) } : null
  };
}
