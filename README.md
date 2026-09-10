# Voxelâº ðŸŽ®âœ¨

<div align="center">

**Free, offline, moddable singleplayer Minecraft (Java Edition)**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/GHisDW/voxelplus)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgray)](https://github.com/GHisDW/voxelplus)
[![Discord](https://img.shields.io/badge/discord-Join%20Server-5865F2)](https://discord.gg/msYWkqa4k)
**For contributing, showcasing, testing etc we highly encourage you to join the discord server**

</div>

Voxelâº is what happens when you take Fabric Loom, Gradle, a bit of Electron, and a healthy disrespect for "intended use" and turn them into an actual playable singleplayer Minecraft client. [...]

It's free, it's offline (after first setup), and it's fully moddable. We've basically taught `./gradlew runClient` to behave like a proper game launcher â€” with snacks. ðŸª

> TL;DR: It makes `./gradlew runClient` behave like a proper, isolated Minecraft instance. No launcher faff â€” just chaos, mods, and excessive logging. âš¡ï¸

## ðŸŽ¨ New Feature: Skin Manager (Issue #13)

**Status:** âœ… Implemented

The Skin Manager feature allows users to:
- Import local Minecraft skin PNG files with validation (64x32 and 64x64 formats)
- Download skins by Minecraft username using the vrc.lol API
- Manage a personal skin library with rename, delete, and active skin selection
- Associate skins with specific instances
- Browse and preview skins before applying

**Key Components:**
- Backend: `electron/backend/skins/` (validation, storage, API integration)
- Frontend: `frontend/src/components/SkinManagerModal.ts`, `frontend/src/pages/SkinsPage.ts`
- Integration: Instance details skin selector, settings persistence

**Testing:** See `SKIN_MANAGER_TEST.md` for comprehensive testing guide.


## ðŸš§ The honest technical explanation (and a small apology to Loom)

Fabric Loom + Gradle were never meant to be a launcher. Voxelâº leans into that hard:

- ðŸ” Forces the exact Java, Gradle wrapper, and Loom version each Minecraft version expects
- âœï¸ Rewrites / injects configs so `./gradlew runClient` becomes a full, isolated, playable instance
- ðŸ§© Layers instance management, Modrinth browsing, resource packs, and live logs on top

This is deliberately exploiting current Loom behaviour. It will break â€” probably at the worst possible moment. Fabric is already fixing it in [PR #1600](https://github.com/FabricMC/fabric-loom/p[...]

(Yes, it's a little cursed. We prefer "strategically experimental." ðŸš€)


## âœ¨ Features

- âœ… Real free Java Edition singleplayer (offline after first setup)
- ðŸ§© Full Fabric mod support (mods > vanilla)
- â˜• Automatic Java detection & version matching (so you don't have to cry over JDKs)
- ðŸ—ƒï¸ Proper isolated instances (create / duplicate / import / export)
- ðŸ”Ž Built-in Modrinth browser (one-click mod temptation)
- ðŸŽ¨ Resource packs + shaders (make your world photogenic)
- ðŸ“œ Live Minecraft + Gradle logs (for debugging â€” and dramatic revenge)
- ðŸ› ï¸ Per-instance Loom/Gradle environments that we happily abuse


## ðŸ“¦ Supported versions

Voxelâº currently provides verified Fabric development profiles for:

| Minecraft | Java | Status |
|:---------:|:----:|:------:|
| 26.2 | 25 | âœ… Supported |
| 26.1.2 | 25 | âœ… Supported |
| 26.1.1 | 25 | âœ… Supported |
| 1.21.4 | 21 | âœ… Supported |
| 1.21.1 | 21 | âœ… Supported |
| 1.20.6 | 21 | âœ… Supported |
| 1.20.1 | 17 | âœ… Supported |
| 1.19.4 | 17 | âœ… Supported |
| 1.18.2 | 17 | âœ… Supported |
| 1.17.1 | 17 | âœ… Supported |
| 1.16.5 | 8 | âœ… Supported |
| 1.15.2 | 8 | âœ… Supported |

> **Note:** Java shows the recommended major version for each Minecraft version. Voxelâº automatically detects and selects a compatible Java runtime when possible. ðŸ•µï¸â€â™‚ï¸

Versions not listed above are not currently advertised as verified by the launcher.

## â¬‡ï¸ Download & Install

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here:

**â†’ [DOWNLOADING.md](DOWNLOADING.md)** ðŸ“š

That's the official guide. Start there â€” it has more step-by-step instructions and fewer bad jokes. (Fewer â€” not none.)


## âš¡ Quick start (for the impatient)

```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

Or grab a release from the Releases page and follow DOWNLOADING.md for a user-friendly installer. This saves you from accidentally summoning Gradle demons. ðŸ‘¹


## ðŸ—‚ï¸ Project structure (for the curious)

textvoxelplus/
â”œâ”€â”€ electron/          # main process + the actual magic
â”‚   â”œâ”€â”€ main.ts
â”‚   â”œâ”€â”€ preload.ts
â”‚   â””â”€â”€ backend/
â”‚       â”œâ”€â”€ instances/  # instance management
â”‚       â”œâ”€â”€ java/       # java detection & management
â”‚       â”œâ”€â”€ processes/  # spawn & manage runClient processes
â”‚       â””â”€â”€ content/    # resources, packs, etc
â”œâ”€â”€ frontend/          # the UI (Vite + TypeScript)
â”œâ”€â”€ templates/         # Loom/Gradle templates we tweak
â””â”€â”€ package.json


## ðŸ§° Usage highlights

- Create a new instance â†’ choose Minecraft version â†’ Voxelâº sets up a Loom/Gradle environment for you.
- Install mods via Modrinth browser â†’ click install â†’ enjoy the chaos.
- Switch Java versions per-instance (when needed) â†’ no global JDK juggling.
- Export / import instances to share worlds with friends (or back up before a TNT experiment). ðŸ’£


## âš ï¸ Known issues & troubleshooting

- If your run fails with a mismatched Java version: check the instance settings and/or the DOWNLOADING.md Java section. â˜•ï¸
- If Gradle hangs: try clearing the instance's Gradle cache and re-run the setup. ðŸ§¹
- Loom PR #1600 may change behavior â€” if something breaks after Loom updates, submit an issue and we'll triage.

If you hit something weird, open an issue with logs attached (logs are available in the instance UI). The more dramatic the stack trace, the better the story. ðŸ“£


## ðŸ“£ Contact & Support

Got questions or want to report a bug? Reach out:

- **Discord Server**: https://discord.gg/msYWkqa4k ðŸ’¬ (voxel + server)
- Discord: DisGamerWorld ðŸ’¬
- Open an issue: https://github.com/GHisDW/voxelplus/issues ðŸ›


## ðŸ¤ Contributing

We welcome contributions!

- Fork the repo, make changes, and open a PR. We review code & docs.
- Particularly useful: tests, improved installer steps, compatibility fixes for Loom changes, and better error messages.

See CONTRIBUTING.md (or DOWNLOADING.md) for more details. If you send snacks, include a shipping tracker. ðŸ¿


## â“ FAQ

Q: Is this legal? ðŸ¤”

A: Voxelâº is a community tool and is not affiliated with Mojang or Microsoft. Use responsibly. Minecraft is a Mojang trademark.

Q: Will my singleplayer world work after mods? ðŸŒ

A: Usually yes, but mods can change world formats. Back up before major changes! Use instance export to keep copies.

Q: What happens when Loom PR #1600 lands? âš–ï¸

A: We'll update Voxelâº. It might require new approaches â€” please help if you can! Contributors are heroes. ðŸ¦¸â€â™€ï¸ðŸ¦¸


## ðŸ“œ License

MIT â€” do whatever you want (but be kind). â¤ï¸


## âš–ï¸ Disclaimer

Voxelâº is not affiliated with Mojang, Microsoft, or the Fabric project.

Minecraft is a trademark of Mojang Studios.

This client exists because Loom currently permits this workflow. That window may close; we're actively tracking Loom changes. ðŸ•µï¸â€â™€ï¸


---

Built with Electron, Vite, TypeScript, Fabric Loom, Gradle, and a complete lack of respect for "intended behaviour".

If this README made you smile, consider starring the repo â­ â€” or at least leaving a funny issue. ðŸ˜‚

