// Pure helpers for the Rebuild page (ui/rebuild.js): system detection and request shaping. No DOM, no fetch.

export const OS_OPTIONS = [
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
  { id: 'chromeos', label: 'ChromeOS' },
];
export const ARCH_OPTIONS = [
  { id: 'arm64', label: 'ARM (Apple Silicon, Snapdragon)' },
  { id: 'x64', label: 'Intel / AMD (x86-64)' },
  { id: 'unknown', label: 'Not sure' },
];
export const FORMAT_OPTIONS = [
  { id: 'html', label: 'App that opens in my browser', file: '.html', note: 'One file. Double-click to open. Nothing to install.' },
  { id: 'python', label: 'Desktop window (Python)', file: '.py', note: 'One file. Needs Python 3, which is free.' },
];

/** Best guess at the person's OS and CPU from the browser. They can change both. */
export function detectSystem(ua = '', uaData = null, webglRenderer = '') {
  const platform = String(uaData?.platform || '').toLowerCase();
  const s = `${platform} ${ua}`.toLowerCase();
  const os = /cros/.test(s) || platform === 'chrome os' ? 'chromeos'
    : /windows/.test(s) ? 'windows'
    : /mac ?os|macintosh|mac os x/.test(s) && !/iphone|ipad/.test(s) ? 'macos'
    : /linux|x11/.test(s) && !/android/.test(s) ? 'linux'
    : 'macos';
  let arch = 'unknown';
  if (uaData?.architecture === 'arm') arch = 'arm64';
  else if (uaData?.architecture === 'x86') arch = 'x64';
  else if (/aarch64|arm64/.test(s)) arch = 'arm64';
  else if (/x86_64|win64|x64|amd64|wow64/.test(s)) arch = 'x64';
  // Safari on Apple Silicon still says "Intel Mac OS X"; the GPU name gives it away.
  if (os === 'macos' && /apple (m\d|gpu)/i.test(webglRenderer)) arch = 'arm64';
  return { os, arch };
}

/** The display title rule: own name, then what it is an alternative to and the mods it adds. */
export function displayTitle(appName, target, mods = []) {
  return `${appName} (alternative to ${target}${mods.length ? ` · mods: ${mods.join(', ')}` : ''})`;
}

/** Turns the page state into the POST /api/rebuild/build body. */
export function buildBody(profile, state) {
  const chosen = profile.features.filter(f => state.selected.has(f.id)).map(f => ({ label: f.label, description: f.description, custom: false }));
  const extra = state.custom.map(label => ({ label, description: '', custom: true }));
  return {
    target: profile.officialName,
    summary: profile.summary,
    category: profile.category,
    features: [...chosen, ...extra].slice(0, 15),
    model: state.model,
    system: { os: state.os, arch: state.arch, format: state.format },
    notes: state.notes.trim().slice(0, 500),
  };
}

/** A Blob-ready download for the one finished file. */
export function downloadSpec(file) {
  return { name: file.filename, type: `${file.mime};charset=utf-8`, text: file.content };
}
