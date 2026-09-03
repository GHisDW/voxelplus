import { MINECRAFT_ITEMS, getItemDataUrl, MinecraftItemDef } from '../assets/items';

export class ItemPickerModal {
  public static async selectItem(currentItemId: string = 'minecraft:grass_block'): Promise<string | null> {
    return new Promise((resolve) => {
      let selectedId = currentItemId;
      let activeCategory = 'all';
      let searchQuery = '';

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay animate-fade-in';

      const renderModal = () => {
        overlay.innerHTML = `
          <div class="modal-content animate-scale-in" style="max-width: 580px;">
            <div class="modal-header">
              <h3 class="modal-title">Select Instance Item Identity</h3>
              <button class="btn btn-icon" id="item-picker-close">✕</button>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
              <input type="text" class="input-field" id="item-search" placeholder="Search items..." value="${searchQuery}" autofocus style="flex: 1;" />
              <select class="select-field" id="item-category" style="width: 140px;">
                <option value="all" ${activeCategory === 'all' ? 'selected' : ''}>All</option>
                <option value="blocks" ${activeCategory === 'blocks' ? 'selected' : ''}>Blocks</option>
                <option value="items" ${activeCategory === 'items' ? 'selected' : ''}>Items</option>
                <option value="redstone" ${activeCategory === 'redstone' ? 'selected' : ''}>Redstone</option>
                <option value="combat" ${activeCategory === 'combat' ? 'selected' : ''}>Combat</option>
              </select>
            </div>

            <div id="items-grid" style="
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
              gap: 12px;
              max-height: 320px;
              overflow-y: auto;
              padding: 4px;
            "></div>

            <div class="modal-footer">
              <button class="btn btn-secondary" id="item-picker-cancel">Cancel</button>
              <button class="btn btn-primary" id="item-picker-confirm">Select Item</button>
            </div>
          </div>
        `;

        const grid = overlay.querySelector('#items-grid') as HTMLElement;
        const filtered = MINECRAFT_ITEMS.filter(item => {
          const matchCat = activeCategory === 'all' || item.category === activeCategory;
          const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.id.toLowerCase().includes(searchQuery.toLowerCase());
          return matchCat && matchSearch;
        });

        filtered.forEach(item => {
          const isSelected = item.id === selectedId;
          const itemCard = document.createElement('div');
          itemCard.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 10px 6px;
            background: ${isSelected ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-glass)'};
            border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'};
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s ease;
          `;
          itemCard.onmouseenter = () => {
            if (!isSelected) itemCard.style.borderColor = 'var(--border-hover)';
          };
          itemCard.onmouseleave = () => {
            if (!isSelected) itemCard.style.borderColor = 'var(--border-subtle)';
          };
          itemCard.onclick = () => {
            selectedId = item.id;
            renderGridItems();
          };

          itemCard.innerHTML = `
            <img src="${getItemDataUrl(item.id)}" width="36" height="36" style="image-rendering: pixelated; margin-bottom: 6px;" />
            <span style="font-size: 0.72rem; font-weight: 600; text-align: center; color: var(--text-secondary); line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
              ${item.name}
            </span>
          `;
          grid.appendChild(itemCard);
        });

        // Search listener
        const searchInput = overlay.querySelector('#item-search') as HTMLInputElement;
        searchInput.oninput = (e: any) => {
          searchQuery = e.target.value;
          renderGridItems();
        };

        const catSelect = overlay.querySelector('#item-category') as HTMLSelectElement;
        catSelect.onchange = (e: any) => {
          activeCategory = e.target.value;
          renderGridItems();
        };

        // Actions
        const close = (res: string | null) => {
          overlay.remove();
          resolve(res);
        };

        (overlay.querySelector('#item-picker-close') as HTMLElement).onclick = () => close(null);
        (overlay.querySelector('#item-picker-cancel') as HTMLElement).onclick = () => close(null);
        (overlay.querySelector('#item-picker-confirm') as HTMLElement).onclick = () => close(selectedId);
      };

      const renderGridItems = () => {
        const grid = overlay.querySelector('#items-grid') as HTMLElement;
        if (!grid) return;
        grid.innerHTML = '';
        const filtered = MINECRAFT_ITEMS.filter(item => {
          const matchCat = activeCategory === 'all' || item.category === activeCategory;
          const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.id.toLowerCase().includes(searchQuery.toLowerCase());
          return matchCat && matchSearch;
        });

        filtered.forEach(item => {
          const isSelected = item.id === selectedId;
          const itemCard = document.createElement('div');
          itemCard.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 10px 6px;
            background: ${isSelected ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-glass)'};
            border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'};
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s ease;
          `;
          itemCard.onmouseenter = () => {
            if (!isSelected) itemCard.style.borderColor = 'var(--border-hover)';
          };
          itemCard.onmouseleave = () => {
            if (!isSelected) itemCard.style.borderColor = 'var(--border-subtle)';
          };
          itemCard.onclick = () => {
            selectedId = item.id;
            renderGridItems();
          };

          itemCard.innerHTML = `
            <img src="${getItemDataUrl(item.id)}" width="36" height="36" style="image-rendering: pixelated; margin-bottom: 6px;" />
            <span style="font-size: 0.72rem; font-weight: 600; text-align: center; color: var(--text-secondary); line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
              ${item.name}
            </span>
          `;
          grid.appendChild(itemCard);
        });
      };

      document.body.appendChild(overlay);
      renderModal();
    });
  }
}
