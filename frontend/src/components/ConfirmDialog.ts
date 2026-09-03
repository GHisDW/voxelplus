export class ConfirmDialog {
  public static async show(options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay animate-fade-in';

      const confirmBtnClass = options.isDanger ? 'btn-danger' : 'btn-primary';
      const confirmText = options.confirmText || 'Confirm';
      const cancelText = options.cancelText || 'Cancel';

      overlay.innerHTML = `
        <div class="modal-content animate-scale-in" style="max-width: 440px;">
          <div class="modal-header">
            <h3 class="modal-title">${this.escapeHtml(options.title)}</h3>
          </div>
          <div style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px;">
            ${this.escapeHtml(options.message)}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="confirm-cancel">${this.escapeHtml(cancelText)}</button>
            <button class="btn ${confirmBtnClass}" id="confirm-ok">${this.escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const cancelBtn = overlay.querySelector('#confirm-cancel') as HTMLButtonElement;
      const okBtn = overlay.querySelector('#confirm-ok') as HTMLButtonElement;

      const cleanup = (result: boolean) => {
        overlay.classList.remove('animate-fade-in');
        overlay.remove();
        resolve(result);
      };

      cancelBtn.onclick = () => cleanup(false);
      okBtn.onclick = () => cleanup(true);
      overlay.onclick = (e) => {
        if (e.target === overlay) cleanup(false);
      };
    });
  }

  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
