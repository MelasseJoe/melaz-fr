import {escapeHTML as e, coverURL, bookRows, dateLabel, parisToday, validDate, makeId, fallbackColors, editionLanguageGroup} from './core.mjs?v=20261112-editions-2';

const root = document.getElementById('bibliotheque');
const content = root.querySelector('.cl-content');
const gallery = document.createElement('div');
gallery.hidden = true;
content.before(gallery);
const addButton = root.querySelector('.cl-add');
const dialog = root.querySelector('.cl-remove-dialog');
const editionDialog = root.querySelector('.cl-edition-dialog');
const toast = root.querySelector('.cl-toast');
let books = [], today = parisToday(), view = 'gallery', selectedId = null, draft = null, busy = false, ready = false;
let results = [], lastQuery = '', searchController = null, searchGeneration = 0, removed = null, columnCount = columns();
let editionSession = null;
let pendingEdition = null;
let detailDraft = null;
let galleryAnchor = null;
let galleryDirty = true;
let coverAnimation = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function inViewport(rect) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

// Copie les pixels déjà affichés pour que la transition ne charge aucune image.
function coverPreview(cover) {
  const image = cover.querySelector('img.is-loaded, canvas.cl-cover-preview');
  if (!image) return null;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;
  const preview = document.createElement('canvas');
  preview.className = 'cl-book-image is-loaded cl-cover-preview';
  preview.setAttribute('aria-hidden', 'true');
  const scale = Math.min(1, 760 / Math.max(width, height));
  preview.width = Math.max(1, Math.round(width * scale));
  preview.height = Math.max(1, Math.round(height * scale));
  const context = preview.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, preview.width, preview.height);
  return preview;
}

function captureCover(cover, event) {
  if (reducedMotion.matches || !event.detail || !cover?.animate) return null;
  const rect = cover.getBoundingClientRect();
  if (!inViewport(rect)) return null;

  const copy = cover.cloneNode(false);
  copy.append(cover.querySelector('.cl-cover-fallback').cloneNode(true));
  const preview = coverPreview(cover);
  if (preview) copy.append(preview);
  else copy.classList.remove('has-image');
  return {copy, rect};
}

function moveCover(snapshot, target, duration) {
  if (!snapshot || !target) return;
  const {copy, rect: from} = snapshot;
  const to = target.getBoundingClientRect();
  if (!inViewport(to)) return;

  copy.classList.add('cl-cover-flight');
  copy.setAttribute('aria-hidden', 'true');
  Object.assign(copy.style, {
    left: from.left + 'px',
    top: from.top + 'px',
    width: from.width + 'px',
    height: from.height + 'px'
  });
  root.append(copy);
  target.classList.add('cl-cover-in-flight');
  const animation = copy.animate([
    {transform: 'none'},
    {transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`}
  ], {duration, easing: 'cubic-bezier(.77, 0, .175, 1)', fill: 'forwards'});
  coverAnimation = animation;
  const cleanup = () => {
    copy.remove();
    target.classList.remove('cl-cover-in-flight');
    if (coverAnimation === animation) coverAnimation = null;
  };
  animation.finished.then(cleanup, cleanup);
}

function columns() { return root.querySelector('.cl-stage').getBoundingClientRect().width <= 570 ? 2 : 4; }
async function request(action, data, signal) {
  const url = new URL('api.php', location.href); url.searchParams.set('action', action);
  if (action === 'search') url.searchParams.set('q', data);
  if (action === 'editions') {
    url.searchParams.set('work', data.workKey);
    url.searchParams.set('offset', String(data.offset));
    url.searchParams.set('group', data.group);
  }
  const mutation = data && !['search', 'editions'].includes(action);
  let response;
  try {
    response = await fetch(url, {method:mutation ? 'POST' : 'GET',credentials:'same-origin',cache:'no-store',signal:signal || AbortSignal.timeout(20000),headers:mutation ? {'Content-Type':'application/json','X-Hub-CSRF':window.HubSession.csrf} : {Accept:'application/json'},body:mutation ? JSON.stringify(data) : undefined});
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('La connexion a été interrompue. Réessaie : aucune modification ne sera ajoutée en double.');
  }
  if (response.status === 401) { location.replace(new URL('../../login.php?next=' + encodeURIComponent(location.pathname), location.href)); throw new Error('Connecte-toi pour continuer.'); }
  let reply;
  try { reply = await response.json(); } catch { throw new Error('La réponse du serveur n’a pas pu être lue. Réessaie dans un instant.'); }
  if (!response.ok) { const error = new Error(reply.error || 'La bibliothèque est momentanément indisponible.'); error.code = reply.code; throw error; }
  return reply;
}
function bookCover(book, size = 'M') {
  const [paper, print] = fallbackColors(book.title);
  const image = coverURL(book, size);
  const retina = image && size === 'M' ? ` srcset="${e(image)} 1x, ${e(coverURL(book,'L'))} 2x"` : '';
  return `<span class="cl-book" style="--paper:${paper};--print:${print}"><span class="cl-cover-fallback" aria-hidden="true"><span class="cl-fallback-author">${e(book.author)}</span><span class="cl-fallback-title">${e(book.title)}</span></span>${image ? `<img class="cl-book-image" src="${e(image)}"${retina} alt="" loading="${size === 'L' ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
}
function wireImages(target = content) {
  target.querySelectorAll('img.cl-book-image').forEach(image => {
    const loaded = () => {
      if (image.naturalWidth < 2 || image.naturalHeight < 2) { image.remove(); return; }
      const cover = image.parentElement;
      cover.style.setProperty('--ratio', String(image.naturalWidth / image.naturalHeight));
      cover.classList.add('has-image');
      image.classList.add('is-loaded');
      cover.querySelector('.cl-cover-preview')?.remove();
    };
    image.addEventListener('load', loaded, {once:true});
    image.addEventListener('error', () => image.remove(), {once:true});
    if (image.complete && image.naturalWidth) loaded();
  });
}
function headingFocus() {
  const title = (gallery.hidden ? content : gallery).querySelector('h1');
  if (title) { title.tabIndex = -1; title.focus({preventScroll:true}); }
}
function backMarkup(label = 'Tous mes livres') { return `<button class="cl-back" type="button"><span aria-hidden="true">←</span> ${label}</button>`; }
function cancelSearch() { searchGeneration++; searchController?.abort(); searchController = null; }
function setView(next, focus = true) {
  if (busy) return;
  coverAnimation?.cancel();
  if (next !== 'search') cancelSearch();
  view = next; render(); if (focus) headingFocus();
  // La fiche remplace la galerie dans le même document : ne pas garder son défilement.
  if (next === 'detail') window.scrollTo({top:0, left:0, behavior:'instant'});
}
function showToast(message, undo = false) { toast.hidden = false; toast.querySelector('span').textContent = message; toast.querySelector('.cl-undo').hidden = !undo; }
toast.querySelector('.cl-dismiss').onclick = () => { toast.hidden = true; };
function updateBook(book) {
  const index = books.findIndex(b => b.id === book.id);
  if (index >= 0) books[index] = book;
  else books.push(book);
  galleryDirty = true;
}
function galleryRows() {
  const collection = gallery.querySelector('.cl-collection');
  const focused = document.activeElement;
  const existing = new Map([...collection.querySelectorAll('[data-book]')].map(button => [button.dataset.book, button]));
  const shelves = document.createDocumentFragment();

  for (const row of bookRows(books, columns())) {
    const group = document.createElement('div');
    group.className = 'cl-shelf-group';
    group.innerHTML = '<div class="cl-shelf"></div><div class="cl-plank" aria-hidden="true"></div><div class="cl-caption-row"></div>';
    const shelf = group.querySelector('.cl-shelf');
    const captions = group.querySelector('.cl-caption-row');
    for (const book of row) {
      const button = existing.get(book.id) || document.createElement('button');
      button.type = 'button';
      button.className = 'cl-book-button';
      button.dataset.book = book.id;
      const date = dateLabel(book.date);
      button.setAttribute('aria-label', `Ouvrir ${book.title}, ${book.author}, terminé le ${date}`);
      const coverKey = JSON.stringify([coverURL(book), book.title, book.author]);
      if (button.dataset.coverKey !== coverKey) {
        button.dataset.coverKey = coverKey;
        button.innerHTML = bookCover(book);
        wireImages(button);
      }
      const item = button.parentElement || document.createElement('div');
      item.className = 'cl-item';
      if (!button.parentElement) item.append(button);
      shelf.append(item);

      const time = document.createElement('time');
      time.className = 'cl-date';
      time.dateTime = book.date;
      time.textContent = date;
      captions.append(time);
    }
    shelves.append(group);
  }
  collection.replaceChildren(shelves);
  const count = books.length;
  gallery.querySelector('.cl-count').textContent = `${count} ${count === 1 ? 'livre lu' : 'livres lus'}`;
  gallery.querySelector('.cl-empty').hidden = count > 0;
  galleryDirty = false;
  if (collection.contains(focused)) focused.focus({preventScroll:true});
}
function renderGallery() {
  if (!gallery.firstChild) {
    gallery.innerHTML = '<div class="cl-intro"><h1>Ma bibliothèque</h1><span class="cl-count"></span></div><div class="cl-collection"></div><section class="cl-empty" hidden><h2>Ton premier livre a sa place ici.</h2><p>Ajoute un livre que tu as terminé pour commencer ta bibliothèque.</p><button class="cl-primary" type="button" data-first>Ajouter mon premier livre</button></section>';
    gallery.querySelector('[data-first]').addEventListener('click', startAdd);
  }
  content.hidden = true;
  content.replaceChildren();
  gallery.hidden = false;
  if (galleryDirty) galleryRows();
}

gallery.addEventListener('click', event => {
  const button = event.target.closest('[data-book]');
  if (!button || busy || !ready) return;
  const cover = button.querySelector('.cl-book');
  const snapshot = captureCover(cover, event);
  const preview = coverPreview(cover);
  galleryAnchor = {id:button.dataset.book, top:button.getBoundingClientRect().top, scrollY:window.scrollY};
  selectedId = button.dataset.book;
  pendingEdition = null;
  detailDraft = null;
  setView('detail');

  const destination = content.querySelector('.cl-display .cl-book');
  if (preview && destination && !destination.classList.contains('has-image')) {
    destination.style.setProperty('--ratio', cover.style.getPropertyValue('--ratio'));
    destination.classList.add('has-image');
    destination.prepend(preview);
  }
  moveCover(snapshot, destination, 270);
});
function formStatus(message, alert = false) { const target = content.querySelector('.cl-form-status'); if (target) { target.textContent = message; target.setAttribute('role', alert ? 'alert' : 'status'); } }
function fieldValues() { return {date:content.querySelector('[name="date"]').value,note:content.querySelector('[name="note"]').value.trim()}; }
function validateFields(form) { if (!form.reportValidity()) return false; if (!validDate(form.elements.date.value, today)) { formStatus('Choisis une date de fin existante, au plus tard aujourd’hui.', true); return false; } return true; }
function lockForm(form, locked) { busy = locked; form.querySelectorAll('button').forEach(b => b.disabled = locked); form.querySelectorAll('input,textarea').forEach(f => f.readOnly = locked); addButton.disabled = locked || !ready; content.querySelector('.cl-back')?.toggleAttribute('disabled', locked); }
function noteFields(book) { return `<label class="cl-label">Terminé le<input class="cl-input" type="date" name="date" value="${e(book.date)}" min="1900-01-01" max="${today}" required></label><label class="cl-label">Ce que j’en garde<textarea class="cl-input" name="note" maxlength="2000" placeholder="Une idée, une émotion, une phrase…">${e(book.note)}</textarea></label>`; }
function renderDetail() {
  const book = books.find(b => b.id === selectedId); if (!book) { view = 'gallery'; renderGallery(); return; }
  const shown = {...book, ...pendingEdition, ...detailDraft};
  const reference = shown.editionKey || shown.workKey;
  const link = /^\/(?:works\/OL\d+W|books\/OL\d+M)$/.test(reference || '') ? `https://openlibrary.org${reference}` : null;
  content.innerHTML = `${backMarkup()}<div class="cl-detail"><div class="cl-display" role="img" aria-label="Couverture de ${e(shown.title)}">${bookCover(shown, 'L')}</div><section class="cl-details"><h1>${e(shown.title)}</h1><p class="cl-by">${e(book.author)}</p><form>${book.workKey ? '<button class="cl-quiet cl-pick-edition" type="button">Changer d’édition</button>' : ''}${noteFields(shown)}<div class="cl-actions"><button type="submit" class="cl-primary">Enregistrer</button><button class="cl-quiet cl-remove" type="button">Retirer le livre</button></div><p class="cl-form-status" role="status"></p></form>${link ? `<a class="cl-source" href="${link}" target="_blank" rel="noopener noreferrer">${shown.editionKey ? 'Voir cette édition sur Open Library' : 'Voir le livre sur Open Library'}</a>` : ''}</section></div>`;
  content.querySelector('.cl-pick-edition')?.addEventListener('click', () => {
    detailDraft = fieldValues();
    openEditionPicker(shown, edition => {
      pendingEdition = edition;
      render();
      formStatus('Édition sélectionnée. Enregistre la fiche pour la conserver.');
      content.querySelector('.cl-pick-edition').focus({preventScroll:true});
    });
  });
  content.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    if (busy || !validateFields(form)) return;
    const input = {id:book.id,revision:book.revision,...fieldValues()};
    if (pendingEdition) Object.assign(input, {editionKey:pendingEdition.editionKey, coverId:pendingEdition.coverId, title:pendingEdition.title});
    lockForm(form, true); formStatus('');
    try {
      const reply = await request('update', input);
      updateBook(reply.book);
      Object.assign(book, reply.book);
      pendingEdition = null;
      detailDraft = null;
      formStatus('Modifications enregistrées.');
    }
    catch (error) { formStatus(error.message, true); if (error.code === 'conflict') addReloadAction(form); }
    finally { lockForm(form, false); }
  };
  content.querySelector('.cl-remove').onclick = () => {
    dialog.querySelector('#remove-description').textContent = `« ${book.title} » sera retiré de ta collection. Tu pourras annuler juste après.`;
    dialog.querySelector('.cl-dialog-error').textContent = ''; dialog.showModal();
  };
  wireImages();
}
function addReloadAction(form) {
  if (form.querySelector('[data-reload]')) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'cl-quiet'; button.dataset.reload = ''; button.textContent = 'Recharger la bibliothèque'; button.onclick = () => load(); form.append(button);
}
function startAdd() { if (!ready || busy) return; lastQuery = ''; results = []; draft = null; setView('search'); content.querySelector('[name="query"]')?.focus({preventScroll:true}); }
function renderSearch() {
  content.innerHTML = `${backMarkup()}<section class="cl-search-page"><h1>Ajouter un livre</h1><form class="cl-search-form"><label class="cl-label">Titre, auteur ou ISBN<input class="cl-input" type="search" name="query" minlength="2" maxlength="160" autocomplete="off" value="${e(lastQuery)}" placeholder="Quel livre as-tu terminé ?" required></label><button type="submit" class="cl-primary">Rechercher</button></form><p class="cl-search-status" role="status"></p><div class="cl-search-results"></div><button class="cl-quiet cl-manual" type="button">Ajouter un livre manuellement</button></section>`;
  showResults();
  content.querySelector('.cl-manual').onclick = () => chooseBook({title:'',author:'',workKey:null,editionKey:null,coverId:null});
  content.querySelector('.cl-search-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    cancelSearch(); const generation = searchGeneration; searchController = new AbortController(); const controller = searchController;
    lastQuery = form.elements.query.value.trim(); if (lastQuery.length < 2) return;
    const status = content.querySelector('.cl-search-status'); const button = form.querySelector('button'); button.disabled = true; status.textContent = 'Recherche dans Open Library…'; status.setAttribute('role','status');
    results = []; content.querySelector('.cl-search-results').replaceChildren();
    try { const reply = await request('search', lastQuery, AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])); if (view !== 'search' || generation !== searchGeneration) return; results = reply.books; showResults(true); }
    catch (error) { if (view === 'search' && generation === searchGeneration && !controller.signal.aborted) { status.textContent = error.message; status.setAttribute('role','alert'); } }
    finally { if (view === 'search' && generation === searchGeneration) button.disabled = false; }
  };
}
function showResults(searched = false) {
  const target = content.querySelector('.cl-search-results'); if (!target) return;
  if (searched || results.length) content.querySelector('.cl-search-status').textContent = results.length ? `${results.length} ${results.length === 1 ? 'livre trouvé' : 'livres trouvés'}. Choisis le tien.` : 'Aucun livre trouvé. Essaie un autre titre, un ISBN ou la saisie manuelle.';
  target.innerHTML = results.map((book, i) => `<button class="cl-result" type="button" data-result="${i}" aria-label="Choisir ${e(book.title)}, ${e(book.author)}"><span class="cl-result-cover">${bookCover(book)}</span><span><span class="cl-result-title">${e(book.title)}</span><span class="cl-result-author">${e(book.author)}</span></span></button>`).join('');
  target.querySelectorAll('[data-result]').forEach(button => button.onclick = () => chooseBook(results[Number(button.dataset.result)]));
  wireImages(target);
}
function chooseBook(book) {
  draft = {...book,id:makeId(),date:today,note:''};
  setView('add');
  if (draft.workKey) pickDraftEdition();
}
function pickDraftEdition() {
  const form = content.querySelector('form');
  Object.assign(draft, fieldValues(), {title:form.elements.title.value.trim(), author:form.elements.author.value.trim()});
  openEditionPicker(draft, edition => {
    Object.assign(draft, edition);
    render();
    content.querySelector('.cl-pick-edition').focus({preventScroll:true});
  });
}
function renderAdd() {
  content.innerHTML = `${backMarkup('Rechercher un autre livre')}<div class="cl-form-wrap"><div class="cl-display" role="img" aria-label="Couverture du livre à ajouter">${bookCover({...draft,title:draft.title || 'Le titre de ton livre',author:draft.author || 'Son auteur'},'L')}</div><section><h1>Un livre de plus.</h1><form><label class="cl-label">Titre du livre<input class="cl-input" name="title" type="text" maxlength="200" value="${e(draft.title)}" required></label><label class="cl-label">Auteur ou autrice<input class="cl-input" name="author" type="text" maxlength="200" value="${e(draft.author)}" required></label>${draft.workKey ? '<button class="cl-quiet cl-pick-edition" type="button">Choisir l’édition</button>' : ''}${noteFields(draft)}<button class="cl-primary" type="submit">Ajouter à ma bibliothèque</button><p class="cl-form-status" role="status"></p></form></section></div>`;
  const form = content.querySelector('form');
  content.querySelector('.cl-pick-edition')?.addEventListener('click', pickDraftEdition);
  form.elements.title.oninput = event => { content.querySelector('.cl-fallback-title').textContent = event.target.value || 'Le titre de ton livre'; };
  form.elements.author.oninput = event => { content.querySelector('.cl-fallback-author').textContent = event.target.value || 'Son auteur'; };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || !validateFields(form)) return;
    Object.assign(draft, fieldValues(), {title:form.elements.title.value.trim(),author:form.elements.author.value.trim()});
    if (!draft.title || !draft.author) { formStatus('Renseigne un titre et un auteur.', true); return; }
    lockForm(form,true); formStatus('');
    try { const reply = await request('create', draft); updateBook(reply.book); busy = false; setView('gallery'); showToast('Livre ajouté à ta bibliothèque.'); }
    catch (error) { formStatus(error.message, true); }
    finally { busy = false; addButton.disabled = !ready; if (form.isConnected) lockForm(form, false); }
  };
  wireImages();
}

function languageLabel(code) {
  const languages = {fre:'Français',fra:'Français',fr:'Français',eng:'Anglais',en:'Anglais',ger:'Allemand',deu:'Allemand',spa:'Espagnol',ita:'Italien',por:'Portugais',jpn:'Japonais',chi:'Chinois',zho:'Chinois',rus:'Russe',ara:'Arabe',dut:'Néerlandais',nld:'Néerlandais'};
  return languages[code] || code.toUpperCase();
}
function editionDescription(edition) {
  return [edition.publisher, edition.publishDate, ...(edition.languages || []).map(languageLabel), edition.format].filter(Boolean).join(', ');
}
function renderEditionList(session) {
  const items = [...session.items];
  const selectedKey = session.book.editionKey;
  if (session.frenchComplete && selectedKey && !items.some(edition => edition.editionKey === selectedKey)) {
    items.unshift({...session.book, preferred:true});
  }
  const cards = items.map((edition, index) => {
    const description = editionDescription(edition) || (edition.preferred ? '' : 'Informations d’édition non renseignées');
    const selected = edition.editionKey === selectedKey;
    return `<button class="cl-edition-item" type="button" data-edition="${index}" aria-pressed="${selected}" aria-label="Choisir ${e(edition.title)}, ${e(description || 'édition sélectionnée')}${edition.isbn ? ', ISBN ' + e(edition.isbn) : ''}"><span class="cl-edition-cover">${bookCover({...edition,author:session.book.author})}</span><span class="cl-edition-info"><strong>${e(edition.title)}</strong>${selected ? '<span class="cl-edition-selected">Édition sélectionnée</span>' : ''}${description ? `<span>${e(description)}</span>` : ''}${edition.isbn ? `<span class="cl-edition-isbn">ISBN ${e(edition.isbn)}</span>` : ''}${!edition.coverId && !edition.preferred ? '<span class="cl-edition-missing">Couverture non renseignée</span>' : ''}</span></button>`;
  });
  const groups = [['fr', 'Éditions en français'], ['other', 'Autres langues'], ['unknown', 'Langue non renseignée']];
  editionDialog.querySelector('.cl-edition-list').innerHTML = groups.map(([group, label]) => {
    const indexes = items.map((edition, index) => editionLanguageGroup(edition) === group ? index : -1).filter(index => index >= 0);
    if (!indexes.length) return '';
    return `<h3 class="cl-edition-group-title">${label}</h3>` + indexes.map(index => cards[index]).join('');
  }).join('');
  editionDialog.querySelectorAll('[data-edition]').forEach(button => {
    button.onclick = () => {
      const edition = items[Number(button.dataset.edition)];
      editionDialog.close();
      session.select(edition);
    };
  });
  const status = editionDialog.querySelector('.cl-edition-status');
  status.setAttribute('role', session.error ? 'alert' : 'status');
  if (session.error) status.textContent = session.error;
  else if (session.loading) status.textContent = 'Chargement des éditions…';
  else if (!session.items.length) status.textContent = 'Aucune autre édition disponible dans le catalogue.';
  else if (session.total !== null) status.textContent = `${session.total} ${session.total === 1 ? 'édition répertoriée' : 'éditions répertoriées'}.`;
  else status.textContent = `${session.items.length} ${session.items.length === 1 ? 'édition chargée' : 'éditions chargées'}.`;
  const more = editionDialog.querySelector('.cl-edition-more');
  more.hidden = !session.loading && !session.error && session.nextGroup === null;
  more.disabled = session.loading;
  if (session.error) more.textContent = 'Réessayer';
  else if (session.nextGroup === 'fr') more.textContent = 'Voir les éditions françaises suivantes';
  else if (!session.otherStarted) more.textContent = 'Voir les autres langues';
  else more.textContent = 'Voir les éditions suivantes';
  wireImages(editionDialog);
}
async function loadEditions(session) {
  if (session.loading) return;
  session.loading = true;
  session.error = '';
  renderEditionList(session);
  session.controller = new AbortController();
  const group = session.nextGroup;
  let loadOtherLanguages = false;
  try {
    const signal = AbortSignal.any([session.controller.signal, AbortSignal.timeout(20000)]);
    if (group === 'other') session.otherStarted = true;
    const reply = await request('editions', {workKey:session.book.workKey, offset:session.nextOffset || 0, group}, signal);
    if (editionSession !== session || !editionDialog.open) return;
    for (const edition of reply.editions) {
      if (!session.items.some(item => item.editionKey === edition.editionKey)) session.items.push(edition);
    }
    session.total = reply.total ?? session.total;
    session.nextOffset = reply.nextOffset;
    session.nextGroup = reply.nextGroup;
    session.frenchComplete = session.nextGroup !== 'fr';
    loadOtherLanguages = group === 'fr' && session.items.length === 0 && session.nextGroup === 'other';
  } catch (error) {
    if (session.controller.signal.aborted) return;
    session.error = error.message;
  } finally {
    session.loading = false;
    if (editionSession === session && editionDialog.open) {
      renderEditionList(session);
      if (loadOtherLanguages) loadEditions(session);
    }
  }
}
function openEditionPicker(book, select) {
  if (busy) return;
  editionSession = {book:{...book},select,items:[],total:null,nextOffset:0,nextGroup:'fr',frenchComplete:false,otherStarted:false,loading:false,error:'',controller:null};
  editionDialog.querySelector('#edition-book').textContent = `${book.title} — ${book.author}`;
  editionDialog.showModal();
  loadEditions(editionSession);
}
editionDialog.querySelector('.cl-edition-close').onclick = () => editionDialog.close();
editionDialog.addEventListener('close', () => {
  editionSession?.controller?.abort();
  editionSession = null;
});
editionDialog.querySelector('.cl-edition-more').onclick = () => {
  if (editionSession) loadEditions(editionSession);
};

function render() {
  addButton.hidden = ['search','add'].includes(view);
  if (view === 'gallery') { renderGallery(); return; }
  gallery.hidden = true;
  content.hidden = false;
  if (view === 'detail') renderDetail(); else if (view === 'search') renderSearch(); else renderAdd();
  content.querySelector('.cl-back')?.addEventListener('click', event => {
    if (busy) return;
    if (view === 'add') { setView('search'); return; }
    const anchor = view === 'detail' ? galleryAnchor : null;
    const snapshot = anchor ? captureCover(content.querySelector('.cl-display .cl-book'), event) : null;
    galleryAnchor = null;
    setView('gallery', !anchor);
    if (!anchor) return;

    const book = gallery.querySelector(`[data-book="${CSS.escape(anchor.id)}"]`);
    const position = book ? window.scrollY + book.getBoundingClientRect().top - anchor.top : anchor.scrollY;
    window.scrollTo({top:position, left:0, behavior:'instant'});
    if (book) {
      book.focus({preventScroll:true});
      moveCover(snapshot, book.querySelector('.cl-book'), 210);
    } else {
      headingFocus();
    }
  });
}
addButton.onclick = startAdd;
dialog.querySelector('.cl-cancel').onclick = () => dialog.close();
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.querySelector('.cl-confirm').onclick = async () => {
  const book = books.find(b => b.id === selectedId); if (busy || !book) return;
  busy = true; dialog.querySelectorAll('button').forEach(button => button.disabled = true);
  try {
    const reply = await request('delete',{id:book.id,revision:book.revision}); removed = reply.book; books = books.filter(b => b.id !== book.id); galleryDirty = true; dialog.close(); busy = false; setView('gallery'); showToast('Livre retiré de ta bibliothèque.',true);
  } catch (error) { dialog.querySelector('.cl-dialog-error').textContent = error.message; }
  finally { busy = false; dialog.querySelectorAll('button').forEach(button => button.disabled = false); }
};
toast.querySelector('.cl-undo').onclick = async () => {
  if (!removed || busy) return;
  const button = toast.querySelector('.cl-undo'); busy = true; button.disabled = true; addButton.disabled = true;
  try { const reply = await request('restore',{id:removed.id,revision:removed.revision}); updateBook(reply.book); removed = null; if (view === 'gallery') render(); showToast('Livre remis dans ta bibliothèque.'); }
  catch (error) { toast.querySelector('span').textContent = error.message; }
  finally { busy = false; button.disabled = false; addButton.disabled = !ready; }
};
new ResizeObserver(() => {
  const count = columns();
  if (count === columnCount) return;
  columnCount = count;
  galleryDirty = true;
  if (ready && view === 'gallery') galleryRows();
}).observe(root.querySelector('.cl-stage'));
async function load() {
  if (busy) return;
  ready = false; addButton.disabled = true; content.setAttribute('aria-busy','true'); cancelSearch();
  try { await window.HubSession.ready; const reply = await request('list'); books = reply.books; galleryDirty = true; today = reply.today; ready = true; view = 'gallery'; render(); }
  catch (error) { gallery.hidden = true; content.hidden = false; content.innerHTML = `<div class="cl-intro"><h1>Ma bibliothèque</h1></div><div class="cl-notice" role="alert"><p>${e(error.message)}</p><button class="cl-primary" type="button">Réessayer</button></div>`; content.querySelector('.cl-notice button').onclick = () => load(); }
  finally { content.setAttribute('aria-busy','false'); addButton.disabled = !ready; }
}
await load();
