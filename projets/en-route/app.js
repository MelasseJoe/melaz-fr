const $ = selector => document.querySelector(selector);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const clock = value => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(value));
const duration = seconds => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
};
const state = { configured: false, lines: [], stops: [], data: null, lineSequence: 0, selectionSequence: 0, controller: null, lastTraffic: 0, lastMessages: 0, refreshing: false };
const preferenceKey = 'en-route-selection-v1';
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch { /* Navigation privée. */ }
const remember = () => {
  preferences = { line: $('#line').value, stop: $('#stop').value };
  try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Le site reste utilisable. */ }
};

async function api(action, params = {}, { signal, body } = {}) {
  const url = new URL('./api.php', import.meta.url);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, action === 'traffic' ? 85000 : 30000);
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('Le serveur ne renvoie pas de données exploitables.'); }
    if (!response.ok) {
      const error = new Error(payload.error || 'La recherche est indisponible pour le moment.');
      error.code = payload.code;
      throw error;
    }
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Recherche remplacée', 'AbortError');
    if (error.name === 'AbortError') throw new Error('La réponse prend trop de temps. Réessaie dans un instant.');
    if (error instanceof TypeError) throw new Error('La connexion au serveur est interrompue. Réessaie.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function options(select, rows, preferred, placeholder) {
  select.replaceChildren();
  if (!rows.length) {
    const option = element('option', '', placeholder);
    option.value = '';
    select.append(option);
    select.disabled = true;
    return;
  }
  rows.forEach(row => {
    const option = element('option', '', row.name ?? row.code);
    option.value = row.id;
    select.append(option);
  });
  if (rows.some(row => row.id === preferred)) select.value = preferred;
  select.disabled = false;
}

function setConnection(copy) { $('#connection-state').textContent = copy; }
function lineBadge(code) { return element('span', 'mt-line', code || 'M'); }
function setSelectionTitle() {
  const line = state.lines.find(line => line.id === $('#line').value);
  const card = $('.mt-departures');
  if (/^#[0-9a-f]{6}$/i.test(line?.color || '')) {
    card.style.setProperty('--mt-accent', line.color);
    card.style.setProperty('--route-color', line.color);
    card.style.setProperty('--route-label', /^#[0-9a-f]{6}$/i.test(line.textColor || '') ? line.textColor : '#ffffff');
    card.dataset.lineColor = 'true';
  } else {
    ['--mt-accent', '--route-color', '--route-label'].forEach(name => card.style.removeProperty(name));
    delete card.dataset.lineColor;
  }
  $('#result-badge').textContent = line?.code || 'M';
  $('#station-name').textContent = state.stops.find(stop => stop.id === $('#stop').value)?.name || 'Votre prochain métro';
}

function drawTimes() {
  const container = $('#departure-times');
  container.replaceChildren();
  const now = Date.now();
  const recorded = state.data?.recordedAt || state.data?.updatedAt;
  const old = recorded && now - new Date(recorded).getTime() > 300000;
  const groups = state.data?.directions || [];
  groups.forEach(group => {
    const section = element('section', 'direction-passages');
    section.setAttribute('aria-label', `Direction ${group.name}`);
    section.append(element('h3', 'direction-heading', `→ ${group.name}`));
    const departures = old ? [] : group.departures.filter(item => new Date(item.time).getTime() >= now - 30000);
    const counts = element('div', 'mt-counts');
    const following = element('div', 'mt-following');
    for (let index = 0; index < 3; index++) {
      const item = departures[index];
      const value = item ? String(Math.max(0, Math.ceil((new Date(item.time).getTime() - now) / 60000))) : '—';
      const block = element('div', index === 0 ? 'mt-primary-time' : 'wait-item');
      block.append(element('span', '', value), element('small', '', 'min'));
      if (index === 0) counts.append(block); else following.append(block);
    }
    counts.append(following);
    section.append(counts);
    const first = departures[0];
    let note = 'Aucun prochain passage communiqué pour ce sens.';
    if (old) note = 'Horaires anciens · actualisez pour consulter les passages.';
    else if (first) {
      note = `${first.atStop ? 'À quai · départ annoncé' : first.realtime ? 'Arrivée estimée' : 'Horaire théorique'} · ${clock(first.time)}`;
      if (first.platform) note += ` · Quai ${first.platform}`;
      if (departures.some(item => !item.realtime)) note += ' · Certains horaires sont théoriques';
    }
    section.append(element('p', 'direction-note', note));
    container.append(section);
  });
  $('#direction-name').textContent = groups.length ? 'Prochains passages · tous les sens' : 'Choisissez une ligne et un arrêt.';
  const notes = [];
  if (state.data && !groups.length) notes.push('Aucun prochain passage communiqué pour cette station.');
  if (state.data?.cancelled) notes.push(`${state.data.cancelled} passage(s) supprimé(s) dans les données de cet arrêt.`);
  $('#departure-state').textContent = notes.join(' ') || (state.data ? '' : 'Les prochains passages s’afficheront ici.');
}

async function loadDepartures(sequence, signal) {
  $('#passages').setAttribute('aria-busy', 'true');
  try {
    const data = await api('departures', { line: $('#line').value, stop: $('#stop').value }, { signal });
    if (sequence !== state.selectionSequence) return;
    state.data = data;
    $('#departure-update').textContent = `Relevé · ${clock(data.recordedAt || data.updatedAt)}`;
    drawTimes();
    remember();
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== state.selectionSequence) return;
    state.data = null;
    drawTimes();
    $('#departure-state').textContent = error.message;
    $('#departure-update').textContent = 'Données indisponibles';
  } finally {
    if (sequence === state.selectionSequence) $('#passages').setAttribute('aria-busy', 'false');
  }
}

async function loadMessages(sequence, signal) {
  const region = $('.mt-messages');
  region.setAttribute('aria-busy', 'true');
  try {
    const data = await api('messages', { line: $('#line').value, stop: $('#stop').value }, { signal });
    if (sequence !== state.selectionSequence) return;
    const container = $('#screen-messages');
    container.replaceChildren();
    data.messages.forEach(message => {
      const entry = element('div', 'message-entry');
      const copy = element('p', 'mt-message-copy');
      copy.append(element('span', 'mt-message-tag', message.channel), document.createTextNode(message.text));
      const scope = message.scope === 'stop' ? 'Station et ligne sélectionnées' : 'Ligne sélectionnée';
      entry.append(copy, element('p', 'mt-message-scope', `${scope} · tous sens, sauf indication dans le texte`));
      container.append(entry);
    });
    if (!data.messages.length) container.append(element('p', 'mt-message-copy', 'Aucun message communiqué pour cet arrêt ou cette ligne.'));
    $('#message-update').textContent = `Relevé · ${clock(data.updatedAt)}${data.warnings.length ? ' · Informations partielles : ' + data.warnings.join(' ') : ''}`;
    state.lastMessages = Date.now();
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== state.selectionSequence) return;
    $('#screen-messages').replaceChildren(element('p', 'mt-message-copy', error.message));
    $('#message-update').textContent = 'Les messages ne sont pas disponibles pour le moment.';
  } finally {
    if (sequence === state.selectionSequence) region.setAttribute('aria-busy', 'false');
  }
}

async function loadSelection() {
  state.controller?.abort();
  state.controller = new AbortController();
  const sequence = ++state.selectionSequence;
  state.data = null;
  setSelectionTitle();
  drawTimes();
  $('#departure-state').textContent = 'Consultation des prochains passages…';
  $('#departure-update').textContent = 'Recherche en cours';
  $('#screen-messages').replaceChildren(element('p', 'mt-message-copy', 'Consultation des messages de cette station…'));
  $('#message-update').textContent = 'Tous sens, sauf indication dans le message.';
  await Promise.allSettled([loadDepartures(sequence, state.controller.signal), loadMessages(sequence, state.controller.signal)]);
}

async function loadStops(preferred) {
  const sequence = ++state.lineSequence;
  state.controller?.abort();
  ++state.selectionSequence;
  state.data = null;
  state.stops = [];
  drawTimes();
  options($('#stop'), [], '', 'Recherche des arrêts…');
  remember();
  $('#passages').setAttribute('aria-busy', 'false');
  $('.mt-messages').setAttribute('aria-busy', 'false');
  setSelectionTitle();
  $('#direction-name').textContent = 'Recherche des arrêts de cette ligne…';
  $('#screen-messages').replaceChildren(element('p', 'mt-message-copy', 'Choisissez un arrêt pour consulter ses messages.'));
  $('#message-update').textContent = 'Tous sens, sauf indication dans le message.';
  $('#departure-state').textContent = 'Recherche des arrêts de cette ligne…';
  $('#departure-update').textContent = 'En attente du choix d’un arrêt';
  const line = $('#line').value;
  try {
    const data = await api('stops', { line });
    if (sequence !== state.lineSequence) return;
    state.stops = data.stops;
    const initial = state.stops.some(stop => stop.id === preferred) ? preferred : '';
    options($('#stop'), state.stops, initial, 'Aucun arrêt disponible');
    if (initial) await loadSelection();
    else {
      if (state.stops.length) {
        const placeholder = element('option', '', 'Choisir un arrêt');
        placeholder.value = '';
        placeholder.disabled = true;
        $('#stop').prepend(placeholder);
        $('#stop').value = '';
      }
      setSelectionTitle();
      $('#direction-name').textContent = 'Choisissez un arrêt pour afficher les deux sens.';
      $('#departure-state').textContent = state.stops.length ? 'Choisissez un arrêt pour consulter les prochains passages.' : 'Aucun arrêt n’a été communiqué pour cette ligne.';
    }
  } catch (error) {
    if (sequence !== state.lineSequence) return;
    options($('#stop'), [], '', 'Arrêts indisponibles');
    $('#departure-state').textContent = error.message;
  }
}

async function loadTraffic() {
  $('.mt-traffic').setAttribute('aria-busy', 'true');
  const open = new Set([...$('.mt-traffic').querySelectorAll('details[data-id][open]')].map(item => item.dataset.id));
  try {
    const data = await api('traffic');
    $('#traffic-list').replaceChildren();
    $('#traffic-rest').replaceChildren();
    data.disruptions.forEach((item, index) => {
      const detail = element('details', 'mt-alert');
      detail.dataset.id = item.id;
      detail.open = open.has(item.id);
      const summary = element('summary');
      const badges = element('span', 'alert-badges');
      item.lines.forEach(line => {
        const badge = lineBadge(`${line.mode && !/métro|metro/i.test(line.mode) ? line.mode + ' ' : ''}${line.code}`);
        if (/^#[0-9a-f]{6}$/i.test(line.color || '')) {
          badge.style.backgroundColor = line.color;
          badge.style.borderColor = line.color;
          badge.style.color = /^#[0-9a-f]{6}$/i.test(line.textColor || '') ? line.textColor : '#ffffff';
        }
        badges.append(badge);
      });
      if (!item.lines.length) badges.append(lineBadge('Info'));
      const copy = element('span');
      copy.append(element('strong', '', item.title), element('small', '', item.scope || 'Informations réseau'));
      const plus = element('span', '', '+');
      plus.setAttribute('aria-hidden', 'true');
      summary.append(badges, copy, plus);
      detail.append(summary);
      item.messages.forEach(message => detail.append(element('p', '', message)));
      if (!item.messages.length) detail.append(element('p', '', 'Aucun détail supplémentaire communiqué par l’opérateur.'));
      (index < 3 ? $('#traffic-list') : $('#traffic-rest')).append(detail);
    });
    $('#traffic-more').hidden = data.disruptions.length <= 3;
    $('#traffic-more>summary').textContent = `Voir les ${data.disruptions.length} perturbations en cours`;
    $('#traffic-title').textContent = `Perturbations en cours${data.disruptions.length ? ' · ' + data.disruptions.length : ''}`;
    $('#traffic-state').textContent = data.disruptions.length ? '' : 'Aucune perturbation en cours signalée dans les données reçues.';
    $('#traffic-update').textContent = `Métro & RER · relevé ${clock(data.updatedAt)}`;
    state.lastTraffic = Date.now();
  } catch (error) {
    $('#traffic-list').replaceChildren();
    $('#traffic-rest').replaceChildren();
    $('#traffic-more').hidden = true;
    $('#traffic-state').textContent = error.message;
    $('#traffic-update').textContent = 'Métro & RER · données indisponibles';
  } finally { $('.mt-traffic').setAttribute('aria-busy', 'false'); }
}

const fields = {};
function setupPlaceField(name) {
  const input = $(`#${name}`);
  const list = $(`#${name}-suggestions`);
  const help = $(`#${name}-help`);
  const field = { input, list, help, selected: null, timer: null, controller: null, sequence: 0 };
  fields[name] = field;
  input.addEventListener('input', () => {
    field.selected = null;
    clearTimeout(field.timer);
    field.controller?.abort();
    const sequence = ++field.sequence;
    list.hidden = true;
    list.replaceChildren();
    const query = input.value.trim();
    help.textContent = query.length < 3 ? 'Saisissez au moins 3 caractères.' : 'Recherche de lieux…';
    if (query.length < 3) return;
    field.timer = setTimeout(async () => {
      field.controller = new AbortController();
      try {
        const data = await api('places', { q: query }, { signal: field.controller.signal });
        if (sequence !== field.sequence) return;
        list.replaceChildren();
        data.places.forEach(place => {
          const item = element('li');
          const button = element('button', '', place.name);
          button.type = 'button';
          button.append(element('small', '', ({ stop_area: 'Station / gare', address: 'Adresse', poi: 'Lieu' })[place.type] || 'Lieu'));
          button.addEventListener('click', () => {
            field.selected = place;
            input.value = place.name;
            list.hidden = true;
            help.textContent = 'Lieu sélectionné.';
            input.focus({ preventScroll: true });
          });
          button.addEventListener('keydown', event => {
            const buttons = [...list.querySelectorAll('button')];
            const index = buttons.indexOf(button);
            if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
            if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + buttons.length - 1) % buttons.length].focus(); }
            if (event.key === 'Escape') { list.hidden = true; input.focus(); }
          });
          item.append(button);
          list.append(item);
        });
        list.hidden = !data.places.length;
        help.textContent = data.places.length ? 'Choisissez un lieu dans les suggestions.' : 'Aucun lieu trouvé. Précisez votre recherche.';
      } catch (error) {
        if (sequence !== field.sequence || error.name === 'AbortError') return;
        help.textContent = error.message;
      }
    }, 550);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !list.hidden) { event.preventDefault(); list.querySelector('button')?.focus(); }
    if (event.key === 'Escape') list.hidden = true;
  });
}
setupPlaceField('from');
setupPlaceField('to');
document.addEventListener('pointerdown', event => {
  Object.values(fields).forEach(field => { if (!field.input.closest('.place-field').contains(event.target)) field.list.hidden = true; });
});

function drawJourneys(journeys) {
  const container = $('#journey-results');
  container.replaceChildren();
  if (!journeys.length) {
    container.append(element('p', 'mt-trip-note', 'Aucun itinéraire disponible entre ces lieux pour un départ maintenant.'));
    return;
  }
  journeys.forEach((journey, index) => {
    const option = element('section', 'journey-option');
    if (journeys.length > 1) option.append(element('span', 'mt-index', index === 0 ? 'VOTRE TRAJET' : `AUTRE POSSIBILITÉ · ${index + 1}`));
    const title = element('div', 'mt-trip-duration');
    title.append(element('strong', '', duration(journey.duration)), element('span', '', journey.departure && journey.arrival ? `${clock(journey.departure)} → ${clock(journey.arrival)}` : 'Départ maintenant'));
    option.append(title);
    const route = element('div', 'journey-route');
    const transit = journey.sections.filter(section => section.type === 'public_transport');
    transit.forEach((section, position) => {
      if (position) route.append(element('span', 'mode-label', '→'));
      route.append(lineBadge(section.line || section.mode || 'Transport'));
    });
    if (!transit.length) route.append(element('span', 'mode-label', 'À pied'));
    option.append(route);
    const meta = element('div', 'mt-trip-meta');
    meta.append(element('span', '', journey.transfers ? `${journey.transfers} correspondance${journey.transfers > 1 ? 's' : ''}` : 'Sans correspondance'));
    if (journey.walking) meta.append(element('span', '', `${duration(journey.walking)} à pied`));
    option.append(meta);
    if (journey.status) option.append(element('p', 'mt-trip-note', `Trajet concerné par une perturbation · ${journey.status}`));
    const details = element('details', 'journey-steps');
    details.open = index === 0;
    details.append(element('summary', '', 'Le trajet, étape par étape'));
    const steps = element('ol');
    journey.sections.forEach(section => {
      const step = element('li');
      const times = section.departure && section.arrival ? `${clock(section.departure)} → ${clock(section.arrival)} · ` : '';
      step.append(element('span', 'step-time', `${times}${duration(section.duration)}`));
      if (section.type === 'public_transport') {
        step.append(element('strong', '', `${section.mode || 'Transport'} ${section.line}`.trim()), document.createTextNode(` · ${section.from} → ${section.to}`));
        if (section.direction) step.append(element('span', 'step-direction', `Direction ${section.direction}${section.stops ? ' · ' + section.stops + ' arrêt' + (section.stops > 1 ? 's' : '') : ''}`));
      } else if (section.type === 'waiting') step.append(document.createTextNode('Attente avant le prochain départ'));
      else if (section.type === 'transfer') step.append(document.createTextNode(`Correspondance à pied${section.to ? ' vers ' + section.to : ''}`));
      else step.append(document.createTextNode(`À pied${section.from ? ' · ' + section.from : ''}${section.to ? ' → ' + section.to : ''}`));
      steps.append(step);
    });
    details.append(steps);
    option.append(details);
    container.append(option);
  });
}

$('#journey-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#journey-error').textContent = '';
  if (!fields.from.selected || !fields.to.selected) {
    $('#journey-error').textContent = 'Choisissez le départ et l’arrivée dans les suggestions.';
    (!fields.from.selected ? fields.from.input : fields.to.input).focus();
    return;
  }
  if (fields.from.selected.id === fields.to.selected.id) { $('#journey-error').textContent = 'Choisissez deux lieux différents.'; return; }
  $('#plan').disabled = true;
  $('#plan>span').textContent = 'Calcul de votre itinéraire…';
  $('#journey-results').setAttribute('aria-busy', 'true');
  try {
    const data = await api('journeys', {}, { body: { from: fields.from.selected.id, to: fields.to.selected.id } });
    drawJourneys(data.journeys);
  } catch (error) {
    $('#journey-error').textContent = error.message;
    $('#journey-results').replaceChildren(element('p', 'mt-trip-note', 'Aucun résultat pour cette recherche.'));
  } finally {
    $('#plan').disabled = !state.configured;
    $('#plan>span').textContent = 'Calculer mon itinéraire';
    $('#journey-results').setAttribute('aria-busy', 'false');
  }
});

function disconnected() {
  state.configured = false;
  setConnection('La connexion PRIM n’est pas encore activée.');
  $('#traffic-state').textContent = 'Les informations réseau apparaîtront une fois la connexion activée.';
  $('.mt-traffic').setAttribute('aria-busy', 'false');
  $('#departure-state').textContent = 'Les prochains passages seront disponibles après activation de la connexion.';
  $('#message-update').textContent = 'En attente de la connexion aux données.';
  $('#from-help').textContent = 'La recherche sera disponible une fois les données connectées.';
}

async function connect() {
  const status = await api('status');
  if (!status.configured) { disconnected(); return; }
  state.configured = true;
  Object.values(fields).forEach(field => { field.input.disabled = false; field.help.textContent = ''; });
  $('#plan').disabled = false;
  setConnection('Informations voyageurs · actualisation automatique');
  const traffic = loadTraffic();
  try {
    const data = await api('lines');
    state.lines = data.lines;
    const initial = preferences.line || state.lines.find(line => line.code === '14')?.id;
    options($('#line'), state.lines.map(line => ({ ...line, name: line.code })), initial, 'Aucune ligne');
    if ($('#line').value) await loadStops(preferences.stop);
    else $('#departure-state').textContent = 'Aucune ligne de métro n’a été communiquée.';
  } catch (error) { setConnection(error.message); $('#departure-state').textContent = error.message; }
  await traffic;
}

$('#line').addEventListener('change', () => { loadStops(); });
$('#stop').addEventListener('change', () => { remember(); loadSelection(); });
$('#refresh').addEventListener('click', async () => {
  if (state.refreshing) return;
  state.refreshing = true;
  $('#refresh').disabled = true;
  try {
    if (!state.configured || !state.lines.length || !$('#stop').value) await connect();
    else await Promise.allSettled([loadDepartures(state.selectionSequence, state.controller?.signal), loadMessages(state.selectionSequence, state.controller?.signal), loadTraffic()]);
  } catch (error) { setConnection(error.message); }
  finally { state.refreshing = false; $('#refresh').disabled = false; }
});

let polling = false;
async function poll() {
  if (polling || document.hidden || !state.configured || !$('#stop').value) return;
  polling = true;
  try {
    const requests = [loadDepartures(state.selectionSequence, state.controller?.signal)];
    if (Date.now() - state.lastMessages > 180000) requests.push(loadMessages(state.selectionSequence, state.controller?.signal));
    if (Date.now() - state.lastTraffic > 300000) requests.push(loadTraffic());
    await Promise.allSettled(requests);
  } finally { polling = false; }
}
setInterval(poll, 65000);
setInterval(() => { if (!document.hidden && state.data) drawTimes(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
function updateClock() {
  const now = new Date();
  $('#page-clock').dateTime = now.toISOString();
  $('#page-clock').textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(now);
}
updateClock();
setInterval(updateClock, 60000);
connect().catch(error => { setConnection(error.message); $('#traffic-state').textContent = 'Les informations réseau ne peuvent pas être chargées.'; $('.mt-traffic').setAttribute('aria-busy', 'false'); $('#departure-state').textContent = error.message; });
