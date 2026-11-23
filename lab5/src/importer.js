import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { dataDir, sources } from './config.js';
import { normalize, openDatabase } from './database.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function download(source, offline) {
  const file = path.join(dataDir, 'cache', source.file);
  if (offline) return { text: await readFile(file, 'utf8'), status: 'CACHED', error: null };
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'SPP-Lab5-EducationAtlas/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (Buffer.byteLength(text) > 25 * 1024 * 1024) throw new Error('Источник превышает 25 МБ.');
      return { text, status: 'LIVE', error: null, cacheFile: file };
    } catch (error) {
      failure = error;
      if (attempt < 2) await pause(250 * 2 ** attempt);
    }
  }
  try { return { text: await readFile(file, 'utf8'), status: 'CACHED', error: failure.message }; }
  catch { throw new Error(`${source.name}: ${failure.message}; локальная копия отсутствует.`); }
}

function countryRows(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length < 200) throw new Error('Некорректный список стран.');
  return data.filter(c => /^[A-Z]{2}$/.test(c.cca2) && c.name?.common && c.region).map(c => ({
    id: c.cca2, name: c.name.common, localName: c.translations?.rus?.common || c.name.common,
    region: c.region, subregion: c.subregion || '', capital: JSON.stringify(c.capital || []), area: Math.max(0, Number(c.area) || 0),
    languages: JSON.stringify(Object.values(c.languages || {})), currencies: JSON.stringify(Object.values(c.currencies || {}).map(v => v.name)),
    search: normalize([c.name.common, c.name.official, c.cca2, ...Object.values(c.translations || {}).flatMap(t => [t.common, t.official]), ...(c.altSpellings || [])].join(' ')),
    aliases: [c.name.common, c.name.official, ...(c.altSpellings || []), ...Object.values(c.translations || {}).map(t => t.common)],
  }));
}

function cityRows(text, countries) {
  const aliases = new Map();
  for (const c of countries) for (const alias of c.aliases) aliases.set(normalize(alias), c.id);
  const extra = { 'Ivory Coast': 'CI', 'Czech Republic': 'CZ', 'Vatican City': 'VA', 'East Timor': 'TL', 'Swaziland': 'SZ', 'Burma': 'MM', 'Republic of the Congo': 'CG', 'Democratic Republic of the Congo': 'CD', 'South Korea': 'KR', 'North Korea': 'KP', 'Palestinian Territory': 'PS', 'Macedonia': 'MK', 'U.S. Virgin Islands': 'VI', 'British Virgin Islands': 'VG', 'Reunion': 'RE' };
  for (const [name, code] of Object.entries(extra)) aliases.set(normalize(name), code);
  const data = parse(text, { columns: true, skip_empty_lines: true, bom: true });
  if (data.length < 10000 || !data[0]?.geonameid) throw new Error('Некорректный список городов.');
  const rows = [];
  for (const c of data) {
    const countryId = aliases.get(normalize(c.country));
    if (countryId && c.name && c.geonameid) rows.push({ id: c.geonameid, name: c.name, countryId, subcountry: c.subcountry || '', search: normalize(`${c.name} ${c.subcountry || ''}`) });
  }
  return { rows, skipped: data.length - rows.length };
}

function universityRows(text, countries) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length < 1000) throw new Error('Некорректный список университетов.');
  const codes = new Set(countries.map(c => c.id));
  const rows = new Map();
  for (const u of data) {
    const countryId = String(u.alpha_two_code || '').toUpperCase();
    if (!codes.has(countryId) || !u.name || !Array.isArray(u.domains) || !Array.isArray(u.web_pages)) continue;
    const id = digest(`${countryId}:${normalize(u.name)}:${[...u.domains].sort().join(',')}`).slice(0, 24);
    rows.set(id, { id, name: u.name, countryId, state: u['state-province'] || null, domains: JSON.stringify(u.domains), websites: JSON.stringify(u.web_pages.filter(url => /^https?:\/\//i.test(url))), search: normalize(`${u.name} ${u['state-province'] || ''} ${u.domains.join(' ')}`) });
  }
  return { rows: [...rows.values()], skipped: data.length - rows.size };
}

export async function importData({ offline = false } = {}) {
  await mkdir(path.join(dataDir, 'cache'), { recursive: true });
  const lockPath = path.join(dataDir, 'import.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Импорт уже запущен. При аварийном завершении удалите data/import.lock.');
    throw error;
  }
  let db;
  try {
    await lock.writeFile(String(process.pid));
    const downloaded = await Promise.all(sources.map(source => download(source, offline)));
    const checksums = downloaded.map(item => digest(item.text));
    db = openDatabase();
    const previous = new Map(db.prepare('SELECT * FROM imports').all().map(item => [item.id, item]));
    const changed = sources.map((source, index) => previous.get(source.id)?.checksum !== checksums[index]);
    const updated = changed.some(Boolean);
    const countries = updated ? countryRows(downloaded[0].text) : null;
    const batches = [
      changed[0] ? { rows: countries, skipped: 0 } : null,
      changed[0] || changed[1] ? cityRows(downloaded[1].text, countries) : null,
      changed[0] || changed[2] ? universityRows(downloaded[2].text, countries) : null,
    ];
    const importedAt = new Date().toISOString();
    const report = sources.map((source, index) => {
      const batch = batches[index];
      const existing = previous.get(source.id);
      return {
        ...source, file: undefined, count: batch ? batch.rows.length : existing.count,
        skipped: batch ? batch.skipped : existing.skipped, importedAt: batch ? importedAt : existing.importedAt,
        checksum: checksums[index], status: downloaded[index].status, error: downloaded[index].error,
      };
    });
    const total = report.reduce((sum, item) => sum + item.count, 0);
    if (total < 10000) throw new Error(`Недостаточно записей: ${total}. Требуется минимум 10000.`);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let i = 0; i < sources.length; i++) {
        const table = sources[i].id;
        const batch = batches[i];
        if (batch) {
          if (!batch.rows.length) throw new Error(`${sources[i].name}: нет подходящих записей.`);
          db.exec(`DELETE FROM ${table}; DELETE FROM ${table}_fts;`);
          const keys = Object.keys(batch.rows[0]).filter(key => key !== 'aliases');
          const insert = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`);
          const index = db.prepare(`INSERT INTO ${table}_fts (id, search) VALUES (?, ?)`);
          for (const row of batch.rows) {
            insert.run(...keys.map(key => row[key]));
            index.run(row.id, row.search);
          }
        }
        const item = report[i];
        db.prepare('INSERT OR REPLACE INTO imports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(item.id, item.name, item.url, item.homepage, item.license, item.count, item.skipped, item.importedAt, item.checksum, item.status, item.error);
      }
      if (batches[2]) db.exec('DELETE FROM favorites WHERE universityId NOT IN (SELECT id FROM universities);');
      if (updated) db.exec('ANALYZE;');
      db.exec('COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    for (const item of downloaded) {
      if (!item.cacheFile) continue;
      await writeFile(`${item.cacheFile}.tmp`, item.text, 'utf8');
      await rename(`${item.cacheFile}.tmp`, item.cacheFile);
    }
    await writeFile(path.join(dataDir, 'import-report.json'), JSON.stringify({ total, importedAt, sources: report }, null, 2));
    return { total, importedAt, updated, sources: report };
  } finally {
    db?.close();
    await lock.close();
    await unlink(lockPath);
  }
}
