import { api } from '../services/api';
import { NotificationToast } from './NotificationToast';

export class AddContentModal {
  public static async show(
    instanceId: string,
    onOpenModrinth: () => void,
    onContentChanged: () => void
  ): Promise<void> {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animate-fade-in';

    overlay.innerHTML = `
      <div class="modal-content animate-scale-in" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">Add Content to Instance</h3>
          <button class="btn btn-icon" id="modal-close">✕</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          <!-- Modrinth Option -->
          <div id="opt-modrinth" class="horizontal-card" style="
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 18px 20px;
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            cursor: pointer;
          ">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: linear-gradient(135deg, #1bd96a 0%, #00af5c 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.4rem;
              color: white;
            ">
              🔍
            </div>
            <div style="flex: 1;">
              <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">Search Modrinth</h4>
              <p style="font-size: 0.84rem; color: var(--text-secondary); margin-top: 2px;">
                Browse and 1-click install thousands of verified mods, resource packs, and shaders.
              </p>
            </div>
          </div>

          <!-- Local File Option -->
          <div id="opt-local" class="horizontal-card" style="
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 18px 20px;
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            cursor: pointer;
          ">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.4rem;
              color: white;
            ">
              📁
            </div>
            <div style="flex: 1;">
              <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">Import from Computer</h4>
              <p style="font-size: 0.84rem; color: var(--text-secondary); margin-top: 2px;">
                Select local <code>.jar</code> mod files or <code>.zip</code> resource packs.
              </p>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="margin-top: 20px;">
          <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    (overlay.querySelector('#modal-close') as HTMLElement).onclick = close;
    (overlay.querySelector('#modal-cancel') as HTMLElement).onclick = close;

    (overlay.querySelector('#opt-modrinth') as HTMLElement).onclick = () => {
      close();
      onOpenModrinth();
    };

    (overlay.querySelector('#opt-local') as HTMLElement).onclick = async () => {
      const filePath = await api.selectFileDialog([
        { name: 'Minecraft Mod / Pack (*.jar, *.zip)', extensions: ['jar', 'zip'] }
      ]);

      if (filePath) {
        const res = await api.importFile(instanceId, filePath, filePath.endsWith('.jar') ? 'mod' : 'resourcepack');
        if (res.success) {
          NotificationToast.show(`Imported "${res.filename}" successfully!`, 'success');
          onContentChanged();
          close();
        } else {
          NotificationToast.show(`Failed to import file: ${res.error}`, 'error');
        }
      }
    };
  }
}
