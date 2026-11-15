import { GraphQLError } from 'graphql';
import { normalize, decode } from './database.js';

export function badInput(message) {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

export function pagination(page) {
  const number = page?.number ?? 1;
  const size = page?.size ?? 20;
  if (!Number.isInteger(number) || number < 1 || number > 10000 || !Number.isInteger(size) || size < 1 || size > 100) {
    throw badInput('Номер страницы: 1–10000, размер: 1–100.');
  }
  return { number, size };
}

export function createCatalog(db) {
  const statements = new Map();
  const prepare = sql => {
    if (!statements.has(sql)) {
      if (statements.size >= 200) statements.delete(statements.keys().next().value);
      statements.set(sql, db.prepare(sql));
    }
    return statements.get(sql);
  };
  return {
    find(table, id) {
      if (!['countries', 'cities', 'universities'].includes(table)) throw new Error('Unknown table');
      return decode(prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    },
    list(table, { filter = {}, sort = 'NAME_ASC', page } = {}) {
      if (!['countries', 'cities', 'universities'].includes(table)) throw new Error('Unknown table');
      const { number, size } = pagination(page);
      const clauses = [];
      const values = [];
      if (filter.search != null && filter.search.length > 120) throw badInput('Поиск: не более 120 символов.');
      const search = normalize(filter.search);
      if (search) {
        if ([...search].length >= 3) {
          clauses.push(`id IN (SELECT id FROM ${table}_fts WHERE search MATCH ?)`);
          values.push(`"${search.replaceAll('"', '""')}"`);
        } else {
          clauses.push("search LIKE ? ESCAPE '\\'");
          values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
        }
      }
      if (table === 'countries') {
        if (filter.region) { clauses.push('region = ?'); values.push(filter.region); }
        if (filter.minArea != null) {
          if (!Number.isFinite(filter.minArea) || filter.minArea < 0) throw badInput('Площадь должна быть неотрицательной.');
          clauses.push('area >= ?'); values.push(filter.minArea);
        }
      } else if (filter.countryId) {
        clauses.push('countryId = ?'); values.push(filter.countryId.toUpperCase());
      }
      if (table === 'universities' && filter.favoritesOnly) clauses.push('id IN (SELECT universityId FROM favorites)');
      const orders = { NAME_ASC: 'name COLLATE NOCASE ASC, id ASC', NAME_DESC: 'name COLLATE NOCASE DESC, id DESC' };
      if (table === 'countries') Object.assign(orders, { NAME_ASC: 'localName COLLATE NOCASE ASC, id ASC', NAME_DESC: 'localName COLLATE NOCASE DESC, id DESC', AREA_DESC: 'area DESC, id ASC', AREA_ASC: 'area ASC, id ASC' });
      if (!orders[sort]) throw badInput('Этот способ сортировки недоступен для выбранного каталога.');
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const total = prepare(`SELECT count(*) AS count FROM ${table}${where}`).get(...values).count;
      const nodes = prepare(`SELECT * FROM ${table}${where} ORDER BY ${orders[sort]} LIMIT ? OFFSET ?`).all(...values, size, (number - 1) * size).map(decode);
      return { nodes, total, pageInfo: { number, size, totalPages: Math.ceil(total / size), hasNextPage: number * size < total, hasPreviousPage: number > 1 } };
    },
    favorite(id) {
      return prepare('SELECT note, updatedAt FROM favorites WHERE universityId = ?').get(id) ?? null;
    },
    setFavorite(id, enabled, note = '') {
      const university = this.find('universities', id);
      if (!university) throw badInput('Университет не найден.');
      if (note.length > 1000) throw badInput('Заметка: не более 1000 символов.');
      if (enabled) prepare('INSERT INTO favorites VALUES (?, ?, ?) ON CONFLICT(universityId) DO UPDATE SET note = excluded.note, updatedAt = excluded.updatedAt').run(id, note.trim(), new Date().toISOString());
      else prepare('DELETE FROM favorites WHERE universityId = ?').run(id);
      return university;
    },
    sources() {
      return prepare('SELECT * FROM imports ORDER BY id').all();
    },
    stats() {
      const counts = Object.fromEntries(['countries', 'cities', 'universities'].map(table => [table, prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
      return { ...counts, total: counts.countries + counts.cities + counts.universities };
    },
  };
}
