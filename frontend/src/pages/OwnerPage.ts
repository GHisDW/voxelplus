import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';

export class OwnerPage {
  private container: HTMLElement;
  private isAuthorized: boolean = false;
  private userRole: string | null = null;
  private activeTab: 'users' | 'audit' | 'danger' = 'users';
  private users: any[] = [];
  private searchQuery: string = '';
  private selectedUser: any = null;
  private auditLogs: any[] = [];
  private isLoading: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-container animate-fade-in';
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
    this.container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <span class="animate-pulse">Verifying server authorization...</span>
      </div>
    `;

    try {
      const status = await api.checkOwnerStatus();
      this.isAuthorized = status.isOwner;
      this.userRole = status.role;
    } catch {
      this.isAuthorized = false;
      this.userRole = null;
    }

    if (!this.isAuthorized) {
      this.renderAccessDenied();
      return this.container;
    }

    await this.loadData();
    this.renderAuthorized();
    return this.container;
  }

  private renderAccessDenied(): void {
    this.container.innerHTML = `
      <div style="
        text-align: center;
        padding: 60px 24px;
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-subtle);
        max-width: 540px;
        margin: 40px auto;
      ">
        <div style="font-size: 3.5rem; margin-bottom: 16px;">🛡️</div>
        <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
          Access Denied
        </h2>
        <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5; margin-bottom: 24px;">
          The Owner Control Panel is restricted to authorized Voxel⁺ platform administrators and owners.
          Server-authoritative role verification failed.
        </p>
        <div style="
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          color: #f87171;
        ">
          Privileged database tokens and service keys are never stored on client devices.
        </div>
      </div>
    `;
  }

  private async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      if (this.activeTab === 'users') {
        const res = await api.getOwnerUsers(this.searchQuery);
        this.users = res.users || [];
      } else if (this.activeTab === 'audit') {
        const res = await api.getOwnerAuditLog();
        this.auditLogs = res.log || [];
      }
    } catch (e: any) {
      NotificationToast.show(e.message || 'Failed to load owner data.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  private renderAuthorized(): void {
    this.container.innerHTML = '';

    // Header banner
    const header = document.createElement('div');
    header.className = 'card-surface';
    header.style.cssText = `
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 27, 75, 0.8)), var(--bg-card);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: var(--radius-xl);
      padding: 24px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    `;

    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="
          width: 52px;
          height: 52px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          box-shadow: 0 4px 18px rgba(139, 92, 246, 0.4);
        ">
          ⚡
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary);">Owner Control Panel</h2>
            <span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); font-weight: 700;">
              ROLE: ${(this.userRole || 'OWNER').toUpperCase()}
            </span>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.88rem; margin-top: 4px;">
            Server-authoritative administration · Audit logged · Real-time identity enforcement
          </p>
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" id="btn-owner-refresh">
          🔄 Refresh
        </button>
      </div>
    `;

    (header.querySelector('#btn-owner-refresh') as HTMLElement).onclick = async () => {
      await this.loadData();
      this.renderAuthorized();
    };

    this.container.appendChild(header);

    // Tab buttons
    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = `
      display: flex;
      gap: 10px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 8px;
    `;

    const tabs: Array<{ id: 'users' | 'audit' | 'danger'; label: string; icon: string }> = [
      { id: 'users', label: `Accounts (${this.users.length})`, icon: '👥' },
      { id: 'audit', label: 'Audit Log', icon: '📜' },
      { id: 'danger', label: 'Danger Zone', icon: '⚠️' }
    ];

    tabsContainer.innerHTML = tabs.map(t => `
      <button class="btn ${this.activeTab === t.id ? 'btn-primary' : 'btn-secondary'}" data-tab="${t.id}" style="padding: 10px 18px; font-weight: 600;">
        <span>${t.icon} ${t.label}</span>
      </button>
    `).join('');

    tabsContainer.querySelectorAll('[data-tab]').forEach(btn => {
      (btn as HTMLElement).onclick = async () => {
        this.activeTab = btn.getAttribute('data-tab') as any;
        await this.loadData();
        this.renderAuthorized();
      };
    });

    this.container.appendChild(tabsContainer);

    // Main content area
    const content = document.createElement('div');
    content.style.cssText = `flex: 1; min-height: 0; display: flex; flex-direction: column;`;

    if (this.activeTab === 'users') {
      content.appendChild(this.renderUsersTab());
    } else if (this.activeTab === 'audit') {
      content.appendChild(this.renderAuditTab());
    } else if (this.activeTab === 'danger') {
      content.appendChild(this.renderDangerTab());
    }

    this.container.appendChild(content);
  }

  private renderUsersTab(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display: flex; flex-direction: column; gap: 16px;`;

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.style.cssText = `display: flex; gap: 12px;`;
    searchBar.innerHTML = `
      <input type="text" class="input-field" id="owner-user-search" placeholder="Search accounts by username..." value="${this.searchQuery}" style="flex: 1;" />
      <button class="btn btn-primary" id="btn-owner-search">Search</button>
    `;

    const input = searchBar.querySelector('#owner-user-search') as HTMLInputElement;
    input.onkeydown = async (e) => {
      if (e.key === 'Enter') {
        this.searchQuery = input.value.trim();
        await this.loadData();
        this.renderAuthorized();
      }
    };
    (searchBar.querySelector('#btn-owner-search') as HTMLElement).onclick = async () => {
      this.searchQuery = input.value.trim();
      await this.loadData();
      this.renderAuthorized();
    };

    wrap.appendChild(searchBar);

    if (this.users.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg);`;
      empty.textContent = 'No user accounts found matching your query.';
      wrap.appendChild(empty);
      return wrap;
    }

    // User table / cards
    const table = document.createElement('div');
    table.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;

    this.users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'horizontal-card';
      card.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        gap: 16px;
        flex-wrap: wrap;
      `;

      const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown';

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px; min-width: 240px;">
          <div style="
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--accent-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.3rem;
            color: white;
          ">
            👤
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">@${u.username}</span>
              ${u.is_creator ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">CREATOR</span>' : ''}
              ${u.is_public ? '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa;">PUBLIC</span>' : '<span class="badge" style="color: var(--text-muted);">PRIVATE</span>'}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
              Created ${dateStr} · Title: ${u.selected_title || 'None'} · Cosmetic: ${u.selected_cosmetic || 'None'}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-grant-title" data-user-id="${u.id}" data-username="${u.username}" style="padding: 6px 12px; font-size: 0.82rem;">
            🏷 Grant Title
          </button>
          <button class="btn btn-secondary btn-grant-badge" data-user-id="${u.id}" data-username="${u.username}" style="padding: 6px 12px; font-size: 0.82rem;">
            ⭐ Grant Badge
          </button>
          <button class="btn btn-secondary btn-toggle-creator" data-user-id="${u.id}" data-creator="${u.is_creator}" style="padding: 6px 12px; font-size: 0.82rem;">
            ${u.is_creator ? 'Revoke Creator' : 'Make Creator'}
          </button>
          <button class="btn btn-danger btn-delete-user" data-user-id="${u.id}" data-username="${u.username}" style="padding: 6px 12px; font-size: 0.82rem; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">
            🗑 Delete
          </button>
        </div>
      `;

      // Title grant handler
      (card.querySelector('.btn-grant-title') as HTMLElement).onclick = () => {
        this.promptGrantTitle(u.id, u.username);
      };

      // Badge grant handler
      (card.querySelector('.btn-grant-badge') as HTMLElement).onclick = () => {
        this.promptGrantBadge(u.id, u.username);
      };

      // Toggle creator handler
      (card.querySelector('.btn-toggle-creator') as HTMLElement).onclick = async () => {
        try {
          await api.setCreatorStatus(u.id, !u.is_creator);
          NotificationToast.show(`Creator status updated for @${u.username}`, 'success');
          await this.loadData();
          this.renderAuthorized();
        } catch (e: any) {
          NotificationToast.show(e.message || 'Failed to update creator status.', 'error');
        }
      };

      // Delete user handler
      (card.querySelector('.btn-delete-user') as HTMLElement).onclick = () => {
        this.promptDeleteUser(u.id, u.username);
      };

      table.appendChild(card);
    });

    wrap.appendChild(table);
    return wrap;
  }

  private renderAuditTab(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display: flex; flex-direction: column; gap: 12px;`;

    if (this.auditLogs.length === 0) {
      wrap.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg);">
          No owner audit events recorded yet.
        </div>
      `;
      return wrap;
    }

    const table = document.createElement('div');
    table.style.cssText = `display: flex; flex-direction: column; gap: 8px; font-family: var(--font-mono);`;

    this.auditLogs.forEach(entry => {
      const row = document.createElement('div');
      row.style.cssText = `
        padding: 12px 16px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        font-size: 0.85rem;
      `;

      const time = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge" style="font-size: 0.72rem; background: rgba(139, 92, 246, 0.15); color: #c4b5fd;">
            ${entry.action || 'AUDIT'}
          </span>
          <span style="color: var(--text-primary); font-weight: 600;">
            ${entry.target_username ? `@${entry.target_username}` : (entry.target_id || '')}
          </span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.78rem;">
          ${time} · Actor: ${entry.actor_role || 'owner'}
        </div>
      `;
      table.appendChild(row);
    });

    wrap.appendChild(table);
    return wrap;
  }

  private renderDangerTab(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display: flex; flex-direction: column; gap: 20px; max-width: 680px;`;

    wrap.innerHTML = `
      <div style="
        padding: 24px;
        background: rgba(239, 68, 68, 0.05);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius-lg);
      ">
        <h3 style="color: #f87171; font-size: 1.2rem; font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span>🚨</span> Bulk Delete All User Accounts
        </h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 16px;">
          This action will permanently delete all non-owner Voxel⁺ user accounts, auth identities,
          cloud-synced profiles, and library records. The platform owner account is protected and will not be deleted.
        </p>

        <div style="
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: var(--radius-md);
          margin-bottom: 20px;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: #fca5a5;
        ">
          Type confirmation phrase: <strong>DELETE_ALL_ACCOUNTS_PERMANENTLY</strong>
        </div>

        <div style="display: flex; gap: 12px;">
          <input type="text" class="input-field" id="bulk-confirm-input" placeholder="Type confirmation phrase..." style="flex: 1;" />
          <button class="btn btn-danger" id="btn-bulk-delete" style="background: #ef4444; color: white;">
            PERMANENTLY DELETE ALL
          </button>
        </div>
      </div>
    `;

    const input = wrap.querySelector('#bulk-confirm-input') as HTMLInputElement;
    const btn = wrap.querySelector('#btn-bulk-delete') as HTMLButtonElement;

    btn.onclick = async () => {
      const phrase = input.value.trim();
      if (phrase !== 'DELETE_ALL_ACCOUNTS_PERMANENTLY') {
        NotificationToast.show('Confirmation phrase does not match.', 'error');
        return;
      }

      if (!confirm('FINAL CONFIRMATION: Are you absolutely certain you want to delete ALL non-owner accounts? This cannot be undone.')) {
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Deleting accounts...';

      try {
        const result = await api.ownerBulkDelete(phrase);
        NotificationToast.show(`Successfully deleted ${result.deleted} accounts.`, 'success');
        input.value = '';
        await this.loadData();
        this.renderAuthorized();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Bulk delete failed.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'PERMANENTLY DELETE ALL';
      }
    };

    return wrap;
  }

  private promptGrantTitle(userId: string, username: string): void {
    const titles = ['founder', 'developer', 'creator', 'contributor', 'tester', 'moderator', 'featured_creator'];
    const chosen = prompt(`Select Title to grant to @${username}:\n\n${titles.join(', ')}`, 'developer');
    if (!chosen) return;

    api.grantTitle(userId, chosen.trim().toLowerCase())
      .then(() => {
        NotificationToast.show(`Title "${chosen}" granted to @${username}!`, 'success');
        this.loadData().then(() => this.renderAuthorized());
      })
      .catch((e: any) => {
        NotificationToast.show(e.message || 'Failed to grant title.', 'error');
      });
  }

  private promptGrantBadge(userId: string, username: string): void {
    const badges = ['verified', 'developer', 'creator', 'founder', 'beta_tester', 'featured'];
    const chosen = prompt(`Select Badge to grant to @${username}:\n\n${badges.join(', ')}`, 'verified');
    if (!chosen) return;

    api.grantBadge(userId, chosen.trim().toLowerCase())
      .then(() => {
        NotificationToast.show(`Badge "${chosen}" granted to @${username}!`, 'success');
        this.loadData().then(() => this.renderAuthorized());
      })
      .catch((e: any) => {
        NotificationToast.show(e.message || 'Failed to grant badge.', 'error');
      });
  }

  private promptDeleteUser(userId: string, username: string): void {
    const confirmPhrase = prompt(
      `DANGER: Deleting @${username} will permanently delete their account and cloud data.\n\nType "DELETE_ACCOUNT_CONFIRMED" to confirm:`,
      ''
    );

    if (confirmPhrase !== 'DELETE_ACCOUNT_CONFIRMED') {
      if (confirmPhrase !== null) {
        NotificationToast.show('Incorrect confirmation phrase. Deletion aborted.', 'warning');
      }
      return;
    }

    api.ownerDeleteUser(userId, 'DELETE_ACCOUNT_CONFIRMED')
      .then(() => {
        NotificationToast.show(`Account @${username} has been permanently deleted.`, 'success');
        this.loadData().then(() => this.renderAuthorized());
      })
      .catch((e: any) => {
        NotificationToast.show(e.message || 'Failed to delete account.', 'error');
      });
  }
}
