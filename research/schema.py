"""
Validates catalog data against the committed catalog.schema.json (generated from the zod schema in
src/schemas.ts) plus the extra rules src/catalog.ts loadCatalog() applies: real https URLs, and every
feature or workaround id an alternative uses must exist on its parent product.

It reads the real schema file instead of restating it, and covers the JSON Schema keywords that file
uses. No third-party dependency is needed.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "catalog.schema.json"

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
}


@lru_cache(maxsize=None)
def load_schema(path=SCHEMA_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _type_ok(value, expected):
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    py = _TYPES.get(expected)
    return py is None or (isinstance(value, py) and not (py is not bool and isinstance(value, bool)))


def _validate(value, schema, path, errors):
    expected = schema.get("type")
    if expected and not _type_ok(value, expected):
        errors.append(f"{path or '$'}: expected {expected}")
        return
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} is not one of {schema['enum']}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: must not be empty")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: must be >= {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: must be <= {schema['maximum']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: needs at least {schema['minItems']} item(s)")
        if "items" in schema:
            for i, item in enumerate(value):
                _validate(item, schema["items"], f"{path}[{i}]", errors)
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path or '$'}: missing required field {key!r}")
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties")
        for key, item in value.items():
            child = f"{path}.{key}" if path else key
            if key in props:
                _validate(item, props[key], child, errors)
            elif isinstance(extra, dict):
                _validate(item, extra, child, errors)


def _real_https_url(raw):
    try:
        url = urlparse(raw)
    except ValueError:
        return False
    return url.scheme == "https" and bool(url.hostname)


def validate_catalog(data, schema=None):
    """Returns a list of problems; empty means the backend would accept this catalog."""
    errors = []
    _validate(data, schema or load_schema(), "", errors)
    if errors or not isinstance(data, dict):
        return errors
    for p, product in enumerate(data.get("products", [])):
        ids = {f["id"] for f in product["features"]}
        for a, alt in enumerate(product["alternatives"]):
            where = f"products[{p}].alternatives[{a}]"
            if not _real_https_url(alt["url"]):
                errors.append(f"{where}.url: not a valid https URL")
            for fid in [*alt["features"], *alt.get("workarounds", {})]:
                if fid not in ids:
                    errors.append(f"{where}: {alt['id']} references unknown feature {fid!r} of {product['id']}")
        for d, disc in enumerate(product.get("officialDiscounts", [])):
            if not _real_https_url(disc["url"]):
                errors.append(f"products[{p}].officialDiscounts[{d}].url: not a valid https URL")
    return errors
