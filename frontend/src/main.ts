import { PageId, Sidebar } from './components/Sidebar';
import { Header, HeaderFilters } from './components/Header';
import { InstancesPage } from './pages/InstancesPage';
import { ContentPage } from './pages/ContentPage';
import { SkinsPage } from './pages/SkinsPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { DirectoryPage } from './pages/DirectoryPage';
import { LibraryPage } from './pages/LibraryPage';
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
  private skinsPage!: SkinsPage;
  private logsPage!: LogsPage;
  private settingsPage!: SettingsPage;
  private profilePage!: ProfilePage;
  private directoryPage!: DirectoryPage;
  private libraryPage!: LibraryPage;

  public async init(): Promise<void> {
    await ThemeService.initialize();
    const settings = await api.getAppSettings();
    const session = await api.getCurrentSession();

    if (!settings.firstRunCompleted || !session) {
      this.showOnboarding();
    } else {
      this.showMainApp();
    }

    // Global listener for process notifications
    api.onProcessStatus((e) => {
      if (e.status === 'RUNNING') {
        NotificationToast.show(`Minecraft development client is running.`, 'success');
      } else if (e.status === 'ERROR') {
        NotificationToast.show(`Process exited with an error. Check logs for details.`, 'error');
      }
    });
  }

  private showOnboarding(): void {
    const appEl = document.getElementById('app')!;
    appEl.innerHTML = '';
    const onboarding = new OnboardingPage({
      onComplete: () => {
        this.showMainApp();
      }
    });
    onboarding.render().then((el) => appEl.appendChild(el));
  }

  private showMainApp(): void {
    const appEl = document.getElementById('app')!;
    appEl.innerHTML = '';

    // Initialize pages
    this.instancesPage = new InstancesPage({
      onOpenModrinthForInstance: (inst: InstanceMetadata) => {
        this.contentPage = new ContentPage(inst);
        this.navigateTo('shop');
      },
      onViewLogs: (instanceId: string) => {
        this.logsPage = new LogsPage(instanceId);
        this.navigateTo('logs');
      }
    });
    this.contentPage = new ContentPage();
    this.skinsPage = new SkinsPage();
    this.logsPage = new LogsPage();
    this.settingsPage = new SettingsPage({
      onRedoOnboarding: () => this.showOnboarding()
    });
    this.profilePage = new ProfilePage({
      onLogout: () => this.showOnboarding()
    });
    this.directoryPage = new DirectoryPage();
    this.libraryPage = new LibraryPage();

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
      },
      onOpenProfile: () => {
        this.navigateTo('profile');
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
    } else if (this.activePage === 'shop') {
      pageContainer.appendChild(await this.contentPage.render());
    } else if (this.activePage === 'library') {
      pageContainer.appendChild(await this.libraryPage.render());
    } else if (this.activePage === 'directory') {
      pageContainer.appendChild(await this.directoryPage.render());
    } else if (this.activePage === 'profile') {
      pageContainer.appendChild(await this.profilePage.render());
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
