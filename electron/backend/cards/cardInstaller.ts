/**
 * CardInstaller — installs a Voxel+ Card into a new Voxel+ instance.
 *
 * Uses the existing InstanceManager + DownloadManager infrastructure.
 * Each step emits progress events through the existing download channel.
 *
 * Important: Installation failures do NOT delete the instance to preserve
 * user customization. Only the install state is removed on failure.
 */

import { VoxelCard, CardInstallState, CardModRef, InstanceMetadata } from '../../types';
import { InstanceManager } from '../instances/instanceManager';
import { DownloadManager } from '../modrinth/downloader';
import { ModrinthClient } from '../modrinth/modrinthClient';
import { CardStore } from './cardStore';

export interface CardInstallProgress {
  cardId: string;
  step: 'creating_instance' | 'downloading_mod' | 'complete' | 'error';
  modName?: string;
  modIndex?: number;
  totalMods?: number;
  error?: string;
}

type ProgressCallback = (progress: CardInstallProgress) => void;

export class CardInstaller {
  private static listeners: ProgressCallback[] = [];
  private static activeInstalls = new Map<string, AbortController>();

  public static onProgress(cb: ProgressCallback): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  private static emit(progress: CardInstallProgress): void {
    for (const l of this.listeners) {
      try { l(progress); } catch { /* ignore */ }
    }
  }

  /**
   * Validate card before installation.
   * Returns error message if invalid, null if valid.
   */
  private static validateCard(card: VoxelCard): string | null {
    if (!card.id || !card.name) {
      return 'Card must have a valid ID and name';
    }
    if (!card.minecraftVersion) {
      return 'Card must specify a Minecraft version';
    }
    if (!card.loaderType || !card.loaderVersion) {
      return 'Card must specify a loader type and version';
    }
    if (!card.mods || card.mods.length === 0) {
      return 'Card must include at least one mod';
    }
    
    // Validate mod references
    for (const mod of card.mods) {
      if (!mod.provider || !mod.projectId || !mod.projectName) {
        return `Invalid mod reference: ${mod.projectName || 'unknown'}`;
      }
    }
    
    return null;
  }

  /**
   * Check if a card is already installed.
   */
  private static isAlreadyInstalled(cardId: string): boolean {
    return CardStore.getInstallState(cardId) !== null;
  }

  /**
   * Cancel an active installation.
   */
  public static cancelInstall(cardId: string): void {
    const controller = this.activeInstalls.get(cardId);
    if (controller) {
      controller.abort();
      this.activeInstalls.delete(cardId);
      this.emit({ cardId, step: 'error', error: 'Installation cancelled' });
    }
  }

  /**
   * Dynamically resolve download URL for a mod reference if downloadUrl is missing or PLACEHOLDER.
   */
  private static async resolveModRef(
    mod: CardModRef,
    minecraftVersion: string,
    loaderType: string
  ): Promise<{ downloadUrl: string; filename: string } | null> {
    if (mod.downloadUrl && mod.downloadUrl !== '' && !mod.downloadUrl.includes('PLACEHOLDER')) {
      return { downloadUrl: mod.downloadUrl, filename: mod.filename };
    }

    if (mod.provider === 'modrinth' && mod.projectId) {
      try {
        const versions = await ModrinthClient.getProjectVersions(
          mod.projectId,
          [loaderType],
          [minecraftVersion]
        );

        if (versions.length > 0 && versions[0].files.length > 0) {
          const primaryFile = versions[0].files.find(f => f.primary) || versions[0].files[0];
          return { downloadUrl: primaryFile.url, filename: primaryFile.filename };
        }

        // Fallback without version filter
        const fallbackVersions = await ModrinthClient.getProjectVersions(mod.projectId, [loaderType], []);
        if (fallbackVersions.length > 0 && fallbackVersions[0].files.length > 0) {
          const primaryFile = fallbackVersions[0].files.find(f => f.primary) || fallbackVersions[0].files[0];
          return { downloadUrl: primaryFile.url, filename: primaryFile.filename };
        }
      } catch (e) {
        console.warn(`Failed to dynamically resolve Modrinth version for ${mod.projectName}:`, e);
      }
    }

    return null;
  }

  /**
   * Install a Card.
   * Returns the resulting CardInstallState.
   */
  public static async install(
    card: VoxelCard
  ): Promise<{ success: boolean; state?: CardInstallState; error?: string }> {
    // ── 0. Pre-installation validation ────────────────────────────────────────
    const validationError = this.validateCard(card);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Check for duplicate installation
    if (this.isAlreadyInstalled(card.id)) {
      return { 
        success: false, 
        error: 'This card is already installed. Uninstall the existing installation first or use the existing instance.' 
      };
    }

    // Set up cancellation support
    const abortController = new AbortController();
    this.activeInstalls.set(card.id, abortController);

    let instance: InstanceMetadata | null = null;
    const failedMods: string[] = [];
    const totalMods = card.mods.length;

    try {
      // ── 1. Create the Voxel+ instance ────────────────────────────────────────
      this.emit({ cardId: card.id, step: 'creating_instance' });

      try {
        instance = await InstanceManager.createInstance({
          name: `${card.name} (Card)`,
          minecraftVersion: card.minecraftVersion,
          loaderType: card.loaderType,
          loaderVersion: card.loaderVersion,
          memoryMb: 4096,
          artwork: card.artwork,
          item: 'minecraft:diamond',
        });
      } catch (e: unknown) {
        const msg = `Failed to create instance: ${e instanceof Error ? e.message : String(e)}`;
        this.emit({ cardId: card.id, step: 'error', error: msg });
        return { success: false, error: msg };
      }

      // ── 2. Download each mod ──────────────────────────────────────────────────
      for (let i = 0; i < card.mods.length; i++) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          throw new Error('Installation cancelled');
        }

        const mod = card.mods[i];
        this.emit({
          cardId: card.id,
          step: 'downloading_mod',
          modName: mod.projectName,
          modIndex: i + 1,
          totalMods,
        });

        // Skip unresolved mods
        if (mod.unresolved) {
          failedMods.push(mod.filename || mod.projectName);
          continue;
        }

        // Dynamically resolve download URL if needed
        const resolved = await this.resolveModRef(mod, card.minecraftVersion, card.loaderType);
        if (!resolved || !resolved.downloadUrl) {
          failedMods.push(mod.filename || mod.projectName);
          continue;
        }

        try {
          const result = await DownloadManager.downloadToInstance(
            instance.id,
            resolved.downloadUrl,
            resolved.filename || mod.filename,
            mod.projectName,
            mod.contentType
          );

          if (!result.success) {
            failedMods.push(resolved.filename || mod.filename);
          }
        } catch (e: unknown) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
          failedMods.push(resolved.filename || mod.filename);
        }
      }

      // ── 3. Save install state ─────────────────────────────────────────────────
      const state: CardInstallState = {
        cardId: card.id,
        cardVersion: card.cardVersion,
        instanceId: instance.id,
        installedAt: new Date().toISOString(),
        isComplete: failedMods.length === 0,
        failedMods,
      };

      CardStore.saveInstallState(state);

      this.emit({ cardId: card.id, step: 'complete', totalMods });

      return { success: true, state };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown installation error';
      this.emit({ cardId: card.id, step: 'error', error: msg });
      
      // Clean up install state if we saved it
      CardStore.removeInstallState(card.id);
      
      return { success: false, error: msg };
    } finally {
      // Clean up cancellation controller
      this.activeInstalls.delete(card.id);
    }
  }

  /**
   * Uninstall a card — removes install state but does NOT delete the
   * Voxel+ instance (user may have customized it).
   */
  public static async uninstall(cardId: string): Promise<{ success: boolean; error?: string }> {
    try {
      CardStore.removeInstallState(cardId);
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
