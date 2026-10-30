import { PageId, Sidebar } from './components/Sidebar';
import { Header, HeaderFilters } from './components/Header';
import { InstancesPage } from './pages/InstancesPage';
import { ContentPage } from './pages/ContentPage';
import { PlayerPage } from './pages/PlayerPage';
import { ShopPage } from './pages/ShopPage';
import { ArcadePage } from './pages/ArcadePage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CreateInstanceModal } from './components/CreateInstanceModal';
import { ThemeService } from './services/themeService';
import { api } from './services/api';
import { InstanceMetadata } from '../../electron/types';
import { NotificationToast } from './components/NotificationToast';
import { SplashScreen } from './components/SplashScreen';
import { UpdatePrompt } from './components/UpdatePrompt';
import { describeIpcError } from './services/errors';

/** Minimal contract every routable page implements. */
interface RenderablePage {
  render(): Promise<HTMLElement>;
  destroy?: () => void;
}

class VPlusApp {
  private activePage: PageId = 'instances';
  private sidebar!: Sidebar;
  private header!: Header;
  private instancesPage!: InstancesPage;
  private contentPage!: ContentPage;
  private playerPage!: PlayerPage;
  private shopPage!: ShopPage;
  private arcadePage!: ArcadePage;
  private logsPage!: LogsPage;
  private settingsPage!: SettingsPage;

  /** The page currently mounted in #page-container, so it can be torn down. */
  private activePageHandle: RenderablePage | null = null;
  /** Guards against a slow render landing after the user already navigated. */
  private renderToken = 0;

  public async init(): Promise<void> {
    // Paint the splash before the first IPC round-trip: a warm launch shows the
    // branding on frame one instead of an empty window.
    const returningUser = readBootFlag();
    if (returningUser) SplashScreen.show(() => this.triggerSidebarAnimation());

    const settings = await api.getAppSettings();

    // Reuse the settings we just fetched instead of issuing a second IPC call.
    ThemeService.initialize(settings.theme || 'dark');

    if (!settings.firstRunCompleted) {
      // First setup skips the boot animation and opens the wizard right away.
      SplashScreen.abort();
      this.showOnboarding();
    } else {
      // The app builds itself behind the splash, so the fade reveals a ready UI.
      if (!returningUser) SplashScreen.show(() => this.triggerSidebarAnimation());
      this.showMainApp();
    }
    writeBootFlag();

    // Listeners and the update check are not needed for the first frame; defer
    // them so they cannot delay the splash or the initial page render.
    runWhenIdle(() => {
      this.attachGlobalListeners();
      this.scheduleUpdateCheck();
    });
  }

  private attachGlobalListeners(): void {
    api.onProcessStatus((e) => {
      if (e.status === 'RUNNING') {
        NotificationToast.show(`Minecraft development client is running.`, 'success');
      } else if (e.status === 'ERROR') {
        NotificationToast.show(`Process exited with an error. Check logs for details.`, 'error');
      }
    });

    api.onAchievementUnlocked((data) => {
      const { achievementName, rewardVP, isWinCondition } = data;
      if (isWinCondition) {
        NotificationToast.show(`🏆 LEGENDARY: ${achievementName} - YOU HAVE COMPLETED ALL ACHIEVEMENTS!`, 'success', 8000);
      } else {
        NotificationToast.show(`🎉 Achievement Unlocked: ${achievementName} (+${rewardVP} VP)`, 'success', 5000);
      }
    });
  }

  private triggerSidebarAnimation(): void {
    const sidebarLogo = document.querySelector('.sidebar-logo');
    const sidebarText = document.querySelector('.sidebar-brand-text');
    if (sidebarLogo) {
      (sidebarLogo as HTMLElement).style.animation = 'none';
      void (sidebarLogo as HTMLElement).offsetWidth;
      (sidebarLogo as HTMLElement).style.animation = '';
    }
    if (sidebarText) {
      (sidebarText as HTMLElement).style.animation = 'none';
      void (sidebarText as HTMLElement).offsetWidth;
      (sidebarText as HTMLElement).style.animation = '';
    }
  }

  /** Delayed GitHub release check; failures stay silent on automatic checks. */
  private scheduleUpdateCheck(attempt = 0): void {
    window.setTimeout(() => {
      // Never cover the boot splash with the update dialog.
      if (SplashScreen.isVisible() && attempt < 12) {
        this.scheduleUpdateCheck(attempt + 1);
        return;
      }
      void this.checkForUpdates(false);
    }, attempt === 0 ? 1500 : 800);
  }

  /** Manual or automatic update check. `force` reports "up to date"/errors. */
  public async checkForUpdates(force: boolean): Promise<void> {
    try {
      const info = await api.checkForUpdates(force);
      if (info.status === 'available') {
        UpdatePrompt.show(info);
      } else if (force && info.status === 'up-to-date') {
        NotificationToast.show(`You are running the latest version (v${info.currentVersion}).`, 'success');
      } else if (force && info.status === 'error') {
        NotificationToast.show(info.error || 'Update check failed.', 'error');
      }
    } catch (error) {
      if (force) NotificationToast.show(describeIpcError(error), 'error');
    }
  }

  private showOnboarding(): void {
    const appEl = document.getElementById('app')!;
    this.destroyActivePage();
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
    this.destroyActivePage();
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
    this.playerPage = new PlayerPage();
    this.shopPage = new ShopPage();
    this.arcadePage = new ArcadePage();
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
      },
      onImportVPack: async () => {
        const zipFile = await api.selectFileDialog([
          { name: 'Voxel⁺ or Modrinth Packages', extensions: ['vpack', 'voxelplus', 'mrpack', 'zip'] },
          { name: 'All Files', extensions: ['*'] }
        ]);
        if (zipFile) {
          NotificationToast.show('Importing package...', 'info');
          const imported = await api.importInstance(zipFile);
          if (imported) {
            NotificationToast.show(`Successfully imported package: ${imported.name}`, 'success');
            this.navigateTo('instances');
            this.instancesPage.render();
          } else {
            NotificationToast.show('Failed to import package. Check file format.', 'error');
          }
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
    this.sidebar.render(this.activePage);
    await this.renderCurrentPage();
  }

  private async renderCurrentPage(): Promise<void> {
    const pageContainer = document.getElementById('page-container');
    if (!pageContainer) return;

    const token = ++this.renderToken;
    // Tear the previous page down first: ArcadePage owns a save interval and
    // LogsPage owns a live log subscription, so leaving them mounted kept both
    // running in the background after navigation.
    this.destroyActivePage();
    pageContainer.innerHTML = '';

    const page = this.resolvePage();
    if (!page) return;

    const element = await page.render();
    if (token !== this.renderToken) {
      // The user navigated while this page was still loading; dispose it instead
      // of attaching stale markup over the page they actually asked for.
      page.destroy?.();
      return;
    }

    this.activePageHandle = page;
    pageContainer.appendChild(element);
  }

  private resolvePage(): RenderablePage | null {
    switch (this.activePage) {
      case 'instances': return this.instancesPage;
      case 'content': return this.contentPage;
      case 'player': return this.playerPage;
      case 'shop': return this.shopPage;
      case 'arcade': return this.arcadePage;
      case 'logs': return this.logsPage;
      case 'settings': return this.settingsPage;
      default: return null;
    }
  }

  private destroyActivePage(): void {
    if (!this.activePageHandle) return;
    const handle = this.activePageHandle;
    this.activePageHandle = null;
    handle.destroy?.();
  }
}

const BOOT_FLAG = 'voxelplus:booted';

/** Remembers that the launcher has completed at least one boot on this machine. */
function readBootFlag(): boolean {
  try {
    return window.localStorage.getItem(BOOT_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeBootFlag(): void {
  try {
    window.localStorage.setItem(BOOT_FLAG, '1');
  } catch {
    // Storage can be unavailable in locked-down profiles; the splash simply
    // renders one frame later in that case.
  }
}

/** Runs non-visual startup work after the first paint. */
function runWhenIdle(task: () => void): void {
  const idle = (window as any).requestIdleCallback as
    | ((cb: () => void, options?: { timeout: number }) => number)
    | undefined;
  if (typeof idle === 'function') {
    idle(task, { timeout: 1200 });
  } else {
    window.setTimeout(task, 60);
  }
}

// Start application. A rejected init used to leave a blank window (and a stuck
// splash overlay), so failures now surface a recoverable error screen.
const app = new VPlusApp();
app.init().catch((error) => {
  console.error('[Voxel+] Startup failed:', error);
  showStartupFailure(error);
});

function showStartupFailure(error: unknown): void {
  document.querySelector('.splash-screen')?.remove();

  const appEl = document.getElementById('app');
  if (!appEl) return;
  appEl.innerHTML = '';

  const panel = document.createElement('div');
  panel.style.cssText = `
    margin: auto;
    max-width: 560px;
    padding: 40px 36px;
    text-align: center;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
  `;

  const logo = document.createElement('img');
  logo.src = 'logo.png';
  logo.alt = 'Voxel+';
  logo.style.cssText = 'width: 72px; height: 72px; border-radius: 18px; margin-bottom: 18px;';

  const title = document.createElement('h2');
  title.textContent = 'Voxel+ could not start';
  title.style.cssText = 'font-size: 1.35rem; font-weight: 800; color: var(--text-primary); margin-bottom: 10px;';

  const detail = document.createElement('p');
  detail.textContent = error instanceof Error ? error.message : String(error);
  detail.style.cssText = 'font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 22px; word-break: break-word;';

  const hint = document.createElement('p');
  hint.textContent = 'The launcher settings or data folder may be unavailable. Retry, or restart the app.';
  hint.style.cssText = 'font-size: 0.8rem; color: var(--text-muted); margin-bottom: 22px;';

  const retry = document.createElement('button');
  retry.className = 'btn btn-primary';
  retry.textContent = 'Retry';
  retry.style.cssText = 'padding: 10px 26px;';
  retry.onclick = () => window.location.reload();

  panel.append(logo, title, detail, hint, retry);
  appEl.appendChild(panel);
}
