import { InstanceMetadata } from '../../../electron/types';
import { api } from '../services/api';
import { InstanceCard } from '../components/InstanceCard';
import { InstanceDetails } from '../components/InstanceDetails';
import { HeaderFilters } from '../components/Header';
import { CreateInstanceModal } from '../components/CreateInstanceModal';

export interface InstancesPageEvents {
  onOpenModrinthForInstance: (instance: InstanceMetadata) => void;
  onViewLogs: (instanceId: string) => void;
}

export class InstancesPage {
  private container: HTMLElement;
  private instances: InstanceMetadata[] = [];
  private activeDetailsId: string | null = null;
  private filters: HeaderFilters = { search: '', filter: 'all', sort: 'recent' };
  private events: InstancesPageEvents;
  private unsubscribeStatus: (() => void) | null = null;

  constructor(events: InstancesPageEvents) {
    this.events = events;
    this.container = document.createElement('div');
    this.container.className = 'page-scroll-area animate-fade-in';
  }

  public setFilters(filters: HeaderFilters): void {
    this.filters = filters;
    this.render();
  }

  public async render(): Promise<HTMLElement> {
    this.container.innerHTML = '';

    // If looking at details for a specific instance
    if (this.activeDetailsId) {
      const target = await api.getInstance(this.activeDetailsId);
      if (target) {
        const detailsView = new InstanceDetails(target, {
          onBack: () => {
            this.activeDetailsId = null;
            this.render();
          },
          onOpenModrinthForInstance: (inst) => this.events.onOpenModrinthForInstance(inst),
          onViewLogs: (id) => this.events.onViewLogs(id)
        });
        this.container.appendChild(await detailsView.render());
        return this.container;
      } else {
        this.activeDetailsId = null;
      }
    }

    this.instances = await api.listInstances();

    // Subscribe to live status updates
    if (!this.unsubscribeStatus) {
      this.unsubscribeStatus = api.onProcessStatus((e) => {
        const target = this.instances.find(i => i.id === e.instanceId);
        if (target) {
          target.status = e.status;
          this.render();
        }
      });
    }

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
      displayed = displayed.filter(i => i.loader.type === 'fabric');
    }

    // Apply sorting
    if (this.filters.sort === 'name') {
      displayed.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.filters.sort === 'created') {
      displayed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (this.filters.sort === 'version') {
      displayed.sort((a, b) => b.minecraft.version.localeCompare(a.minecraft.version));
    }

    // Empty state
    if (displayed.length === 0) {
      this.container.innerHTML = `
        <div style="
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
        ">
          <div style="font-size: 3rem; margin-bottom: 16px;">🌱</div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
            No Instances Found
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.95rem; max-width: 440px; margin-bottom: 24px;">
            ${this.instances.length === 0
              ? 'Create your first Minecraft development instance powered by Fabric Loom and Gradle.'
              : 'No instances matched your active search or filters.'
            }
          </p>
          <button class="btn btn-primary" id="btn-empty-create" style="padding: 12px 28px; font-size: 1rem;">
            + CREATE INSTANCE
          </button>
        </div>
      `;

      (this.container.querySelector('#btn-empty-create') as HTMLElement).onclick = async () => {
        const created = await CreateInstanceModal.show();
        if (created) {
          this.render();
        }
      };

      return this.container;
    }

    // Render list of horizontal cards
    const listWrapper = document.createElement('div');
    listWrapper.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;

    displayed.forEach(instance => {
      const cardEl = InstanceCard.render(instance, {
        onOpenDetails: (id) => {
          this.activeDetailsId = id;
          this.render();
        },
        onRefresh: () => this.render(),
        onViewLogs: (id) => this.events.onViewLogs(id)
      });
      listWrapper.appendChild(cardEl);
    });

    this.container.appendChild(listWrapper);
    return this.container;
  }
}
