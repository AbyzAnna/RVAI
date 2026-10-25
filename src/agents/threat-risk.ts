import type { GoalProfile, Product, Severity, Threat, ThreatReport } from "../schemas.js";

/**
 * Threat & Risk agent: flags legal/IP risks, security risks of the recommended tools
 * (unofficial download sites, closed binaries, unmaintained projects) and prompt injection.
 * Rule based, so it runs instantly and can't itself be talked out of its checks.
 */

const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|earlier|all|your)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?)\b/i,
  /\b(system|developer) (prompt|message|instructions?)\b/i,
  /\byou are now\b|\bact as\b.{0,30}\b(dan|jailbreak|unfiltered|unrestricted)\b/i,
  /\bjailbreak\b|\bdo anything now\b/i,
  /<\/?(system|assistant|instructions?)>|\[\/?INST\]|<\|im_start\|>/i,
  /\b(reveal|print|show|repeat)\b.{0,20}\b(your|the) (prompt|instructions|rules|api key|secrets?)\b/i,
];

/** Hosts that repackage other people's software; installers from them are a common malware route. */
const MIRROR_HOSTS = [
  "softonic.", "filehippo.", "uptodown.", "download.cnet.", "softpedia.", "malavida.", "apkpure.",
  "filehorse.", "getintopc.", "oceanofgames.", "steamunlocked.", "4shared.", "mediafire.", "mega.nz",
];

const UNMAINTAINED = /\b(unmaintained|abandoned|discontinued|no longer (maintained|developed|updated)|archived|end of life)\b/i;
const CLONE_WORDING = /\b(clone|exact(ly)? (like|the same)|same (look|logo|name|characters?)|copy of|replica|1:1)\b/i;

const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/** Scans the raw request for prompt-injection attempts. Runs before any model sees it. */
export function scanForInjection(query: string): Threat[] {
  if (!INJECTION_PATTERNS.some((p) => p.test(query))) return [];
  return [
    {
      kind: "prompt-injection",
      severity: "high",
      scope: "request",
      subject: "your request",
      detail: "The request contains text that tries to change the agent's instructions.",
      advice: "RVAI ignored those instructions, skipped the language model and used its offline keyword analyzer instead.",
    },
  ];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export interface ThreatInput {
  profile: GoalProfile;
  product: Product | undefined;
  /** Alternatives were found live by a model rather than taken from the reviewed catalog. */
  discovered: boolean;
  /** Findings from the input scan, carried into the final report. */
  requestThreats: Threat[];
}

export function assessThreats({ profile, product, discovered, requestThreats }: ThreatInput): ThreatReport {
  const items: Threat[] = [...requestThreats];
  const add = (t: Threat) => items.push(t);

  for (const alt of product?.alternatives ?? []) {
    const host = hostOf(alt.url);
    if (MIRROR_HOSTS.some((m) => host.includes(m))) {
      add({
        kind: "security", severity: "high", scope: "alternative", subject: alt.name,
        detail: `The link points to ${host}, a third-party download site rather than the project's own site.`,
        advice: `Download ${alt.name} only from its official website or official app store listing.`,
      });
    } else if (host === "github.com" || host.endsWith(".github.io")) {
      add({
        kind: "security", severity: "low", scope: "alternative", subject: alt.name,
        detail: "Hosted on GitHub, where look-alike forks and fake release files exist.",
        advice: "Install from the official repository's Releases page and check the publisher name.",
      });
    }
    if (!alt.openSource) {
      add({
        kind: "security", severity: "medium", scope: "alternative", subject: alt.name,
        detail: "Free of charge but closed source, so nobody outside the vendor can audit the code.",
        advice: "Get it from the vendor's own site, decline bundled offers in the installer, and read the license for commercial-use limits.",
      });
    }
    if (UNMAINTAINED.test(alt.notes ?? "")) {
      add({
        kind: "maintenance", severity: "high", scope: "alternative", subject: alt.name,
        detail: "Noted as no longer maintained, so security holes may never be fixed.",
        advice: "Prefer an actively maintained option, or keep it offline and away from untrusted files.",
      });
    } else if (discovered) {
      add({
        kind: "maintenance", severity: "medium", scope: "alternative", subject: alt.name,
        detail: "Found live and not yet reviewed by a person; it could be stale or misdescribed.",
        advice: "Check the date of the latest release and recent activity on the official site before relying on it.",
      });
    }
  }

  add({
    kind: "legal-ip", severity: "low", scope: "request", subject: product?.name ?? "the paid product",
    detail: "Product names, logos and characters are trademarks or copyrighted works of their owners.",
    advice: "Use the alternatives under their own names; never rebrand them as the paid product.",
  });
  if (CLONE_WORDING.test(profile.query)) {
    add({
      kind: "legal-ip", severity: "medium", scope: "build-plan", subject: "build plan",
      detail: "Copying another product's exact look, name or characters can infringe trademark, copyright or trade dress.",
      advice: "Recreate the job it does and the feel you like with your own design, name and art.",
    });
  }
  add({
    kind: "legal-ip", severity: profile.category === "games" ? "medium" : "low", scope: "build-plan", subject: "build plan",
    detail: profile.category === "games"
      ? "Game art, music, levels and characters are protected even when the game mechanics are not."
      : "Reusing code, UI layouts or assets from the paid product would copy protected work.",
    advice: "Follow the clean-room rules in the build plan and keep a CREDITS file for every asset and library you use.",
  });

  return summarize(items);
}

/** Keeps only threats about what the final answer shows, then rates the overall level. */
export function scopeThreats(report: ThreatReport, pickNames: string[], hasBuildPlan: boolean): ThreatReport {
  return summarize(
    report.items.filter((t) =>
      t.scope === "request" || (t.scope === "alternative" ? pickNames.includes(t.subject) : hasBuildPlan),
    ),
  );
}

function summarize(items: Threat[]): ThreatReport {
  const sorted = [...items].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const level = sorted[0]?.severity ?? "low";
  const counts = (["high", "medium", "low"] as const)
    .map((s) => [s, sorted.filter((t) => t.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`);
  return {
    level,
    summary: sorted.length ? `Overall risk ${level}: ${counts.join(", ")}.` : "No risks found.",
    items: sorted,
  };
}
