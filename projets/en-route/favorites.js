// Les favoris ne stockent que les identifiants ; les noms viennent du référentiel PRIM.
export function validateFavorites(value) {
  return Array.isArray(value) ? value.filter((item, index, list) => item && typeof item.line === 'string' && typeof item.stop === 'string' && item.line && item.stop && list.findIndex(other => other?.line === item.line) === index).slice(0, 3).map(({ line, stop }) => ({ line, stop })) : [];
}
export function prioritizeDisruptions(disruptions, favorites) {
  const ids = new Set(favorites.map(item => item.line));
  return disruptions.map((item, index) => ({ item, index, favorite: item.lines.some(line => ids.has(line.id)) }))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.index - b.index).map(({ item }) => item);
}

export class Favorites {
  constructor({ api, element, badge, drawTimes, save, onChange }) {
    Object.assign(this, { api, element, badge, drawTimes, save, onChange });
    this.items = []; this.entries = new Map(); this.active = ''; this.sequence = 0;
    this.region = document.querySelector('#favorites');
    this.tabs = document.querySelector('#favorite-tabs');
    this.panel = document.querySelector('#favorite-panel');
    this.editor = document.querySelector('#favorite-editor');
    this.status = document.querySelector('#favorite-status');
    this.manage = document.querySelector('#manage-favorites');
    this.manage.addEventListener('click', () => this.editor.hidden ? this.openEditor() : this.closeEditor());
    this.editor.addEventListener('submit', event => { event.preventDefault(); this.saveEditor(); });
    document.querySelector('#cancel-favorites').addEventListener('click', () => { this.closeEditor(); this.manage.focus(); });
  }
  async start(lines, saved) {
    this.lines = lines; this.items = validateFavorites(saved); this.manage.disabled = !lines.length;
    this.render();
    await this.refresh();
  }
  makeBadge(line) {
    const node = this.badge(line?.code || 'M');
    if (/^#[0-9a-f]{6}$/i.test(line?.color || '')) {
      node.style.backgroundColor = line.color; node.style.borderColor = line.color;
      node.style.color = /^#[0-9a-f]{6}$/i.test(line.textColor || '') ? line.textColor : '#ffffff';
    }
    return node;
  }
  render() {
    const focused = this.tabs.querySelector('button:focus')?.dataset.line;
    if (!this.items.some(item => item.line === this.active)) this.active = this.items[0]?.line || '';
    this.tabs.replaceChildren();
    this.items.forEach((item, index) => {
      const line = this.lines?.find(line => line.id === item.line);
      const entry = this.entries.get(item.line);
      const button = this.element('button', 'favorite-tab'); button.type = 'button'; button.id = `favorite-tab-${index}`;
      button.dataset.line = item.line; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(item.line === this.active));
      button.setAttribute('aria-controls', 'favorite-panel'); button.tabIndex = item.line === this.active ? 0 : -1;
      button.append(this.makeBadge(line), this.element('span', '', entry?.name || 'Arrêt favori'));
      button.addEventListener('click', () => { this.active = item.line; this.render(); });
      button.addEventListener('keydown', event => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!offset && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.items.length - 1 : (index + offset + this.items.length) % this.items.length;
        this.active = this.items[next].line; this.render(); this.tabs.children[next].focus();
      });
      this.tabs.append(button);
    });
    if (focused) [...this.tabs.children].find(button => button.dataset.line === focused)?.focus({ preventScroll: true });
    this.panel.replaceChildren();
    this.panel.removeAttribute('aria-labelledby'); this.panel.setAttribute('aria-busy', 'false');
    if (!this.items.length) {
      this.panel.append(this.element('p', 'favorite-empty', 'Vos lignes habituelles, à portée de main. Ajoutez jusqu’à trois lignes et choisissez un arrêt pour chacune.'));
      return;
    }
    const index = this.items.findIndex(item => item.line === this.active);
    this.panel.setAttribute('aria-labelledby', `favorite-tab-${index}`);
    const entry = this.entries.get(this.active);
    const title = this.element('div', 'mt-result-title');
    title.append(this.makeBadge(this.lines?.find(line => line.id === this.active)), this.element('span', 'mt-station-name', entry?.name || 'Votre arrêt favori'));
    this.panel.append(title);
    if (!entry || entry.loading && !entry.data) {
      this.panel.setAttribute('aria-busy', 'true');
      this.panel.append(this.element('p', 'departure-state', 'Consultation des prochains passages…')); return;
    }
    if (entry.error) { this.panel.append(this.element('p', 'departure-state', entry.error)); return; }
    const times = this.element('div', 'direction-list favorite-times');
    this.drawTimes(entry.data, times);
    this.panel.append(times);
    if (!entry.data?.directions?.length) this.panel.append(this.element('p', 'departure-state', 'Aucun prochain passage communiqué pour cet arrêt.'));
    const note = this.element('div', 'mt-time-note');
    const recorded = entry.data?.recordedAt || entry.data?.updatedAt;
    note.append(this.element('span', '', 'Horaires estimés, non garantis'), this.element('span', '', recorded ? `Relevé · ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(recorded))}` : ''));
    this.panel.append(note);
  }
  async refresh() {
    if (!this.items.length || this.loading) return;
    this.loading = true; const sequence = this.sequence;
    try {
      await Promise.allSettled(this.items.map(async item => {
        const entry = this.entries.get(item.line) || { stop: item.stop, name: '', data: null };
        entry.loading = true; this.entries.set(item.line, entry);
        try {
          if (!entry.name) {
            const result = await this.api('stops', { line: item.line });
            const stop = result.stops.find(stop => stop.id === item.stop);
            if (!stop) throw new Error('Cet arrêt n’est plus proposé sur la ligne. Modifiez ce favori.');
            entry.name = stop.name;
          }
          entry.data = await this.api('departures', { line: item.line, stop: item.stop }); entry.error = '';
        } catch (error) { entry.data = null; entry.error = error.message; }
        finally { entry.loading = false; if (sequence === this.sequence) this.render(); }
      }));
    } finally { this.loading = false; if (sequence !== this.sequence) await this.refresh(); }
  }
  closeEditor() { this.editor.hidden = true; this.manage.setAttribute('aria-expanded', 'false'); }
  openEditor() {
    if (!this.lines?.length) return;
    this.editor.querySelectorAll('button').forEach(node => { node.disabled = false; });
    this.editor.hidden = false; this.manage.setAttribute('aria-expanded', 'true'); this.status.textContent = '';
    const container = document.querySelector('#favorite-fields'); container.replaceChildren();
    this.rows = [0, 1, 2].map(index => {
      const row = this.element('div', 'favorite-edit-row');
      const lineLabel = this.element('label'); lineLabel.append(this.element('span', '', `Ligne ${index + 1}`));
      const lineSelect = this.element('select'); lineSelect.name = `favorite-line-${index}`;
      const empty = this.element('option', '', 'Aucune'); empty.value = ''; lineSelect.append(empty);
      this.lines.forEach(line => { const option = this.element('option', '', `Métro ${line.code}`); option.value = line.id; lineSelect.append(option); });
      lineLabel.append(lineSelect);
      const stopLabel = this.element('label'); stopLabel.append(this.element('span', '', 'Arrêt'));
      const stopSelect = this.element('select'); stopSelect.name = `favorite-stop-${index}`; stopLabel.append(stopSelect);
      const error = this.element('p', 'favorite-row-error'); error.setAttribute('role', 'status');
      row.append(lineLabel, stopLabel, error); container.append(row);
      let sequence = 0;
      const load = async preferred => {
        const current = ++sequence, line = lineSelect.value;
        error.textContent = ''; stopSelect.replaceChildren(); stopSelect.disabled = true;
        const placeholder = this.element('option', '', line ? 'Recherche des arrêts…' : 'Choisir une ligne'); placeholder.value = ''; stopSelect.append(placeholder);
        if (!line) return;
        try {
          const result = await this.api('stops', { line });
          if (current !== sequence) return;
          placeholder.textContent = 'Choisir un arrêt';
          result.stops.forEach(stop => { const option = this.element('option', '', stop.name); option.value = stop.id; stopSelect.append(option); });
          stopSelect.disabled = false;
          if (result.stops.some(stop => stop.id === preferred)) stopSelect.value = preferred;
        } catch (err) { if (current === sequence) { placeholder.textContent = 'Arrêts indisponibles'; error.textContent = err.message + ' Sélectionnez à nouveau la ligne pour réessayer.'; } }
      };
      lineSelect.addEventListener('change', () => load()); lineSelect.value = this.items[index]?.line || ''; load(this.items[index]?.stop);
      return { lineSelect, stopSelect };
    });
    this.rows[0].lineSelect.focus({ preventScroll: true });
  }
  async saveEditor() {
    const items = this.rows.filter(row => row.lineSelect.value).map(row => ({ line: row.lineSelect.value, stop: row.stopSelect.disabled ? '' : row.stopSelect.value }));
    if (items.some(item => !item.stop)) { this.status.textContent = 'Choisissez un arrêt pour chaque ligne sélectionnée.'; return; }
    if (new Set(items.map(item => item.line)).size !== items.length) { this.status.textContent = 'Choisissez trois lignes différentes au maximum.'; return; }
    const button = document.querySelector('#save-favorites'); button.disabled = true;
    this.editor.querySelectorAll('select,button').forEach(node => { node.disabled = true; }); this.manage.disabled = true;
    this.status.textContent = 'Enregistrement…';
    try {
      await this.save(items);
      ++this.sequence; this.items = items; this.entries.clear(); this.closeEditor();
      this.status.textContent = 'Favoris enregistrés.'; this.render(); this.onChange();
      this.manage.disabled = false; this.manage.focus({ preventScroll: true }); await this.refresh();
    } catch (error) {
      this.status.textContent = 'Les favoris n’ont pas pu être enregistrés. Réessayez.';
      this.editor.querySelectorAll('button').forEach(node => { node.disabled = false; });
      this.rows.forEach(({ lineSelect, stopSelect }) => { lineSelect.disabled = false; stopSelect.disabled = stopSelect.options.length < 2; });
    } finally { button.disabled = false; this.manage.disabled = false; }
  }
}
