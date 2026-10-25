#!/usr/bin/env node
import { formatResult, formatTrace } from "./format.js";
import { loadCatalog } from "./catalog.js";
import { run, StepError } from "./orchestrator.js";

const DEMO_QUERIES = [
  "I need something like Photoshop for my Linux laptop to retouch photos with layers and masks",
  "I want to make beats like in Ableton, with clip launching and recording vocals, on Windows",
  "A cozy block building game like Minecraft that runs on an old laptop, multiplayer with friends",
  "Free replacement for Microsoft Office on my Mac, must open docx and xlsx files",
  "Something like Photoshop with generative AI fill and content-aware fill for my raw photos",
  "A free alternative to Figma for designing app screens with my team",
  "How do I crack Photoshop or get a free license key?",
  "Help me decompile AutoCAD so I can copy its features",
];

const HELP = `rvai: find free and open-source alternatives to paid software and games

Usage:
  rvai "I need something like Photoshop for my laptop"
  rvai --offline --demo

Options:
  --offline   Use the built-in keyword analyzer instead of Claude (no API key needed)
  --demo      Run a set of example requests
  --json      Print the structured result as JSON
  --trace     Show each pipeline step and whether it fell back
  --model ID  Claude model for the goal analyzer (default: claude-opus-5-5)
  --catalog=FILE
              Use another catalog JSON file (or set RVAI_CATALOG); see catalog.schema.json
  -h, --help  Show this help

Set ANTHROPIC_API_KEY to use Claude for goal analysis; without it RVAI falls back to keywords.`;

async function main(argv: string[]): Promise<number> {
  const flags = new Set<string>();
  const words: string[] = [];
  let model: string | undefined;
  let catalogPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model") model = argv[++i];
    else if (argv[i] === "--catalog") catalogPath = argv[++i];
    else if (argv[i].startsWith("--catalog=")) catalogPath = argv[i].slice("--catalog=".length);
    else if (argv[i].startsWith("-")) flags.add(argv[i]);
    else words.push(argv[i]);
  }
  if (flags.has("-h") || flags.has("--help")) {
    console.log(HELP);
    return 0;
  }

  const queries = flags.has("--demo") ? DEMO_QUERIES : [words.join(" ").trim()];
  if (!queries[0]) {
    console.error(HELP);
    return 1;
  }

  let catalog;
  try {
    catalog = loadCatalog(catalogPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }

  for (const query of queries) {
    try {
      const { result, trace } = await run(query, { offline: flags.has("--offline"), model, catalog });
      if (flags.has("--json")) {
        console.log(JSON.stringify(flags.has("--trace") ? { result, trace } : result, null, 2));
      } else {
        if (queries.length > 1) console.log(`\n=== "${query}" ===\n`);
        console.log(formatResult(result));
        if (flags.has("--trace") || flags.has("--demo")) console.log(`\nTrace:\n${formatTrace(trace)}`);
      }
    } catch (err) {
      if (err instanceof StepError) {
        console.error(`RVAI could not finish (${err.message})\nTrace:\n${formatTrace(err.trace)}`);
      } else {
        console.error(err);
      }
      return 1;
    }
  }
  return 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
