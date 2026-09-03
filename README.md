# Voxel⁺

<div align="center">

**Free, offline, moddable singleplayer Minecraft (Java Edition)**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/GHisDW/voxelplus)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgray)](https://github.com/GHisDW/voxelplus)

</div>

Voxel⁺ is what happens when you take Fabric Loom, Gradle, a bit of Electron, and a healthy disrespect for “intended use” and turn them into an actual playable singleplayer Minecraft client.

It’s free. It’s offline (after first setup). It’s fully moddable. And it’s built entirely around abusing Loom’s `runClient` task until it stops being a temporary dev environment and starts being a real game — the kind of abuse your CI told you not to try at home.

> TL;DR: It makes `./gradlew runClient` behave like a proper, isolated Minecraft instance. No launcher faff, just chaos and mod support.


## The honest technical explanation (and a small apology to Loom)

Fabric Loom + Gradle were never meant to be a launcher. Voxel⁺ leans into that hard:

- Forces the exact Java, Gradle wrapper, and Loom version each Minecraft version wants
- Rewrites / injects configs so `./gradlew runClient` becomes a full, isolated, playable instance
- Layers instance management, Modrinth browsing, resource packs, and live logs on top

This is deliberately exploiting current Loom behaviour. It will break. Fabric is already fixing it in [PR #1600](https://github.com/FabricMC/fabric-loom/pull/1600). When that lands, this whole approach will need a serious update — and probably a long, remorseful refactor.

(Yes, we know this is a bit cursed. We prefer the term "strategically experimental.")


## Features

- Real free Java Edition singleplayer (offline after first setup)
- Full Fabric mod support (because mods > vanilla)
- Automatic Java detection & version matching (it cries so you don’t have to)
- Proper isolated instances (create / duplicate / import / export)
- Built-in Modrinth browser (for instant mod temptation)
- Resource packs + shaders (for when you want Minecraft to look like a painting)
- Live Minecraft + Gradle logs (for debugging — and dramatic revenge)
- Per-instance Loom/Gradle environments that we happily abuse


## Supported versions

| Minecraft | Java    | Gradle  | Loom         |
|-----------|---------|---------|--------------|
| 1.15.x    | 8       | 6.0     | 0.4-SNAPSHOT |
| 1.16.x    | 8       | 7.0     | 0.8-SNAPSHOT |
| 1.17.x    | 16      | 7.3     | 0.9-SNAPSHOT |
| 1.18.x    | 17      | 8.10.2  | 1.8.13       |
| 1.19.x    | 17      | 8.10.2  | 1.8.13       |
| 1.20.x    | 17 / 21 | 8.10.2  | 1.8.13       |
| 1.21.x    | 21      | 8.10.2  | 1.8.13       |


## Download & Install

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here:

**→ [DOWNLOADING.md](DOWNLOADING.md)**

That’s the official guide. Start there — it has fewer jokes and more actionable instructions.


## Quick start (for the impatient)

```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

Or just grab a release from the repo and follow DOWNLOADING.md. This path contains fewer opportunities to accidentally summon Gradle demons.


## Project structure (for the curious)

textvoxelplus/
├── electron/          # main process + the actual magic
│   ├── main.ts
│   ├── preload.ts
│   └── backend/
│       ├── instances/
│       ├── java/
│       ├── processes/
│       └── content/
├── frontend/          # the UI
├── templates/         # the Loom/Gradle templates we mess with
└── package.json


## Contact & Support

Got questions, found a bug, or just want to talk about how cursed this is?

- Discord: DisGamerWorld
- Open an issue if you think your world was destroyed by a bug (or by your own TNT experiment)


## Contributing

PRs welcome. Especially if you’re helping prepare for the day Loom PR #1600 lands and breaks everything.

See the contribution guidelines and DOWNLOADING.md for setup info. We accept code, documentation, snacks, and very specific bug reports.


## License

MIT. Do whatever you want with it. Please be nicer to the code than it has been to Loom.


## Disclaimer

Voxel⁺ is not affiliated with Mojang, Microsoft, or the Fabric project.

Minecraft is a trademark of Mojang Studios.

This client exists because Loom currently lets us get away with it. That window is closing.


Built with Electron, Vite, TypeScript, Fabric Loom, Gradle, and a complete lack of respect for “intended behaviour”.

If this README made you smile, consider starring the repo ⭐
