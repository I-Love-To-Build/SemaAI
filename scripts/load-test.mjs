const baseUrl = process.env.SEMA_LOAD_TEST_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://sema-ai-theta.vercel.app";
const requests = Number(process.env.SEMA_LOAD_TEST_REQUESTS || 100);
const concurrency = Number(process.env.SEMA_LOAD_TEST_CONCURRENCY || 10);

const targets = [
  "/api/health",
  "/api/client/catalog",
  "/vocabulary",
  "/clients"
];

async function hit(path) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { method: path.startsWith("/api") ? "GET" : "HEAD" });
  return {
    path,
    ok: response.ok,
    status: response.status,
    ms: Math.round(performance.now() - started)
  };
}

async function worker(results) {
  while (results.length < requests) {
    const index = results.length;
    const path = targets[index % targets.length];
    try {
      results.push(await hit(path));
    } catch (error) {
      results.push({ path, ok: false, status: 0, ms: 0, error: error.message });
    }
  }
}

const results = [];
await Promise.all(Array.from({ length: concurrency }, () => worker(results)));

const failures = results.filter((result) => !result.ok);
const latencies = results.map((result) => result.ms).sort((a, b) => a - b);
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const max = latencies.at(-1) ?? 0;

console.log(JSON.stringify({
  baseUrl,
  requests: results.length,
  concurrency,
  failures: failures.length,
  p95Ms: p95,
  maxMs: max,
  byStatus: results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {})
}, null, 2));

if (failures.length) process.exit(1);
