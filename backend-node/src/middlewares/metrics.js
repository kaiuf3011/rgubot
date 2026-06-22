import promClient from 'prom-client';

const Registry = promClient.Registry;
const register = new Registry();

// Add default metrics (CPU, Memory, Event Loop Lag)
promClient.collectDefaultMetrics({ register });

// Define custom metrics
export const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in microseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 15]
});

export const llmProviderFailovers = new promClient.Counter({
  name: 'llm_provider_failovers_total',
  help: 'Total number of times the primary LLM provider failed and triggered a failover',
  labelNames: ['primary_provider', 'fallback_provider']
});

export const vectorSearchLatency = new promClient.Histogram({
  name: 'vector_search_latency_seconds',
  help: 'Latency of the hybrid vector search',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5]
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(llmProviderFailovers);
register.registerMetric(vectorSearchLatency);

export const metricsMiddleware = async (req, res, next) => {
  if (req.path === '/metrics') {
    res.set('Content-Type', register.contentType);
    return res.end(await register.metrics());
  }

  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode,
      method: req.method
    });
  });
  next();
};
