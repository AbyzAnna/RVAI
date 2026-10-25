/**
 * Guardrails: RVAI helps people get the same job done, not the same product.
 * Requests to crack, pirate, decompile or rip paid software are refused, and every
 * outgoing link must be an https link that does not look like a piracy source.
 */

export type GuardCategory = "piracy" | "license-bypass" | "reverse-engineering" | "asset-ripping" | "cheating";

export interface GuardResult {
  allowed: boolean;
  category?: GuardCategory;
  reason?: string;
}

const RULES: Array<{ category: GuardCategory; reason: string; patterns: RegExp[] }> = [
  {
    category: "piracy",
    reason: "Downloading or sharing paid software without paying is piracy.",
    patterns: [
      /\bcrack(s|ed|ing)?\b/i,
      /\bkey ?gen(s|erator)?\b/i,
      /\b(serial|license|licence|product|activation) (key|code|number)s?\b.*\b(free|generate|get|find)\b/i,
      /\b(free|generate|get|find)\b.*\b(serial|license|licence|product|activation) (key|code|number)s?\b/i,
      /\bwarez\b/i,
      /\bnulled\b/i,
      /\bpirat(e|ed|ing|ion)\b/i,
      /\btorrent(s|ing)?\b/i,
      /\brepack(s|ed)?\b/i,
      /\b(cracked|modded|patched) apk\b/i,
      /\bfree (full )?download\b.*\b(full version|premium|pro)\b/i,
    ],
  },
  {
    category: "license-bypass",
    reason: "Bypassing DRM, license checks, trials or paywalls breaks the license and often the law.",
    patterns: [
      /\b(bypass|remove|disable|skip|get around|circumvent|defeat|break)\b.{0,40}\b(drm|license|licence|licensing|activation|trial|paywall|subscription|copy ?protection|denuvo|serial check)\b/i,
      /\b(reset|extend)\b.{0,20}\btrial\b/i,
      /\bactivat(e|or|ion)\b.{0,30}\bwithout (paying|a license|a key)\b/i,
    ],
  },
  {
    category: "reverse-engineering",
    reason: "RVAI does not decompile or reverse engineer paid software; it designs original tools instead.",
    patterns: [
      /\bdecompil(e|ed|er|ing)\b/i,
      /\bdisassembl(e|y|er|ing)\b/i,
      /\breverse[- ]engineer(ed|ing)?\b/i,
      /\b(dump|extract|copy|steal)\b.{0,30}\b(source code|binary|binaries|exe|dll)\b/i,
    ],
  },
  {
    category: "asset-ripping",
    reason: "Ripping art, models, music or levels out of a paid product copies someone else's work.",
    patterns: [
      /\b(rip|ripping|ripped|extract|extracting|dump|steal)\b.{0,40}\b(assets?|sprites?|textures?|models?|music|soundtrack|sounds?|levels?|maps?|art(work)?|fonts?|icons?)\b/i,
      /\b(assets?|sprites?|textures?|models?)\b.{0,20}\b(rip|ripper|ripping)\b/i,
      /\bpixel[- ]for[- ]pixel\b/i,
      /\bexact (copy|clone|replica)\b/i,
    ],
  },
  {
    category: "cheating",
    reason: "Cheats and anti-cheat bypasses hurt other players and break the game's terms.",
    patterns: [/\baim ?bot\b/i, /\bwall ?hack\b/i, /\b(bypass|evade|disable)\b.{0,20}\banti[- ]?cheat\b/i, /\bcheat engine\b/i],
  },
];

// Everyday phrases that contain a piracy word but mean something else. They are removed before the
// rules run, so "a pirate ship game" or "a torrent client" pass while "pirate Photoshop" still doesn't.
const HARMLESS_PHRASES = [
  /\bpirate[- ](ship|boat|game|adventure|theme|themed|story|crew|map|party|costume|hat|captain|treasure|island|flag|radio)s?\b/gi,
  /\bcrack(s|ed|ing)? (the |a |this )?(code|puzzle|case|cipher|riddle|joke|egg|safe|nut)s?\b/gi,
  /\bcracked (screen|phone|glass|egg|tile|wall)s?\b/gi,
  /\btorrent (client|app|program|software|downloader|manager)s?\b/gi,
];

/** Checks a user request before any analysis runs. */
export function checkRequest(text: string): GuardResult {
  const meant = HARMLESS_PHRASES.reduce((t, p) => t.replace(p, " "), text);
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(meant))) {
      return { allowed: false, category: rule.category, reason: rule.reason };
    }
  }
  return { allowed: true };
}

const BLOCKED_HOST_TERMS = [
  "crack", "keygen", "warez", "torrent", "nulled", "pirate", "piratebay", "rutracker",
  "fitgirl", "dodi", "igg-games", "getintopc", "filecr", "softonic", "apkmirror-mod", "repack",
];

// Official sites of legal BitTorrent clients, which would otherwise trip the "torrent" host marker.
const TORRENT_CLIENT_HOSTS = ["qbittorrent.org", "transmissionbt.com", "deluge-torrent.org", "webtorrent.io"];

/** Returns true when a URL is safe to show: https, a real host, no piracy markers. */
export function isSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (TORRENT_CLIENT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  const haystack = `${url.hostname}${url.pathname}`.toLowerCase();
  return !BLOCKED_HOST_TERMS.some((term) => haystack.includes(term));
}

// "torrent" alone is fine (torrent clients are legal); a torrent *of* something or a download via torrent is not.
const BLOCKED_OUTPUT_TEXT = /\b(crack(ed)?|keygen|warez|nulled)\b|\btorrents? (of|for|file|link|download)s?\b|\b(download|get|grab)\b.{0,30}\btorrents?\b/i;

/** Scans every string in an outgoing result. Returns the problems found (empty means clean). */
export function auditOutput(value: unknown): string[] {
  const problems: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (/^https?:\/\//i.test(v) && !isSafeUrl(v)) problems.push(`${path}: unsafe link ${v}`);
      else if (BLOCKED_OUTPUT_TEXT.test(v)) problems.push(`${path}: mentions piracy terms`);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, item] of Object.entries(v)) walk(item, path ? `${path}.${k}` : k);
    }
  };
  walk(value, "");
  return problems;
}

export const REFUSAL_PREFIX =
  "I can't help with that, because RVAI only points to legal options and original work.";

export const SYSTEM_RULES = `Rules you must follow:
- Recommend only free, legal software, with its license and its official website.
- Never mention, link to or describe cracks, keygens, warez, torrents of paid software, or unofficial "free download" mirrors.
- Never help bypass DRM, license checks, trials, paywalls or anti-cheat.
- Never help decompile, disassemble or reverse engineer paid software, or rip its code, art, music, models or levels.
- Describe what a product does and how it feels in your own words. Do not reuse its trademarks, logos or characters for new work.`;
