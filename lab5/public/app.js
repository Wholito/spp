const $ = selector => document.querySelector(selector);
const format = value => new Intl.NumberFormat('ru-RU').format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const labels = { universities: 'Университеты', countries: 'Страны', cities: 'Города', favorites: 'Избранное', sources: 'Источники', monitor: 'Мониторинг', explorer: 'GraphQL Explorer' };
const state = { tab: 'universities', page: 1, pages: 1, countries: [], rows: [], version: 0, detailVersion: 0 };
const examples = {
  nested: {
    query: `query CountryJourney($id: ID!) {
  country(id: $id) {
    id
    name
    localName
    region
    capital
    languages
    cities(page: { size: 5 }) {
      total
      nodes {
        name
        subcountry
      }
    }
    universities(page: { size: 5 }) {
      total
      nodes {
        name
        domains
        country {
          name
          region
        }
      }
    }
  }
}`,
    variables: { id: 'BY' },
  },
  search: {
    query: `query FindUniversities($filter: UniversityFilter, $page: PageInput) {
  universities(filter: $filter, page: $page, sort: NAME_ASC) {
    total
    pageInfo {
      number
      totalPages
      hasNextPage
    }
    nodes {
      ...UniversityCard
    }
  }
}

fragment UniversityCard on University {
  id
  name
  domains
  country {
    id
    name
    localName
  }
}`,
    variables: { filter: { search: 'technology', countryId: 'US' }, page: { number: 1, size: 5 } },
  },
  aliases: {
    query: `query Compare($details: Boolean!) {
  europe: countries(filter: { region: "Europe" }, page: { size: 3 }) {
    total
    nodes {
      name
      area
      languages @include(if: $details)
    }
  }
  asia: countries(filter: { region: "Asia" }, page: { size: 3 }) {
    total
    nodes {
      name
      area
      languages @include(if: $details)
    }
  }
}`,
    variables: { details: true },
  },
  mutation: {
    query: `mutation SaveUniversity($id: ID!, $enabled: Boolean!, $note: String) {
  setFavorite(universityId: $id, enabled: $enabled, note: $note) {
    id
    name
    favorite {
      note
      updatedAt
    }
  }
}`,
    variables: { id: 'Вставьте ID университета из каталога', enabled: true, note: 'Хочу узнать об этом университете больше' },
  },
  monitor: {
    query: `query SystemPulse {
  monitor {
    requests
    errors
    rejected
    active
    cacheHits
    p95Ms
    uptimeSeconds
    traces {
      id
      operation
      durationMs
      cached
      error
      spans {
        service
        durationMs
        ok
      }
    }
  }
}`,
    variables: {},
  },
};

function notice(message = '') {
  $('#notice').hidden = !message;
  $('#notice').textContent = message;
}

async function graphql(query, variables = {}, { partial = false } = {}) {
  const response = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const result = await response.json();
  if (result.errors?.length && !partial) throw new Error(result.errors.map(error => error.message).join(' '));
  return result;
}

function makeQuery() {
  const type = state.tab === 'favorites' ? 'universities' : state.tab;
  const fields = type === 'countries'
    ? ['id', 'name', 'localName', 'region', 'capital', 'area']
    : ['id', 'name'];

  if (type === 'cities') fields.push('subcountry');
  if (type === 'universities') {
    fields.push('state', `favorite {
    note
  }`);
  }
  if (type !== 'countries' && $('#include-country').checked) {
    fields.push(`country {
    id
    name
    localName
    region
  }`);
  }
  if (type === 'universities' && $('#include-domains').checked) fields.push('domains');
  const input = type === 'countries' ? 'CountryFilter' : type === 'cities' ? 'CityFilter' : 'UniversityFilter';
  return `query Browse($filter: ${input}, $sort: Sort, $page: PageInput) {
  ${type}(filter: $filter, sort: $sort, page: $page) {
    total
    pageInfo {
      number
      totalPages
      hasNextPage
    }
    nodes {
      ...CardFields
    }
  }
}

fragment CardFields on ${type === 'countries' ? 'Country' : type === 'cities' ? 'City' : 'University'} {
  ${fields.join('\n  ')}
}`;
}

async function loadCatalog() {
  const version = ++state.version;
  $('#results').classList.add('loading');
  $('#previous').disabled = true;
  $('#next').disabled = true;
  $('#result-count').textContent = 'Загрузка…';
  notice();
  const query = makeQuery();
  const filter = { search: $('#search').value.trim() || undefined };
  if (state.tab === 'countries') filter.region = $('#region-filter').value || undefined;
  else filter.countryId = $('#country-filter').value || undefined;
  if (state.tab === 'favorites') filter.favoritesOnly = true;
  const variables = { filter, sort: $('#sort').value, page: { number: state.page, size: Number($('#size').value) } };
  $('#query-preview').textContent = `${query}\n\n${JSON.stringify(variables, null, 2)}`;
  try {
    const result = await graphql(query, variables, { partial: true });
    if (version !== state.version) return;
    const type = state.tab === 'favorites' ? 'universities' : state.tab;
    const connection = result.data?.[type];
    if (result.errors?.length) notice(`Часть данных недоступна: ${result.errors.map(e => e.message).join(' ')}`);
    if (!connection) throw new Error('Каталог временно недоступен. Попробуйте другой раздел или повторите запрос.');
    state.rows = connection.nodes;
    state.pages = connection.pageInfo.totalPages;
    if (!connection.nodes.length && state.page > 1 && state.pages > 0) { state.page = state.pages; return loadCatalog(); }
    $('#result-count').textContent = `${format(connection.total)} результатов`;
    $('#page-label').textContent = `Страница ${state.page} из ${Math.max(1, state.pages)}`;
    $('#previous').disabled = state.page <= 1;
    $('#next').disabled = !connection.pageInfo.hasNextPage;
    $('#results').innerHTML = connection.nodes.length ? connection.nodes.map(row => card(row, type)).join('') : '<div class="empty">Ничего не найдено.<br>Попробуйте другое название или сбросьте фильтры.</div>';
  } catch (error) {
    if (version !== state.version) return;
    notice(error.message);
    $('#results').innerHTML = '<div class="empty">Не удалось получить данные.<br><button class="secondary" data-retry>Повторить запрос ↻</button></div>';
    $('#result-count').textContent = 'Нет соединения';
  } finally { if (version === state.version) $('#results').classList.remove('loading'); }
}

function card(row, type) {
  const country = row.country;
  const subtitle = type === 'universities' ? row.state || 'Высшее образование' : type === 'cities' ? row.subcountry || 'Город' : row.region;
  const name = type === 'countries' ? row.localName : row.name;
  return `<article class="card"><div class="card-top"><span class="card-mark">${escape(type === 'countries' ? row.id : row.name.slice(0, 1))}</span>${type === 'universities' ? `<button class="star ${row.favorite ? 'saved' : ''}" data-favorite="${escape(row.id)}" aria-label="${row.favorite ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${Boolean(row.favorite)}">${row.favorite ? '★' : '☆'}</button>` : `<span class="card-code">${type === 'cities' ? 'GEONAMES' : escape(row.id)}</span>`}</div><h3><button class="card-title" data-detail="${escape(row.id)}" data-type="${type}">${escape(name)}</button></h3><div class="card-subtitle">${escape(subtitle)}</div><div class="card-bottom">${country ? `<button class="country-link" data-detail="${escape(country.id)}" data-type="countries">◎ ${escape(country.localName)}</button>` : `<span>${type === 'countries' ? `${format(row.area)} км²` : 'Открытые данные'}</span>`}<span class="domain">${escape(type === 'universities' ? row.domains?.[0] || '' : type === 'countries' ? row.capital?.join(', ') : '')}</span></div></article>`;
}

async function selectTab(tab) {
  state.tab = tab;
  state.page = 1;
  state.version++;
  notice();
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  $('#breadcrumb').textContent = labels[tab];
  const isCatalog = ['universities', 'countries', 'cities', 'favorites'].includes(tab);
  $('#catalog').hidden = !isCatalog;
  for (const panel of ['sources', 'monitor', 'explorer']) $(`#${panel}-panel`).hidden = tab !== panel;
  if (!isCatalog) {
    if (tab === 'sources') await loadSources();
    if (tab === 'monitor') await loadMonitor();
    return;
  }
  state.resetting = true;
  $('#filters').reset();
  state.resetting = false;
  $('#country-filter').hidden = tab === 'countries';
  $('#region-filter').hidden = tab !== 'countries';
  $('#include-country').closest('label').hidden = tab === 'countries';
  $('#domains-option').hidden = !['universities', 'favorites'].includes(tab);
  $('#search').placeholder = tab === 'countries' ? 'Название страны, в том числе по-русски…' : tab === 'cities' ? 'Название города или региона…' : 'Название, регион или домен…';
  $('#sort').innerHTML = '<option value="NAME_ASC">Название: А → Я</option><option value="NAME_DESC">Название: Я → А</option>' + (tab === 'countries' ? '<option value="AREA_DESC">Площадь: по убыванию</option><option value="AREA_ASC">Площадь: по возрастанию</option>' : '');
  $('#catalog-title').textContent = { universities: 'Каталог университетов', countries: 'Страны и территории', cities: 'Города мира', favorites: 'Сохранённые университеты' }[tab];
  await loadCatalog();
}

async function bootstrap() {
  try {
    const { data, errors } = await graphql(`
      {
        catalogStats {
          universities
          countries
          cities
          total
        }
        countries(page: { size: 100, number: 1 }) {
          nodes {
            id
            localName
          }
        }
      }
    `, {}, { partial: true });
    for (const key of ['universities', 'countries', 'cities', 'total']) $(`#stat-${key}`).textContent = data?.catalogStats ? format(data.catalogStats[key]) : '—';
    if (data?.catalogStats) $('#nav-count').textContent = format(data.catalogStats.universities);
    state.countries = data?.countries?.nodes || [];
    for (const number of [2, 3]) {
      const result = await graphql(`
        query Options($page: PageInput) {
          countries(page: $page) {
            nodes {
              id
              localName
            }
          }
        }
      `, { page: { number, size: 100 } }, { partial: true });
      state.countries.push(...(result.data?.countries?.nodes || []));
    }
    state.countries.sort((a, b) => a.localName.localeCompare(b.localName, 'ru'));
    const countryFilter = $('#country-filter');
    const selectedCountry = countryFilter.value;
    countryFilter.innerHTML = '<option value="">Все страны</option>' + state.countries.map(c => `<option value="${escape(c.id)}">${escape(c.localName)}</option>`).join('');
    if (state.countries.some(country => country.id === selectedCountry)) countryFilter.value = selectedCountry;
    if (errors?.length) notice('Сведения о странах временно недоступны.');
  } catch (error) { notice(error.message); }
}

async function openDetails(type, id) {
  const version = ++state.detailVersion;
  $('#details-content').textContent = 'Загрузка…';
  if (!$('#details').open) $('#details').showModal();
  const countryFields = `
    id
    name
    localName
    region
    subregion
    capital
    area
    languages
    currencies
    cities(page: { size: 6 }) {
      total
      nodes {
        name
        subcountry
      }
    }
    universities(page: { size: 6 }) {
      total
      nodes {
        id
        name
        domains
      }
    }
  `;
  const queries = {
    countries: `
      query Details($id: ID!) {
        country(id: $id) {
          ${countryFields}
        }
      }
    `,
    cities: `
      query Details($id: ID!) {
        city(id: $id) {
          id
          name
          subcountry
          country {
            ${countryFields}
          }
        }
      }
    `,
    universities: `
      query Details($id: ID!) {
        university(id: $id) {
          id
          name
          state
          domains
          websites
          favorite {
            note
            updatedAt
          }
          country {
            ${countryFields}
          }
        }
      }
    `,
  };
  const query = queries[type];
  try {
    const { data, errors } = await graphql(query, { id }, { partial: true });
    if (version !== state.detailVersion || !$('#details').open) return;
    const row = data?.[type === 'countries' ? 'country' : type === 'cities' ? 'city' : 'university'];
    if (!row) throw new Error('Запись временно недоступна.');
    const c = type === 'countries' ? row : row.country;
    $('#details-content').innerHTML = `<h2 class="detail-title">${escape(type === 'countries' ? row.localName : row.name)}</h2><div class="detail-meta"><span>ID: ${escape(row.id)}</span>${c ? `<span>${escape(c.localName)} · ${escape(c.region)}</span>` : ''}${row.state || row.subcountry ? `<span>${escape(row.state || row.subcountry)}</span>` : ''}</div>${errors?.length ? '<p class="notice">Некоторые связанные данные сейчас недоступны.</p>' : ''}${type === 'universities' ? `<div class="detail-section"><h3>Сайты университета</h3><ul>${row.websites.filter(url => /^https?:\/\//i.test(url)).map(url => `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a></li>`).join('')}</ul><p>Домены: ${escape(row.domains.join(', '))}</p></div><div class="detail-section"><label class="note-label">Заметка к избранному<textarea id="favorite-note" maxlength="1000" rows="3">${escape(row.favorite?.note || '')}</textarea></label><button class="primary" id="save-note" data-id="${escape(row.id)}">Сохранить в избранном</button><span id="note-status" class="muted" role="status"></span></div>` : ''}${c ? `<div class="detail-section"><h3>О стране</h3><p>${escape(c.name)} · ${escape(c.subregion)}<br>Столица: ${escape(c.capital.join(', ') || '—')}<br>Площадь: ${format(c.area)} км²<br>Языки: ${escape(c.languages.join(', ') || '—')}<br>Валюты: ${escape(c.currencies.join(', ') || '—')}</p></div><div class="detail-section"><h3>Города · ${c.cities ? format(c.cities.total) : 'недоступно'}</h3><p>${escape(c.cities?.nodes.map(city => city.name).join(' · ') || 'Нет доступных данных')}</p></div><div class="detail-section"><h3>Университеты · ${c.universities ? format(c.universities.total) : 'недоступно'}</h3><ul>${c.universities?.nodes.map(u => `<li><button class="country-link" data-detail="${escape(u.id)}" data-type="universities">${escape(u.name)}</button></li>`).join('') || '<li>Нет доступных данных</li>'}</ul></div>` : ''}`;
  } catch (error) { if (version === state.detailVersion) $('#details-content').textContent = error.message; }
}

async function saveFavorite(id, enabled, note = '') {
  return graphql(`
    mutation Save($id: ID!, $enabled: Boolean!, $note: String) {
      setFavorite(universityId: $id, enabled: $enabled, note: $note) {
        id
        favorite {
          note
          updatedAt
        }
      }
    }
  `, { id, enabled, note });
}

async function loadSources() {
  $('#sources-content').textContent = 'Загрузка…';
  try {
    const { data } = await graphql(`
      {
        sources {
          id
          name
          homepage
          license
          count
          skipped
          importedAt
          checksum
          status
          error
        }
      }
    `);
    $('#sources-content').innerHTML = data.sources.map(source => `<article class="source-card"><h3>${escape(source.name)}<span class="badge ${source.status === 'CACHED' ? 'warn' : ''}">${source.status === 'CACHED' ? 'Локальная копия' : 'Загружено из источника'}</span></h3><div class="source-info">${format(source.count)} записей · Пропущено: ${format(source.skipped)}<br>Импорт: ${escape(new Date(source.importedAt).toLocaleString('ru-RU'))}<br>Лицензия: ${escape(source.license)}<br><a href="${escape(source.homepage)}" target="_blank" rel="noopener noreferrer">${escape(source.homepage)}</a><br>SHA-256: ${escape(source.checksum)}${source.error ? `<br>При загрузке: ${escape(source.error)}` : ''}</div></article>`).join('');
  } catch (error) { $('#sources-content').textContent = error.message; }
}

async function refreshSources() {
  const button = $('#refresh-sources');
  const status = $('#sources-status');
  button.disabled = true;
  status.textContent = 'Проверяем источники…';
  try {
    const { data } = await graphql(`
      mutation RefreshSources {
        refreshSources {
          updated
          unchecked
        }
      }
    `);
    const { updated, unchecked } = data.refreshSources;
    if (updated) {
      status.textContent = 'Данные обновлены.';
      await bootstrap();
      if (!$('#catalog').hidden) await loadCatalog();
    } else {
      status.textContent = unchecked ? 'База не изменилась.' : 'Изменений в источниках нет.';
    }
    if (unchecked) status.textContent += ` Не удалось проверить источники: ${unchecked}. Использованы локальные копии.`;
    await loadSources();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

async function loadMonitor() {
  try {
    const { data } = await graphql(examples.monitor.query);
    const m = data.monitor;
    const metrics = [[m.requests, 'запросов'], [m.errors, 'ошибок GraphQL'], [m.rejected, 'отклонено по нагрузке'], [`${m.p95Ms.toFixed(1)} мс`, 'P95, последние 100'], [m.cacheHits, 'ответов из кэша'], [m.active, 'активных запросов'], [`${m.uptimeSeconds} с`, 'время работы']];
    $('#monitor-content').innerHTML = `<div class="monitor-grid">${metrics.map(([value, name]) => `<div class="metric"><b>${escape(value)}</b><span>${name}</span></div>`).join('')}</div><h2>Последние запросы</h2>${m.traces.map(t => `<div class="trace"><div><div class="trace-name">${escape(t.operation)}${t.cached ? '<span class="badge">Кэш</span>' : ''}${t.error ? '<span class="badge warn">Ошибка</span>' : ''}</div><div class="trace-id">${escape(t.id)}</div></div><span class="muted">${t.durationMs.toFixed(1)} мс</span><div class="spans">${t.spans.map(s => `<span class="span ${s.ok ? '' : 'error'}">${escape(s.service)} · ${s.durationMs.toFixed(1)} мс</span>`).join('') || '<span class="muted">Локальный ответ шлюза</span>'}</div></div>`).join('')}`;
  } catch (error) { $('#monitor-content').textContent = error.message; }
}

function setExample() {
  const example = examples[$('#example').value];
  $('#query-editor').value = example.query;
  $('#variables-editor').value = JSON.stringify(example.variables, null, 2);
}

let searchTimer;
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.page = 1; loadCatalog(); }, 300); });
$('#filters').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); state.page = 1; loadCatalog(); });
for (const id of ['country-filter', 'region-filter', 'sort', 'size', 'include-country', 'include-domains']) $(`#${id}`).addEventListener('change', () => { state.page = 1; loadCatalog(); });
$('#filters').addEventListener('reset', () => { if (!state.resetting) setTimeout(() => { state.page = 1; loadCatalog(); }, 0); });
$('#previous').addEventListener('click', () => { if (state.page > 1) { state.page--; loadCatalog(); } });
$('#next').addEventListener('click', () => { if (state.page < state.pages) { state.page++; loadCatalog(); } });
$('#show-query').addEventListener('click', () => { $('#query-preview').hidden = !$('#query-preview').hidden; });
$('#close-details').addEventListener('click', () => { state.detailVersion++; $('#details').close(); });
$('#details').addEventListener('click', event => { if (event.target === $('#details')) { state.detailVersion++; $('#details').close(); } });
$('#refresh-sources').addEventListener('click', refreshSources);
$('#refresh-monitor').addEventListener('click', loadMonitor);
$('#example').addEventListener('change', setExample);
$('#execute').addEventListener('click', async () => {
  $('#execute').disabled = true;
  const started = performance.now();
  try {
    const result = await graphql($('#query-editor').value, JSON.parse($('#variables-editor').value || '{}'), { partial: true });
    $('#explorer-result').textContent = JSON.stringify(result, null, 2);
    $('#query-timing').textContent = `${(performance.now() - started).toFixed(0)} мс · ${new TextEncoder().encode(JSON.stringify(result)).length} байт`;
  } catch (error) { $('#explorer-result').textContent = error.message; }
  finally { $('#execute').disabled = false; }
});
document.addEventListener('click', async event => {
  const tab = event.target.closest('[data-tab]');
  const detail = event.target.closest('[data-detail]');
  const favorite = event.target.closest('[data-favorite]');
  if (tab) { clearTimeout(searchTimer); await selectTab(tab.dataset.tab); }
  if (detail) await openDetails(detail.dataset.type, detail.dataset.detail);
  if (event.target.closest('[data-retry]')) await loadCatalog();
  if (favorite) {
    favorite.disabled = true;
    const row = state.rows.find(item => item.id === favorite.dataset.favorite);
    try { await saveFavorite(row.id, !row.favorite, row.favorite?.note || ''); await loadCatalog(); }
    catch (error) { notice(error.message); favorite.disabled = false; }
  }
  const save = event.target.closest('#save-note');
  if (save) {
    save.disabled = true;
    try {
      await saveFavorite(save.dataset.id, true, $('#favorite-note').value);
      $('#note-status').textContent = ' Сохранено';
      if (['universities', 'favorites'].includes(state.tab)) await loadCatalog();
    } catch (error) { $('#note-status').textContent = ` ${error.message}`; }
    finally { save.disabled = false; }
  }
});
setExample();
await Promise.all([bootstrap(), loadCatalog()]);
