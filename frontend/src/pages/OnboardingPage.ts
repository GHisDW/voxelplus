import { ThemeMode, SystemScanResult, EnvironmentCheckResult, JavaRuntime } from '../../../electron/types';
import { api } from '../services/api';
import { ThemeService } from '../services/themeService';
import { NotificationToast } from '../components/NotificationToast';

export interface OnboardingEvents {
  onComplete: () => void;
}

export class OnboardingPage {
  private currentStep: number = 1;
  private totalSteps: number = 7;
  private selectedTheme: ThemeMode = 'dark';
  private systemScanData: SystemScanResult | null = null;
  private envCheckData: EnvironmentCheckResult | null = null;
  private instanceDir: string = '';
  private selectedJava: JavaRuntime | null = null;
  private events: OnboardingEvents;
  private container: HTMLElement;

  constructor(events: OnboardingEvents) {
    this.events = events;
    this.container = document.createElement('div');
    this.container.style.cssText = `
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-app);
      position: absolute;
      inset: 0;
      z-index: 50;
      padding: 24px;
    `;
  }

  public async render(): Promise<HTMLElement> {
    const settings = await api.getAppSettings();
    this.instanceDir = settings.instanceDirectory;
    this.selectedTheme = settings.theme;

    this.renderStep();
    return this.container;
  }

  private async renderStep(): Promise<void> {
    this.container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'modal-content animate-scale-in';
    card.style.maxWidth = '640px';

    if (this.currentStep === 1) {
      // Step 1: Welcome
      card.innerHTML = `
        <div style="text-align: center; padding: 24px 12px;">
          <div style="
            width: 68px;
            height: 68px;
            border-radius: var(--radius-lg);
            background: var(--accent-gradient);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 2.2rem;
            font-weight: 900;
            color: white;
            box-shadow: 0 8px 24px var(--accent-glow);
            margin-bottom: 20px;
          ">
            V
          </div>
          <div class="brand-title" style="font-size: 2.2rem; justify-content: center; margin-bottom: 8px;">
            VOXEL<span class="plus-badge">⁺</span>
          </div>
          <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">
            Minecraft development, simplified.
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; max-width: 460px; margin: 0 auto 32px;">
            Manage instances, mods, and Fabric Loom development environments without having to live inside the terminal.
          </p>

          <button class="btn btn-primary" id="btn-welcome-start" style="padding: 12px 32px; font-size: 1.05rem;">
            GET STARTED →
          </button>
        </div>
      `;

      (card.querySelector('#btn-welcome-start') as HTMLElement).onclick = () => {
        this.currentStep = 2;
        this.renderStep();
      };
    } else if (this.currentStep === 2) {
      // Step 2: Appearance (3 horizontal animated cards)
      card.innerHTML = `
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Choose Appearance</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
              Select your preferred visual style. You can adjust this anytime in Settings.
            </p>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; margin: 20px 0;">
          <!-- Dark -->
          <div class="horizontal-card ${this.selectedTheme === 'dark' ? 'selected' : ''}" data-theme="dark" style="${this.themeCardStyle(this.selectedTheme === 'dark')}">
            <div style="font-size: 1.5rem;">◐</div>
            <div style="flex: 1;">
              <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">DARK</h4>
              <p style="font-size: 0.82rem; color: var(--text-secondary);">Deep, focused, and cinematic</p>
            </div>
            ${this.selectedTheme === 'dark' ? '<span class="badge badge-recommended">✓ SELECTED</span>' : ''}
          </div>

          <!-- Light -->
          <div class="horizontal-card ${this.selectedTheme === 'light' ? 'selected' : ''}" data-theme="light" style="${this.themeCardStyle(this.selectedTheme === 'light')}">
            <div style="font-size: 1.5rem;">○</div>
            <div style="flex: 1;">
              <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">LIGHT</h4>
              <p style="font-size: 0.82rem; color: var(--text-secondary);">Clean and bright</p>
            </div>
            ${this.selectedTheme === 'light' ? '<span class="badge badge-recommended">✓ SELECTED</span>' : ''}
          </div>

          <!-- System -->
          <div class="horizontal-card ${this.selectedTheme === 'system' ? 'selected' : ''}" data-theme="system" style="${this.themeCardStyle(this.selectedTheme === 'system')}">
            <div style="font-size: 1.5rem;">🖥</div>
            <div style="flex: 1;">
              <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">SYSTEM</h4>
              <p style="font-size: 0.82rem; color: var(--text-secondary);">Follow Windows appearance</p>
            </div>
            ${this.selectedTheme === 'system' ? '<span class="badge badge-recommended">✓ SELECTED</span>' : ''}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-theme-back">← Back</button>
          <button class="btn btn-primary" id="btn-theme-next">CONTINUE →</button>
        </div>
      `;

      card.querySelectorAll('[data-theme]').forEach(themeCard => {
        (themeCard as HTMLElement).onclick = async () => {
          const t = themeCard.getAttribute('data-theme') as ThemeMode;
          this.selectedTheme = t;
          await ThemeService.setTheme(t);
          this.renderStep();
        };
      });

      (card.querySelector('#btn-theme-back') as HTMLElement).onclick = () => {
        this.currentStep = 1;
        this.renderStep();
      };
      (card.querySelector('#btn-theme-next') as HTMLElement).onclick = () => {
        this.currentStep = 3;
        this.renderStep();
      };
    } else if (this.currentStep === 3) {
      // Step 3: Real System Scan
      card.innerHTML = `
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Checking Your System</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
              Inspecting hardware resources and installed runtime environments.
            </p>
          </div>
        </div>

        <div id="scan-progress-area" style="padding: 24px 0;">
          <div style="display: flex; flex-direction: column; gap: 14px;" id="scan-checklist"></div>
        </div>

        <div class="modal-footer" id="scan-footer" style="display: none;">
          <button class="btn btn-primary" id="btn-scan-next">CONTINUE →</button>
        </div>
      `;

      this.runSystemScanAnimation(card);
    } else if (this.currentStep === 4) {
      // Step 4: Java Runtimes
      const runtimes = await api.scanJava();
      const recommended = runtimes.find(j => j.isRecommended) || runtimes[0] || null;
      this.selectedJava = this.selectedJava || recommended;

      card.innerHTML = `
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Java Runtime Selection</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
              Voxel⁺ automatically resolves compatible Java runtimes for your Minecraft instances.
            </p>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; margin: 16px 0; max-height: 320px; overflow-y: auto;">
          ${runtimes.map(j => `
            <div class="horizontal-card ${this.selectedJava?.id === j.id ? 'selected' : ''}" data-java-id="${j.id}" style="${this.themeCardStyle(this.selectedJava?.id === j.id)}">
              <div style="font-size: 1.4rem;">☕</div>
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${j.name}</h4>
                  ${j.isRecommended ? '<span class="badge badge-recommended">✓ RECOMMENDED</span>' : '<span class="badge badge-lts">✓ TESTED</span>'}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                  ${j.vendor} · ${j.architecture} · ${j.compatibilityDescription}
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-java-back">← Back</button>
          <button class="btn btn-primary" id="btn-java-next">CONTINUE →</button>
        </div>
      `;

      card.querySelectorAll('[data-java-id]').forEach(jc => {
        (jc as HTMLElement).onclick = () => {
          const id = jc.getAttribute('data-java-id');
          this.selectedJava = runtimes.find(j => j.id === id) || null;
          this.renderStep();
        };
      });

      (card.querySelector('#btn-java-back') as HTMLElement).onclick = () => {
        this.currentStep = 3;
        this.renderStep();
      };
      (card.querySelector('#btn-java-next') as HTMLElement).onclick = () => {
        this.currentStep = 5;
        this.renderStep();
      };
    } else if (this.currentStep === 5) {
      // Step 5: Instance Storage Location
      card.innerHTML = `
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Where should Voxel⁺ store your instances?</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
              All Minecraft development client workspaces, mods, and configurations will be stored here.
            </p>
          </div>
        </div>

        <div style="margin: 24px 0;">
          <div class="horizontal-card" style="padding: 18px 20px; background: var(--bg-card); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: space-between;">
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); word-break: break-all;">
                ${this.instanceDir}
              </div>
              <div style="font-size: 0.82rem; color: #10b981; margin-top: 4px; font-weight: 600;">
                ✓ Valid storage directory with write permissions
              </div>
            </div>
            <button class="btn btn-secondary" id="btn-change-storage" style="flex-shrink: 0; margin-left: 16px;">
              Change
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-storage-back">← Back</button>
          <button class="btn btn-primary" id="btn-storage-next">CONTINUE →</button>
        </div>
      `;

      (card.querySelector('#btn-change-storage') as HTMLElement).onclick = async () => {
        const picked = await api.selectFolderDialog();
        if (picked) {
          this.instanceDir = picked;
          await api.setAppSettings({ instanceDirectory: picked });
          this.renderStep();
        }
      };

      (card.querySelector('#btn-storage-back') as HTMLElement).onclick = () => {
        this.currentStep = 4;
        this.renderStep();
      };
      (card.querySelector('#btn-storage-next') as HTMLElement).onclick = () => {
        this.currentStep = 6;
        this.renderStep();
      };
    } else if (this.currentStep === 6) {
      // Step 6: Environment Check
      card.innerHTML = `
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Environment Verification</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
              Verifying all development subsystems and network connections.
            </p>
          </div>
        </div>

        <div id="env-items-list" style="display: flex; flex-direction: column; gap: 10px; margin: 20px 0;">
          <div style="text-align: center; color: var(--text-muted); padding: 20px;">
            <span class="animate-pulse">Validating environment...</span>
          </div>
        </div>

        <div class="modal-footer" id="env-footer" style="display: none;">
          <button class="btn btn-primary" id="btn-env-next">CONTINUE →</button>
        </div>
      `;

      this.runEnvironmentVerification(card);
    } else if (this.currentStep === 7) {
      // Step 7: Ready Screen
      card.innerHTML = `
        <div style="text-align: center; padding: 28px 16px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">🎉</div>
          <h2 style="font-size: 1.8rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
            VOXEL⁺ IS READY
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 24px;">
            Your Minecraft development environment is configured and ready.
          </p>

          <div style="
            display: inline-flex;
            flex-direction: column;
            gap: 8px;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 16px 28px;
            margin-bottom: 28px;
            text-align: left;
            width: 100%;
            max-width: 380px;
          ">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600;">
              <span style="color: var(--text-secondary);">Java runtime</span>
              <span style="color: #10b981;">✓ Ready</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600;">
              <span style="color: var(--text-secondary);">Storage directory</span>
              <span style="color: #10b981;">✓ Configured</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600;">
              <span style="color: var(--text-secondary);">Development engine</span>
              <span style="color: #10b981;">✓ Fabric Loom</span>
            </div>
          </div>

          <div>
            <button class="btn btn-primary" id="btn-ready-create" style="padding: 12px 36px; font-size: 1.05rem;">
              CREATE YOUR FIRST INSTANCE
            </button>
          </div>
        </div>
      `;

      (card.querySelector('#btn-ready-create') as HTMLElement).onclick = async () => {
        await api.setAppSettings({ firstRunCompleted: true });
        this.events.onComplete();
      };
    }

    this.container.appendChild(card);
  }

  private async runSystemScanAnimation(card: HTMLElement): Promise<void> {
    const list = card.querySelector('#scan-checklist') as HTMLElement;
    const footer = card.querySelector('#scan-footer') as HTMLElement;

    const data = await api.scanSystem();
    this.systemScanData = data;

    const items = [
      { title: 'Operating System', val: `${data.os.caption} (${data.os.architecture})` },
      { title: 'CPU Architecture', val: `${data.cpu.name} (${data.cpu.cores} Cores)` },
      { title: 'System Memory', val: `${data.memory.totalGb} GB RAM (${data.memory.freeGb} GB Free)` },
      { title: 'Graphics Hardware', val: data.gpu.name },
      { title: 'Storage Capacity', val: `${data.storage.defaultInstanceDriveAvailableGb} GB Available` },
      { title: 'Java Runtimes', val: `${data.java.installed.length} Installations Verified` }
    ];

    for (let i = 0; i < items.length; i++) {
      await new Promise(r => setTimeout(r, 220));
      const row = document.createElement('div');
      row.className = 'animate-fade-in-up';
      row.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--bg-surface);
        border-radius: var(--radius-sm);
        font-size: 0.88rem;
      `;
      row.innerHTML = `
        <span style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
          <span style="color: #10b981;">✓</span> ${items[i].title}
        </span>
        <span style="color: var(--text-muted); font-size: 0.82rem;">${items[i].val}</span>
      `;
      list.appendChild(row);
    }

    footer.style.display = 'flex';
    (card.querySelector('#btn-scan-next') as HTMLElement).onclick = () => {
      this.currentStep = 4;
      this.renderStep();
    };
  }

  private async runEnvironmentVerification(card: HTMLElement): Promise<void> {
    const list = card.querySelector('#env-items-list') as HTMLElement;
    const footer = card.querySelector('#env-footer') as HTMLElement;

    const check = await api.runEnvironmentCheck();
    this.envCheckData = check;

    list.innerHTML = '';
    check.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'horizontal-card';
      row.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--bg-card);
        border-radius: var(--radius-md);
      `;

      let icon = '<span style="color: #10b981; font-weight: 700;">✓</span>';
      if (item.status === 'warning') icon = '<span style="color: #f59e0b; font-weight: 700;">⚠</span>';
      if (item.status === 'failed') icon = '<span style="color: #ef4444; font-weight: 700;">✕</span>';

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 1.1rem;">${icon}</div>
          <div>
            <div style="font-size: 0.92rem; font-weight: 700; color: var(--text-primary);">${item.title}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">${item.description}</div>
          </div>
        </div>
      `;

      list.appendChild(row);
    });

    footer.style.display = 'flex';
    (card.querySelector('#btn-env-next') as HTMLElement).onclick = () => {
      this.currentStep = 7;
      this.renderStep();
    };
  }

  private themeCardStyle(isSelected: boolean): string {
    return `
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: var(--bg-card);
      border: 1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'};
      border-radius: var(--radius-lg);
      cursor: pointer;
    `;
  }
}
