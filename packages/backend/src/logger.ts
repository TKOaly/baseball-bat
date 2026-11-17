import pino from 'pino';

/**
 * Application logger.
 *
 * Every line is written to stdout as a single JSON object, using the same
 * schema as the other services in the cluster:
 *
 *   { "level": "info", "time": "<ISO 8601>", "service": "baseball-bat",
 *     "env": "production", "msg": "...", ...fields }
 *
 * Errors go under the `err` key (`{ type, message, stack, ... }`). When a
 * log call happens inside an OpenTelemetry span, `trace_id` and `span_id`
 * are added by the pino instrumentation (see `instrumentation.ts`), so log
 * lines can be matched with traces in Grafana.
 *
 * For human readable output during development, pipe the output through
 * `pino-pretty` (the `start:dev` script already does this).
 *
 * Configuration:
 *   LOG_LEVEL  trace | debug | info | warn | error | fatal | silent (default: info)
 */

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
const DEFAULT_LEVEL = 'info';

const configuredLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
const invalidLevel =
  configuredLevel && !LEVELS.includes(configuredLevel)
    ? process.env.LOG_LEVEL
    : undefined;

/** Query string parameters whose values must never end up in the logs. */
const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'code',
  'state',
  'session_state',
  'access_token',
  'id_token',
  'refresh_token',
]);

export const REDACTED = '[Redacted]';

type AxiosLikeError = Error & {
  isAxiosError: true;
  code?: string;
  config?: { method?: string; baseURL?: string; url?: string };
  response?: { status?: number };
};

const isAxiosError = (err: unknown): err is AxiosLikeError =>
  typeof err === 'object' &&
  err !== null &&
  (err as { isAxiosError?: unknown }).isAxiosError === true;

/**
 * Error properties that are copied into the log. Everything else is dropped:
 * libraries attach request data to their errors, e.g. body-parser's `body`
 * (the raw request body), Stripe's `header` and `payload` (the webhook
 * signature and event) and axios' `config` (including auth headers).
 * pino's serializer already folds `cause` chains into `message` and `stack`.
 */
const ERROR_FIELDS = [
  'type',
  'message',
  'stack',
  'code',
  'status',
  'statusCode',
  // PostgreSQL errors. Not `detail`, which contains row values.
  'constraint',
  'table',
  'column',
  'hint',
  'routine',
  // Stripe errors. `requestId` is what Stripe support asks for.
  'requestId',
  'param',
] as const;

/**
 * Serializes errors as `{ type, message, stack, ... }`, keeping only the
 * fields in ERROR_FIELDS. Axios errors also get the request method, URL
 * (with sensitive query parameters redacted) and response status.
 */
const serializeError = (err: unknown) => {
  if (err === undefined || err === null) {
    return err;
  }

  if (typeof err !== 'object') {
    // e.g. `throw 'message'` or a rejected promise with a string reason.
    return { type: typeof err, message: String(err) };
  }

  const serialized: Record<string, unknown> = pino.stdSerializers.err(
    err as Error,
  );

  if (serialized === err) {
    // Not an Error. Only keep its message, if any; the rest may hold anything.
    const message = (err as { message?: unknown }).message;
    return {
      type: err.constructor?.name ?? 'Object',
      message: typeof message === 'string' ? message : undefined,
    };
  }

  const result: Record<string, unknown> = {};

  for (const field of ERROR_FIELDS) {
    if (serialized[field] !== undefined && serialized[field] !== '') {
      result[field] = serialized[field];
    }
  }

  if (isAxiosError(err)) {
    const { config, response } = err;

    result.method = config?.method?.toUpperCase();
    result.url = redactUrl(
      config?.url && config.baseURL && !/^\w+:/.test(config.url)
        ? `${config.baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`
        : config?.url,
    );
    result.statusCode = response?.status;
  }

  return result;
};

export const loggerOptions: pino.LoggerOptions = {
  level: invalidLevel ? DEFAULT_LEVEL : configuredLevel || DEFAULT_LEVEL,
  base: {
    service: 'baseball-bat',
    env: process.env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // Emit the level as a string ("level":"info") instead of pino's
    // numeric levels, so that it can be filtered on directly in Grafana.
    level: label => ({ level: label }),
  },
  serializers: {
    err: serializeError,
    error: serializeError,
  },
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'headers.authorization',
      'headers.cookie',
      'headers["x-token"]',
      'headers["stripe-signature"]',
      '*.headers.authorization',
      '*.headers.cookie',
      '*.headers["x-token"]',
      '*.headers["stripe-signature"]',
    ],
    censor: REDACTED,
  },
};

/** Exported for tests, which pass their own destination to capture output. */
export const createLogger = (destination?: pino.DestinationStream) =>
  destination ? pino(loggerOptions, destination) : pino(loggerOptions);

export const logger = createLogger();

if (invalidLevel) {
  logger.warn(
    { configuredLevel: invalidLevel, fallbackLevel: DEFAULT_LEVEL },
    `Invalid LOG_LEVEL, falling back to "${DEFAULT_LEVEL}"`,
  );
}

export type Logger = pino.Logger;

/**
 * Returns the URL with the values of sensitive query parameters replaced,
 * e.g. `/api/session/callback?code=abc&state=def` becomes
 * `/api/session/callback?code=REDACTED&state=REDACTED`.
 */
export function redactUrl(url: string): string;
export function redactUrl(url: string | undefined): string | undefined;
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;

  const index = url.indexOf('?');
  if (index === -1) return url;

  const params = new URLSearchParams(url.substring(index + 1));
  let changed = false;

  for (const key of new Set(params.keys())) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      // Plain text, as the brackets in REDACTED would be percent-encoded.
      params.set(key, 'REDACTED');
      changed = true;
    }
  }

  if (!changed) return url;

  return `${url.substring(0, index)}?${params.toString()}`;
}

export default logger;
