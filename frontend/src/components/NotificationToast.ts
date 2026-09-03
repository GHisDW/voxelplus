export type ToastType = 'info' | 'success' | 'warning' | 'error';

export class NotificationToast {
  private static container: HTMLElement | null = null;

  private static ensureContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  public static show(message: string, type: ToastType = 'info', durationMs: number = 4000): void {
    const container = this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast animate-fade-in-up`;

    let icon = 'ℹ️';
    let borderColor = 'var(--border-subtle)';
    if (type === 'success') {
      icon = '✓';
      borderColor = '#10b981';
    } else if (type === 'warning') {
      icon = '⚠️';
      borderColor = '#f59e0b';
    } else if (type === 'error') {
      icon = '✕';
      borderColor = '#ef4444';
    }

    toast.style.borderColor = borderColor;
    toast.innerHTML = `
      <span style="font-size: 1.1rem; font-weight: 700;">${icon}</span>
      <div style="flex: 1; font-weight: 500;">${this.escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
