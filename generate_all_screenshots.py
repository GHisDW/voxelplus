import os
import sys
import time
import subprocess
from playwright.sync_api import sync_playwright

output_dir = "/home/jules/verification/screenshots"
os.makedirs(output_dir, exist_ok=True)

# Start Vite dev server
server_process = subprocess.Popen(["npm", "run", "dev", "--", "--port", "5173"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(3)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Mock window.voxelApi in page initialization
        page.add_init_script("""
            window.voxelApi = {
                getAppSettings: async () => ({
                    javaPath: '/usr/bin/java',
                    defaultMemoryMb: 4096,
                    developerMode: true,
                    firstRunCompleted: true,
                    theme: 'dark'
                }),
                setAppSettings: async (s) => s,
                listInstances: async () => [
                    { id: 'inst-1', name: 'Fabric Dev 26.3', minecraft: { version: '26.3' }, loader: { type: 'fabric', version: '0.19.5' }, appearance: { artwork: null }, status: 'stopped' }
                ],
                getInstance: async (id) => ({ id, name: 'Fabric Dev 26.3', minecraft: { version: '26.3' }, loader: { type: 'fabric', version: '0.19.5' }, appearance: { artwork: null }, status: 'stopped' }),
                listCards: async () => [
                    { schemaVersion: 1, id: 'card-fabric-essentials', name: 'Fabric Essentials', tagline: 'Sodium & Lithium Optimization', description: 'Official core performance pack featuring Sodium rendering optimization and Lithium physics improvements.', artwork: null, cardVersion: '1.0.0', minecraftVersion: '26.3', loaderType: 'fabric', loaderVersion: '0.19.5', mods: [{ provider: 'modrinth', projectId: 'AANobbMI', projectName: 'Sodium', versionId: 'v4PSXean', versionName: 'Sodium 0.9.3', downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/v4PSXean/sodium.jar', filename: 'sodium.jar', contentType: 'mod' }], tags: ['performance', 'fabric'], author: 'Voxel+ Team', publishedAt: new Date().toISOString(), signature: null, source: 'builtin' },
                    { schemaVersion: 1, id: 'card-dev-tech', name: 'Developer Curated Tech', tagline: 'Developer Catalog Featured Blueprint', description: 'Curated technological pack published directly via Developer Catalog.', artwork: null, cardVersion: '2.1.0', minecraftVersion: '26.3', loaderType: 'fabric', loaderVersion: '0.19.5', mods: [], tags: ['tech', 'developer'], author: 'Voxel+ Developer', publishedAt: new Date().toISOString(), signature: null, source: 'developer' },
                    { schemaVersion: 1, id: 'card-user-custom', name: 'My Custom Blueprint', tagline: 'User Created Blueprint', description: 'Custom user blueprint created locally in launcher.', artwork: null, cardVersion: '1.0.0', minecraftVersion: '26.3', loaderType: 'fabric', loaderVersion: '0.19.5', mods: [], tags: ['custom'], author: 'Local User', publishedAt: new Date().toISOString(), signature: null, source: 'user' }
                ],
                isDeveloperMode: async () => true,
                isCardRetired: async () => false,
                isBuiltInCard: async (id) => id === 'card-fabric-essentials',
                listInstalledCards: async () => [],
                listPacks: async () => [
                    { id: 'pack-normal-user', name: 'Normal User Pack', description: 'Standard user instance definition', artwork: null, packVersion: '1.0.0', minecraftVersion: '26.3', loaderType: 'fabric', loaderVersion: '0.19.5', mods: [{ provider: 'modrinth', projectId: 'AANobbMI', projectName: 'Sodium', versionId: 'v4PSXean', versionName: 'Sodium 0.9.3', downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/v4PSXean/sodium.jar', filename: 'sodium.jar', contentType: 'mod' }], resourcePacks: [], shaderPacks: [], configs: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    { id: 'pack-imported-vpack', name: 'Imported VPack Blueprint', description: 'Portable .vpack exported from instance', artwork: null, packVersion: '1.2.0', minecraftVersion: '26.3', loaderType: 'fabric', loaderVersion: '0.19.5', mods: [{ provider: 'modrinth', projectId: 'AANobbMI', projectName: 'Sodium', versionId: 'v4PSXean', versionName: 'Sodium 0.9.3', downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/v4PSXean/sodium.jar', filename: 'sodium.jar', contentType: 'mod' }], resourcePacks: [], shaderPacks: [], configs: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    { id: 'pack-unresolved', name: 'Unresolved VPack', description: 'VPack with offline/unresolvable mod dependency', artwork: null, packVersion: '1.0.0', minecraftVersion: '26.3', loaderType: 'fabric', loaderVersion: '0.19.5', mods: [{ provider: 'modrinth', projectId: 'unresolved', projectName: 'Unknown Mod', versionId: 'unresolved', versionName: 'unknown', downloadUrl: '', filename: 'unknown.jar', contentType: 'mod', unresolved: true }], resourcePacks: [], shaderPacks: [], configs: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                ],
                listSkins: async () => [],
                getActiveSkin: async () => null,
                scanSystem: async () => ({ os: 'Linux', memoryTotalGb: 16, memoryFreeGb: 8 }),
                runEnvironmentCheck: async () => ({ passesAll: true, checks: [] }),
                scanMods: async () => [],
                scanResourcePacks: async () => [],
                scanShaders: async () => [],
                getLogs: async () => [],
                onLog: () => () => {},
                onProcessStatus: () => () => {},
                onDownloadProgress: () => () => {}
            };
        """)

        page.goto("http://localhost:5173")
        time.sleep(2)

        # 1. Home / Instances
        page.screenshot(path=os.path.join(output_dir, "01_Home_Instances.png"))

        # 2. Shop View
        page.click('[data-page="shop"]')
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "02_Shop_Overview.png"))

        # 3. Built-in Shop Card Detail
        page.click("text=Fabric Essentials")
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "03_Shop_Builtin_Card_Detail.png"))
        page.click("#cd-close")
        time.sleep(1)

        # 4. Developer Shop Card Detail
        page.click("text=Developer Curated Tech")
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "04_Shop_Developer_Card_Detail.png"))
        page.click("#cd-close")
        time.sleep(1)

        # 5. Developer Card Creator Modal
        page.click("#btn-new-card")
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "05_Developer_Card_Creator.png"))
        page.click("#cc-cancel")
        time.sleep(1)

        # 6. My Packs Overview
        page.click('[data-page="mypacks"]')
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "06_MyPacks_Overview.png"))

        # 7. Imported VPack / Pack Detail Modal
        page.click("text=Imported VPack Blueprint")
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "07_MyPacks_Resolved_Detail.png"))
        page.click("#cd-close")
        time.sleep(1)

        # 8. Unresolved VPack Detail
        page.click("text=Unresolved VPack")
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "08_MyPacks_Unresolved_Detail.png"))
        page.click("#cd-close")
        time.sleep(1)

        # 9. Settings
        page.click('[data-page="settings"]')
        time.sleep(1)
        page.screenshot(path=os.path.join(output_dir, "09_Settings.png"))

        print("All screenshots generated successfully!")

finally:
    server_process.terminate()
