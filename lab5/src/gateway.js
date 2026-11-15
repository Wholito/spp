import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloGateway, RemoteGraphQLDataSource, LocalGraphQLDataSource } from '@apollo/gateway';
import { composeServices } from '@apollo/composition';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { parse } from 'graphql';
import { schemas } from './schemas.js';
import { root, serviceUrl } from './config.js';
import { createTelemetry, loadControl } from './observability.js';

export async function startGateway({ port = Number(process.env.PORT || 4100), host = process.env.HOST || '127.0.0.1' } = {}) {
  const telemetry = createTelemetry();
  const monitorDefs = parse(`
    type ServiceSpan { service: String!, durationMs: Float!, ok: Boolean! }
    type Trace { id: ID!, operation: String!, startedAt: String!, durationMs: Float!, error: Boolean!, cached: Boolean!, spans: [ServiceSpan!]! }
    type Monitor { requests: Int!, errors: Int!, rejected: Int!, active: Int!, cacheHits: Int!, cacheEntries: Int!, uptimeSeconds: Int!, p95Ms: Float!, traces: [Trace!]! }
    type Query { monitor: Monitor }
  `);
  const monitor = buildSubgraphSchema([{ typeDefs: monitorDefs, resolvers: { Query: { monitor: () => telemetry.snapshot() } } }]);
  const composed = composeServices([
    ...Object.entries(schemas).map(([name, typeDefs]) => ({ name, typeDefs, url: serviceUrl(name) })),
    { name: 'monitor', typeDefs: monitorDefs, url: 'http://monitor.internal/graphql' },
  ]);
  if (composed.errors) throw new Error(composed.errors.map(error => error.message).join('\n'));
  class TracedSource extends RemoteGraphQLDataSource {
    willSendRequest({ request, context }) {
      request.http.headers.set('x-trace-id', context.trace?.id || 'internal');
    }
    async process(options) {
      const started = performance.now();
      let ok = false;
      try {
        const result = await super.process(options);
        ok = !result.errors?.length;
        return result;
      } finally {
        options.context.trace?.spans.push({ service: this.serviceName, durationMs: performance.now() - started, ok });
      }
    }
  }
  const gateway = new ApolloGateway({
    supergraphSdl: composed.supergraphSdl,
    buildService({ name, url }) {
      if (name === 'monitor') return new LocalGraphQLDataSource(monitor);
      const source = new TracedSource({ url, fetcher: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(3000) }) });
      source.serviceName = name;
      return source;
    },
  });
  const app = express();
  app.disable('x-powered-by');
  const httpServer = http.createServer(app);
  const server = new ApolloServer({
    gateway,
    includeStacktraceInErrorResponses: false,
    allowBatchedHttpRequests: false,
    plugins: [telemetry.plugin, ApolloServerPluginDrainHttpServer({ httpServer })],
    formatError: formatted => ({ message: formatted.extensions?.code === 'INTERNAL_SERVER_ERROR' ? 'Сервис временно недоступен. Остальные разделы продолжают работать.' : formatted.message, path: formatted.path, extensions: { code: formatted.extensions?.code || 'GRAPHQL_ERROR', serviceName: formatted.extensions?.serviceName } }),
  });
  await server.start();
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    next();
  });
  app.use('/graphql', loadControl(telemetry), express.json({ limit: '64kb' }), expressMiddleware(server, {
    context: async ({ res }) => {
      const trace = telemetry.trace();
      res.setHeader('x-trace-id', trace.id);
      return { trace };
    },
  }));
  app.use(express.static(path.join(root, 'public')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ errors: [{ message: error.status === 413 ? 'Запрос превышает 64 КБ.' : 'Не удалось обработать запрос.' }] });
  });
  await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(port, host, resolve); });
  console.log(JSON.stringify({ event: 'gateway_ready', url: `http://${host}:${httpServer.address().port}` }));
  return { server, httpServer, telemetry, stop: () => server.stop() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'src', 'gateway.js')) {
  const gateway = await startGateway();
  process.on('SIGTERM', () => gateway.stop());
  process.on('SIGINT', () => gateway.stop());
}
