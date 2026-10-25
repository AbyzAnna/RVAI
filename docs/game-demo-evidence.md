# Voxel demo research: Luanti + Minetest Game

Reviewed 2026-10-25. This is a source-backed setup candidate, not a runtime-tested game.

- Official game repository: https://github.com/luanti-org/minetest_game
- Distribution: https://content.luanti.org/packages/Minetest/minetest_game/
- Installation and maintenance status: https://github.com/luanti-org/minetest_game/blob/master/README.md
- Capabilities and minimum engine declaration: https://github.com/luanti-org/minetest_game/blob/master/game.conf
- License declarations: https://github.com/luanti-org/minetest_game/blob/master/LICENSE.txt

Upstream describes a basic exploration/mining/crafting/building sandbox without NPCs, monsters or animals. Its configuration declares engine minimum 5.8. The README describes rolling releases compatible with the latest stable engine, and maintenance-only development. This is a simpler creative-building candidate; do not promise survival enemies or Minecraft equivalence.

License file declares LGPL 2.1 for source and CC BY-SA 3.0 for media, with per-mod README author/license details. This is a top-level declaration review, not a complete per-mod audit. Distribution in RVAI is links/instructions only; no upstream code or media is copied.

## Official setup path for the user

1. Obtain Luanti from its official website.
2. In Luanti, choose Content → Browse Online Content, search Minetest Game and choose Install, per the upstream README.
3. Select the game and create a world. Confirm actual controls and behavior in the installed version before recording a demo.

Before claiming a working playable result, record tested OS, engine version, game revision, launch, place/remove block, save/reload, and offline behavior. None of those runtime checks has been performed by this change. Hardware fit remains unknown. The initial catalog entry remains the engine, so game capabilities must not be silently attributed to it. This companion note supplies the next setup candidate while Anna decides how to model engine/game dependencies in the API.
