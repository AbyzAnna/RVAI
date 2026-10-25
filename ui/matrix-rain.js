// Matrix-style rain of 0s and 1s on a canvas behind every view. Decorative only: aria-hidden, no pointer events.
// Three depth layers (far = small, dim, slow; near = large, bright, fast). Each drop has a bright leading
// character and a trail that fades out; characters flicker now and then. Under prefers-reduced-motion it draws
// a single still frame and stops; it pauses while the tab is hidden and is skipped in forced-colors mode.

const LAYERS = [
  { size: 11, speed: [2.5, 5], alpha: 0.28, trail: [10, 22], density: 0.55 },
  { size: 15, speed: [5, 9], alpha: 0.5, trail: [12, 26], density: 0.4 },
  { size: 21, speed: [9, 15], alpha: 0.8, trail: [14, 30], density: 0.22 },
];
const HEAD = '#e8ffec';
const GREEN = [0, 255, 65];
const FPS = 30;

const rand = (a, b) => a + Math.random() * (b - a);
const bit = () => (Math.random() < 0.5 ? '0' : '1');

export function startMatrixRain(canvas, win = window) {
  const media = q => win.matchMedia?.(q) ?? { matches: false, addEventListener() {} };
  if (media('(forced-colors: active)').matches) return null;
  const reduce = media('(prefers-reduced-motion: reduce)');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let w = 0, h = 0, drops = [], last = 0, raf = 0;

  function makeDrop(layer, x, scatter) {
    const len = Math.round(rand(...layer.trail));
    return { layer, x, y: scatter ? rand(-h, h) : rand(-h * 0.6, -layer.size), v: rand(...layer.speed), len,
      chars: Array.from({ length: len }, bit) };
  }
  function resize() {
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || win.innerWidth; h = canvas.clientHeight || win.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops = [];
    for (const layer of LAYERS) {
      const cols = Math.floor(w / layer.size);
      for (let c = 0; c < cols; c++) if (Math.random() < layer.density) drops.push(makeDrop(layer, c * layer.size, true));
    }
  }
  function draw(step) {
    ctx.clearRect(0, 0, w, h);
    for (const d of drops) {
      const { size, alpha } = d.layer;
      ctx.font = `${size}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
      d.y += d.v * step;
      if (Math.random() < 0.04) d.chars[(Math.random() * d.len) | 0] = bit(); // flicker
      for (let i = 0; i < d.len; i++) {
        const y = d.y - i * size;
        if (y < -size || y > h + size) continue;
        if (i === 0) {
          ctx.fillStyle = HEAD; ctx.globalAlpha = Math.min(1, alpha + 0.2);
          ctx.shadowColor = 'rgba(0,255,65,.9)'; ctx.shadowBlur = size * 0.8;
        } else {
          const fade = 1 - i / d.len;
          ctx.fillStyle = `rgb(${GREEN[0]},${Math.round(GREEN[1] * (0.55 + 0.45 * fade))},${GREEN[2]})`;
          ctx.globalAlpha = alpha * fade * fade; ctx.shadowBlur = 0;
        }
        ctx.fillText(d.chars[i], d.x, y);
      }
      if (d.y - d.len * size > h) Object.assign(d, makeDrop(d.layer, d.x, false));
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function frame(t) {
    raf = win.requestAnimationFrame(frame);
    if (t - last < 1000 / FPS) return;
    const step = last ? Math.min((t - last) / (1000 / FPS), 3) : 1;
    last = t;
    draw(step);
  }
  function play() {
    win.cancelAnimationFrame(raf); raf = 0; last = 0;
    if (reduce.matches || win.document?.hidden) return draw(0); // one still frame
    raf = win.requestAnimationFrame(frame);
  }
  resize(); play();
  win.addEventListener('resize', () => { resize(); play(); });
  win.document?.addEventListener('visibilitychange', play);
  reduce.addEventListener?.('change', play);
  return { stop: () => { win.cancelAnimationFrame(raf); raf = 0; } };
}

if (typeof document !== 'undefined') {
  const canvas = document.createElement('canvas');
  canvas.id = 'matrix-rain';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  startMatrixRain(canvas);
}
