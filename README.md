# Voxel⁺ 🎮✨

<div align="center">

**Free, offline, moddable singleplayer Minecraft (Java Edition)**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/GHisDW/voxelplus)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgray)](https://github.com/GHisDW/voxelplus)
[![Discord](https://img.shields.io/badge/discord-Join%20Server-5865F2)](https://discord.gg/z6GTYnRgM)

**For contributing, showcasing, testing, and keeping up with development, we highly encourage you to join the Discord server.**

</div>

Voxel⁺ is what happens when you take Fabric Loom, Gradle, a bit of Electron, and a healthy disrespect for "intended use" and turn them into an actual playable singleplayer Minecraft client.

It's free, it's offline after first setup, and it's fully moddable. We've basically taught `./gradlew runClient` to behave like a proper game launcher — with snacks. 🍪

> **TL;DR:** Voxel⁺ turns `./gradlew runClient` into a proper, isolated Minecraft instance. No launcher faff — just Minecraft, mods, and excessive logging. ⚡

## 🎨 Skin Manager — Issue #13

**Status:** ✅ Implemented

Voxel⁺ now includes a built-in Skin Manager for managing Minecraft skins across your instances.

### Features

* 🖼️ Import local Minecraft skin PNG files
* ✅ Validate standard `64×32` and `64×64` skin formats
* 🔎 Download skins by Minecraft username using the vrc.lol API
* 📚 Maintain a personal skin library
* ✏️ Rename saved skins
* 🗑️ Delete skins
* ⭐ Select an active skin
* 🎮 Associate skins with specific Minecraft instances
* 👀 Browse and preview skins before applying them

### Key Components

* **Backend:** `electron/backend/skins/`

  * Skin validation
  * Local storage
  * API integration
* **Frontend:** `frontend/src/components/SkinManagerModal.ts`
* **Skins Page:** `frontend/src/pages/SkinsPage.ts`
* **Integration:** Instance details, skin selection, and settings persistence

### Testing

See [`SKIN_MANAGER_TEST.md`](SKIN_MANAGER_TEST.md) for the comprehensive testing guide.

---

## 🧩 The Fabric & Loom Situation

Voxel⁺ is built around Fabric Loom and Gradle, but recent changes in the official Fabric ecosystem have **not broken Voxel⁺**.

A recent PR from the official Fabric project introduced **optional Minecraft authorization support**.

The important part:

> 🟢 **It does not break or change Voxel⁺.**

We checked the changes against how Voxel⁺ currently handles Minecraft instances, Fabric/Loom projects, Java runtimes, instance generation, and launching.

### What this means for Voxel⁺

* ✅ Voxel⁺ remains unaffected
* ✅ Existing Fabric instance generation still works
* ✅ Minecraft version compatibility remains unaffected
* ✅ Current Java runtime handling remains unaffected
* ✅ No emergency Voxel⁺ update is required
* ✅ No Voxel⁺ features are being removed
* ✅ Existing instances continue to use the same workflow
* ✅ Voxel⁺ development can continue normally

You can read the official Fabric Loom change here:

**[Fabric Loom PR #1600](https://github.com/FabricMC/fabric-loom/pull/1600)**

For now, there is **no Loom apocalypse**. 🌎🔥❌

We'll continue monitoring Fabric and Loom development as Voxel⁺ grows, but users do not need to do anything because of this change.

> **Voxel⁺ is alive, development continues, and the launcher is not going anywhere. 🚀**

---

## ✨ Features

* 🎮 Real free Java Edition singleplayer experience
* 🧩 Full Fabric mod support
* ☕ Automatic Java detection and version matching
* 🗃️ Proper isolated Minecraft instances
* 📋 Create, duplicate, import, and export instances
* 🔎 Built-in Modrinth browser
* 🎨 Resource pack support
* ✨ Shader support
* 📜 Live Minecraft and Gradle logs
* 🛠️ Per-instance Loom and Gradle environments
* 👤 Built-in Skin Manager
* 💾 Persistent per-instance configuration
* ⚙️ Automatic Minecraft development environment setup

> **Minecraft is better with mods. We don't make the rules. 😎**

## 📦 Supported Versions

Voxel⁺ currently provides verified Fabric development profiles for:

| Minecraft | Java |    Status   |
| :-------: | :--: | :---------: |
|    26.2   |  25  | ✅ Supported |
|   26.1.2  |  25  | ✅ Supported |
|   26.1.1  |  25  | ✅ Supported |
|   1.21.4  |  21  | ✅ Supported |
|   1.21.1  |  21  | ✅ Supported |
|   1.20.6  |  21  | ✅ Supported |
|   1.20.1  |  17  | ✅ Supported |
|   1.19.4  |  17  | ✅ Supported |
|   1.18.2  |  17  | ✅ Supported |
|   1.17.1  |  17  | ✅ Supported |
|   1.16.5  |   8  | ✅ Supported |
|   1.15.2  |   8  | ✅ Supported |

> **Note:** Java shows the recommended major version for each Minecraft version. Voxel⁺ automatically detects and selects a compatible Java runtime when possible. 🕵️‍♂️

Versions not listed above are not currently advertised as verified by Voxel⁺.

## ⬇️ Download & Install

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here:

**→ [DOWNLOADING.md](DOWNLOADING.md)** 📚

That's the official guide. Start there — it has more step-by-step instructions and fewer bad jokes.

Fewer.

Not none. 😭

## ⚡ Quick Start

For developers who want to run Voxel⁺ from source:

```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

Or grab a release from the Releases page and follow [`DOWNLOADING.md`](DOWNLOADING.md) for the user-friendly installation process.

This saves you from accidentally summoning Gradle demons. 👹

## 🗂️ Project Structure

```text
voxelplus/
├── electron/              # Main process + backend
│   ├── main.ts
│   ├── preload.ts
│   └── backend/
│       ├── instances/     # Instance management
│       ├── java/          # Java detection & management
│       ├── processes/     # Minecraft process management
│       ├── content/       # Resources and packs
│       └── skins/         # Skin Manager backend
├── frontend/              # Vite + TypeScript UI
├── templates/             # Loom/Gradle templates
├── SKIN_MANAGER_TEST.md   # Skin Manager testing guide
└── package.json
```

## 🧰 Usage Highlights

### 🎮 Create an Instance

Create a new instance, choose a supported Minecraft version, and Voxel⁺ handles the required Fabric/Loom/Gradle setup.

### 🧩 Install Mods

Open the built-in Modrinth browser, find a compatible mod, install it, and launch the instance.

### ☕ Manage Java

Voxel⁺ detects installed Java runtimes and selects the appropriate Java version for the Minecraft version being used.

### 🗃️ Manage Instances

Create, duplicate, import, export, and manage isolated Minecraft instances without mixing their files together.

### 👤 Manage Skins

Use the Skin Manager to import local skins, search for skins by username, preview them, save them to your library, and assign them to instances.

### 📜 Watch Logs

Minecraft and Gradle output is available directly inside the Voxel⁺ interface, making debugging significantly easier.

---

## ⚠️ Known Issues & Troubleshooting

### Java Version Problems

If an instance fails because of an incompatible Java version, check the instance settings and the Java section of [`DOWNLOADING.md`](DOWNLOADING.md).

### Gradle Problems

If Gradle hangs or behaves unexpectedly, try clearing the affected instance's Gradle cache and running the setup again.

### Fabric / Loom Changes

Voxel⁺ depends heavily on Fabric and Loom behavior, so upstream changes can occasionally affect development workflows.

However, **the recent authorization-related Fabric change does not currently require any Voxel⁺ changes.**

If you encounter a new issue after a Fabric or Loom update, please open a GitHub issue and include the relevant logs.

### Something Else Broken?

If you hit something weird, open an issue with logs attached.

The more useful information you provide, the faster we can figure out what went wrong.

The more dramatic the stack trace, the better the story. 📣

## 📣 Contact & Support

Got questions, found a bug, or want to help develop Voxel⁺?

* **Discord:** https://discord.gg/z6GTYnRgM 💬
* **GitHub:** https://github.com/GHisDW/voxelplus
* **Issues:** https://github.com/GHisDW/voxelplus/issues 🐛

The Discord server is the best place for development discussion, testing, showcasing projects, and community updates.

## 🤝 Contributing

Contributions are welcome!

Useful areas include:

* 🧪 Testing
* 🐛 Bug fixes
* 📦 Instance management improvements
* ☕ Java compatibility improvements
* 🧩 Fabric/Loom compatibility
* 🎨 UI improvements
* 👤 Skin Manager improvements
* 📜 Better error messages and diagnostics
* 📚 Documentation

Fork the repository, make your changes, test them, and open a pull request.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution information if available.

And if you send snacks, include a shipping tracker. 🍿

## ❓ FAQ

**Q: Is Voxel⁺ a Minecraft launcher? 🤔**

A: Voxel⁺ is a community-developed Minecraft Java client/launcher-style application focused on isolated, moddable singleplayer instances.

**Q: Is Voxel⁺ affiliated with Mojang or Microsoft?**

A: No. Voxel⁺ is an independent community project and is not affiliated with Mojang Studios or Microsoft.

**Q: Does Voxel⁺ require an internet connection? 🌐**

A: Voxel⁺ is designed to work offline after the required Minecraft and development files have been obtained. Some features, such as downloading mods or skins, naturally require internet access.

**Q: Does Voxel⁺ support Fabric mods? 🧩**

A: Yes. Fabric is currently the primary modding platform supported by Voxel⁺.

**Q: Can I use my existing Minecraft worlds? 🌍**

A: Voxel⁺ uses Minecraft's normal world files, but always back up important worlds before changing versions or installing major mods.

**Q: What happened with Fabric PR #1600? ⚖️**

A: The recent Fabric change introduced optional Minecraft authorization support. It does **not currently break or change Voxel⁺'s existing workflow**, so no emergency update is required.

**Q: Is Voxel⁺ going away because of Loom?**

A: **No.** 🚀

Voxel⁺ development is continuing normally. We will keep monitoring upstream Fabric and Loom changes, but there is currently no reason to expect Voxel⁺ to stop working because of PR #1600.

---

## 📜 License

MIT — do whatever you want, but be kind. ❤️

## ⚖️ Disclaimer

Voxel⁺ is not affiliated with Mojang Studios, Microsoft, or the Fabric project.

Minecraft is a trademark of Mojang Studios.

Voxel⁺ is an independent community project built around the existing Minecraft Java Edition ecosystem and Fabric tooling.

---

<div align="center">

**Built with Electron, Vite, TypeScript, Fabric Loom, Gradle, and a complete lack of respect for "intended behaviour."**

If Voxel⁺ made you smile, consider starring the repository ⭐

Or at least leave a funny issue. 😂


</div>
