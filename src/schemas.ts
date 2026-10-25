import { z } from "zod";

export const Platform = z.enum(["windows", "mac", "linux", "web", "android", "ios"]);
export type Platform = z.infer<typeof Platform>;

export const Category = z.enum(["creative", "office", "audio", "video", "engineering", "3d", "games", "dev", "security", "other"]);
export type Category = z.infer<typeof Category>;

export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);

// ---------- Catalog ----------

export const Feature = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  keywords: z.array(z.string()).default([]),
  // 3 = core, 2 = important, 1 = extra. Coverage is weighted by it.
  weight: z.number().int().min(1).max(3).default(2),
});

export const Discount = z.object({
  name: z.string(),
  url: z.string().url().startsWith("https://"),
  eligibility: z.string(),
});

export const Support = z.enum(["full", "partial", "plugin"]);
export type Support = z.infer<typeof Support>;

export const LearningCurve = z.enum(["easy", "moderate", "steep"]);

export const Alternative = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url().startsWith("https://"),
  // SPDX id, or "Freeware" for software that is free of charge but not open source.
  license: z.string().min(1),
  openSource: z.boolean(),
  platforms: z.array(Platform).min(1),
  learningCurve: LearningCurve,
  // Features not listed are missing.
  features: z.record(z.string(), Support),
  vibe: z.array(z.string()).default([]),
  workarounds: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});
export type Alternative = z.infer<typeof Alternative>;

export const Product = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  category: Category,
  vibe: z.array(z.string()).default([]),
  features: z.array(Feature).min(1),
  alternatives: z.array(Alternative).min(1),
  officialDiscounts: z.array(Discount).optional(),
});
export type Product = z.infer<typeof Product>;

export const Catalog = z.object({
  $schema: z.string().optional(),
  version: z.string().optional(),
  products: z.array(Product).min(1),
});
export type Catalog = z.infer<typeof Catalog>;

// ---------- Goal analysis ----------

// One short question for a request too vague to act on, with a few example answers to tap.
export const Clarify = z.object({ question: z.string().min(1), options: z.array(z.string()) });
export type Clarify = z.infer<typeof Clarify>;

export const GoalProfile = z.object({
  query: z.string(),
  targetProductId: z.string().nullable(),
  category: Category,
  tasks: z.array(z.string()),
  mustHaves: z.array(z.string()),
  niceToHaves: z.array(z.string()),
  platforms: z.array(Platform),
  skillLevel: SkillLevel,
  vibe: z.array(z.string()),
  openSourceOnly: z.boolean(),
  source: z.enum(["claude", "openrouter", "keyword"]),
  // Set only when the request doesn't say what kind of software or job it is about.
  clarify: Clarify.nullable().optional(),
});
export type GoalProfile = z.infer<typeof GoalProfile>;

// ---------- Comparison ----------

export const CandidateScore = z.object({
  alternativeId: z.string(),
  name: z.string(),
  license: z.string(),
  openSource: z.boolean(),
  url: z.string(),
  platformMatch: z.boolean(),
  mustHaveCoverage: z.number().min(0).max(1),
  niceToHaveCoverage: z.number().min(0).max(1),
  vibeMatch: z.number().min(0).max(1),
  learningFit: z.number().min(0).max(1),
  score: z.number().min(0).max(1),
  covered: z.array(z.string()),
  plugin: z.array(z.string()),
  partial: z.array(z.string()),
  missing: z.array(z.string()),
});
export type CandidateScore = z.infer<typeof CandidateScore>;

export const FeatureMatrix = z.object({
  productId: z.string().nullable(),
  features: z.array(z.object({ id: z.string(), label: z.string(), weight: z.number(), mustHave: z.boolean() })),
  candidates: z.array(CandidateScore),
});
export type FeatureMatrix = z.infer<typeof FeatureMatrix>;

// ---------- Recommendation ----------

export const Gap = z.object({
  featureId: z.string(),
  label: z.string(),
  status: z.enum(["missing", "partial", "plugin"]),
  workaround: z.string().nullable(),
});

export const Pick = z.object({
  rank: z.number().int().positive(),
  name: z.string(),
  url: z.string(),
  license: z.string(),
  openSource: z.boolean(),
  score: z.number(),
  mustHaveCoverage: z.number(),
  platformMatch: z.boolean(),
  why: z.string(),
  gaps: z.array(Gap),
  notes: z.string().optional(),
});
export type Pick = z.infer<typeof Pick>;

export const BuildPlan = z.object({
  reason: z.string(),
  concept: z.string(),
  featuresToBuild: z.array(z.string()),
  suggestedFoundation: z.array(z.string()),
  steps: z.array(z.string()),
  cleanRoomRules: z.array(z.string()),
});
export type BuildPlan = z.infer<typeof BuildPlan>;

// ---------- Threats and risks ----------

export const Severity = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof Severity>;

export const Threat = z.object({
  kind: z.enum(["legal-ip", "security", "maintenance", "prompt-injection"]),
  severity: Severity,
  // What the threat is about: the request itself, one alternative, or the build plan.
  scope: z.enum(["request", "alternative", "build-plan"]),
  subject: z.string(),
  detail: z.string(),
  advice: z.string(),
});
export type Threat = z.infer<typeof Threat>;

export const ThreatReport = z.object({
  level: Severity,
  summary: z.string(),
  items: z.array(Threat),
});
export type ThreatReport = z.infer<typeof ThreatReport>;

export const Recommendation = z.object({
  status: z.literal("ok"),
  query: z.string(),
  // "discovered": found live by Claude for a request outside the catalog; links checked, not human-reviewed.
  source: z.enum(["catalog", "discovered"]),
  target: z.object({ id: z.string(), name: z.string(), vendor: z.string().optional() }).nullable(),
  picks: z.array(Pick),
  discounts: z.array(Discount),
  buildPlan: BuildPlan.nullable(),
  // Added by the Threat & Risk agent; optional so older callers can still build a Recommendation.
  threats: ThreatReport.optional(),
  // When set, the answer is a question back to the person instead of picks.
  clarify: Clarify.nullable().optional(),
  attribution: z.string(),
});
export type Recommendation = z.infer<typeof Recommendation>;

export const Refusal = z.object({
  status: z.literal("refused"),
  query: z.string(),
  reason: z.string(),
  message: z.string(),
  legalOptions: z.object({
    alternatives: z.array(z.object({ name: z.string(), url: z.string(), license: z.string() })),
    discounts: z.array(Discount),
  }),
});
export type Refusal = z.infer<typeof Refusal>;
