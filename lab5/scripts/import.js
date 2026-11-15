import { importData } from '../src/importer.js';

try {
  const result = await importData({ offline: process.argv.includes('--offline') });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
