import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const dataDir = process.env.DATA_DIR || path.join(root, 'data');
export const dbPath = path.join(dataDir, 'atlas.sqlite');
export const sources = [
  { id: 'countries', name: 'mledoze / Countries', url: 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json', homepage: 'https://github.com/mledoze/countries', license: 'ODbL 1.0', file: 'countries.json' },
  { id: 'cities', name: 'DataHub / GeoNames', url: 'https://raw.githubusercontent.com/datasets/world-cities/main/data/world-cities.csv', homepage: 'https://github.com/datasets/world-cities', license: 'CC BY 4.0; GeoNames, DataHub, Open Knowledge Foundation', file: 'cities.csv' },
  { id: 'universities', name: 'Hipo / University Domains', url: 'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json', homepage: 'https://github.com/Hipo/university-domains-list', license: 'MIT', file: 'universities.json' },
];

export const ports = { countries: 4101, cities: 4102, universities: 4103 };
export function serviceUrl(name) {
  return process.env[`${name.toUpperCase()}_URL`] || `http://127.0.0.1:${ports[name]}/graphql`;
}
