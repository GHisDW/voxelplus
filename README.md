# Voxel⁺

<div align="center">

**Free, offline, moddable singleplayer Minecraft (Java Edition)**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/GHisDW/voxelplus)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgray)](https://github.com/GHisDW/voxelplus)

</div>

Voxel⁺ is what happens when you take Fabric Loom, Gradle, a bit of Electron, and a healthy disrespect for “intended use” and turn them into an actual playable singleplayer Minecraft client.

It’s free. It’s offline. It’s fully moddable. And it’s built entirely around abusing Loom’s `runClient` task until it stops being a temporary dev environment and starts being a real game.

### The honest technical explanation

Fabric Loom + Gradle were never meant to be a launcher.  
Voxel⁺ leans into that hard:

- It forces the exact Java + Gradle wrapper + Loom version each Minecraft version wants
- It rewrites / injects the config so `./gradlew runClient` becomes a full, isolated, playable instance
- It then layers instance management, Modrinth, resource packs, and live logs on top

This is deliberately exploiting current Loom behaviour.  
It will break. Fabric is already fixing it in [PR #1600](https://github.com/FabricMC/fabric-loom/pull/1600). When that lands, this whole approach gets patched and Voxel⁺ will need a serious update (or a rewrite). Until then… it works.

### Features

- Real free Java Edition singleplayer (offline after first setup)
- Full Fabric mod support
- Automatic Java detection & version matching
- Proper isolated instances (create / duplicate / import / export)
- Built-in Modrinth browser
- Resource packs + shaders
- Live Minecraft + Gradle logs
- Per-instance Loom/Gradle environment that we happily abuse

### Supported versions

| Minecraft | Java    | Gradle  | Loom         |
|-----------|---------|---------|--------------|
| 1.15.x    | 8       | 6.0     | 0.4-SNAPSHOT |
| 1.16.x    | 8       | 7.0     | 0.8-SNAPSHOT |
| 1.17.x    | 16      | 7.3     | 0.9-SNAPSHOT |
| 1.18.x    | 17      | 8.10.2  | 1.8.13       |
| 1.19.x    | 17      | 8.10.2  | 1.8.13       |
| 1.20.x    | 17 / 21 | 8.10.2  | 1.8.13       |
| 1.21.x    | 21      | 8.10.2  | 1.8.13       |

### Download & Install

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here:

**→ [DOWNLOADING.md](DOWNLOADING.md)**

That’s the official guide. Start there.

### Quick start (for the impatient)

```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
Or just grab a release from the repo and follow DOWNLOADING.md [blocked].
Project structure (for the curious)
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
Contact & Support
Got questions, found a bug, or just want to talk about how cursed this is?
Discord: DisGamerWorld
Contributing
PRs welcome. Especially if you’re helping prepare for the day Loom PR #1600 lands and breaks everything.
See the contribution guidelines and DOWNLOADING.md [blocked] for setup info.
License
MIT. Do whatever you want with it.
Disclaimer
Voxel⁺ is not affiliated with Mojang, Microsoft, or the Fabric project.

Minecraft is a trademark of Mojang Studios.

This client exists because Loom currently lets us get away with it. That window is closing.


Built with Electron, Vite, TypeScript, Fabric Loom, Gradle, and a complete lack of respect for “intended behaviour”.
⭐ Star it if it made you smile
