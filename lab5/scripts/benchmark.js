import { performance } from 'node:perf_hooks';

const url = process.env.GRAPHQL_URL || 'http://127.0.0.1:4100/graphql';
const count = Number(process.env.REQUESTS || 60);
const concurrency = Number(process.env.CONCURRENCY || 5);
if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error('REQUESTS: 1–10000; CONCURRENCY: 1–64.');
const query = 'query Benchmark($page: PageInput) { universities(page: $page) { total nodes { id name domains country { name region } } } }';
const durations = [];
let errors = 0;
let next = 0;
const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < count) {
    const index = next++;
    const time = performance.now();
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { page: { number: index % 20 + 1, size: 20 } } }), signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (!response.ok || body.errors?.length || !body.data?.universities) errors++;
    } catch { errors++; }
    durations.push(performance.now() - time);
  }
}));
const elapsed = performance.now() - started;
durations.sort((a, b) => a - b);
console.log(JSON.stringify({ requests: count, concurrency, errors, elapsedMs: Math.round(elapsed), requestsPerSecond: Number((count / elapsed * 1000).toFixed(2)), p50Ms: Number(durations[Math.ceil(count * 0.5) - 1].toFixed(2)), p95Ms: Number(durations[Math.ceil(count * 0.95) - 1].toFixed(2)) }, null, 2));
if (errors) process.exitCode = 1;
