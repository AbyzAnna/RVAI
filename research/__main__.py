"""
Command line for the research module. The TypeScript backend can call it with --json and read
the result from stdout; errors go to stderr with a non-zero exit code.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from .api import research_alternatives
from .catalog import CatalogError, load_catalog
from .export import export_proposals


def load_dotenv(path=".env"):
    """Reads GITHUB_TOKEN from a local, gitignored .env file, like the backend reads its keys."""
    if not Path(path).exists():
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key.strip() == "GITHUB_TOKEN" and "GITHUB_TOKEN" not in os.environ:
            os.environ["GITHUB_TOKEN"] = value.strip().strip('"').strip("'")


def parse_args(argv):
    p = argparse.ArgumentParser(prog="python -m research", description="Find legitimate free or open-source alternatives to a paid product.")
    p.add_argument("product", help='paid product, e.g. "Adobe Photoshop"')
    p.add_argument("-r", "--require", action="append", default=[], help="a capability you need (repeat, or separate with commas)")
    p.add_argument("--platform", action="append", default=[], help="windows, mac, linux, web, android or ios (repeatable)")
    p.add_argument("--open-source-only", action="store_true")
    p.add_argument("--budget", type=float, help="what you can spend; curated alternatives are all free")
    p.add_argument("--hardware", help='e.g. "4 GB RAM laptop" (reported, not checked: no hardware data exists yet)')
    p.add_argument("--external", choices=["auto", "always", "never"], default="auto", help="search GitHub: auto (only when the catalog has too few), always or never")
    p.add_argument("--offline", action="store_true", help="same as --external never")
    p.add_argument("--max-external", type=int, default=5)
    p.add_argument("--no-license-check", action="store_true", help="skip the per-repository license file lookup")
    p.add_argument("--catalog", help="catalog JSON file (default: RVAI_CATALOG or data/catalog.json)")
    p.add_argument("--json", action="store_true", help="print the structured result as JSON")
    p.add_argument("--export", action="store_true", help="write proposed catalog entries to a separate review file")
    p.add_argument("--out", help="where --export writes (default: research-output/proposed-<product>-<date>.json)")
    p.add_argument("--overrides", help="JSON file of reviewer-supplied fields per candidate id, used by --export")
    p.add_argument("--force", action="store_true", help="let --export replace an existing proposal file")
    return p.parse_args(argv)


def format_text(result):
    lines = [result["summary"]]
    if result["product"]:
        lines.append("Compared features: " + ", ".join(f["label"] for f in result["requestedFeatures"]))
    for i, c in enumerate(result["candidates"], 1):
        cov = "" if c["coverage"] is None else f"  coverage {round(c['coverage'] * 100)}%"
        lic = c["license"] or "license unknown"
        lines.append(f"\n{i}. {c['name']}  [{c['source']}, {c['verification']['status']}]{cov}")
        lines.append(f"   {lic}  {c['officialUrl'] or c['repositoryUrl']}")
        if c["description"]:
            lines.append(f"   {c['description']}")
        for cap in c["capabilities"]:
            if cap["status"] != "full":
                lines.append(f"   - {cap['status']}: {cap['label']}. {cap['explanation']}")
        for w in c["warnings"]:
            lines.append(f"   ! {w}")
    lines.append("\nSources: " + ", ".join(f"{s['name']} {s['status']}" + (f" ({s['detail']})" if s.get("detail") else "") for s in result["sources"]))
    for w in result["warnings"]:
        lines.append(f"Note: {w}")
    return "\n".join(lines)


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    load_dotenv()
    constraints = {
        "platforms": args.platform,
        "openSourceOnly": args.open_source_only,
        "budget": args.budget,
        "hardware": args.hardware,
        "external": "never" if args.offline else args.external,
        "maxExternal": args.max_external,
        "verifyLicenses": not args.no_license_check,
    }
    requirements = [r for chunk in args.require for r in chunk.split(",")]
    try:
        catalog = load_catalog(args.catalog)
        result = research_alternatives(args.product, requirements, constraints, catalog=catalog)
        report = None
        if args.export:
            overrides = json.loads(Path(args.overrides).read_text(encoding="utf-8")) if args.overrides else None
            report = export_proposals(result, catalog, args.out, overrides, force=args.force)
    except (CatalogError, ValueError, OSError) as err:
        print(f"research: {err}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps({**result, "export": report} if report else result, indent=2, ensure_ascii=False))
    else:
        print(format_text(result))
        if report:
            print(f"\nProposals written to {report['path']}: {report['complete']} complete, {report['pending']} need review.")
    return 0


if __name__ == "__main__":
    # Windows consoles default to a legacy code page; keep output readable everywhere.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
