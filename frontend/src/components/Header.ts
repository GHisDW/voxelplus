export interface HeaderFilters {
  search: string;
  filter: 'all' | 'running' | 'favorites' | 'fabric';
  sort: 'recent' | 'name' | 'created' | 'version';
}

export interface HeaderEvents {
  onFilterChange: (filters: HeaderFilters) => void;
  onCreateInstance: () => void;
}

export class Header {
  private filters: HeaderFilters = {
    search: '',
    filter: 'all',
    sort: 'recent'
  };
  private events: HeaderEvents;
  private container: HTMLElement;

  constructor(events: HeaderEvents) {
    this.events = events;
    this.container = document.createElement('header');
    this.container.className = 'header';
  }

  public render(): HTMLElement {
    this.container.innerHTML = `
      <!-- Search & Filters -->
      <div style="display: flex; align-items: center; gap: 14px; flex: 1; max-width: 720px;">
        <div style="position: relative; flex: 1;">
          <input type="text" class="input-field" id="header-search" placeholder="Search your instances..." value="${this.filters.search}" style="padding-left: 36px;" />
          <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.9rem;">🔍</span>
        </div>

        <select class="select-field" id="header-filter" style="width: 140px;">
          <option value="all" ${this.filters.filter === 'all' ? 'selected' : ''}>All Instances</option>
          <option value="favorites" ${this.filters.filter === 'favorites' ? 'selected' : ''}>★ Favorites</option>
          <option value="running" ${this.filters.filter === 'running' ? 'selected' : ''}>● Running</option>
          <option value="fabric" ${this.filters.filter === 'fabric' ? 'selected' : ''}>Fabric</option>
        </select>

        <select class="select-field" id="header-sort" style="width: 150px;">
          <option value="recent" ${this.filters.sort === 'recent' ? 'selected' : ''}>Recent First</option>
          <option value="name" ${this.filters.sort === 'name' ? 'selected' : ''}>Name (A-Z)</option>
          <option value="created" ${this.filters.sort === 'created' ? 'selected' : ''}>Creation Date</option>
          <option value="version" ${this.filters.sort === 'version' ? 'selected' : ''}>MC Version</option>
        </select>
      </div>

      <!-- Action Button -->
      <div>
        <button class="btn btn-primary" id="btn-header-create">
          + CREATE INSTANCE
        </button>
      </div>
    `;

    const searchInput = this.container.querySelector('#header-search') as HTMLInputElement;
    searchInput.oninput = (e: any) => {
      this.filters.search = e.target.value;
      this.events.onFilterChange(this.filters);
    };

    const filterSelect = this.container.querySelector('#header-filter') as HTMLSelectElement;
    filterSelect.onchange = (e: any) => {
      this.filters.filter = e.target.value;
      this.events.onFilterChange(this.filters);
    };

    const sortSelect = this.container.querySelector('#header-sort') as HTMLSelectElement;
    sortSelect.onchange = (e: any) => {
      this.filters.sort = e.target.value;
      this.events.onFilterChange(this.filters);
    };

    const createBtn = this.container.querySelector('#btn-header-create') as HTMLButtonElement;
    createBtn.onclick = () => this.events.onCreateInstance();

    return this.container;
  }
}
