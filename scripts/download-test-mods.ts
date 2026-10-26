/**
 * Download real mods for testing
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const DOWNLOAD_DIR = path.join(process.cwd(), '.test-mods');

// Popular mods for testing (use direct download URLs)
const TEST_MODS = [
  {
    name: 'Sodium',
    url: 'https://cdn.modrinth.com/data/AANobbMI/versions/whVSMh9A/sodium-fabric-0.5.8+mc1.20.1.jar',
    fileName: 'sodium-fabric-0.5.8+mc1.20.1.jar'
  },
  {
    name: 'Lithium',
    url: 'https://cdn.modrinth.com/data/zvQW9tD6/versions/Cvsn68Ih/lithium-fabric-0.12.1+mc1.20.1.jar',
    fileName: 'lithium-fabric-0.12.1+mc1.20.1.jar'
  },
  {
    name: 'Fabric API',
    url: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/KUfb3Ym2/fabric-api-0.92.0+1.20.1.jar',
    fileName: 'fabric-api-0.92.0+1.20.1.jar'
  },
  {
    name: 'Replay Mod',
    url: 'https://cdn.modrinth.com/data/Nv2fQJ5F/versions/3Xk7XHsX/ReplayMod-1.20.1-2.6.13-fabric.jar',
    fileName: 'ReplayMod-1.20.1-2.6.13-fabric.jar'
  },
  {
    name: 'Xaero Minimap',
    url: 'https://cdn.modrinth.com/data/1bokaNcj/versions/tyS6S7Yg/Xaeros_Minimap_23.9.7_Fabric_1.20.1.jar',
    fileName: 'Xaeros_Minimap_23.9.7_Fabric_1.20.1.jar'
  }
];

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading test mods...');

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  for (const mod of TEST_MODS) {
    console.log(`Downloading ${mod.name}...`);
    const destPath = path.join(DOWNLOAD_DIR, mod.fileName);

    try {
      await downloadFile(mod.url, destPath);
      console.log(`  ✓ Downloaded: ${mod.fileName} (${fs.statSync(destPath).size} bytes)`);
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }

  console.log('\nAll mods downloaded to:', DOWNLOAD_DIR);
}

main().catch(console.error);
