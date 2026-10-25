import { z } from "zod";
import { SYSTEM_RULES } from "../guardrails.js";
import { Category, Platform, SkillLevel, type Catalog, type GoalProfile } from "../schemas.js";

/** What the model returns; mapped and checked against the catalog by toProfile. */
export const LlmGoal = z.strictObject({
  targetProductId: z.string().nullable(),
  category: Category,
  tasks: z.array(z.string()),
  mustHaves: z.array(z.string()),
  niceToHaves: z.array(z.string()),
  platforms: z.array(Platform),
  skillLevel: SkillLevel,
  vibe: z.array(z.string()),
  openSourceOnly: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  answerOptions: z.array(z.string()),
});
export type LlmGoal = z.infer<typeof LlmGoal>;

function describeCatalog(catalog: Catalog): string {
  return catalog.products
    .map((p) => `- ${p.id} (${p.name}, ${p.category}): features ${p.features.map((f) => `${f.id} = ${f.label}`).join("; ")}`)
    .join("\n");
}

export function systemPrompt(catalog: Catalog): string {
  return `You turn a person's request for affordable software or games into a structured goal profile.
Map the request to one product id from this catalog, or null if none fits:
${describeCatalog(catalog)}

mustHaves and niceToHaves must be feature ids of that product. Put features the person names or clearly needs in mustHaves; when they name none, use the product's first four features. Put the rest in niceToHaves.
vibe holds short adjectives for how the tool or game should feel (e.g. cozy, playful, simple, professional).
platforms holds only platforms the person states; a Chromebook means ["web", "linux"] because it runs Linux apps, an iPad or iPhone means ["ios"]. openSourceOnly is true only if they ask for open source only.
tasks holds the jobs they want done, each as a short phrase in plain words ("retouch photos", "open docx files from school").
skillLevel is beginner when they say they are new, a kid or a student starting out; advanced when they say professional or studio; otherwise intermediate.
Pick the product by the job, even when they don't name it: making beats is ableton-live, a first 2D game is unity, a password manager is 1password. Prefer null over a weak guess.
If they name a paid product or a clear job that isn't in the catalog (for example "like Duolingo", "a farming game"), set targetProductId to null and do not ask a question: free alternatives are looked up live.
Only if the request doesn't say what kind of software or what job it is for (for example "app", "something for school", "help me with my computer"), set targetProductId to null, set clarifyingQuestion to one short, friendly question that would let you pick, and give 3 or 4 short answerOptions the person could tap (each a few words, e.g. "Write essays and homework"). Otherwise clarifyingQuestion is null and answerOptions is empty.

${SYSTEM_RULES}`;
}

/** Turns model output into a profile, dropping product and feature ids the catalog doesn't have. */
export function toProfile(query: string, parsed: LlmGoal, catalog: Catalog, source: GoalProfile["source"]): GoalProfile {
  const product = catalog.products.find((p) => p.id === parsed.targetProductId);
  const valid = new Set(product?.features.map((f) => f.id) ?? []);
  const mustHaves = parsed.mustHaves.filter((id) => valid.has(id));
  return {
    query,
    targetProductId: product?.id ?? null,
    category: product?.category ?? parsed.category,
    tasks: parsed.tasks,
    mustHaves,
    niceToHaves: parsed.niceToHaves.filter((id) => valid.has(id) && !mustHaves.includes(id)),
    platforms: parsed.platforms,
    skillLevel: parsed.skillLevel,
    vibe: parsed.vibe.map((v) => v.toLowerCase()),
    openSourceOnly: parsed.openSourceOnly,
    source,
    // A question only makes sense when nothing could be matched.
    clarify: !product && parsed.clarifyingQuestion ? { question: parsed.clarifyingQuestion, options: parsed.answerOptions.slice(0, 4) } : null,
  };
}
