# RVAI / OpenAccess AI — catalog foundation

Initial role 1 work for Impact Miami 2.0. The project helps people find legitimate free/open-source alternatives to expensive software. The backend and frontend are being developed separately.

This slice provides three source-reviewed catalog entries, explicit evidence/unknowns, and a callable Python discovery tool. It is not the complete agent or website. No packages or API key required; use Python 3.10+.

```sh
python3 -m catalog --category voxel_game --platform windows --features world_saving crafting
python3 -m unittest discover -s tests -v
```

Read [integration notes](integration.md) for Anna's backend handoff and role 3 prerequisites. Catalog facts were checked against official sources on 2026-10-25. Hardware fit, offline suitability, full dependency/asset license audits and application runtime behavior are unverified. Luanti is an engine requiring a separately reviewed game package.

Team repository: https://github.com/AbyzAnna/RVAI. This initial catalog slice is proposed through a separate review branch. UI integration, installation and deployment remain pending.
