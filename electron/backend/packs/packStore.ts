import fs from 'node:fs';
import path from 'node:path';
import { MyPack } from '../../types';
import { PathManager } from '../storage/paths';

export class PackStore {
  private static getPacksDir(): string {
    return PathManager.ensureDirectory(
      path.join(PathManager.getConfigDir(), 'packs')
    );
  }

  public static listPacks(): MyPack[] {
    const packs: MyPack[] = [];
    const dir = this.getPacksDir();

    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          packs.push(JSON.parse(raw) as MyPack);
        } catch {
          // Skip corrupted
        }
      }
    } catch {
      // Ignored
    }
    return packs;
  }

  public static getPack(id: string): MyPack | null {
    return this.listPacks().find(p => p.id === id) ?? null;
  }

  public static savePack(pack: MyPack): void {
    const filePath = path.join(this.getPacksDir(), `${pack.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(pack, null, 2), 'utf-8');
  }

  public static deletePack(id: string): void {
    const filePath = path.join(this.getPacksDir(), `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
