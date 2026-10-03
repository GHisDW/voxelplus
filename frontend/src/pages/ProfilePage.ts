import { VoxelUserProfile } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';

export interface ProfilePageEvents {
  onLogout?: () => void;
  onNavigateToDirectory?: () => void;
}

export class ProfilePage {
  private activeTab: 'overview' | 'packs' | 'skins' | 'public_preview' | 'settings' = 'overview';
  private user: VoxelUserProfile | null = null;
  private events: ProfilePageEvents;
  private container: HTMLElement;

  private userPacks: any[] = [];
  private userSkins: any[] = [];
  private userLibrary: any[] = [];

  constructor(events: ProfilePageEvents = {}) {
    this.events = events;
    this.container = document.createElement('div');
    this.container.className = 'page-container';
    this.container.style.cssText = `
      padding: 24px;
      overflow-y: auto;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;
  }

  public async render(): Promise<HTMLElement> {
    try {
      this.user = await api.getCurrentUser();
      if (this.user) {
        try {
          this.userLibrary = await api.getLibrary();
          const syncData = await api.syncCloudData();
          this.userPacks = syncData.packs || [];
          this.userSkins = syncData.skins || [];
        } catch {
          // Fallback gracefully if offline
        }
      }
    } catch (e) {
      console.warn('Failed to load user profile:', e);
    }

    this.renderContent();
    return this.container;
  }

  private renderContent(): void {
    this.container.innerHTML = '';

    if (!this.user) {
      this.container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle);">
          <div style="font-size: 3rem; margin-bottom: 12px;">👤</div>
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">No Voxel⁺ Account Found</h2>
          <p style="color: var(--text-secondary); max-width: 400px; margin: 0 auto 24px;">
            Sign in or create a Voxel⁺ account to access your cloud profile, synchronized library, packs, and skins.
          </p>
        </div>
      `;
      return;
    }

    const createdDate = new Date(this.user.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const banner = document.createElement('div');
    banner.className = 'card-surface';
    banner.style.cssText = `
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9)), var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 24px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    `;

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: var(--accent-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          color: white;
          box-shadow: 0 8px 20px var(--accent-glow);
          border: 3px solid rgba(255, 255, 255, 0.2);
        ">
          ${this.getAvatarIcon(this.user.avatar)}
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary);">@${this.user.username}</h2>
            <span class="badge ${this.user.isPublic ? 'badge-recommended' : 'badge-lts'}">
              ${this.user.isPublic ? '🌐 PUBLIC PROFILE' : '🔒 PRIVATE PROFILE'}
            </span>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
            ${this.user.bio || 'No bio written yet. Customize your bio in Account Settings.'}
          </p>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 6px;">
            Member since ${createdDate}
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary" id="btn-sync-now" style="display: flex; align-items: center; gap: 8px;">
          <span>☁ Sync Cloud</span>
        </button>
      </div>
    `;

    (banner.querySelector('#btn-sync-now') as HTMLElement).onclick = async () => {
      try {
        await api.syncCloudData();
        NotificationToast.show('Cloud profile and library synchronized successfully!', 'success');
        this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Sync failed.', 'error');
      }
    };

    this.container.appendChild(banner);

    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = `
      display: flex;
      gap: 10px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 8px;
    `;

    const tabs: Array<{ id: 'overview' | 'packs' | 'skins' | 'public_preview' | 'settings'; label: string; icon: string }> = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'packs', label: `My Packs (${this.userPacks.length})`, icon: '📦' },
      { id: 'skins', label: `My Skins (${this.userSkins.length})`, icon: '👕' },
      { id: 'public_preview', label: 'Public Profile', icon: '🌐' },
      { id: 'settings', label: 'Account Settings', icon: '⚙' }
    ];

    tabsContainer.innerHTML = tabs
      .map(
        (t) => `
      <button class="btn ${this.activeTab === t.id ? 'btn-primary' : 'btn-secondary'}" data-tab="${t.id}" style="padding: 10px 18px; font-size: 0.9rem; font-weight: 600;">
        <span>${t.icon} ${t.label}</span>
      </button>
    `
      )
      .join('');

    tabsContainer.querySelectorAll('[data-tab]').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        this.activeTab = btn.getAttribute('data-tab') as any;
        this.renderContent();
      };
    });

    this.container.appendChild(tabsContainer);

    const bodyArea = document.createElement('div');
    bodyArea.style.cssText = `flex: 1; min-height: 0;`;

    if (this.activeTab === 'overview') {
      bodyArea.appendChild(this.renderOverviewTab());
    } else if (this.activeTab === 'packs') {
      bodyArea.appendChild(this.renderPacksTab());
    } else if (this.activeTab === 'skins') {
      bodyArea.appendChild(this.renderSkinsTab());
    } else if (this.activeTab === 'public_preview') {
      bodyArea.appendChild(this.renderPublicPreviewTab());
    } else if (this.activeTab === 'settings') {
      bodyArea.appendChild(this.renderSettingsTab());
    }

    this.container.appendChild(bodyArea);
  }

  private renderOverviewTab(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;`;

    div.innerHTML = `
      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 14px;">Identity & Creator Info</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Username</span>
            <span style="font-weight: 700; color: var(--text-primary);">@${this.user!.username}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Account Type</span>
            <span style="color: #10b981; font-weight: 700;">Voxel⁺ Cloud Identity</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Password Recovery</span>
            <span style="color: #ef4444; font-weight: 700;">Disabled (No Email/Phone)</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Public Directory Status</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.user!.isPublic ? 'Listed' : 'Hidden'}</span>
          </div>
        </div>
      </div>

      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 14px;">Cloud Assets & Library</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Associated VPacks</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userPacks.length}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Saved Skins</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userSkins.length}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Library Items</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userLibrary.length}</span>
          </div>
        </div>
      </div>
    `;

    return div;
  }

  private renderPacksTab(): HTMLElement {
    const div = document.createElement('div');
    if (this.userPacks.length === 0) {
      div.innerHTML = `
        <div style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">📦</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">No VPacks Associated Yet</h4>
          <p style="color: var(--text-secondary); font-size: 0.88rem; margin-top: 4px;">
            Export or create a .vpack instance package to associate it with your @${this.user!.username} creator profile.
          </p>
        </div>
      `;
    } else {
      div.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;
      div.innerHTML = this.userPacks
        .map(
          (p) => `
        <div class="card-surface" style="padding: 16px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-subtle);">
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">${p.name}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin: 4px 0 8px;">Version ${p.version} · ${p.description || 'No description'}</div>
          <div style="font-size: 0.75rem; color: var(--accent-primary); font-weight: 600;">Created by @${p.authorUsername}</div>
        </div>
      `
        )
        .join('');
    }
    return div;
  }

  private renderSkinsTab(): HTMLElement {
    const div = document.createElement('div');
    if (this.userSkins.length === 0) {
      div.innerHTML = `
        <div style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">👕</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">No Saved Skins</h4>
          <p style="color: var(--text-secondary); font-size: 0.88rem; margin-top: 4px;">
            Import or download Minecraft skins in the Skins tab to save them to your cloud profile.
          </p>
        </div>
      `;
    } else {
      div.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;`;
      div.innerHTML = this.userSkins
        .map(
          (s) => `
        <div class="card-surface" style="padding: 16px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-subtle); text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 8px;">👕</div>
          <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${s.name}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Model: ${s.model}</div>
        </div>
      `
        )
        .join('');
    }
    return div;
  }

  private renderPublicPreviewTab(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `
      background: var(--bg-card);
      border: 1px dashed var(--accent-primary);
      border-radius: var(--radius-xl);
      padding: 28px;
      max-width: 580px;
      margin: 0 auto;
    `;

    div.innerHTML = `
      <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-primary); letter-spacing: 1px; margin-bottom: 16px; text-transform: uppercase;">
        🔍 COMMUNITY DIRECTORY PREVIEW
      </div>
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
        <div style="
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: var(--accent-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          color: white;
        ">
          ${this.getAvatarIcon(this.user!.avatar)}
        </div>
        <div>
          <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">@${this.user!.username}</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary);">${this.user!.bio || 'No public bio set.'}</p>
        </div>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted); padding-top: 12px; border-top: 1px solid var(--border-subtle);">
        Public VPacks: ${this.userPacks.length} · Public Skins: ${this.userSkins.length}
      </div>
    `;

    return div;
  }

  private renderSettingsTab(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `display: flex; flex-direction: column; gap: 24px; max-width: 640px;`;

    div.innerHTML = `
      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">Change Password</h3>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 14px;">
          Update your password below. Reminder: Voxel⁺ does NOT support password recovery if forgotten.
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <input type="password" id="input-old-pass" class="input" placeholder="Current Password (optional)" style="padding: 10px;" />
          <input type="password" id="input-new-pass" class="input" placeholder="New Password (min 6 chars)" style="padding: 10px;" />
          <button class="btn btn-secondary" id="btn-change-pass" style="align-self: flex-start; padding: 10px 20px;">Update Password</button>
        </div>
      </div>

      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">Edit Bio & Visibility</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">BIO</label>
            <textarea id="input-edit-bio" class="input" rows="2" style="width: 100%; padding: 10px; font-size: 0.9rem;">${this.user!.bio}</textarea>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.88rem; color: var(--text-primary);">Show in Public Directory</span>
            <input type="checkbox" id="check-edit-public" ${this.user!.isPublic ? 'checked' : ''} style="width: 18px; height: 18px;" />
          </div>
          <button class="btn btn-primary" id="btn-save-bio" style="align-self: flex-start; padding: 10px 20px;">Save Profile Changes</button>
        </div>
      </div>

      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid #ef4444;">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: #f87171; margin-bottom: 12px;">Session & Account Deletion</h3>
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <button class="btn btn-secondary" id="btn-logout" style="padding: 10px 20px;">Logout</button>
          <button class="btn btn-danger" id="btn-delete-account" style="padding: 10px 20px; background: #ef4444; color: white;">Delete Account Permanently</button>
        </div>
      </div>
    `;

    (div.querySelector('#btn-change-pass') as HTMLElement).onclick = async () => {
      const oldP = (div.querySelector('#input-old-pass') as HTMLInputElement).value;
      const newP = (div.querySelector('#input-new-pass') as HTMLInputElement).value;
      if (!newP) {
        NotificationToast.show('Please enter a new password.', 'error');
        return;
      }
      try {
        await api.changePassword({ oldPassword: oldP, newPassword: newP });
        NotificationToast.show('Password updated successfully!', 'success');
        (div.querySelector('#input-old-pass') as HTMLInputElement).value = '';
        (div.querySelector('#input-new-pass') as HTMLInputElement).value = '';
      } catch (e: any) {
        NotificationToast.show(e.message || 'Failed to update password.', 'error');
      }
    };

    (div.querySelector('#btn-save-bio') as HTMLElement).onclick = async () => {
      const bioVal = (div.querySelector('#input-edit-bio') as HTMLTextAreaElement).value;
      const isPub = (div.querySelector('#check-edit-public') as HTMLInputElement).checked;
      try {
        await api.updateProfile({ bio: bioVal, isPublic: isPub });
        NotificationToast.show('Profile updated!', 'success');
        this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Update failed.', 'error');
      }
    };

    (div.querySelector('#btn-logout') as HTMLElement).onclick = async () => {
      await api.logoutAccount();
      NotificationToast.show('Logged out of Voxel⁺ account.', 'info');
      if (this.events.onLogout) this.events.onLogout();
      this.render();
    };

    (div.querySelector('#btn-delete-account') as HTMLElement).onclick = () => {
      this.showDeleteModal();
    };

    return div;
  }

  private showDeleteModal(): void {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    backdrop.innerHTML = `
      <div class="modal-content animate-scale-in" style="max-width: 460px; width: 100%; background: var(--bg-card); border: 2px solid #ef4444; border-radius: var(--radius-xl); padding: 24px;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: #ef4444; margin-bottom: 10px;">
          Delete Voxel⁺ Account?
        </h3>
        <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">
          This action will <strong>permanently delete</strong> your Voxel⁺ identity (@${this.user!.username}) and all associated cloud sync metadata. Local Minecraft instance files will remain intact.
        </p>
        <p style="font-size: 0.82rem; color: #f87171; margin-bottom: 16px;">
          Type your username <strong>${this.user!.username}</strong> to confirm:
        </p>
        <input type="text" id="confirm-delete-user" class="input" style="width: 100%; padding: 10px; margin-bottom: 20px;" placeholder="${this.user!.username}" />
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-secondary" id="btn-cancel-delete">Cancel</button>
          <button class="btn btn-danger" id="btn-confirm-delete" style="background: #ef4444; color: white;">Permanently Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    (backdrop.querySelector('#btn-cancel-delete') as HTMLElement).onclick = () => {
      backdrop.remove();
    };

    (backdrop.querySelector('#btn-confirm-delete') as HTMLElement).onclick = async () => {
      const typed = (backdrop.querySelector('#confirm-delete-user') as HTMLInputElement).value.trim();
      if (typed !== this.user!.username) {
        NotificationToast.show('Username mismatch. Account was not deleted.', 'error');
        return;
      }
      try {
        await api.deleteAccount();
        backdrop.remove();
        NotificationToast.show('Your account was permanently deleted.', 'info');
        if (this.events.onLogout) this.events.onLogout();
        this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Deletion failed.', 'error');
      }
    };
  }

  private getAvatarIcon(avatar: string): string {
    if (avatar === 'avatar_alex') return '🟩';
    if (avatar === 'avatar_creeper') return '❇️';
    if (avatar === 'avatar_ender') return '🟪';
    if (avatar === 'avatar_blaze') return '🟧';
    if (avatar === 'avatar_redstone') return '🟥';
    return '🟦';
  }
}
