"""RVAI catalog adapter: no API keys, installs, or external execution."""
import json
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[1] / 'data' / 'alternatives.json'

def load_catalog(path=CATALOG):
    entries = json.loads(Path(path).read_text())
    ids = set()
    for item in entries:
        for key in ('id', 'name', 'category', 'license', 'license_source_url',
                    'features', 'feature_evidence', 'supported_platforms', 'pricing_type'):
            if key not in item:
                raise ValueError(f'Missing catalog field: {key}')
        if item['id'] in ids:
            raise ValueError('Duplicate catalog ID')
        ids.add(item['id'])
        if not set(item['features']) <= set(item['feature_evidence']):
            raise ValueError('Feature without evidence')
    return entries

def find_candidate_projects(specification, candidates=None):
    """Return sourced candidates, explicit exclusions, and unresolved constraints.

    Anna can call this from FastAPI without adopting a second backend.
    Unknown features are not reported as missing or supported.
    """
    category = specification.get('category')
    if not isinstance(category, str) or not category.strip():
        raise ValueError('category is required')
    required = specification.get('required_features', [])
    if not isinstance(required, list) or not all(isinstance(f, str) for f in required):
        raise ValueError('required_features must be a list of strings')
    platform = specification.get('platform')
    if platform is not None and platform not in ('windows', 'macos', 'linux', 'android', 'ios', 'web'):
        raise ValueError('Unsupported platform value')
    budget = specification.get('budget', 0)
    if isinstance(budget, bool) or not isinstance(budget, (int, float)) or budget < 0:
        raise ValueError('budget must be a nonnegative number')
    matches, excluded, seen = [], [], set()
    for item in load_catalog() if candidates is None else candidates:
        if item['id'] in seen or item['category'] != category:
            continue
        seen.add(item['id'])
        reasons = []
        if not item.get('license') or item.get('license_review_status') != 'declared_license_only':
            reasons.append('license_requires_review')
        if item.get('pricing_type') != 'free_open_source':
            reasons.append('outside_curated_free_open_source_scope')
        if platform and platform not in item.get('supported_platforms', []):
            reasons.append('platform_incompatible')
        if reasons:
            excluded.append({'id': item['id'], 'reasons': reasons})
            continue
        supported = [f for f in required if f in item['features']]
        unknown = [f for f in required if f not in item['features']]
        matches.append({'project': item, 'supported_features': supported,
                        'unknown_features': unknown, 'missing_features': [],
                        'feature_coverage': len(supported)/len(required) if required else None,
                        'compatibility_status': 'needs_verification',
                        'warnings': item.get('notes', []) + [
                            'Hardware and offline suitability are unverified.',
                            'Declared license is not a completed compliance audit.']})
    matches.sort(key=lambda m: (-(m['feature_coverage'] or 0), m['project']['id']))
    return {'schema_version': '0.1', 'recommendations': matches,
            'excluded': excluded, 'status': 'matches' if matches else 'no_match',
            'limitations': ['Curated discovery adapter only; no LLM, build, install, or runtime verification.']}
