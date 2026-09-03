# Voxel⁺ 🎮✨

<div align="center">

**Free, offline, moddable singleplayer Minecraft (Java Edition)**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/GHisDW/voxelplus)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgray)](https://github.com/GHisDW/voxelplus)
[![Discord](https://img.shields.io/badge/discord-Join%20Server-5865F2)](https://discord.gg/msYWkqa4k)

</div>

Voxel⁺ is what happens when you take Fabric Loom, Gradle, a bit of Electron, and a healthy disrespect for "intended use" and turn them into an actual playable singleplayer Minecraft client. [...]

It's free, it's offline (after first setup), and it's fully moddable. We've basically taught `./gradlew runClient` to behave like a proper game launcher — with snacks. 🍪

> TL;DR: It makes `./gradlew runClient` behave like a proper, isolated Minecraft instance. No launcher faff — just chaos, mods, and excessive logging. ⚡️


## 🚧 The honest technical explanation (and a small apology to Loom)

Fabric Loom + Gradle were never meant to be a launcher. Voxel⁺ leans into that hard:

- 🔁 Forces the exact Java, Gradle wrapper, and Loom version each Minecraft version expects
- ✍️ Rewrites / injects configs so `./gradlew runClient` becomes a full, isolated, playable instance
- 🧩 Layers instance management, Modrinth browsing, resource packs, and live logs on top

This is deliberately exploiting current Loom behaviour. It will break — probably at the worst possible moment. Fabric is already fixing it in [PR #1600](https://github.com/FabricMC/fabric-loom/p[...]

(Yes, it's a little cursed. We prefer "strategically experimental." 🚀)


## ✨ Features

- ✅ Real free Java Edition singleplayer (offline after first setup)
- 🧩 Full Fabric mod support (mods > vanilla)
- ☕ Automatic Java detection & version matching (so you don't have to cry over JDKs)
- 🗃️ Proper isolated instances (create / duplicate / import / export)
- 🔎 Built-in Modrinth browser (one-click mod temptation)
- 🎨 Resource packs + shaders (make your world photogenic)
- 📜 Live Minecraft + Gradle logs (for debugging — and dramatic revenge)
- 🛠️ Per-instance Loom/Gradle environments that we happily abuse


## 📦 Supported versions

| Minecraft | Java    | Gradle  | Loom         |
|:--------:|:-------:|:-------:|:------------:|
| 1.15.x    | 8       | 6.0     | 0.4-SNAPSHOT  |
| 1.16.x    | 8       | 7.0     | 0.8-SNAPSHOT  |
| 1.17.x    | 16      | 7.3     | 0.9-SNAPSHOT  |
| 1.18.x    | 17      | 8.10.2  | 1.8.13        |
| 1.19.x    | 17      | 8.10.2  | 1.8.13        |
| 1.20.x    | 17 / 21 | 8.10.2  | 1.8.13        |
| 1.21.x    | 21      | 8.10.2  | 1.8.13        |

> Note: Java column shows the recommended major version. We try to detect and match the correct JRE automatically. 🕵️‍♂️


## ⬇️ Download & Install

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here:

**→ [DOWNLOADING.md](DOWNLOADING.md)** 📚

That's the official guide. Start there — it has more step-by-step instructions and fewer bad jokes. (Fewer — not none.)


## ⚡ Quick start (for the impatient)

```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

Or grab a release from the Releases page and follow DOWNLOADING.md for a user-friendly installer. This saves you from accidentally summoning Gradle demons. 👹


## 🗂️ Project structure (for the curious)

textvoxelplus/
├── electron/          # main process + the actual magic
│   ├── main.ts
│   ├── preload.ts
│   └── backend/
│       ├── instances/  # instance management
│       ├── java/       # java detection & management
│       ├── processes/  # spawn & manage runClient processes
│       └── content/    # resources, packs, etc
├── frontend/          # the UI (Vite + TypeScript)
├── templates/         # Loom/Gradle templates we tweak
└── package.json


## 🧰 Usage highlights

- Create a new instance → choose Minecraft version → Voxel⁺ sets up a Loom/Gradle environment for you.
- Install mods via Modrinth browser → click install → enjoy the chaos.
- Switch Java versions per-instance (when needed) → no global JDK juggling.
- Export / import instances to share worlds with friends (or back up before a TNT experiment). 💣


## ⚠️ Known issues & troubleshooting

- If your run fails with a mismatched Java version: check the instance settings and/or the DOWNLOADING.md Java section. ☕️
- If Gradle hangs: try clearing the instance's Gradle cache and re-run the setup. 🧹
- Loom PR #1600 may change behavior — if something breaks after Loom updates, submit an issue and we'll triage.

If you hit something weird, open an issue with logs attached (logs are available in the instance UI). The more dramatic the stack trace, the better the story. 📣


## 📣 Contact & Support

Got questions or want to report a bug? Reach out:

- **Discord Server**: https://discord.gg/msYWkqa4k 💬 (voxel + server)
- Discord: DisGamerWorld 💬
- Open an issue: https://github.com/GHisDW/voxelplus/issues 🐛


## 🤝 Contributing

We welcome contributions!

- Fork the repo, make changes, and open a PR. We review code & docs.
- Particularly useful: tests, improved installer steps, compatibility fixes for Loom changes, and better error messages.

See CONTRIBUTING.md (or DOWNLOADING.md) for more details. If you send snacks, include a shipping tracker. 🍿


## ❓ FAQ

Q: Is this legal? 🤔

A: Voxel⁺ is a community tool and is not affiliated with Mojang or Microsoft. Use responsibly. Minecraft is a Mojang trademark.

Q: Will my singleplayer world work after mods? 🌍

A: Usually yes, but mods can change world formats. Back up before major changes! Use instance export to keep copies.

Q: What happens when Loom PR #1600 lands? ⚖️

A: We'll update Voxel⁺. It might require new approaches — please help if you can! Contributors are heroes. 🦸‍♀️🦸


## 📜 License

MIT — do whatever you want (but be kind). ❤️


## ⚖️ Disclaimer

Voxel⁺ is not affiliated with Mojang, Microsoft, or the Fabric project.

Minecraft is a trademark of Mojang Studios.

This client exists because Loom currently permits this workflow. That window may close; we're actively tracking Loom changes. 🕵️‍♀️


---

Built with Electron, Vite, TypeScript, Fabric Loom, Gradle, and a complete lack of respect for "intended behaviour".

If this README made you smile, consider starring the repo ⭐ — or at least leaving a funny issue. 😂
