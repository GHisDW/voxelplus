/**
 * CardStore — persists Voxel+ Card definitions and installation states locally.
 *
 * Card definitions are stored in: <config>/cards/definitions/<id>.json
 * Install states are stored in:   <config>/cards/installed.json
 * Retired card IDs are stored in: <config>/cards/retired.json
 * Retired card snapshots in:     <config>/cards/retired_definitions/<id>.json
 *
 * Card definitions are immutable once written unless edited by user in dev mode.
 * Built-in cards that are removed from the default set become "retired".
 */

import fs from 'node:fs';
import path from 'node:path';
import { VoxelCard, CardInstallState, CardSource } from '../../types';
import { PathManager } from '../storage/paths';
import { getDefaultCards, getBuiltInCardIds } from './defaultCards';

interface InstalledRegistry {
  installs: CardInstallState[];
}

interface RetiredRegistry {
  retiredCardIds: string[];
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

  private static getRetiredDefinitionsDir(): string {
    return PathManager.ensureDirectory(
      path.join(this.getCardsDir(), 'retired_definitions')
    );
  }

  private static getInstalledFile(): string {
    return path.join(this.getCardsDir(), 'installed.json');
  }

  private static getRetiredFile(): string {
    return path.join(this.getCardsDir(), 'retired.json');
  }

  // ── Built-in card definitions ───────────────────────────────────────────────

  /**
   * Returns the built-in cards shipped with Voxel+.
   * These are loaded from the centralized defaultCards.ts file.
   */
  private static getBuiltInCards(): VoxelCard[] {
    return getDefaultCards().map(card => ({
      ...card,
      source: 'builtin' as CardSource,
    }));
  }

  /**
   * Returns the set of built-in card IDs.
   * Used to determine if a card is built-in vs user-created.
   */
  private static getBuiltInCardIdSet(): Set<string> {
    return getBuiltInCardIds();
  }

  // ── Retirement tracking ─────────────────────────────────────────────────────

  private static loadRetired(): RetiredRegistry {
    const file = this.getRetiredFile();
    if (!fs.existsSync(file)) return { retiredCardIds: [] };
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      return JSON.parse(raw) as RetiredRegistry;
    } catch {
      return { retiredCardIds: [] };
    }
  }

  private static saveRetired(registry: RetiredRegistry): void {
    fs.writeFileSync(
      this.getRetiredFile(),
      JSON.stringify(registry, null, 2),
      'utf-8'
    );
  }

  /**
   * Save a snapshot of a card definition for retired card reconstruction.
   */
  public static saveCardSnapshot(card: VoxelCard): void {
    try {
      const snapshotPath = path.join(this.getRetiredDefinitionsDir(), `${card.id}.json`);
      fs.writeFileSync(snapshotPath, JSON.stringify(card, null, 2), 'utf-8');
    } catch (e) {
      console.warn(`Failed to save card snapshot for ${card.id}:`, e);
    }
  }

  /**
   * Mark a card as retired.
   */
  public static markAsRetired(cardId: string): void {
    const registry = this.loadRetired();
    if (!registry.retiredCardIds.includes(cardId)) {
      registry.retiredCardIds.push(cardId);
      this.saveRetired(registry);
    }
  }

  /**
   * Check if a card is retired (removed from built-in set but still installed).
   */
  public static isCardRetired(cardId: string): boolean {
    const registry = this.loadRetired();
    return registry.retiredCardIds.includes(cardId);
  }

  /**
   * Update retirement status based on current built-in cards.
   * User-created cards (`source: 'user'`) are NEVER marked as retired.
   */
  private static updateRetirementStatus(): void {
    const builtInIds = this.getBuiltInCardIdSet();
    const registry = this.loadRetired();
    const installed = this.listInstalled();

    for (const install of installed) {
      // If card definition exists in definitions dir (user-created or edited), it's not retired
      const userDefPath = path.join(this.getDefinitionsDir(), `${install.cardId}.json`);
      if (fs.existsSync(userDefPath)) {
        try {
          const raw = fs.readFileSync(userDefPath, 'utf-8');
          const parsed = JSON.parse(raw) as VoxelCard;
          if (parsed.source === 'user') {
            // Remove from retired if present
            registry.retiredCardIds = registry.retiredCardIds.filter(id => id !== install.cardId);
            continue;
          }
        } catch {
          /* ignore error reading file */
        }
      }

      if (builtInIds.has(install.cardId)) {
        // Still active in built-in set
        registry.retiredCardIds = registry.retiredCardIds.filter(id => id !== install.cardId);
      } else {
        // Missing from built-in set and not a user card -> mark as retired
        if (!registry.retiredCardIds.includes(install.cardId)) {
          this.markAsRetired(install.cardId);
        }
      }
    }

    this.saveRetired(registry);
  }

  // ── Card definitions ───────────────────────────────────────────────────────

  public static listCards(): VoxelCard[] {
    // Save snapshots for all current built-in cards so they can be reconstructed if retired later
    for (const card of this.getBuiltInCards()) {
      this.saveCardSnapshot(card);
    }

    this.updateRetirementStatus();

    const builtInCards = this.getBuiltInCards();
    const cardsMap = new Map<string, VoxelCard>();

    for (const c of builtInCards) {
      cardsMap.set(c.id, c);
    }

    const dir = this.getDefinitionsDir();
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const card = JSON.parse(raw) as VoxelCard;
          if (!card.source) {
            card.source = 'user';
          }
          // User definitions or edited definitions override or add to catalog
          cardsMap.set(card.id, card);
        } catch {
          // Skip corrupted definition files silently.
        }
      }
    } catch {
      // definitions dir not readable — return built-in cards.
    }

    return Array.from(cardsMap.values());
  }

  public static getCard(cardId: string): VoxelCard | null {
    return this.listCards().find(c => c.id === cardId) ?? null;
  }

  /**
   * Get a card even if it's retired.
   * Returns active card if available, or reconstructs definition from retired snapshots/definitions.
   */
  public static getCardIncludingRetired(cardId: string): VoxelCard | null {
    const card = this.getCard(cardId);
    if (card) return card;

    // Search in user definitions
    const userDefPath = path.join(this.getDefinitionsDir(), `${cardId}.json`);
    if (fs.existsSync(userDefPath)) {
      try {
        const raw = fs.readFileSync(userDefPath, 'utf-8');
        return JSON.parse(raw) as VoxelCard;
      } catch {
        /* ignore */
      }
    }

    // Search in retired snapshots
    const snapshotPath = path.join(this.getRetiredDefinitionsDir(), `${cardId}.json`);
    if (fs.existsSync(snapshotPath)) {
      try {
        const raw = fs.readFileSync(snapshotPath, 'utf-8');
        return JSON.parse(raw) as VoxelCard;
      } catch {
        /* ignore */
      }
    }

    return null;
  }

  /**
   * Check if a card is built-in (shipped with Voxel+).
   */
  public static isBuiltInCard(cardId: string): boolean {
    return this.getBuiltInCardIdSet().has(cardId);
  }

  public static saveCard(card: VoxelCard): void {
    if (!card.id || !card.name || !card.minecraftVersion || !card.loaderType) {
      throw new Error('Card must have id, name, minecraftVersion, and loaderType');
    }

    if (!card.source) {
      card.source = this.isBuiltInCard(card.id) ? 'builtin' : 'user';
    }

    const filePath = path.join(this.getDefinitionsDir(), `${card.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf-8');

    // Save snapshot as well
    this.saveCardSnapshot(card);
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
