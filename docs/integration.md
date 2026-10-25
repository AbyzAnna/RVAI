# RVAI discovery handoff — initial slice

Role 1 precedes role 3. Anna owns the in-progress backend. This module does not create a competing API or user interface.

## Call from Python

```python
from catalog import find_candidate_projects
result = find_candidate_projects({
    'category': 'voxel_game',
    'platform': 'windows',
    'budget': 0,
    'required_features': ['voxel_engine', 'world_saving', 'crafting'],
    'hardware_constraints': {'ram_gb': 8, 'dedicated_gpu': False},
    'internet': 'limited'
})
```

Categories: voxel_game, cad, video_editor. Platforms: windows, macos, linux, android, ios, web.
The adapter only validates/filters category, platform, budget type and requested features in this slice. Hardware and internet constraints are not evaluated and always remain uncertain. Only curated free/open-source entries qualify; nonzero budgets do not expand this catalog to paid products.

Response: schema_version, status (matches/no_match), recommendations, excluded, limitations. Each recommendation contains project, supported_features, unknown_features, missing_features, feature_coverage, compatibility_status, warnings. Exclusions contain id and reasons. Invalid specifications raise ValueError; the backend should map this to its chosen validation response.

Coverage is supported requested features divided by requested features; null for no requested features. It is not overall suitability. Unlisted capabilities are unknown, never automatically missing. No partial/missing feature claims are made in this initial dataset. Declared licensing is not approval for redistribution. No dependencies, assets, binaries, or upstream source code are bundled.

UI must show unknowns and evidence links. Luanti is an engine and requires a separately reviewed game package. Do not display Play now or promise it runs in the browser. No application has been installed or runtime-tested.

Target repository: https://github.com/AbyzAnna/RVAI. At initial inspection, main contains only README.md and no backend/UI contract or AGENTS.md. Next: integrate on a catalog branch; agree with Anna on API mapping; then begin role 3. No LLM calls, execution sandbox, generated-code execution, API server, or website deployment is implemented here.
