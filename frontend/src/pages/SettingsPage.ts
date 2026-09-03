import { AppSettings, ThemeMode } from '../../../electron/types';
import { api } from '../services/api';
import { ThemeService } from '../services/themeService';
import { JavaManagerModal } from '../components/JavaManagerModal';
import { NotificationToast } from '../components/NotificationToast';

export interface SettingsPageEvents {
  onRedoOnboarding?: () => void;
}

export class SettingsPage {
  private container: HTMLElement;
  private settings: AppSettings | null = null;
  private activeSection: 'general' | 'minecraft' | 'java' | 'appearance' | 'advanced' | 'about' = 'general';
  private events?: SettingsPageEvents;

  constructor(events?: SettingsPageEvents) {
    this.events = events;
    this.container = document.createElement('div');
    this.container.className = 'page-scroll-area animate-fade-in';
  }

  public async render(): Promise<HTMLElement> {
    this.settings = await api.getAppSettings();

    this.container.innerHTML = `
      <div style="display: grid; grid-template-columns: 200px 1fr; gap: 32px; max-width: 960px;">
        <!-- Settings Nav Sidebar -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">Settings</h3>

          <button class="btn ${this.activeSection === 'general' ? 'btn-primary' : 'btn-secondary'}" data-sec="general" style="justify-content: flex-start;">⚙ General</button>
          <button class="btn ${this.activeSection === 'minecraft' ? 'btn-primary' : 'btn-secondary'}" data-sec="minecraft" style="justify-content: flex-start;">⛏ Minecraft</button>
          <button class="btn ${this.activeSection === 'java' ? 'btn-primary' : 'btn-secondary'}" data-sec="java" style="justify-content: flex-start;">☕ Java Runtimes</button>
          <button class="btn ${this.activeSection === 'appearance' ? 'btn-primary' : 'btn-secondary'}" data-sec="appearance" style="justify-content: flex-start;">◐ Appearance</button>
          <button class="btn ${this.activeSection === 'advanced' ? 'btn-primary' : 'btn-secondary'}" data-sec="advanced" style="justify-content: flex-start;">⚡ Advanced</button>
          <button class="btn ${this.activeSection === 'about' ? 'btn-primary' : 'btn-secondary'}" data-sec="about" style="justify-content: flex-start;">ℹ About</button>
        </div>

        <!-- Section Content Panel -->
        <div id="settings-content-panel" class="horizontal-card" style="padding: 28px; background: var(--bg-card); border-radius: var(--radius-xl);"></div>
      </div>
    `;

    // Hook section buttons
    this.container.querySelectorAll('[data-sec]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        this.activeSection = btn.getAttribute('data-sec') as any;
        this.render();
      };
    });

    const panel = this.container.querySelector('#settings-content-panel') as HTMLElement;
    panel.appendChild(this.renderActiveSection());

    return this.container;
  }

  private renderActiveSection(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'animate-fade-in';
    if (!this.settings) return div;

    if (this.activeSection === 'general') {
      div.innerHTML = `
        <h4 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 18px;">General Settings</h4>

        <div class="form-group">
          <label class="form-label">Instance Storage Location</label>
          <div style="display: flex; gap: 10px;">
            <input type="text" class="input-field" value="${this.settings.instanceDirectory}" readonly style="font-family: var(--font-mono); font-size: 0.88rem;" />
            <button class="btn btn-secondary" id="btn-set-inst-dir">Browse</button>
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Where Minecraft Loom instances, worlds, and mods are stored.</span>
        </div>

        <div class="form-group" style="margin-top: 20px;">
          <label style="display: flex; align-items: center; gap: 10px; font-weight: 600; cursor: pointer;">
            <input type="checkbox" id="chk-notif" ${this.settings.notificationsEnabled ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 18px; height: 18px;" />
            <span>Enable in-app notifications</span>
          </label>
        </div>

        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border-subtle);">
          <h5 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">First-Run Experience</h5>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
            Re-run the 7-step onboarding wizard to re-scan hardware, Java installations, and environment status.
          </p>
          <button class="btn btn-secondary" id="btn-redo-onboarding">
            🚀 Redo Startup Introduction
          </button>
        </div>
      `;

      (div.querySelector('#btn-set-inst-dir') as HTMLElement).onclick = async () => {
        const picked = await api.selectFolderDialog();
        if (picked) {
          await api.setAppSettings({ instanceDirectory: picked });
          NotificationToast.show('Storage path updated.', 'success');
          this.render();
        }
      };

      (div.querySelector('#chk-notif') as HTMLInputElement).onchange = async (e: any) => {
        await api.setAppSettings({ notificationsEnabled: e.target.checked });
        NotificationToast.show('Notification preference saved.', 'info');
      };

      (div.querySelector('#btn-redo-onboarding') as HTMLElement).onclick = async () => {
        await api.setAppSettings({ firstRunCompleted: false });
        if (this.events?.onRedoOnboarding) {
          this.events.onRedoOnboarding();
        } else {
          window.location.reload();
        }
      };
    } else if (this.activeSection === 'minecraft') {
      div.innerHTML = `
        <h4 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 18px;">Minecraft Defaults</h4>

        <div class="form-group">
          <label class="form-label">Default Memory: <span id="set-mem-label">${this.settings.defaultMemoryMb} MB</span></label>
          <input type="range" min="1024" max="16384" step="512" value="${this.settings.defaultMemoryMb}" id="set-mem-slider" style="accent-color: var(--accent-primary); width: 100%; margin-top: 8px;" />
          <span style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Assigned default maximum heap size for newly created development instances.</span>
        </div>
      `;

      const slider = div.querySelector('#set-mem-slider') as HTMLInputElement;
      const label = div.querySelector('#set-mem-label') as HTMLElement;
      slider.oninput = async (e: any) => {
        const val = Number(e.target.value);
        label.textContent = `${val} MB (${(val / 1024).toFixed(1)} GB)`;
        await api.setAppSettings({ defaultMemoryMb: val });
      };
    } else if (this.activeSection === 'java') {
      div.innerHTML = `
        <h4 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 18px;">Java Configuration</h4>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 20px;">
          Voxel⁺ scans and tests 64-bit Java runtimes across PATH, Program Files, and the Windows Registry.
        </p>

        <div class="form-group">
          <label class="form-label">Global Java Selection Mode</label>
          <select class="select-field" id="set-java-mode">
            <option value="auto" ${this.settings.globalJavaMode === 'auto' ? 'selected' : ''}>Auto (Resolve Best Compatible Java per Minecraft version)</option>
            <option value="manual" ${this.settings.globalJavaMode !== 'auto' ? 'selected' : ''}>Manual Selection</option>
          </select>
        </div>

        <div style="margin-top: 24px;">
          <button class="btn btn-primary" id="btn-open-java-mgr">
            ☕ Open Java Runtime Manager
          </button>
        </div>
      `;

      (div.querySelector('#set-java-mode') as HTMLSelectElement).onchange = async (e: any) => {
        await api.setAppSettings({ globalJavaMode: e.target.value });
        NotificationToast.show('Java mode updated.', 'info');
      };

      (div.querySelector('#btn-open-java-mgr') as HTMLElement).onclick = () => {
        JavaManagerModal.show();
      };
    } else if (this.activeSection === 'appearance') {
      div.innerHTML = `
        <h4 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 18px;">Appearance</h4>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="horizontal-card ${this.settings.theme === 'dark' ? 'selected' : ''}" data-set-theme="dark" style="padding: 14px 18px; background: var(--bg-surface); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="font-weight: 700;">◐ Dark Theme</div>
            ${this.settings.theme === 'dark' ? '<span class="badge badge-recommended">✓ ACTIVE</span>' : ''}
          </div>

          <div class="horizontal-card ${this.settings.theme === 'light' ? 'selected' : ''}" data-set-theme="light" style="padding: 14px 18px; background: var(--bg-surface); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="font-weight: 700;">○ Light Theme</div>
            ${this.settings.theme === 'light' ? '<span class="badge badge-recommended">✓ ACTIVE</span>' : ''}
          </div>

          <div class="horizontal-card ${this.settings.theme === 'system' ? 'selected' : ''}" data-set-theme="system" style="padding: 14px 18px; background: var(--bg-surface); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="font-weight: 700;">🖥 Follow System (Windows)</div>
            ${this.settings.theme === 'system' ? '<span class="badge badge-recommended">✓ ACTIVE</span>' : ''}
          </div>
        </div>
      `;

      div.querySelectorAll('[data-set-theme]').forEach(card => {
        (card as HTMLElement).onclick = async () => {
          const t = card.getAttribute('data-set-theme') as ThemeMode;
          await ThemeService.setTheme(t);
          this.render();
        };
      });
    } else if (this.activeSection === 'advanced') {
      div.innerHTML = `
        <h4 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 18px;">Advanced Settings</h4>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
          Low-level options for Fabric Loom, Gradle Wrapper, and JVM tuning.
        </p>

        <div class="form-group">
          <label class="form-label">Advanced JVM Arguments</label>
          <input type="text" class="input-field" id="set-jvm-args" value="${this.settings.advancedJvmArgs}" style="font-family: var(--font-mono); font-size: 0.85rem;" />
        </div>

        <div class="form-group">
          <label class="form-label">Gradle Wrapper Arguments</label>
          <input type="text" class="input-field" id="set-gradle-args" value="${this.settings.gradleWrapperArgs}" style="font-family: var(--font-mono); font-size: 0.85rem;" />
        </div>

        <div class="form-group" style="margin-top: 20px;">
          <label style="display: flex; align-items: center; gap: 10px; font-weight: 600; cursor: pointer;">
            <input type="checkbox" id="chk-debug-log" ${this.settings.debugLogging ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 18px; height: 18px;" />
            <span>Enable Verbose Debug Logging</span>
          </label>
        </div>

        <div style="margin-top: 24px;">
          <button class="btn btn-primary" id="btn-save-adv">Save Advanced Settings</button>
        </div>
      `;

      (div.querySelector('#btn-save-adv') as HTMLElement).onclick = async () => {
        const jvmArgs = (div.querySelector('#set-jvm-args') as HTMLInputElement).value;
        const gradleArgs = (div.querySelector('#set-gradle-args') as HTMLInputElement).value;
        const debugLogging = (div.querySelector('#chk-debug-log') as HTMLInputElement).checked;

        await api.setAppSettings({
          advancedJvmArgs: jvmArgs,
          gradleWrapperArgs: gradleArgs,
          debugLogging
        });
        NotificationToast.show('Advanced settings saved.', 'success');
      };
    } else if (this.activeSection === 'about') {
      div.innerHTML = `
        <div style="text-align: center; padding: 20px 0;">
          <div style="
            width: 56px;
            height: 56px;
            border-radius: var(--radius-lg);
            background: var(--accent-gradient);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 1.8rem;
            font-weight: 900;
            color: white;
            box-shadow: 0 4px 18px var(--accent-glow);
            margin-bottom: 12px;
          ">
            V
          </div>
          <div class="brand-title" style="font-size: 1.8rem; justify-content: center; margin-bottom: 4px;">
            VOXEL<span class="plus-badge">⁺</span>
          </div>
          <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-accent);">Version 1.0.0 (Windows x64)</div>

          <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 16px auto; max-width: 440px; line-height: 1.6;">
            A modern, elegant Minecraft development launcher designed to make Fabric Loom and Gradle feel like a premium launcher.
          </p>

          <div style="
            display: inline-flex;
            gap: 16px;
            background: var(--bg-surface);
            padding: 12px 24px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            font-size: 0.84rem;
            color: var(--text-muted);
            margin-top: 12px;
          ">
            <span>Electron + Vite</span>
            <span>·</span>
            <span>TypeScript</span>
            <span>·</span>
            <span>Fabric Loom</span>
            <span>·</span>
            <span>Gradle</span>
          </div>
        </div>
      `;
    }

    return div;
  }
}
