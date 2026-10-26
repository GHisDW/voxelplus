# Manual Launch Verification

This directory contains scripts for manually testing instance launches.

## manual-launch-test.ts

This script creates instances one at a time for each loader/version combination, installs 5 dummy mods per instance, and attempts to run `gradlew runClient` to verify the instance can actually launch.

### Usage

```bash
npx tsx scripts/manual-launch-test.ts
```

### What it does

1. Creates a test instance for each loader/version combination:
   - Fabric: 1.21.1, 1.20.1, 1.19.4, 1.16.5
   - Quilt: 1.21.1, 1.20.1, 1.19.4
   - Forge: 1.20.1, 1.19.4, 1.16.5
   - NeoForge: 1.21.1, 1.20.4

2. Adds 5 dummy .jar files to the mods folder

3. Runs `gradlew runClient` with a 30-second timeout
   - If output is produced, Gradle started successfully
   - The process is killed after 30s (we don't actually need to launch Minecraft)

4. Records success/failure results to `.test-instances/results.json`

5. Cleans up the instance before moving to the next

### Interpreting Results

- **Success**: The Gradle wrapper started and produced output (build.gradle is valid)
- **Failure**: Check the error message in results.json for:
  - Gradle wrapper missing
  - Loader type not recognized
  - Unsupported loader/version combination
  - Java issues

### Troubleshooting

If you see "loader type not found" or "loader class not defined" errors:

1. Check the loader type in the instance metadata:
   ```bash
   cat .test-instances/[instance-id]/voxel-instance.json
   ```

2. Verify the build.gradle has the correct loader plugin:
   ```bash
   cat .test-instances/[instance-id]/build.gradle
   ```

3. Check if the loader registry supports the combination:
   - LoaderRegistry.isCombinationSupported(loaderType, minecraftVersion)

### Requirements

- Node.js with tsx installed: `npm install -g tsx`
- Java runtime (for Gradle to run)
- Internet connection (for Gradle to download dependencies)
- **Important**: This script requires Electron context for ConfigStore to work properly
  - Either run it from within the Electron main process
  - Or set up the required environment variables/mock Electron APIs
  - For now, the script may create instances in the default app data directory and move them to the test directory
