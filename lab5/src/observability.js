import { randomUUID } from 'node:crypto';
import { HeaderMap } from '@apollo/server';
import { GraphQLError, Kind, valueFromASTUntyped } from 'graphql';

export function assessOperation(document, operation, variables = {}) {
  const fragments = new Map(document.definitions.filter(n => n.kind === Kind.FRAGMENT_DEFINITION).map(n => [n.name.value, n]));
  function walk(selectionSet, depth = 0, multiplier = 1) {
    if (depth > 12 || multiplier > 15000) throw new GraphQLError('Запрос слишком сложный.', { extensions: { code: 'QUERY_TOO_COMPLEX' } });
    let cost = 0;
    let maxDepth = depth;
    for (const node of selectionSet?.selections || []) {
      if (node.kind === Kind.FRAGMENT_SPREAD) {
        const result = walk(fragments.get(node.name.value).selectionSet, depth, multiplier);
        cost += result.cost; maxDepth = Math.max(maxDepth, result.depth);
      } else if (node.kind === Kind.INLINE_FRAGMENT) {
        const result = walk(node.selectionSet, depth, multiplier);
        cost += result.cost; maxDepth = Math.max(maxDepth, result.depth);
      } else {
        const page = node.arguments?.find(arg => arg.name.value === 'page');
        const requested = page ? valueFromASTUntyped(page.value, variables) : null;
        const size = requested?.size ?? 20;
        if (['countries', 'cities', 'universities'].includes(node.name.value) && (!Number.isInteger(size) || size < 1 || size > 100)) throw new GraphQLError('Размер страницы: 1–100.', { extensions: { code: 'BAD_USER_INPUT' } });
        const factor = ['countries', 'cities', 'universities'].includes(node.name.value) ? size : 1;
        const result = walk(node.selectionSet, depth + 1, multiplier * factor);
        cost += multiplier + result.cost;
        maxDepth = Math.max(maxDepth, result.depth);
      }
      if (cost > 15000) throw new GraphQLError('Запрос слишком сложный.', { extensions: { code: 'QUERY_TOO_COMPLEX' } });
    }
    return { cost, depth: maxDepth };
  }
  const result = walk(operation.selectionSet);
  if (result.depth > 12 || result.cost > 15000) throw new GraphQLError('Запрос слишком сложный: глубина до 12, стоимость до 15000.', { extensions: { code: 'QUERY_TOO_COMPLEX', ...result } });
  return result;
}

export function createTelemetry() {
  const startedAt = Date.now();
  const state = { requests: 0, errors: 0, rejected: 0, active: 0, cacheHits: 0, traces: [] };
  const cache = new Map();
  let revision = 0;
  const telemetry = {
    state,
    trace(operation = '') { return { id: randomUUID(), operation, startedAt: new Date().toISOString(), started: performance.now(), durationMs: 0, error: false, cached: false, spans: [] }; },
    finish(trace) {
      trace.durationMs = performance.now() - trace.started;
      state.traces.unshift(trace);
      state.traces.length = Math.min(100, state.traces.length);
      console.log(JSON.stringify({ event: 'graphql', traceId: trace.id, operation: trace.operation, durationMs: Math.round(trace.durationMs), error: trace.error, cached: trace.cached, spans: trace.spans }));
    },
    snapshot() {
      const durations = state.traces.map(t => t.durationMs).sort((a, b) => a - b);
      return { ...state, traces: state.traces.slice(0, 20), uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), p95Ms: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] || 0, cacheEntries: cache.size };
    },
    plugin: {
      async requestDidStart({ contextValue }) {
        const trace = contextValue.trace;
        state.requests++; state.active++;
        return {
          async didResolveOperation(request) {
            trace.operation = request.operationName || request.operation.operation;
            assessOperation(request.document, request.operation, request.request.variables);
            if (request.operation.operation === 'mutation') { revision++; cache.clear(); }
            else if (!/\bmonitor\b|__schema|__type/.test(request.request.query || '')) {
              contextValue.cacheKey = JSON.stringify([revision, request.request.query, request.request.variables || {}, request.operationName]);
            }
          },
          async responseForOperation() {
            const hit = cache.get(contextValue.cacheKey);
            if (!hit || hit.expires < Date.now()) return null;
            trace.cached = true; state.cacheHits++;
            return { http: { headers: new HeaderMap() }, body: { kind: 'single', singleResult: structuredClone(hit.result) } };
          },
          async didEncounterErrors() { trace.error = true; state.errors++; },
          async willSendResponse({ response }) {
            state.active--;
            if (response.body.kind === 'single') {
              const result = response.body.singleResult;
              if (result.errors?.length) trace.error = true;
              if (contextValue.cacheKey && !trace.cached && !trace.error) {
                if (cache.size >= 200) cache.delete(cache.keys().next().value);
                cache.set(contextValue.cacheKey, { result: structuredClone(result), expires: Date.now() + 5000 });
              }
              result.extensions = { ...result.extensions, traceId: trace.id, cached: trace.cached };
            }
            telemetry.finish(trace);
          },
        };
      },
    },
  };
  return telemetry;
}

export function loadControl(telemetry, { limit = Number(process.env.RATE_LIMIT || 120), maxActive = Number(process.env.MAX_ACTIVE || 32) } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.socket.remoteAddress;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= 60000) {
      if (buckets.size >= 10000) for (const [id, item] of buckets) if (now - item.start >= 60000) buckets.delete(id);
      bucket = { start: now, count: 0 }; buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit || telemetry.state.active >= maxActive) {
      telemetry.state.rejected++;
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ errors: [{ message: 'Слишком много запросов. Повторите позже.', extensions: { code: 'RATE_LIMITED' } }] });
    }
    next();
  };
}
