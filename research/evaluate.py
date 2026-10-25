"""
Turns catalog entries and external leads into candidates with evidence, verification status and
capability mappings against the paid product's own feature ids.

Evidence levels, strongest first:
- curated: a human-reviewed catalog entry; its feature support (full/partial/plugin) is used as is.
- automated-license-check: the license comes from GitHub's detector run on the repository's license
  file, which is linked as evidence. Still worth a human look before it goes in the catalog.
- unverified: repository metadata only. A lead, not proof.

External candidates never get full/partial/plugin support. A feature named in a repository
description is reported as "mentioned", and anything else as "unknown", never as "missing".
"""

import re
from urllib.parse import urlparse

from .catalog import _contains_phrase, coverage, normalize
from .safety import clean_text, is_safe_url, mentions_piracy, untrusted_description

# OSI-approved licenses common on GitHub. Anything else (or no license) is not called open source.
OSI_LICENSES = {
    "MIT", "Apache-2.0", "MPL-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "EPL-2.0", "Zlib",
    "Unlicense", "BSL-1.0", "Artistic-2.0", "CDDL-1.0", "EUPL-1.2", "OSL-3.0", "MS-PL", "0BSD",
    "GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "GPL-2.0-only", "GPL-2.0-or-later",
    "GPL-3.0-only", "GPL-3.0-or-later", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only",
    "LGPL-3.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later",
}

# Topic -> catalog platform. Topics are set by repository owners, so these stay "inferred".
TOPIC_PLATFORMS = {
    "windows": "windows", "macos": "mac", "osx": "mac", "linux": "linux", "android": "android",
    "ios": "ios", "web": "web", "webapp": "web", "web-app": "web", "pwa": "web",
}


def known_license(spdx):
    """GitHub reports NOASSERTION or 'other' when it can't tell; both mean unknown."""
    return spdx if isinstance(spdx, str) and spdx and spdx not in ("NOASSERTION", "other", "Other") else None


def url_key(url):
    if not isinstance(url, str):
        return None
    u = urlparse(url.strip().lower())
    host = (u.hostname or "").removeprefix("www.")
    return f"{host}{u.path.rstrip('/')}" if host else None


def name_key(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


# Same rule as runsOn() in src/compare.ts: a browser app works anywhere a desktop browser does.
BROWSER_PLATFORMS = {"web", "windows", "mac", "linux"}


def runs_on(available, wanted):
    """None when nothing is wanted or nothing is known; otherwise whether any wanted platform fits."""
    if not wanted or not available:
        return None
    have = set(available) | (BROWSER_PLATFORMS if "web" in available else set())
    return bool(have & set(wanted))


def _feature_view(product, feature_ids):
    by_id = {f["id"]: f for f in product["features"]}
    return [by_id[i] for i in feature_ids if i in by_id]


def from_catalog(alt, product, feature_ids, platforms):
    """Builds a candidate from a curated alternative. Every claim comes from the catalog entry."""
    features = _feature_view(product, feature_ids)
    workarounds = alt.get("workarounds", {})
    capabilities, limitations = [], []
    for f in features:
        status = alt["features"].get(f["id"], "missing")
        explanation = {
            "full": f"Curated catalog: {alt['name']} fully supports {f['label'].lower()}.",
            "partial": f"Curated catalog: only partial support for {f['label'].lower()}.",
            "plugin": f"Curated catalog: {f['label'].lower()} needs a plug-in or extension.",
            "missing": f"Curated catalog: {alt['name']} does not support {f['label'].lower()}.",
        }[status]
        if workarounds.get(f["id"]):
            explanation += f" Workaround: {workarounds[f['id']]}"
        capabilities.append({
            "featureId": f["id"], "label": f["label"], "status": status,
            "explanation": explanation, "evidence": "curated catalog entry",
        })
        if status != "full":
            limitations.append(explanation)
    return {
        "id": alt["id"],
        "name": alt["name"],
        "source": "catalog",
        "description": alt.get("notes"),
        "officialUrl": alt["url"],
        "repositoryUrl": None,
        "license": alt["license"],
        "openSource": alt["openSource"],
        "platforms": alt["platforms"],
        "platformsInferred": False,
        "platformMatch": runs_on(alt["platforms"], platforms),
        "learningCurve": alt["learningCurve"],
        "features": dict(alt["features"]),
        "coverage": coverage(alt, features) if features else None,
        "capabilities": capabilities,
        "limitations": limitations,
        "evidence": [{"claim": "official website, license and feature support", "url": alt["url"], "source": "curated catalog"}],
        "verification": {"status": "curated", "checkedAt": None, "note": "Reviewed catalog entry; the catalog does not record a review date."},
        "warnings": [],
    }


def _mentions(text_blob, terms):
    return [t for t in terms if _contains_phrase(text_blob, t)]


def from_lead(lead, product, feature_ids, unresolved, platforms, license_check, today):
    """
    Builds a candidate from a repository lead. Returns None when it can't be shown safely.
    license_check is {spdx, url} from the repository's license file, None if it has none, or
    "skipped" when it wasn't looked up.
    """
    name = clean_text(lead.get("name"), 100)
    repo_url = lead.get("repositoryUrl")
    if not name or not is_safe_url(repo_url):
        return None
    description, warning = untrusted_description(lead.get("description"))
    if mentions_piracy(name) or (description and mentions_piracy(description)):
        return None
    warnings = [warning] if warning else []

    homepage = lead.get("homepage")
    if homepage and not is_safe_url(homepage):
        if homepage.strip():
            warnings.append("Ignored a homepage link that was not a safe https URL.")
        homepage = None

    evidence = [{"claim": "source repository", "url": repo_url, "source": "GitHub API"}]
    if isinstance(license_check, dict) and license_check.get("url") and is_safe_url(license_check["url"]):
        license_id = known_license(license_check.get("spdx"))
        evidence.append({"claim": f"license file ({license_id or 'license not recognized'})", "url": license_check["url"], "source": "GitHub license API"})
        verification = {
            "status": "automated-license-check",
            "checkedAt": today,
            "note": "License detected by GitHub from the repository's license file. Features are not verified.",
        }
    else:
        license_id = known_license(lead.get("licenseSpdx"))
        note = "Repository metadata only; treat as a lead."
        if license_check is None:
            license_id = None
            note = "No license file found in the repository, so it is not known to be open source."
        verification = {"status": "unverified", "checkedAt": today, "note": note}
    if homepage:
        evidence.append({"claim": "homepage listed by the repository owner (not independently verified)", "url": homepage, "source": "GitHub API"})

    if license_id is None:
        warnings.append("License unknown: do not treat this as open source until a license file is checked.")
        open_source = None
    else:
        open_source = license_id in OSI_LICENSES or None
        if open_source is None:
            warnings.append(f"License {license_id} is not on RVAI's OSI-approved list; open-source status unknown.")

    topics = [t.lower() for t in lead.get("topics", [])]
    inferred = sorted({TOPIC_PLATFORMS[t] for t in topics if t in TOPIC_PLATFORMS})
    # The withheld placeholder isn't searched, so injected text can never create a "mention".
    blob = normalize(" ".join([description if not warning and description else "", " ".join(topics)]))

    capabilities = []
    for f in (_feature_view(product, feature_ids) if product else []):
        hits = _mentions(blob, [f["id"].replace("-", " "), f["label"], *f.get("keywords", [])])
        capabilities.append({
            "featureId": f["id"], "label": f["label"],
            "status": "mentioned" if hits else "unknown",
            "explanation": (f"Repository description or topics mention {', '.join(repr(h) for h in hits[:3])}; support level not verified."
                            if hits else "Not mentioned in repository metadata; support unknown."),
            "evidence": repo_url if hits else None,
        })
    for req in unresolved:
        hit = _contains_phrase(blob, req)
        capabilities.append({
            "featureId": None, "label": req,
            "status": "mentioned" if hit else "unknown",
            "explanation": "Requested capability has no feature id in the catalog. "
                           + ("Repository metadata mentions it; not verified." if hit else "Support unknown."),
            "evidence": repo_url if hit else None,
        })

    return {
        "id": name_key(lead["fullName"].split("/")[-1]) or name_key(name),
        "name": name,
        "source": "github",
        "description": description,
        "officialUrl": homepage,
        "repositoryUrl": repo_url,
        "license": license_id,
        "openSource": open_source,
        "platforms": inferred,
        "platformsInferred": True,
        "platformMatch": runs_on(inferred, platforms),
        "learningCurve": None,
        "features": {},  # never claim full/partial/plugin without curated evidence
        "coverage": None,
        "capabilities": capabilities,
        "limitations": ["Feature support has not been verified; check the project's documentation before recommending it."],
        "evidence": evidence,
        "verification": verification,
        "stars": lead.get("stars"),
        "lastPushedAt": clean_text(lead.get("pushedAt"), 40),
        "warnings": warnings,
    }


def dedupe(candidates):
    """
    Keeps the first candidate per name or URL. Catalog candidates come first, so a repository that
    duplicates a curated entry is dropped instead of being attached to it on a name match alone.
    """
    seen, kept, dropped = set(), [], 0
    for c in candidates:
        keys = {k for k in (name_key(c["name"]), url_key(c["officialUrl"]), url_key(c["repositoryUrl"])) if k}
        if keys & seen:
            dropped += 1
            continue
        seen |= keys
        kept.append(c)
    return kept, dropped


def rank_key(c):
    """Catalog first; then platform match and coverage; external leads by stars."""
    return (
        c["source"] != "catalog",
        c["platformMatch"] is False,
        -(c["coverage"] or 0),
        -(c.get("stars") or 0),
        c["name"].lower(),
    )
