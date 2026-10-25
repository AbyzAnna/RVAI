# Catalog expansion evidence

Source review: October 25, 2026. Catalog now contains six entries: two candidates in each existing category. Only catalog data changed; no upstream program, asset or binary is copied. These records are source-reviewed and **not runtime-tested**. Hardware fit, offline suitability and complete dependency/asset audits remain unknown.

## Minetest Game

- [Official repository and README](https://github.com/luanti-org/minetest_game): installation through Luanti ContentDB, rolling-release compatibility policy and maintenance-only status.
- [Game configuration](https://github.com/luanti-org/minetest_game/blob/master/game.conf): exploration, mining, crafting, building, engine minimum 5.8, and absence of NPCs/monsters/animals.
- [Top-level license](https://github.com/luanti-org/minetest_game/blob/master/LICENSE.txt): source LGPL 2.1 and media CC BY-SA 3.0; mod-level notices still require review.
- [Engine platform evidence](https://github.com/luanti-org/luanti/blob/master/README.md): desktop platforms apply through Luanti. The game is not an independently runnable desktop program; compatibility of the chosen pair remains untested.

See also [game demo evidence](game-demo-evidence.md). No unsupported world-saving or engine capability is attributed to the game package. Luanti and Minetest Game are related components, not two independent turnkey games.

## OpenSCAD

- [Official about page](https://openscad.org/about.html): free software, parameterized script-based CAD, constructive solid geometry, extrusion and STL output.
- [Official downloads](https://openscad.org/downloads.html): Windows, macOS and Linux distribution evidence.
- [Upstream COPYING](https://github.com/openscad/openscad/blob/master/COPYING): GPL version 2 text with a CGAL linking exception. The catalog preserves the top-level declaration instead of asserting a full license audit.

This is a different CAD workflow from FreeCAD; interactive sketch editing is not implied. Imported designs, libraries, assets and linked dependencies require separate review.

## Kdenlive

- [Official repository mirror README](https://github.com/KDE/kdenlive/blob/master/README.md): free/open-source status and [KDE Invent](https://invent.kde.org/multimedia/kdenlive) as primary development source.
- [Official download page](https://kdenlive.org/download/): Windows, macOS and Linux distributions. Consult the selected build's OS/version limits.
- [Timeline documentation](https://docs.kdenlive.org/en/user_interface/timeline.html), [editing documentation](https://docs.kdenlive.org/en/cutting_and_assembling/editing.html), and [glossary](https://docs.kdenlive.org/en/glossary.html): timeline editing, audio mixing and rendering/export.
- [Top-level COPYING](https://github.com/KDE/kdenlive/blob/master/COPYING): GPLv3 text. Per-file licensing and upstream LICENSES still govern individual components; imported footage/music do not inherit the editor's license.

No proprietary or freemium entry was added. New entries include category/capability keywords as routing hints, not brand-equivalence assertions. No “replaces” equivalence claim is made: category and evidenced capabilities drive comparison. Unsupported capabilities remain unknown.

## Verification performed

Parsed all six entries with the existing `load_catalog` validator and exercised Windows discovery for each category: two candidates returned per category. Existing tests that assume exactly three catalog rows must be updated by the integration owner; backend behavior was not changed here.
