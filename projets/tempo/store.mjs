import { validDate } from './core.mjs';

export class TempoStore {
  constructor(endpoint = './api.php') {
    this.endpoint = endpoint;
    this.csrf = null;
  }

  async request(options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(this.endpoint, {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
      });
      let data;
      try { data = await response.json(); }
      catch { throw new Error('Le serveur ne renvoie pas de données valides. Vérifie que PHP est activé.'); }
      if (response.status === 401 && typeof window !== 'undefined' && window.HubSession) {
        location.replace(new URL('login.php?next=' + encodeURIComponent(location.pathname), window.HubSession.base));
      }
      if (!response.ok) throw new Error(data.error || 'Le serveur est indisponible.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Le serveur met trop de temps à répondre. Réessaie.');
      if (error instanceof TypeError) throw new Error('Connexion interrompue. Tes modifications ne sont pas encore enregistrées.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async load() {
    const data = await this.request();
    if (!Array.isArray(data.days) || !data.days.every(validDate) || !validDate(data.today)
      || typeof data.csrf !== 'string' || !data.csrf) throw new Error('Les données du serveur sont invalides.');
    this.csrf = data.csrf;
    return data;
  }

  async setDay(date, active) {
    if (!this.csrf) throw new Error('Recharge les données avant de saisir une séance.');
    if (!validDate(date) || typeof active !== 'boolean') throw new Error('Choisis une date valide.');
    const data = await this.request({
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tempo-CSRF': this.csrf },
      body: JSON.stringify({ date, active }),
    });
    if (data.date !== date || data.active !== active) throw new Error('Le serveur n’a pas confirmé la sauvegarde. Réessaie.');
    return data;
  }
}
