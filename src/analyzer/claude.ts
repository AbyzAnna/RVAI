import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { SYSTEM_RULES } from "../guardrails.js";
import { Category, Platform, SkillLevel, type Catalog, type GoalProfile } from "../schemas.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** The slice of the SDK client the analyzer uses, so tests can pass a fake. */
export type MessagesClient = Pick<Anthropic, "messages">;

const LlmGoal = z.object({
  targetProductId: z.string().nullable(),
  category: Category,
  tasks: z.array(z.string()),
  mustHaves: z.array(z.string()),
  niceToHaves: z.array(z.string()),
  platforms: z.array(Platform),
  skillLevel: SkillLevel,
  vibe: z.array(z.string()),
  openSourceOnly: z.boolean(),
});

function describeCatalog(catalog: Catalog): string {
  return catalog.products
    .map((p) => `- ${p.id} (${p.name}, ${p.category}): features ${p.features.map((f) => `${f.id} = ${f.label}`).join("; ")}`)
    .join("\n");
}

export function hasApiCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/** Goal analyzer backed by Claude structured output. Throws on refusal or an unusable answer. */
export async function analyzeWithClaude(
  query: string,
  catalog: Catalog,
  opts: { client?: MessagesClient; model?: string } = {},
): Promise<GoalProfile> {
  const client = opts.client ?? new Anthropic();
  const response = await client.messages.parse({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(LlmGoal) },
    system: `You turn a person's request for affordable software or games into a structured goal profile.
Map the request to one product id from this catalog, or null if none fits:
${describeCatalog(catalog)}

mustHaves and niceToHaves must be feature ids of that product. Put features the person names or clearly needs in mustHaves; when they name none, use the product's first four features. Put the rest in niceToHaves.
vibe holds short adjectives for how the tool or game should feel (e.g. cozy, playful, simple, professional).
platforms holds only platforms the person states. openSourceOnly is true only if they ask for open source only.

${SYSTEM_RULES}`,
    messages: [{ role: "user", content: query }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Claude returned no parsable profile (stop_reason: ${response.stop_reason})`);

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
    source: "claude",
  };
}
