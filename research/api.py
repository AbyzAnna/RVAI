"""
research_alternatives(): the one function the rest of RVAI needs. It returns plain JSON-serializable
data, so the TypeScript backend can call it through the CLI (python -m research --json) without
knowing anything about the search providers behind it.
"""

import os
from datetime import date, datetime, timezone

from .catalog import default_feature_ids, find_product, load_catalog, resolve_requirements
from .discovery import DiscoveryError, GitHubSearch
from .evaluate import dedupe, from_catalog, from_lead, name_key, rank_key
from .safety import clean_text, mentions_piracy

PLATFORMS = {"windows", "mac", "linux", "web", "android", "ios"}
PLATFORM_ALIASES = {"macos": "mac", "osx": "mac", "win": "windows", "browser": "web", "chromeos": "web"}
EXTERNAL_MODES = {"auto", "always", "never"}
# In "auto" mode GitHub is searched only when the catalog offers fewer usable candidates than this.
AUTO_EXTERNAL_BELOW = 2


def normalize_constraints(constraints):
    c = dict(constraints or {})
    platforms = []
    for p in c.get("platforms") or []:
        p = PLATFORM_ALIASES.get(str(p).lower().strip(), str(p).lower().strip())
        if p not in PLATFORMS:
            raise ValueError(f"unknown platform {p!r}; use one of {sorted(PLATFORMS)}")
        platforms.append(p)
    external = c.get("external", "auto")
    if external not in EXTERNAL_MODES:
        raise ValueError(f"external must be one of {sorted(EXTERNAL_MODES)}")
    return {
        "platforms": sorted(set(platforms)),
        "openSourceOnly": bool(c.get("openSourceOnly", False)),
        "budget": c.get("budget"),
        "hardware": clean_text(c.get("hardware"), 200),
        "external": external,
        "maxExternal": max(0, int(c.get("maxExternal", 5))),
        "verifyLicenses": bool(c.get("verifyLicenses", True)),
    }


def _requirements(requirements):
    if requirements is None:
        return []
    if isinstance(requirements, str):
        requirements = requirements.split(",")
    return [r for r in (clean_text(str(x), 120) for x in requirements) if r]


def _external(provider, search_name, product, feature_ids, unresolved, cons, today, known):
    """Runs external discovery. Returns (candidates, source status dict, warnings)."""
    try:
        leads, notes = provider.search(search_name)
    except DiscoveryError as err:
        status = "rate_limited" if err.kind == "rate_limit" else "error"
        return [], {"name": provider.name, "status": status, "detail": str(err)}, []

    usable = [l for l in leads if not l["archived"] and not l["fork"]]
    usable.sort(key=lambda l: -(l["stars"] or 0))
    # Drop duplicates (and leads that duplicate curated entries) before spending license lookups.
    fresh, seen = [], set(known)
    for lead in usable:
        key = name_key(lead["name"])
        if key in seen or lead["fullName"].lower() in seen:
            continue
        seen |= {key, lead["fullName"].lower()}
        fresh.append(lead)
    fresh = fresh[: cons["maxExternal"]]

    warnings, candidates, checks_blocked = [], [], False
    for lead in fresh:
        check = "skipped"
        if cons["verifyLicenses"] and not checks_blocked and hasattr(provider, "license_file"):
            try:
                check = provider.license_file(lead["fullName"])
            except DiscoveryError as err:
                if err.kind == "rate_limit":
                    checks_blocked = True
                    warnings.append(f"License checks stopped early: {err}")
                else:
                    warnings.append(f"License check failed for {lead['fullName']}: {err}")
        cand = from_lead(lead, product, feature_ids, unresolved, cons["platforms"], check, today)
        if cand:
            candidates.append(cand)
        else:
            notes.append(f"Dropped {lead['fullName']}: unsafe link or text.")

    status = {"name": provider.name, "status": "partial" if any(n.startswith("query failed") for n in notes) else "ok",
              "leads": len(leads), "kept": len(candidates)}
    if notes:
        status["detail"] = "; ".join(dict.fromkeys(notes))
    return candidates, status, warnings


def research_alternatives(product_name, requirements=None, constraints=None, *, catalog=None,
                          catalog_path=None, provider=None, env=None, today=None):
    """
    Finds legitimate free or open-source alternatives to a paid product.

    product_name  e.g. "Adobe Photoshop" or "photoshop"
    requirements  capabilities the user needs, as free text or the product's feature ids
    constraints   {platforms, openSourceOnly, budget, hardware, external: auto|always|never,
                   maxExternal, verifyLicenses}
    provider      external search provider; defaults to GitHub search (GITHUB_TOKEN optional)
    """
    name = clean_text(product_name, 200)
    if not name:
        raise ValueError("product_name is required")
    reqs = _requirements(requirements)
    if mentions_piracy(name) or any(mentions_piracy(r) for r in reqs):
        raise ValueError("RVAI only researches legal alternatives; requests for cracks or pirated copies are refused.")
    cons = normalize_constraints(constraints)
    env = os.environ if env is None else env
    today = today or date.today().isoformat()
    catalog = catalog if catalog is not None else load_catalog(catalog_path, env)

    product = find_product(catalog, name)
    warnings, sources = [], []
    resolved, unresolved, feature_ids = [], list(reqs), []
    candidates = []

    if product:
        resolved, unresolved = resolve_requirements(product, reqs)
        feature_ids = list(dict.fromkeys(i for r in resolved for i in r["featureIds"]))
        if not feature_ids:
            if reqs:
                warnings.append(f"None of the requirements matched a feature of {product['name']}; compared its core features instead.")
            feature_ids = default_feature_ids(product)
        candidates = [from_catalog(a, product, feature_ids, cons["platforms"]) for a in product["alternatives"]]
        sources.append({"name": "catalog", "status": "ok", "kept": len(candidates)})
    else:
        sources.append({"name": "catalog", "status": "no_match", "kept": 0,
                        "detail": f"{name!r} is not in the curated catalog."})
    if unresolved and product:
        warnings.append("No catalog feature id for: " + ", ".join(unresolved) + ". These are reported as unknown, not as missing.")

    usable_curated = [c for c in candidates if (c["openSource"] or not cons["openSourceOnly"]) and c["platformMatch"] is not False]
    run_external = cons["external"] == "always" or (cons["external"] == "auto" and len(usable_curated) < AUTO_EXTERNAL_BELOW)
    if cons["external"] == "never" or cons["maxExternal"] == 0:
        sources.append({"name": "github", "status": "disabled"})
    elif not run_external:
        sources.append({"name": "github", "status": "skipped",
                        "detail": f"The catalog already has {len(usable_curated)} matching alternatives; pass external='always' to search GitHub too."})
    else:
        provider = provider or GitHubSearch(token=env.get("GITHUB_TOKEN"))
        search_name = (product.get("aliases") or [product["name"]])[0] if product else name
        known = {name_key(c["name"]) for c in candidates}
        external, status, ext_warnings = _external(provider, search_name, product, feature_ids, unresolved, cons, today, known)
        candidates += external
        sources.append(status)
        warnings += ext_warnings

    candidates, dropped = dedupe(candidates)
    if dropped:
        warnings.append(f"Removed {dropped} duplicate candidate(s).")
    if cons["openSourceOnly"]:
        before = len(candidates)
        candidates = [c for c in candidates if c["openSource"] is True]
        if before > len(candidates):
            warnings.append(f"Left out {before - len(candidates)} candidate(s) that are not confirmed open source.")
    candidates.sort(key=rank_key)

    if cons["hardware"]:
        warnings.append(f"Hardware requirements are not recorded in the catalog or repository metadata, so {cons['hardware']!r} was not checked.")
    if cons["budget"] is not None:
        warnings.append("Curated alternatives are free of charge (open source or freeware); paid tiers and add-ons were not evaluated. "
                        "External leads with an unknown license may not be free.")
    if not candidates:
        warnings.append("No alternatives found. Try another product name, fewer constraints, or external='always'.")

    curated = sum(c["source"] == "catalog" for c in candidates)
    return {
        "query": {"productName": name, "requirements": reqs, "constraints": cons},
        "product": {"id": product["id"], "name": product["name"], "vendor": product.get("vendor")} if product else None,
        "requestedFeatures": [{"id": f["id"], "label": f["label"], "weight": f.get("weight", 2)}
                              for f in (product["features"] if product else []) if f["id"] in feature_ids],
        "resolvedRequirements": resolved,
        "unresolvedRequirements": unresolved if product else reqs,
        "candidates": candidates,
        "sources": sources,
        "summary": f"{curated} curated alternative(s) and {len(candidates) - curated} external lead(s) for {product['name'] if product else name}.",
        "warnings": warnings,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
