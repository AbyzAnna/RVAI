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
