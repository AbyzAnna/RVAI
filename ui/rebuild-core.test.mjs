// Run: node --test ui/rebuild-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./rebuild-core.js', import.meta.url), 'utf8');
const { detectSystem, buildBody, displayTitle } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

test('detects the system from the browser', () => {
  assert.deepEqual(detectSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), { os: 'windows', arch: 'x64' });
  assert.deepEqual(detectSystem('Mozilla/5.0 (X11; Linux aarch64)'), { os: 'linux', arch: 'arm64' });
  assert.deepEqual(detectSystem('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)'), { os: 'chromeos', arch: 'x64' });
  assert.deepEqual(detectSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', null, 'Apple M2'), { os: 'macos', arch: 'arm64' });
  assert.deepEqual(detectSystem('', { platform: 'macOS', architecture: 'arm' }), { os: 'macos', arch: 'arm64' });
});

test('builds the request with chosen features first and mods marked custom', () => {
  const profile = { officialName: 'Minecraft', summary: 's', category: 'sandbox game', features: [{ id: 'a', label: 'Build blocks', description: 'd' }, { id: 'b', label: 'Survival', description: 'e' }] };
  const body = buildBody(profile, { selected: new Set(['a']), custom: ['co-op on LAN'], model: 'm', os: 'linux', arch: 'x64', format: 'html', notes: '  cozy  ' });
  assert.deepEqual(body.features, [{ label: 'Build blocks', description: 'd', custom: false }, { label: 'co-op on LAN', description: '', custom: true }]);
  assert.deepEqual(body.system, { os: 'linux', arch: 'x64', format: 'html' });
  assert.equal(body.notes, 'cozy');
  assert.equal(displayTitle('BlockForge', 'Minecraft', ['co-op on LAN']), 'BlockForge (alternative to Minecraft · mods: co-op on LAN)');
});

test('spots requests to build the app and finds the product name', async () => {
  const { rebuildIntent, targetFrom } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('./rebuild-core.js', import.meta.url), 'utf8')).toString('base64'));
  assert.deepEqual(rebuildIntent('Create something new, i want to create a new app similar to it'), { target: null });
  assert.deepEqual(rebuildIntent('build my own version of Notion'), { target: 'Notion' });
  assert.deepEqual(rebuildIntent('I want to make a game like Minecraft with co-op'), { target: 'Minecraft' });
  assert.equal(rebuildIntent('I need something like Photoshop for my Linux laptop'), null);
  assert.equal(rebuildIntent('Free replacement for Microsoft Office on my Mac'), null);
  assert.equal(targetFrom('similar to it'), null);
  assert.equal(rebuildIntent('I want to make my first 2D game like in Unity, I\'m a beginner'), null);
  assert.equal(rebuildIntent('I want to make a game in Godot like Celeste'), null);
  assert.deepEqual(rebuildIntent('make my own version of Minecraft'), { target: 'Minecraft' });
  assert.deepEqual(rebuildIntent('create it with blue themed background'), { target: null, notes: 'with blue themed background' });
  assert.deepEqual(rebuildIntent('ok build it'), { target: null });
  assert.deepEqual(rebuildIntent('Can you make me one, dark mode please'), { target: null, notes: 'dark mode please' });
  assert.equal(targetFrom('something like Adobe Premiere Pro, but free'), 'Adobe Premiere Pro');
});
