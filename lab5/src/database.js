import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dbPath, dataDir } from './config.js';

export function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function openDatabase(file = dbPath) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS countries (id TEXT PRIMARY KEY, name TEXT NOT NULL, localName TEXT NOT NULL, region TEXT NOT NULL, subregion TEXT NOT NULL, capital TEXT NOT NULL, area REAL NOT NULL, languages TEXT NOT NULL, currencies TEXT NOT NULL, search TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cities (id TEXT PRIMARY KEY, name TEXT NOT NULL, countryId TEXT NOT NULL, subcountry TEXT NOT NULL, search TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS universities (id TEXT PRIMARY KEY, name TEXT NOT NULL, countryId TEXT NOT NULL, state TEXT, domains TEXT NOT NULL, websites TEXT NOT NULL, search TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS favorites (universityId TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, homepage TEXT NOT NULL, license TEXT NOT NULL, count INTEGER NOT NULL, skipped INTEGER NOT NULL, importedAt TEXT NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL, error TEXT);
    CREATE INDEX IF NOT EXISTS countries_region_name ON countries(region, name, id);
    CREATE INDEX IF NOT EXISTS countries_name ON countries(name, id);
    CREATE INDEX IF NOT EXISTS countries_local_name ON countries(localName, id);
    CREATE INDEX IF NOT EXISTS countries_area ON countries(area, id);
    CREATE INDEX IF NOT EXISTS cities_country_name ON cities(countryId, name, id);
    CREATE INDEX IF NOT EXISTS cities_name ON cities(name, id);
    CREATE INDEX IF NOT EXISTS universities_country_name ON universities(countryId, name, id);
    CREATE INDEX IF NOT EXISTS universities_name ON universities(name, id);
    CREATE VIRTUAL TABLE IF NOT EXISTS countries_fts USING fts5(id UNINDEXED, search, tokenize='trigram');
    CREATE VIRTUAL TABLE IF NOT EXISTS cities_fts USING fts5(id UNINDEXED, search, tokenize='trigram');
    CREATE VIRTUAL TABLE IF NOT EXISTS universities_fts USING fts5(id UNINDEXED, search, tokenize='trigram');
  `);
  return db;
}

export function decode(row) {
  if (!row) return null;
  const result = { ...row };
  for (const key of ['languages', 'currencies', 'domains', 'websites']) {
    if (key in result) result[key] = JSON.parse(result[key]);
  }
  return result;
}
