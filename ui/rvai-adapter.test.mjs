// Fixtures in docs/examples/recommend.*.json are real responses from Anna's server (origin/main, offline mode).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRecommendEndpoint, recommendQuery, recommendContext, recommendError, fromRecommend, MAX_QUERY } from './rvai-adapter.js';

const fixture = name => JSON.parse(readFileSync(new URL(`../docs/examples/recommend.${name}.json`, import.meta.url), 'utf8'));

test('recognizes the recommend endpoint, absolute or relative', () => {
  assert.ok(isRecommendEndpoint('http://127.0.0.1:3000/api/recommend'));
  assert.ok(isRecommendEndpoint('/api/recommend'));
  assert.ok(!isRecommendEndpoint('http://localhost:8000/agent/run'));
  assert.ok(!isRecommendEndpoint('/api/recommend/extra'));
});

test('query sends only the latest message, so an earlier refusal cannot block later requests', () => {
  const user = content => ({ role: 'user', content });
  assert.equal(recommendQuery([user('How do I crack Photoshop?'), { role: 'assistant', content: 'refused' }, user('edit PDF forms like Acrobat')]), 'edit PDF forms like Acrobat');
  assert.equal(recommendQuery([user('like Photoshop'), user('  ')]), 'like Photoshop');
  assert.equal(recommendQuery([user('x'.repeat(MAX_QUERY + 50))]).length, MAX_QUERY);
  assert.equal(recommendQuery([]), '');
});

test('a vague request becomes a clarifying question with tap-able answers, not an empty list of picks', () => {
  const r = fromRecommend({ result: { status: 'ok', query: 'app', source: 'catalog', target: null, picks: [], discounts: [], buildPlan: null, attribution: 'x',
    clarify: { question: 'What do you want to do with it?', options: ['Edit photos', 'Write homework'] } }, trace: [] });
  assert.equal(r.stage, 'clarifying');
  assert.equal(r.clarifying_question.prompt, 'What do you want to do with it?');
  assert.deepEqual(r.clarifying_question.options, ['Edit photos', 'Write homework']);
  assert.match(r.assistant_message, /• Write homework/);
  assert.equal(r.discovery, null);
});

test('context carries the last two earlier messages, never refused ones or the latest', () => {
  const user = (content, refused) => ({ role: 'user', content, ...(refused ? { refused } : {}) });
  assert.deepEqual(recommendContext([user('like Photoshop'), { role: 'assistant', content: 'GIMP' }, user('which works offline?')]), ['like Photoshop']);
  assert.deepEqual(recommendContext([user('How do I crack Photoshop?', true), user('which works offline?')]), []);
  assert.deepEqual(recommendContext([user('a'), user('b'), user('c'), user('d')]), ['b', 'c']);
  assert.deepEqual(recommendContext([user('only one')]), []);
});

test('backend string errors are surfaced', () => {
  assert.equal(recommendError(fixture('error')), 'Describe what you need.');
  assert.equal(recommendError({ error: { message: 'x' } }), null);
  assert.equal(recommendError(fixture('ok')), null);
});

test('catalog recommendation maps to discovery cards with gaps, no plan', () => {
  const env = fromRecommend(fixture('ok'));
  assert.equal(env.stage, 'recommended');
  assert.equal(env.route, 'find');
  assert.equal(env.plan, null);
  const [first] = env.discovery.recommendations;
  assert.equal(first.project.name, 'FreeCAD');
  assert.equal(first.project.official_url, 'https://www.freecad.org');
  assert.ok(first.summary_lines.some(l => l.startsWith('Partial: DWG file support — workaround:')));
  assert.match(env.assistant_message, /^Free alternatives to Autodesk AutoCAD:/);
  assert.match(env.assistant_message, /Autodesk Education Plan/);
  assert.ok(env.steps.some(s => s.label === 'analyze' && s.status.startsWith('fallback')));
  // shape app.js validates before accepting the fields
  assert.ok(env.discovery.recommendations.every(m => typeof m.project.name === 'string'));
});

test('build plan becomes a Create plan with titled steps', () => {
  const env = fromRecommend(fixture('build-plan'));
  assert.equal(env.route, 'create');
  assert.ok(env.plan.steps.length >= 6);
  assert.ok(env.plan.steps.every(s => typeof s.title === 'string' && s.title));
  assert.equal(env.plan.steps.at(-1).title, 'Clean-room rules');
  assert.match(env.assistant_message, /Plan tab/);
});

test('refusal is declined and lists only legal options', () => {
  const env = fromRecommend(fixture('refused'));
  assert.equal(env.stage, 'refused');
  assert.equal(env.plan, null);
  assert.deepEqual(env.discovery.recommendations.map(m => m.project.name), ['GIMP', 'Krita', 'Photopea']);
  assert.match(env.assistant_message, /can't help with that/);
  assert.deepEqual(env.steps, [{ label: 'guard-input', status: 'blocked (piracy)' }]);
});

test('live-discovered results are labeled as not human-reviewed', () => {
  const data = fixture('ok');
  data.result.source = 'discovered';
  const env = fromRecommend(data);
  assert.equal(env.stage, 'discovered');
  assert.match(env.assistant_message, /not reviewed by a person/);
  assert.ok(env.discovery.recommendations.every(m => /not reviewed/.test(m.project.verification_status)));
});

test('unknown shapes are rejected, not rendered', () => {
  assert.throws(() => fromRecommend({}), /not an RVAI recommendation/);
  assert.throws(() => fromRecommend({ result: { status: 'ok' } }), /not an RVAI recommendation/);
});

test('chat and side-panel cards name the paid product they replace', () => {
  const env = fromRecommend(fixture('ok'));
  assert.ok(env.discovery.recommendations.every(m => m.project.alternative_to === 'Autodesk AutoCAD'));
  assert.ok(env.visual.picks.every(p => p.alternativeTo === 'Autodesk AutoCAD'));
});

test('a recommendation carries a brief the Brief tab can show', () => {
  const ok = fromRecommend(fixture('ok'));
  assert.equal(ok.brief.request, 'I want something like Fusion 360 for 3D CAD with an AI generative design helper on my Mac');
  assert.equal(ok.brief.replaces, 'Autodesk AutoCAD');
  assert.match(ok.brief.best_option, /^FreeCAD \(/);
  assert.equal(ok.brief.route, 'find');
  assert.equal(fromRecommend(fixture('build-plan')).brief.route, 'create');
  assert.equal(fromRecommend(fixture('refused')).brief, undefined);
});
