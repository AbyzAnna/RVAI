// Fixtures in docs/examples/recommend.*.json are real responses from Anna's server (origin/main, offline mode).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRecommendEndpoint, recommendQuery, recommendError, fromRecommend, MAX_QUERY } from './rvai-adapter.js';

const fixture = name => JSON.parse(readFileSync(new URL(`../docs/examples/recommend.${name}.json`, import.meta.url), 'utf8'));

test('recognizes the recommend endpoint, absolute or relative', () => {
  assert.ok(isRecommendEndpoint('http://127.0.0.1:3000/api/recommend'));
  assert.ok(isRecommendEndpoint('/api/recommend'));
  assert.ok(!isRecommendEndpoint('http://localhost:8000/agent/run'));
  assert.ok(!isRecommendEndpoint('/api/recommend/extra'));
});

test('query keeps the goal and the latest messages within the server limit', () => {
  const user = content => ({ role: 'user', content });
  assert.equal(recommendQuery([user('like Photoshop'), { role: 'assistant', content: 'ok' }, user('on Linux')]), 'like Photoshop. on Linux');
  const long = [user('GOAL'), ...Array.from({ length: 50 }, (_, i) => user(`detail number ${i}`))];
  const q = recommendQuery(long);
  assert.ok(q.length <= MAX_QUERY);
  assert.ok(q.startsWith('GOAL. '));
  assert.ok(q.endsWith('detail number 49'));
  assert.equal(recommendQuery([]), '');
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
