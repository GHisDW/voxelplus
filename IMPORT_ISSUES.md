# Import Issues Found and Fixed

## Critical Issue: Missing instancePath on Imported Instances

### Problem
When importing VPack, Modrinth (.mrpack), or CurseForge modpacks, the imported instance metadata did not have `instancePath` set. This caused:
- Frontend could not locate the imported instance
- Instance details page would not load
- Mods could not be added to imported instances
- Instance appeared to not exist after import

### Root Cause
In `instanceManager.ts`, after calling `ModrinthPackImporter.importMrpack()` or `CurseForgePackImporter.importCurseForgePack()`, the returned metadata had `instancePath` set to `null` or undefined. The code then called `InstanceMetadataStore.writeMetadata()` with this incomplete metadata.

Similarly, in `VPackManager.extractVPack()`, the manifest extraction didn't preserve or set `instancePath`.

### Fix Applied
1. **ModrinthPackImporter**: Set `metadata.instancePath = targetDir` before returning
2. **CurseForgePackImporter**: Set `metadata.instancePath = targetDir` before returning
3. **InstanceManager.importInstance()**: Ensure metadata has `instancePath` set before writing
4. **LoomProjectGenerator.generateProject()**: Ensure generated metadata has `instancePath` set

## Additional Import Issues

### Placeholder Files for Unresolved Downloads
When external mod downloads fail (e.g., CurseForge private projects, expired URLs), the importers create placeholder `.jar` files. These are not valid mods but allow the import to complete. Users must manually replace these files.

### Missing Gradle Files on Imported Packs
Modrinth `.mrpack` files typically don't include Gradle project files. The code now scaffolds `build.gradle`, `gradlew.bat`, etc. using `LoomProjectGenerator.generateProject()` when these files are missing.

## Test Improvements Needed

### Current Test Limitations
- Tests only verify file existence, not actual functionality
- No tests attempt to run `gradlew runClient` to verify instances can actually launch
- No tests with real `.mrpack` or CurseForge zip files
- Placeholder files aren't validated for format

### Proposed Test Improvements
1. Add test that runs `gradlew --help` to verify Gradle wrapper works
2. Add test that runs `gradlew runClient` (timeout after 30s, cancel if it starts successfully)
3. Add tests with actual sample `.mrpack` files
4. Validate placeholder files have proper extension and size
