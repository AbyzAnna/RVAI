"""
Exports researched leads as *proposed* catalog entries in a separate file for human review.

- Never writes to the active catalog, data/catalog.json or the example catalog.
- Fills a field only from evidence: license and openSource only from a checked license file.
  Platforms, learning curve and feature support are never guessed; a reviewer supplies them through
  overrides ({candidateId: {field: value}}), and feature ids must exist on the parent product.
- Entries that are still missing required fields go under "review.pending" with what is missing.
  Complete entries go under "products", which is validated like the backend validates a catalog,
  so the file can be loaded with --catalog=FILE once it has any.
"""

import json
import re
from datetime import date
from pathlib import Path

from .catalog import DEFAULT_CATALOG_PATH, catalog_path
from .safety import is_safe_url
from .schema import REPO_ROOT, load_schema, validate_catalog

REQUIRED = ["id", "name", "url", "license", "openSource", "platforms", "learningCurve", "features"]
OUTPUT_DIR = REPO_ROOT / "research-output"
PROTECTED = [DEFAULT_CATALOG_PATH, REPO_ROOT / "examples" / "catalog.example.json", REPO_ROOT / "catalog.schema.json"]


def _alternative_props():
    return load_schema()["properties"]["products"]["items"]["properties"]["alternatives"]["items"]["properties"]


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


def proposed_entry(candidate, product, override=None, today=None):
    """Returns (entry, missing, problems) for one external candidate."""
    entry = {"id": _slug(candidate["id"] or candidate["name"]), "name": candidate["name"]}
    problems = []
    url = candidate.get("officialUrl") or candidate.get("repositoryUrl")
    if url and is_safe_url(url):
        entry["url"] = url
    if candidate["verification"]["status"] == "automated-license-check" and candidate.get("license"):
        entry["license"] = candidate["license"]
        if candidate.get("openSource") is not None:
            entry["openSource"] = candidate["openSource"]
    entry["features"] = {}
    evidence = ", ".join(e["url"] for e in candidate.get("evidence", []))
    entry["notes"] = f"Proposed by RVAI research on {today or date.today().isoformat()}. Evidence: {evidence}. Review before adding to the catalog."

    allowed = set(_alternative_props())
    feature_ids = {f["id"] for f in product["features"]}
    for key, value in (override or {}).items():
        if key not in allowed:
            problems.append(f"override field {key!r} is not part of the catalog schema")
            continue
        entry[key] = value
    for key in ("features", "workarounds"):
        if key in entry and not isinstance(entry[key], dict):
            problems.append(f"override {key!r} must be an object")
            entry[key] = {}
    for fid in list(entry["features"]):
        if fid not in feature_ids:
            problems.append(f"feature {fid!r} is not defined on {product['id']}")
            del entry["features"][fid]
    for fid in list(entry.get("workarounds", {})):
        if fid not in feature_ids:
            problems.append(f"workaround for unknown feature {fid!r}")
            del entry["workarounds"][fid]

    missing = [k for k in REQUIRED if k not in entry]
    if not entry["features"]:
        missing.append("features (at least one reviewed full/partial/plugin mapping)")
    return entry, missing, problems


def _is_protected(path, env):
    target = Path(path).resolve()
    return any(target == Path(p).resolve() for p in [*PROTECTED, catalog_path(None, env)])


def export_proposals(result, catalog, out_path=None, overrides=None, force=False, env=None, today=None):
    """Writes the proposal file and returns a short report. Raises ValueError for unsafe requests."""
    if not result.get("product"):
        raise ValueError("Export needs a product that is in the catalog, because feature ids are defined on it.")
    product = next(p for p in catalog["products"] if p["id"] == result["product"]["id"])
    today = today or date.today().isoformat()
    out = Path(out_path) if out_path else OUTPUT_DIR / f"proposed-{product['id']}-{today}.json"
    if _is_protected(out, env):
        raise ValueError(f"Refusing to write {out}: proposals never overwrite a catalog. Choose another file.")
    if out.exists() and not force:
        raise ValueError(f"{out} already exists; pass force=True (--force) to replace this proposal file.")

    existing_ids = {a["id"] for a in product["alternatives"]}
    complete, pending = [], []
    for cand in result["candidates"]:
        if cand["source"] == "catalog":
            continue
        entry, missing, problems = proposed_entry(cand, product, (overrides or {}).get(cand["id"]), today)
        if entry["id"] in existing_ids:
            problems.append(f"id {entry['id']!r} already exists in the catalog for {product['id']}")
        item = {"candidateId": cand["id"], "entry": entry, "missing": missing, "problems": problems,
                "verification": cand["verification"], "evidence": cand["evidence"], "warnings": cand["warnings"]}
        (pending if missing or problems else complete).append(item)

    doc = {"version": f"proposed-{today}"}
    errors = []
    if complete:
        proposed_product = {k: v for k, v in product.items() if k != "alternatives"}
        proposed_product["alternatives"] = [i["entry"] for i in complete]
        errors = validate_catalog({"products": [proposed_product]})
        if errors:
            pending += complete
            complete = []
        else:
            doc["products"] = [proposed_product]
    doc["review"] = {
        "note": "Proposed additions only. Nothing here is in the catalog until a person reviews it and copies it in.",
        "productId": product["id"],
        "generatedAt": today,
        "complete": [i["candidateId"] for i in complete],
        "pending": pending,
        "validationErrors": errors,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"path": str(out), "loadableAsCatalog": bool(complete), "complete": len(complete),
            "pending": len(pending), "validationErrors": errors}
