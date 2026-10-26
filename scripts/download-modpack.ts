/**
 * Download a real Modrinth modpack for testing
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const DOWNLOAD_DIR = path.join(process.cwd(), '.test-modpacks');

// Cobblemon Fabric 1.3.2 modpack from Modrinth
const MODPACK_URL = 'https://cdn.modrinth.com/data/5FFgwNNP/versions/nvrqJg44/Cobblemon%20%5BFabric%5D%201.3.2.mrpack';
const MODPACK_NAME = 'Cobblemon-Fabric-1.3.2.mrpack';

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
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
  console.log('Downloading Cobblemon Fabric modpack from Modrinth...');

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const destPath = path.join(DOWNLOAD_DIR, MODPACK_NAME);

  try {
    await downloadFile(MODPACK_URL, destPath);
    console.log(`✓ Downloaded to: ${destPath}`);
    console.log(`Size: ${fs.statSync(destPath).size} bytes`);
  } catch (error: any) {
    console.error(`✗ Failed to download: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
