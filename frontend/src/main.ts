import { PageId, Sidebar } from './components/Sidebar';
import { Header, HeaderFilters } from './components/Header';
import { InstancesPage } from './pages/InstancesPage';
import { ContentPage } from './pages/ContentPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { TosGatePage } from './pages/TosGatePage';
import { CreateInstanceModal } from './components/CreateInstanceModal';
import { ThemeService } from './services/themeService';
import { api } from './services/api';
import { InstanceMetadata } from '../../electron/types';

import { NotificationToast } from './components/NotificationToast';

class VoxelApp {
  private activePage: PageId = 'instances';
  private sidebar!: Sidebar;
  private header!: Header;
  private instancesPage!: InstancesPage;
  private contentPage!: ContentPage;
  private logsPage!: LogsPage;
  private settingsPage!: SettingsPage;

  public async init(): Promise<void> {
    const settings = await api.getAppSettings();

    // TOS is part of the first-launch setup.
    // It must appear before theme, Java detection, or normal onboarding.
    if (!settings.tosAccepted) {
      this.showTosGate();
      return;
    }

    await this.continueStartup();
  }

  private async continueStartup(): Promise<void> {
    // This is the normal Java + Theme setup.
    // It only runs after the TOS has been accepted.
    await ThemeService.initialize();

    const settings = await api.getAppSettings();

    if (!settings.firstRunCompleted) {
      this.showOnboarding();
    } else {
      this.showMainApp();
    }
  }

  private showTosGate(): void {
    const appEl = document.getElementById('app')!;
    appEl.innerHTML = '';

    const tos = new TosGatePage({
      onAccepted: async () => {
        // Accept TOS once.
        // After this, TOS will never block startup again.
        await api.setAppSettings({
          tosAccepted: true
        });

        // Immediately continue into the normal
        // Java + Theme onboarding.
        await this.continueStartup();
      }
    });

    appEl.appendChild(tos.render());
  }
  private showOnboarding(): void {
    const appEl = document.getElementById('app')!;
    appEl.innerHTML = '';
    const onboarding = new OnboardingPage({
      onComplete: () => {
        this.showMainApp();
      }
    });
    onboarding.render().then(el => appEl.appendChild(el));
  }

  private showMainApp(): void {
    const appEl = document.getElementById('app')!;
    appEl.innerHTML = '';

    // Initialize pages
    this.instancesPage = new InstancesPage({
      onOpenModrinthForInstance: (inst: InstanceMetadata) => {
        this.contentPage = new ContentPage(inst);
        this.navigateTo('content');
      },
      onViewLogs: (instanceId: string) => {
        this.logsPage = new LogsPage(instanceId);
        this.navigateTo('logs');
      }
    });
    this.contentPage = new ContentPage();
    this.logsPage = new LogsPage();
    this.settingsPage = new SettingsPage({
      onRedoOnboarding: () => this.showOnboarding()
    });

    // Initialize layout
    this.sidebar = new Sidebar({
      onNavigate: (page: PageId) => this.navigateTo(page)
    });

    this.header = new Header({
      onFilterChange: (filters: HeaderFilters) => {
        if (this.activePage === 'instances') {
          this.instancesPage.setFilters(filters);
        }
      },
      onCreateInstance: async () => {
        const created = await CreateInstanceModal.show();
        if (created) {
          this.navigateTo('instances');
          this.instancesPage.render();
        }
      }
    });

    const mainArea = document.createElement('main');
    mainArea.className = 'main-content-area';

    mainArea.appendChild(this.header.render());

    const contentContainer = document.createElement('div');
    contentContainer.id = 'page-container';
    contentContainer.style.cssText = `flex: 1; overflow: hidden; display: flex; flex-direction: column;`;
    mainArea.appendChild(contentContainer);

    appEl.appendChild(this.sidebar.render(this.activePage));
    appEl.appendChild(mainArea);

    this.renderCurrentPage();
  }

  private async navigateTo(page: PageId): Promise<void> {
    this.activePage = page;
    const appEl = document.getElementById('app')!;
    const sidebarEl = appEl.querySelector('.sidebar') as HTMLElement;
    if (sidebarEl) {
      sidebarEl.replaceWith(this.sidebar.render(this.activePage));
    }

    await this.renderCurrentPage();
  }

  private async renderCurrentPage(): Promise<void> {
    const pageContainer = document.getElementById('page-container');
    if (!pageContainer) return;
    pageContainer.innerHTML = '';

    if (this.activePage === 'instances') {
      pageContainer.appendChild(await this.instancesPage.render());
    } else if (this.activePage === 'content') {
      pageContainer.appendChild(await this.contentPage.render());
    } else if (this.activePage === 'logs') {
      pageContainer.appendChild(await this.logsPage.render());
    } else if (this.activePage === 'settings') {
      pageContainer.appendChild(await this.settingsPage.render());
    }
  }
}

// Start application
const app = new VoxelApp();
app.init();
