import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { openDatabase } from './database.js';
import { createCatalog } from './catalog.js';
import { schemas, resolvers } from './schemas.js';
import { ports } from './config.js';

const name = process.argv[2];
if (!schemas[name]) throw new Error('Specify countries, cities or universities');
const db = openDatabase();
const catalog = createCatalog(db);
const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs: schemas[name], resolvers: resolvers(name, catalog) }]),
  includeStacktraceInErrorResponses: false,
});
const { url } = await startStandaloneServer(server, { listen: { port: Number(process.env.PORT || ports[name]), host: process.env.SERVICE_HOST || '127.0.0.1' } });
console.log(JSON.stringify({ event: 'subgraph_ready', name, url }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  db.close();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
