/**
 * CardStore — persists Voxel+ Card definitions and installation states locally.
 *
 * Card definitions are stored in: <config>/cards/definitions/<id>.json
 * Install states are stored in:   <config>/cards/installed.json
 * Retired card IDs are stored in: <config>/cards/retired.json
 * Retired card snapshots in:     <config>/cards/retired_definitions/<id>.json
 *
 * Card definitions are immutable once written unless edited by developer in dev mode.
 * Built-in cards that are removed from the default set in future app updates become "retired".
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

  // ── Developer Catalog helpers ──────────────────────────────────────────────

  private static getDeveloperDir(): string {
    return PathManager.ensureDirectory(
      path.join(PathManager.getConfigDir(), 'developer')
    );
  }

  public static getDeveloperCatalogFile(): string {
    return path.join(this.getDeveloperDir(), 'catalog.json');
  }

  /**
   * Loads structured developer catalog cards if developer/catalog.json exists.
   * Developer cards loaded from catalog.json strictly have source = 'developer'.
   * Gracefully handles missing or malformed catalog files without throwing.
   */
  public static loadDeveloperCatalog(): VoxelCard[] {
    const file = this.getDeveloperCatalogFile();
    if (!fs.existsSync(file)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      if (!raw || !raw.trim()) {
        return [];
      }
      const catalog = JSON.parse(raw);
      if (!catalog) return [];
      const cards: VoxelCard[] = Array.isArray(catalog)
        ? catalog
        : (Array.isArray(catalog.cards) ? catalog.cards : []);
      return cards.map(card => ({
        ...card,
        source: 'developer' as CardSource,
      }));
    } catch (e) {
      console.warn('Failed or malformed developer catalog file, returning empty list:', e);
      return [];
    }
  }

  /**
   * Saves the list of developer cards to <config>/developer/catalog.json.
   */
  public static saveDeveloperCatalog(cards: VoxelCard[]): void {
    const file = this.getDeveloperCatalogFile();
    const developerCards = cards.map(c => ({ ...c, source: 'developer' as CardSource }));
    fs.writeFileSync(file, JSON.stringify({ cards: developerCards }, null, 2), 'utf-8');
  }

  /**
   * Creates or updates a card in the developer catalog (<config>/developer/catalog.json).
   */
  public static saveDeveloperCard(card: VoxelCard): void {
    if (!card.id || !card.name || !card.minecraftVersion || !card.loaderType) {
      throw new Error('Card must have id, name, minecraftVersion, and loaderType');
    }
    if (this.isBuiltInCard(card.id)) {
      throw new Error(`Cannot modify canonical built-in card "${card.id}" in developer catalog.`);
    }
    const devCard: VoxelCard = { ...card, source: 'developer' as CardSource };
    const catalog = this.loadDeveloperCatalog();
    const idx = catalog.findIndex(c => c.id === card.id);
    if (idx >= 0) {
      catalog[idx] = devCard;
    } else {
      catalog.push(devCard);
    }
    this.saveDeveloperCatalog(catalog);
    this.saveCardSnapshot(devCard);
  }

  /**
   * Deletes a card from the developer catalog (<config>/developer/catalog.json).
   */
  public static deleteDeveloperCard(cardId: string): void {
    if (this.isBuiltInCard(cardId)) {
      throw new Error(`Cannot delete canonical built-in card "${cardId}".`);
    }
    const catalog = this.loadDeveloperCatalog();
    const filtered = catalog.filter(c => c.id !== cardId);
    this.saveDeveloperCatalog(filtered);
  }

  // ── Built-in card definitions ───────────────────────────────────────────────

  /**
   * Returns the canonical built-in cards shipped with Voxel+.
   * Strictly reads from defaultCards.ts with zero fallback fabrication.
   */
  public static getBuiltInCards(): VoxelCard[] {
    try {
      const defaultCards = getDefaultCards();
      if (!Array.isArray(defaultCards)) {
        console.warn('Canonical card catalog in defaultCards.ts returned non-array:', defaultCards);
        return [];
      }
      return defaultCards.map(card => ({
        ...card,
        source: 'builtin' as CardSource,
      }));
    } catch (e) {
      console.error('Failed to load canonical default cards from defaultCards.ts:', e);
      return [];
    }
  }

  /**
   * Returns the set of canonical built-in card IDs.
   */
  public static getBuiltInCardIdSet(): Set<string> {
    try {
      return getBuiltInCardIds();
    } catch {
      return new Set<string>();
    }
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
   * Mark a card as retired. Built-in cards are never retired while they remain in defaultCards.
   */
  public static markAsRetired(cardId: string): void {
    if (this.isBuiltInCard(cardId)) {
      return;
    }
    const registry = this.loadRetired();
    if (!registry.retiredCardIds.includes(cardId)) {
      registry.retiredCardIds.push(cardId);
      this.saveRetired(registry);
    }
  }

  /**
   * Check if a card is retired. Built-in cards shipped with Voxel+ are never retired.
   */
  public static isCardRetired(cardId: string): boolean {
    if (this.isBuiltInCard(cardId)) {
      return false;
    }
    const registry = this.loadRetired();
    return registry.retiredCardIds.includes(cardId);
  }

  /**
   * Update retirement status.
   * - Built-in cards present in defaultCards are NEVER retired.
   * - Deleting or omitting the developer catalog file NEVER causes built-in or user cards to become retired.
   * - Active developer catalog cards are not retired; developer cards removed from catalog or when catalog is deleted ARE retired if installed/known.
   * - User-created cards present in definitions directory are NEVER retired.
   */
  private static updateRetirementStatus(): void {
    const builtInIds = this.getBuiltInCardIdSet();
    const devCatalogCards = this.loadDeveloperCatalog();
    const devCatalogCardIds = new Set(devCatalogCards.map(c => c.id));
    const registry = this.loadRetired();
    const installed = this.listInstalled();

    // Remove built-in IDs from retired registry
    registry.retiredCardIds = registry.retiredCardIds.filter(id => !builtInIds.has(id));

    // Check installed cards
    for (const install of installed) {
      // User definitions in definitions/ directory are active
      const userDefPath = path.join(this.getDefinitionsDir(), `${install.cardId}.json`);
      if (fs.existsSync(userDefPath)) {
        registry.retiredCardIds = registry.retiredCardIds.filter(id => id !== install.cardId);
        continue;
      }

      // Built-in cards are active
      if (builtInIds.has(install.cardId)) {
        registry.retiredCardIds = registry.retiredCardIds.filter(id => id !== install.cardId);
        continue;
      }

      // Developer cards currently in catalog are active
      if (devCatalogCardIds.has(install.cardId)) {
        registry.retiredCardIds = registry.retiredCardIds.filter(id => id !== install.cardId);
        continue;
      }

      // Installed card is neither built-in, user def, nor in current dev catalog -> mark retired
      if (!registry.retiredCardIds.includes(install.cardId)) {
        registry.retiredCardIds.push(install.cardId);
      }
    }

    this.saveRetired(registry);
  }

  // ── Card definitions ───────────────────────────────────────────────────────

  public static listCards(): VoxelCard[] {
    // Save snapshots for all current built-in cards so they remain reconstructable if retired in future releases
    for (const card of this.getBuiltInCards()) {
      this.saveCardSnapshot(card);
    }

    // Save snapshots for current developer catalog cards
    const devCards = this.loadDeveloperCatalog();
    for (const card of devCards) {
      this.saveCardSnapshot(card);
    }

    this.updateRetirementStatus();

    const cardsMap = new Map<string, VoxelCard>();

    // 1. Always include built-in cards (strictly source = 'builtin')
    for (const c of this.getBuiltInCards()) {
      cardsMap.set(c.id, { ...c, source: 'builtin' });
    }

    // 2. Include active developer catalog cards (strictly source = 'developer')
    for (const c of devCards) {
      cardsMap.set(c.id, { ...c, source: 'developer' });
    }

    // 3. Include user definitions from definitions directory (strictly source = 'user')
    const dir = this.getDefinitionsDir();
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const card = JSON.parse(raw) as VoxelCard;
          // User definitions in config/cards/definitions/ are strictly source = 'user'
          card.source = 'user';
          cardsMap.set(card.id, card);
        } catch {
          // Skip corrupted definition files.
        }
      }
    } catch {
      // definitions dir not readable
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

    const userDefPath = path.join(this.getDefinitionsDir(), `${cardId}.json`);
    if (fs.existsSync(userDefPath)) {
      try {
        const raw = fs.readFileSync(userDefPath, 'utf-8');
        return JSON.parse(raw) as VoxelCard;
      } catch {
        /* ignore */
      }
    }

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

    if (this.isBuiltInCard(card.id)) {
      throw new Error(`Cannot modify canonical built-in card "${card.id}".`);
    }

    // If card source is 'developer', persist directly to developer catalog
    if (card.source === 'developer') {
      this.saveDeveloperCard(card);
      return;
    }

    // Otherwise, ensure source is 'user' and save to user definitions directory
    card.source = 'user';
    const filePath = path.join(this.getDefinitionsDir(), `${card.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf-8');

    // Save snapshot as well
    this.saveCardSnapshot(card);
  }

  public static deleteCard(cardId: string): void {
    if (this.isBuiltInCard(cardId)) {
      throw new Error(`Cannot delete canonical built-in card "${cardId}".`);
    }

    // Remove from developer catalog if present
    const devCatalog = this.loadDeveloperCatalog();
    if (devCatalog.some(c => c.id === cardId)) {
      this.deleteDeveloperCard(cardId);
    }

    // Remove from user definitions directory if present
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
