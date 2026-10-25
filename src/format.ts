import type { TraceEntry } from "./orchestrator.js";
import type { Recommendation, Refusal } from "./schemas.js";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function formatResult(result: Recommendation | Refusal): string {
  const out: string[] = [];
  if (result.status === "refused") {
    out.push(result.message, "");
    if (result.legalOptions.alternatives.length) {
      out.push("Free alternatives:");
      for (const a of result.legalOptions.alternatives) out.push(`  - ${a.name} (${a.license}) ${a.url}`);
    }
    if (result.legalOptions.discounts.length) {
      out.push("Official discounts:");
      for (const d of result.legalOptions.discounts) out.push(`  - ${d.name}: ${d.eligibility}. ${d.url}`);
    }
    return out.join("\n");
  }

  out.push(result.target ? `Free alternatives to ${result.target.name}` : "No catalog match for this request", "");
  for (const p of result.picks) {
    out.push(`${p.rank}. ${p.name}  [score ${p.score.toFixed(2)}, must-haves ${pct(p.mustHaveCoverage)}]`);
    out.push(`   ${p.license}${p.openSource ? "" : " (free, not open source)"}  ${p.url}`);
    out.push(`   ${p.why}`);
    if (p.notes) out.push(`   Note: ${p.notes}`);
    for (const g of p.gaps) {
      const status = { missing: "Missing", partial: "Partial", plugin: "Via plug-in" }[g.status];
      out.push(`   - ${status}: ${g.label}${g.workaround ? `. Workaround: ${g.workaround}` : ""}`);
    }
    out.push("");
  }
  if (result.discounts.length) {
    out.push("If you want the original, official discounts:");
    for (const d of result.discounts) out.push(`  - ${d.name}: ${d.eligibility}. ${d.url}`);
    out.push("");
  }
  if (result.buildPlan) {
    const b = result.buildPlan;
    out.push("Plan for an original tool", `  Why: ${b.reason}`, `  Concept: ${b.concept}`);
    if (b.featuresToBuild.length) out.push(`  Build: ${b.featuresToBuild.join(", ")}`);
    out.push("  Foundation:", ...b.suggestedFoundation.map((s) => `    - ${s}`));
    out.push("  Steps:", ...b.steps.map((s, i) => `    ${i + 1}. ${s}`));
    out.push("  Clean-room rules:", ...b.cleanRoomRules.map((s) => `    - ${s}`));
    out.push("");
  }
  out.push(result.attribution);
  return out.join("\n");
}

export function formatTrace(trace: TraceEntry[]): string {
  return trace.map((t) => `  ${t.step.padEnd(13)} ${t.status.padEnd(8)} ${String(t.ms).padStart(5)}ms${t.detail ? `  ${t.detail}` : ""}`).join("\n");
}
