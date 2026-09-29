/**
 * CardStore — persists Voxel+ Card definitions and installation states locally.
 *
 * Card definitions are stored in: <config>/cards/definitions/<id>.json
 * Install states are stored in:   <config>/cards/installed.json
 * Retired card IDs are stored in: <config>/cards/retired.json
 *
 * Card definitions are immutable once written.
 * Installation state is mutable.
 * Built-in cards that are removed from the default set become "retired".
 */

import fs from 'node:fs';
import path from 'node:path';
import { VoxelCard, CardInstallState } from '../../types';
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

  private static getInstalledFile(): string {
    return path.join(this.getCardsDir(), 'installed.json');
  }

  // ── Built-in card definitions ───────────────────────────────────────────────

  /**
   * Returns the built-in cards shipped with Voxel+.
   * These are loaded from the centralized defaultCards.ts file.
   */
  private static getBuiltInCards(): VoxelCard[] {
    return getDefaultCards();
  }

  /**
   * Returns the set of built-in card IDs.
   * Used to determine if a card is built-in vs user-created.
   */
  private static getBuiltInCardIdSet(): Set<string> {
    return getBuiltInCardIds();
  }

  // ── Retirement tracking ─────────────────────────────────────────────────────

  private static getRetiredFile(): string {
    return path.join(this.getCardsDir(), 'retired.json');
  }

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
   * Mark a built-in card as retired.
   * This happens when a card is removed from the default cards set.
   */
  private static markAsRetired(cardId: string): void {
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
   * Cards that are no longer in the built-in set become retired.
   */
  private static updateRetirementStatus(): void {
    const builtInIds = this.getBuiltInCardIdSet();
    const registry = this.loadRetired();
    const installed = this.listInstalled();

    // Check each installed card
    for (const install of installed) {
      // If it was built-in but is no longer in the built-in set, mark as retired
      if (builtInIds.has(install.cardId)) {
        // Still in built-in set, remove from retired if present
        registry.retiredCardIds = registry.retiredCardIds.filter(id => id !== install.cardId);
      } else {
        // Not in built-in set anymore, check if it was ever built-in
        // We can't know for sure without historical data, but if it's installed
        // and not user-created, we assume it was built-in
        const userCreated = fs.existsSync(path.join(this.getDefinitionsDir(), `${install.cardId}.json`));
        if (!userCreated && !registry.retiredCardIds.includes(install.cardId)) {
          this.markAsRetired(install.cardId);
        }
      }
    }

    this.saveRetired(registry);
  }

  // ── Card definitions ───────────────────────────────────────────────────────

  public static listCards(): VoxelCard[] {
    // Update retirement status based on current built-in cards
    this.updateRetirementStatus();

    const cards: VoxelCard[] = [...this.getBuiltInCards()];
    const dir = this.getDefinitionsDir();

    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const card = JSON.parse(raw) as VoxelCard;
          // Avoid duplicating built-in IDs if someone imported a built-in card
          if (!cards.find(c => c.id === card.id)) {
            cards.push(card);
          }
        } catch {
          // Skip corrupted definition files silently.
        }
      }
    } catch {
      // definitions dir not readable — return only built-in cards.
    }

    return cards;
  }

  public static getCard(cardId: string): VoxelCard | null {
    return this.listCards().find(c => c.id === cardId) ?? null;
  }

  /**
   * Get a card even if it's retired.
   * Returns the card definition if it exists, or null if not found.
   * For retired cards, we return the definition from the install state if available.
   */
  public static getCardIncludingRetired(cardId: string): VoxelCard | null {
    // First try to get from current cards
    const card = this.getCard(cardId);
    if (card) return card;

    // If not found and it's retired, we might need to reconstruct from install state
    // For now, we return null - the frontend should handle retired cards specially
    return null;
  }

  /**
   * Check if a card is built-in (shipped with Voxel+).
   */
  public static isBuiltInCard(cardId: string): boolean {
    return this.getBuiltInCardIdSet().has(cardId);
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
