import { InstanceMetadata } from '../../../electron/types';
import { api } from '../services/api';
import { InstanceCard } from '../components/InstanceCard';
import { InstanceDetails } from '../components/InstanceDetails';
import { HeaderFilters } from '../components/Header';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { NotificationToast } from '../components/NotificationToast';
import { getItemDataUrl } from '../assets/items';

export interface InstancesPageEvents {
  onOpenModrinthForInstance: (instance: InstanceMetadata) => void;
  onViewLogs: (instanceId: string) => void;
}

export class InstancesPage {
  private container: HTMLElement;
  private instances: InstanceMetadata[] = [];
  private activeDetailsId: string | null = null;
  private filters: HeaderFilters = { search: '', filter: 'all', sort: 'recent' };
  private currentLayout: 'horizontal' | 'vertical' = 'horizontal';
  private events: InstancesPageEvents;
  private unsubscribeStatus: (() => void) | null = null;
  private currentRenderId: number = 0;
  /** Coalesces bursts of process-status events into one re-render. */
  private statusRefreshTimer: number | null = null;

  constructor(events: InstancesPageEvents) {
    this.events = events;
    this.container = document.createElement('div');
    this.container.className = 'page-scroll-area animate-fade-in';
    // Initialize layout preference from app settings or localStorage
    try {
      const saved = localStorage.getItem('voxelplus:homeLayout');
      if (saved === 'horizontal' || saved === 'vertical') {
        this.currentLayout = saved;
      }
    } catch {
      this.currentLayout = 'horizontal';
    }
  }

  public setFilters(filters: HeaderFilters): void {
    this.filters = filters;
    this.render();
  }

  public async render(): Promise<HTMLElement> {
    const renderId = ++this.currentRenderId;

    // Subscribe to live status updates
    if (!this.unsubscribeStatus) {
      this.unsubscribeStatus = api.onProcessStatus((e) => {
        const target = this.instances.find(i => i.id === e.instanceId);
        if (!target || target.status === e.status) return;
        target.status = e.status;
        this.scheduleStatusRefresh();
      });
    }

    // If looking at details for a specific instance
    if (this.activeDetailsId) {
      let target: InstanceMetadata | null = null;
      try {
        target = await api.getInstance(this.activeDetailsId);
      } catch (error: any) {
        console.error('Failed to get instance:', error);
        NotificationToast.show(`Failed to load instance: ${error?.message || 'Unknown error'}`, 'error');
      }
      if (renderId !== this.currentRenderId) return this.container;

      if (target) {
        const detailsView = new InstanceDetails(target, {
          onBack: () => {
            this.activeDetailsId = null;
            this.render();
          },
          onOpenModrinthForInstance: (inst) => this.events.onOpenModrinthForInstance(inst),
          onViewLogs: (id) => this.events.onViewLogs(id)
        });
        const detailsEl = await detailsView.render();
        if (renderId !== this.currentRenderId) return this.container;

        this.container.innerHTML = '';
        this.container.appendChild(detailsEl);
        return this.container;
      } else {
        this.activeDetailsId = null;
        // Re-render to show the list view
        return this.render();
      }
    }

    let fetchedInstances: InstanceMetadata[] = [];
    try {
      fetchedInstances = await api.listInstances();
    } catch (error: any) {
      console.error('Failed to list instances:', error);
      NotificationToast.show(`Failed to load instances: ${error?.message || 'Unknown error'}`, 'error');
      fetchedInstances = [];
    }
    if (renderId !== this.currentRenderId) return this.container;

    this.instances = fetchedInstances;

    // Apply filtering
    let displayed = [...this.instances];

    if (this.filters.search.trim()) {
      const q = this.filters.search.toLowerCase();
      displayed = displayed.filter(i => i.name.toLowerCase().includes(q) || i.minecraft.version.includes(q));
    }

    if (this.filters.filter === 'favorites') {
      displayed = displayed.filter(i => i.isFavorite);
    } else if (this.filters.filter === 'running') {
      displayed = displayed.filter(i => ['PREPARING', 'STARTING', 'LAUNCHING', 'RUNNING'].includes(i.status));
    } else if (this.filters.filter === 'fabric') {
      displayed = displayed.filter(i => i.loader?.type === 'fabric');
    }

    // Apply sorting
    if (this.filters.sort === 'name') {
      displayed.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.filters.sort === 'created') {
      displayed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (this.filters.sort === 'version') {
      displayed.sort((a, b) => b.minecraft.version.localeCompare(a.minecraft.version));
    }

    this.container.innerHTML = '';

    // Add layout toggle and import actions at the top
    const headerActions = document.createElement('div');
    headerActions.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;';
    headerActions.innerHTML = `
      <!-- Layout Toggle: Horizontal (List) vs Vertical (Grid/Poster) -->
      <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-surface); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
        <button class="btn btn-sm ${this.currentLayout === 'horizontal' ? 'btn-primary' : 'btn-secondary'}" id="btn-layout-horizontal" title="Horizontal Cards">
          ☰ Horizontal
        </button>
        <button class="btn btn-sm ${this.currentLayout === 'vertical' ? 'btn-primary' : 'btn-secondary'}" id="btn-layout-vertical" title="Vertical Poster Grid">
          ☵ Vertical
        </button>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <button class="btn btn-primary" id="btn-import-vpack" style="padding: 8px 18px;">
          📦 Import VPack / Modpack
        </button>
      </div>
    `;
    this.container.appendChild(headerActions);

    const btnHoriz = headerActions.querySelector('#btn-layout-horizontal') as HTMLElement;
    const btnVert = headerActions.querySelector('#btn-layout-vertical') as HTMLElement;

    btnHoriz.onclick = async () => {
      if (this.currentLayout === 'horizontal') return;
      this.currentLayout = 'horizontal';
      try {
        localStorage.setItem('voxelplus:homeLayout', 'horizontal');
        await api.setAppSettings({ homeLayout: 'horizontal' });
      } catch {}
      this.render();
    };

    btnVert.onclick = async () => {
      if (this.currentLayout === 'vertical') return;
      this.currentLayout = 'vertical';
      try {
        localStorage.setItem('voxelplus:homeLayout', 'vertical');
        await api.setAppSettings({ homeLayout: 'vertical' });
      } catch {}
      this.render();
    };

    (this.container.querySelector('#btn-import-vpack') as HTMLElement).onclick = async () => {
      const filePath = await api.selectFileDialog([{ name: 'Voxel+ or Modrinth Pack', extensions: ['voxelplus', 'vpack', 'mrpack', 'zip'] }]);
      if (filePath) {
        console.log('Importing VPack from:', filePath);
        NotificationToast.show('Importing VPack...', 'info');
        try {
          const instance = await api.importInstance(filePath);
          console.log('Import result:', instance);
          if (instance) {
            NotificationToast.show(`Successfully imported "${instance.name}"!`, 'success');
            this.render();
          } else {
            NotificationToast.show('Failed to import package - check that it is a valid VPack, Modrinth, or CurseForge pack.', 'error');
          }
        } catch (error: any) {
          console.error('Import error:', error);
          const errorMsg = error?.message || error?.toString() || 'Unknown error';
          NotificationToast.show(`Import error: ${errorMsg}`, 'error');
        }
      }
    };

    // Empty state
    if (displayed.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: calc(100vh - 200px);
        text-align: center;
        background: var(--bg-card);
        border: 1px dashed var(--border-subtle);
        border-radius: var(--radius-xl);
        padding: 40px;
      `;
      emptyState.innerHTML = `
        <div style="margin-bottom: 16px;">
          <img src="${getItemDataUrl('minecraft:grass_block')}" style="width: 56px; height: 56px; image-rendering: pixelated;" />
        </div>
        <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
          No Instances Found
        </h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; max-width: 440px; margin-bottom: 24px;">
          ${this.instances.length === 0
            ? 'Create your first Minecraft development instance with a supported loader and Gradle, or import a VPack.'
            : 'No instances matched your active search or filters.'
          }
        </p>
        <button class="btn btn-primary" id="btn-empty-create" style="padding: 12px 28px; font-size: 1rem;">
          + CREATE INSTANCE
        </button>
      `;

      (emptyState.querySelector('#btn-empty-create') as HTMLElement).onclick = async () => {
        const created = await CreateInstanceModal.show();
        if (created) {
          this.render();
        }
      };

      this.container.appendChild(emptyState);
      return this.container;
    }

    // Render instances in selected layout (horizontal list or vertical grid)
    const listWrapper = document.createElement('div');
    if (this.currentLayout === 'vertical') {
      listWrapper.className = 'instance-grid-wrapper animate-fade-in';
    } else {
      listWrapper.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;
      listWrapper.className = 'animate-fade-in';
    }

    displayed.forEach(instance => {
      const cardEl = InstanceCard.render(
        instance,
        {
          onOpenDetails: (id) => {
            this.activeDetailsId = id;
            this.render();
          },
          onRefresh: () => this.render(),
          onViewLogs: (id) => this.events.onViewLogs(id)
        },
        this.currentLayout
      );
      listWrapper.appendChild(cardEl);
    });

    this.container.appendChild(listWrapper);
    return this.container;
  }

  /**
   * Status events can arrive in bursts (Gradle, JVM, downloads). Coalescing them
   * avoids re-listing every instance and rebuilding the whole page for each one.
   */
  private scheduleStatusRefresh(): void {
    if (this.statusRefreshTimer !== null) return;
    this.statusRefreshTimer = window.setTimeout(() => {
      this.statusRefreshTimer = null;
      if (document.hidden) return;
      void this.render();
    }, 200);
  }

  public destroy(): void {
    if (this.statusRefreshTimer !== null) {
      window.clearTimeout(this.statusRefreshTimer);
      this.statusRefreshTimer = null;
    }
    if (this.unsubscribeStatus) {
      this.unsubscribeStatus();
      this.unsubscribeStatus = null;
    }
  }
}
