import { ErrorRequestHandler, RequestHandler } from 'express';
import opentelemetry from '@opentelemetry/api';
import {
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';
import { Logger, redactUrl } from '@/logger';

/**
 * Starts a span for each API request and writes one log line when the
 * request completes (or the client disconnects before the response is sent).
 *
 * Levels: `error` for 5xx and aborted requests, `warn` for 4xx, `info`
 * otherwise. Successful health checks are logged at `debug`.
 */
export const requestTracing =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const { trace: tracing, propagation, context } = opentelemetry;

    const tracer = tracing.getTracer('baseball-bat');
    // Query strings can carry auth tokens and OAuth codes, which must not
    // end up in span names or logs.
    const url = redactUrl(req.originalUrl);
    const name = `[${req.method}] ${url}`;

    const newContext = propagation.extract(context.active(), {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate,
    });

    const span = (req.span = tracer.startSpan(
      name,
      {
        root: !req.headers.traceparent,
        attributes: {
          [ATTR_HTTP_ROUTE]: url,
          [ATTR_HTTP_REQUEST_METHOD]: req.method,
          parent: req.headers.taceparent,
        },
      },
      newContext,
    ));

    // Make the request span the active span for the rest of the request, so
    // that child spans attach to it and log lines carry its `trace_id`.
    // Binding `req` and `res` keeps the context in their event listeners
    // (body parsing, the completion handler below).
    const requestContext = tracing.setSpan(newContext, span);
    context.bind(requestContext, req);
    context.bind(requestContext, res);

    // Computed up front: nested routers rewrite `req.path` while routing.
    const isHealthCheck = /^\/health(\/|$)/.test(req.path);
    const start = process.hrtime.bigint();
    let done = false;

    const onDone = () => {
      if (done) return;
      done = true;

      const responseTime =
        Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
      const aborted = !res.writableFinished;

      let level: 'debug' | 'info' | 'warn' | 'error' = 'info';

      if (aborted || res.statusCode >= 500) {
        level = 'error';
      } else if (res.statusCode >= 400) {
        level = 'warn';
      } else if (isHealthCheck) {
        // Successful health checks would otherwise flood the logs.
        level = 'debug';
      }

      logger[level](
        {
          req: {
            method: req.method,
            url,
            userAgent: req.headers['user-agent'],
          },
          res: { statusCode: res.statusCode },
          responseTime,
        },
        aborted ? 'request aborted' : 'request completed',
      );

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.statusCode);
      span.end();
    };

    res.on('finish', onDone);
    res.on('close', onDone);

    context.with(requestContext, next);
  };

/**
 * Final error handler. Replaces Express's default one, which writes plain
 * text stack traces to stderr, and keeps its status code handling: errors
 * carrying a 4xx or 5xx status (e.g. malformed JSON bodies) keep it, anything
 * else is a 500.
 */
export const errorLogging =
  (logger: Logger): ErrorRequestHandler =>
  (err, req, res, _next) => {
    const errStatus = err?.status ?? err?.statusCode;
    const status =
      typeof errStatus === 'number' && errStatus >= 400 && errStatus < 600
        ? errStatus
        : 500;

    logger[status >= 500 ? 'error' : 'warn'](
      {
        err,
        req: { method: req.method, url: redactUrl(req.originalUrl) },
        res: { statusCode: status },
      },
      'Unhandled error while handling request',
    );

    if (res.headersSent) {
      // Too late to send an error response. Express's default handler would
      // also just close the connection, but log a plain text stack first.
      res.destroy();
      return;
    }

    res.sendStatus(status);
  };
