# Voxel⁺

<div align="center">

**A modern, offline Minecraft client for singleplayer development**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/GHisDW/voxelplus)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgray)](https://github.com/GHisDW/voxelplus)

</div>

Voxel⁺ is a powerful, Windows-first Minecraft client designed for singleplayer mod development and testing. Built with Electron, Vite, and TypeScript, it provides a clean, modern interface for managing isolated Minecraft instances with automatic environment resolution.

## ✨ Features

- **Automatic Java Detection** - Scans and validates installed Java runtimes
- **Dynamic Compatibility Resolution** - Automatically selects the correct Java version for each Minecraft version
- **Fabric Mod Integration** - Built-in support for Fabric mod loader and development
- **Instance Management** - Create, duplicate, import, and export isolated Minecraft instances
- **Modrinth Integration** - Browse and install mods directly from Modrinth
- **Resource Pack Support** - Manage resource packs and shaders
- **Real-time Logging** - View live logs from Minecraft and Gradle processes
- **Offline-First** - Works completely offline after initial setup
- **Development Tools** - Integrated Fabric Loom/Gradle environment for mod development

## 🎯 Supported Minecraft Versions

- **1.15.x** - Java 8 + Gradle 6.0 + Loom 0.4-SNAPSHOT
- **1.16.x** - Java 8 + Gradle 7.0 + Loom 0.8-SNAPSHOT  
- **1.17.x** - Java 16 + Gradle 7.3 + Loom 0.9-SNAPSHOT
- **1.18.x** - Java 17 + Gradle 8.10.2 + Loom 1.8.13
- **1.19.x** - Java 17 + Gradle 8.10.2 + Loom 1.8.13
- **1.20.x** - Java 17/21 + Gradle 8.10.2 + Loom 1.8.13
- **1.21.x** - Java 21 + Gradle 8.10.2 + Loom 1.8.13

## 🚀 Getting Started

### Prerequisites

- **Windows 10/11** (Primary platform)
- **Node.js 18+** 
- **Java 8, 17, or 21** (Voxel⁺ will detect and use appropriate versions)
- **7-Zip** or similar (for instance import/export)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/GHisDW/voxelplus.git
   cd voxelplus
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Development mode**
   ```bash
   npm run app:dev
   ```

4. **Production build**
   ```bash
   npm run build
   npm start
   ```

## 📖 Usage

### Creating a New Instance

1. Click "Create Instance" in the main interface
2. Select your desired Minecraft version
3. Choose a name for your instance
4. Voxel⁺ will automatically:
   - Set up the correct Gradle/Gradle wrapper
   - Configure Fabric Loom for the selected version
   - Select the appropriate Java runtime
   - Pre-download necessary dependencies

### Installing Mods

1. Navigate to the "Mods" tab for your instance
2. Use the built-in Modrinth search to find mods
3. Click "Install" to add mods to your instance
4. Toggle mods on/off as needed

### Running an Instance

1. Select an instance from the main list
2. Click the "PLAY" button
3. Voxel⁺ will:
   - Verify Java compatibility
   - Set up the correct environment
   - Launch Minecraft with the appropriate configuration

## 🔧 Development

### Project Structure

```
voxelplus/
├── electron/              # Electron main process
│   ├── main.ts           # Application entry point
│   ├── preload.ts        # IPC bridge
│   └── backend/          # Backend services
│       ├── instances/    # Instance management
│       ├── java/         # Java detection & compatibility
│       ├── processes/    # Process management
│       └── content/      # Mod/content management
├── frontend/             # React/Vite frontend
├── templates/            # Gradle wrapper templates
└── package.json
```

### Building from Source

```bash
# Install dependencies
npm install

# Development
npm run dev

# Production build
npm run build

# Run production build
npm start
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas for Contribution

- **Additional Minecraft Version Support** - Add compatibility for new Minecraft releases
- **UI Improvements** - Enhance the user interface and experience
- **Performance Optimizations** - Improve startup time and resource usage
- **Bug Fixes** - Help squash bugs and improve stability
- **Documentation** - Improve guides and documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Fabric Project** - For the excellent Fabric mod loader and Loom toolchain
- **Modrinth** - For providing an excellent mod hosting platform
- **Electron Team** - For the cross-platform desktop framework
- **Minecraft Community** - For years of amazing mods and content

## 📧 Contact

- **Author**: GHisDW
- **Email**: mokshadshetty@gmail.com
- **GitHub**: [GHisDW](https://github.com/GHisDW)

## ⚠️ Disclaimer

Voxel⁺ is an unofficial third-party Minecraft client. It is not affiliated with, endorsed by, or sponsored by Mojang Studios or Microsoft Corporation. Minecraft is a trademark of Mojang Studios.

---

<div align="center">

**Built with ❤️ for the Minecraft modding community**

[⭐ Star us on GitHub!](https://github.com/GHisDW/voxelplus)

</div>
