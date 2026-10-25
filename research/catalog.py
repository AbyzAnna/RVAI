"""
Read-only access to the curated catalog. The file is found the same way as loadCatalog() in
src/catalog.ts: an explicit path, then RVAI_CATALOG, then data/catalog.json.
"""

import json
import os
import re
from pathlib import Path

from .schema import REPO_ROOT, validate_catalog

DEFAULT_CATALOG_PATH = REPO_ROOT / "data" / "catalog.json"

# Same weights as src/compare.ts: full support counts 1, a plug-in 0.75, partial 0.5.
SUPPORT_VALUE = {"full": 1.0, "plugin": 0.75, "partial": 0.5}


class CatalogError(Exception):
    pass


def catalog_path(path=None, env=None):
    env = os.environ if env is None else env
    return Path(path or env.get("RVAI_CATALOG") or DEFAULT_CATALOG_PATH)


def load_catalog(path=None, env=None):
    """Loads a catalog and rejects it, like the backend does, if it breaks the schema."""
    file = catalog_path(path, env)
    try:
        with open(file, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as err:
        raise CatalogError(f"catalog {file} could not be read: {err}") from err
    problems = validate_catalog(data)
    if problems:
        raise CatalogError(f"catalog {file} is invalid:\n" + "\n".join(problems))
    return data


def normalize(text):
    return " ".join(re.sub(r"[^a-z0-9+#]+", " ", str(text).lower()).split())


def _contains_phrase(haystack, phrase):
    phrase = normalize(phrase)
    return bool(phrase) and re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", haystack) is not None


def find_product(catalog, product_name):
    """Finds a paid product by id, name or alias. Returns None when the catalog doesn't have it."""
    wanted = normalize(product_name)
    if not wanted:
        return None
    best, best_len = None, 0
    for product in catalog["products"]:
        names = [product["id"], product["name"], *product.get("aliases", [])]
        for name in names:
            n = normalize(name)
            if n == wanted:
                return product
            # "Adobe Photoshop 2025" still finds "photoshop"; the longest alias wins.
            if len(n) >= 3 and _contains_phrase(wanted, n) and len(n) > best_len:
                best, best_len = product, len(n)
    return best


def resolve_requirements(product, requirements):
    """
    Maps free-text requirements to the product's own feature ids, by id, label or keyword.
    Returns (resolved, unresolved): resolved is a list of {requirement, featureIds}.
    """
    resolved, unresolved = [], []
    for req in requirements:
        r = normalize(req)
        if not r:
            continue
        exact = [f["id"] for f in product["features"] if r in (normalize(f["id"]), normalize(f["label"]))]
        ids = exact or [
            f["id"]
            for f in product["features"]
            if any(_contains_phrase(r, k) or _contains_phrase(normalize(k), r) for k in f.get("keywords", []))
            or _contains_phrase(normalize(f["label"]), r)
        ]
        if ids:
            resolved.append({"requirement": req, "featureIds": ids})
        else:
            unresolved.append(req)
    return resolved, unresolved


def default_feature_ids(product):
    """The backend's analyzer uses a product's first four features when a request names none."""
    return [f["id"] for f in product["features"][:4]]


def coverage(alternative, features):
    """Weighted share of the given features the alternative supports, as in src/compare.ts."""
    total = sum(f.get("weight", 2) for f in features)
    if not total:
        return 0.0
    got = sum(f.get("weight", 2) * SUPPORT_VALUE.get(alternative["features"].get(f["id"]), 0) for f in features)
    return round(got / total, 3)
