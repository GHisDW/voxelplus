/**
 * CardInstaller — installs a Voxel+ Card into a new Voxel+ instance.
 *
 * Uses the existing InstanceManager + DownloadManager infrastructure.
 * Each step emits progress events through the existing download channel.
 */

import { VoxelCard, CardInstallState, CardModRef } from '../../types';
import { InstanceManager } from '../instances/instanceManager';
import { DownloadManager } from '../modrinth/downloader';
import { CardStore } from './cardStore';
import { randomBytes } from 'node:crypto';

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
   * Install a Card.
   * Returns the resulting CardInstallState.
   */
  public static async install(
    card: VoxelCard
  ): Promise<{ success: boolean; state?: CardInstallState; error?: string }> {
    // ── 1. Create the Voxel+ instance ────────────────────────────────────────
    this.emit({ cardId: card.id, step: 'creating_instance' });

    let instance;
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
    } catch (e: any) {
      const msg = `Failed to create instance: ${e?.message ?? e}`;
      this.emit({ cardId: card.id, step: 'error', error: msg });
      return { success: false, error: msg };
    }

    const failedMods: string[] = [];
    const totalMods = card.mods.length;

    // ── 2. Download each mod ──────────────────────────────────────────────────
    for (let i = 0; i < card.mods.length; i++) {
      const mod = card.mods[i]!;
      this.emit({
        cardId: card.id,
        step: 'downloading_mod',
        modName: mod.projectName,
        modIndex: i + 1,
        totalMods,
      });

      if (!mod.downloadUrl) {
        failedMods.push(mod.filename);
        continue;
      }

      const result = await DownloadManager.downloadToInstance(
        instance.id,
        mod.downloadUrl,
        mod.filename,
        mod.projectName,
        mod.contentType
      );

      if (!result.success) {
        failedMods.push(mod.filename);
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
  }

  /**
   * Uninstall a card — removes install state but does NOT delete the
   * Voxel+ instance (user may have customized it).
   */
  public static async uninstall(cardId: string): Promise<{ success: boolean; error?: string }> {
    try {
      CardStore.removeInstallState(cardId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: String(e?.message ?? e) };
    }
  }
}
