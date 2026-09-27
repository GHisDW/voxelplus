/**
 * CardStore — persists Voxel+ Card definitions and installation states locally.
 *
 * Card definitions are stored in: <config>/cards/definitions/<id>.json
 * Install states are stored in:   <config>/cards/installed.json
 *
 * Card definitions are immutable once written.
 * Installation state is mutable.
 */

import fs from 'node:fs';
import path from 'node:path';
import { VoxelCard, CardInstallState } from '../../types';
import { PathManager } from '../storage/paths';

interface InstalledRegistry {
  installs: CardInstallState[];
}

export class CardStore {
  // ── Directory helpers ──────────────────────────────────────────────────────

  private static getCardsDir(): string {
    return PathManager.ensureDirectory(
      path.join(PathManager.getConfigDir(), 'cards')
    );
  }

  private static getDefinitionsDir(): string {
    return PathManager.ensureDirectory(
      path.join(this.getCardsDir(), 'definitions')
    );
  }

  private static getInstalledFile(): string {
    return path.join(this.getCardsDir(), 'installed.json');
  }

  // ── Built-in / sample card definitions ────────────────────────────────────

  /**
   * Returns local sample cards shipped with Voxel+.
   * These are clearly non-production placeholders that demonstrate the Card
   * schema. They have no real download URLs and will produce install errors
   * if the user attempts to install them without a real connection.
   */
  private static getSampleCards(): VoxelCard[] {
    return [
      {
        schemaVersion: 1,
        id: 'voxelplus-performance-2602',
        name: 'Voxel⁺ Performance',
        description:
          'A curated selection of performance mods optimized for Minecraft development environments. Includes Sodium, Lithium, and Starlight for maximum FPS.',
        tagline: 'Max FPS for Minecraft dev',
        artwork: null,
        cardVersion: '1.0.0',
        minecraftVersion: '26.0.2',
        loaderType: 'fabric',
        loaderVersion: '0.16.0',
        mods: [
          {
            provider: 'modrinth',
            projectId: 'AANobbMI',
            projectName: 'Sodium',
            versionId: 'PLACEHOLDER',
            versionName: 'mc26-compatible',
            downloadUrl: '',
            filename: 'sodium-placeholder.jar',
            iconUrl: 'https://cdn.modrinth.com/data/AANobbMI/icon.png',
            contentType: 'mod',
          },
          {
            provider: 'modrinth',
            projectId: 'gvQqBUqZ',
            projectName: 'Lithium',
            versionId: 'PLACEHOLDER',
            versionName: 'mc26-compatible',
            downloadUrl: '',
            filename: 'lithium-placeholder.jar',
            iconUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png',
            contentType: 'mod',
          },
        ],
        tags: ['performance', 'fps', 'fabric'],
        author: 'Voxel⁺ Team',
        publishedAt: new Date().toISOString(),
        signature: null,
      },
    ];
  }

  // ── Card definitions ───────────────────────────────────────────────────────

  public static listCards(): VoxelCard[] {
    const cards: VoxelCard[] = [...this.getSampleCards()];
    const dir = this.getDefinitionsDir();

    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const card = JSON.parse(raw) as VoxelCard;
          // Avoid duplicating sample IDs if someone imports a sample
          if (!cards.find(c => c.id === card.id)) {
            cards.push(card);
          }
        } catch {
          // Skip corrupted definition files silently.
        }
      }
    } catch {
      // definitions dir not readable — return only sample cards.
    }

    return cards;
  }

  public static getCard(cardId: string): VoxelCard | null {
    return this.listCards().find(c => c.id === cardId) ?? null;
  }

  public static saveCard(card: VoxelCard): void {
    const filePath = path.join(this.getDefinitionsDir(), `${card.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf-8');
  }

  public static deleteCard(cardId: string): void {
    const filePath = path.join(this.getDefinitionsDir(), `${cardId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ── Install state ──────────────────────────────────────────────────────────

  private static loadInstalled(): InstalledRegistry {
    const file = this.getInstalledFile();
    if (!fs.existsSync(file)) return { installs: [] };
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      return JSON.parse(raw) as InstalledRegistry;
    } catch {
      return { installs: [] };
    }
  }

  private static saveInstalled(registry: InstalledRegistry): void {
    fs.writeFileSync(
      this.getInstalledFile(),
      JSON.stringify(registry, null, 2),
      'utf-8'
    );
  }

  public static listInstalled(): CardInstallState[] {
    return this.loadInstalled().installs;
  }

  public static getInstallState(cardId: string): CardInstallState | null {
    return this.listInstalled().find(i => i.cardId === cardId) ?? null;
  }

  public static saveInstallState(state: CardInstallState): void {
    const registry = this.loadInstalled();
    const idx = registry.installs.findIndex(i => i.cardId === state.cardId);
    if (idx >= 0) {
      registry.installs[idx] = state;
    } else {
      registry.installs.push(state);
    }
    this.saveInstalled(registry);
  }

  public static removeInstallState(cardId: string): void {
    const registry = this.loadInstalled();
    registry.installs = registry.installs.filter(i => i.cardId !== cardId);
    this.saveInstalled(registry);
  }
}
