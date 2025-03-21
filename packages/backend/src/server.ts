import express from 'express';
import path from 'path';
import opentelemetry from '@opentelemetry/api';
import crypto from 'crypto';
import {
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';
import helmet, { HelmetOptions } from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import initServices from '@/modules';
import apiRoutes, { ApiDeps } from './api';
import { ModuleDeps } from './module';

const helmetConfig: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", '*.stripe.com'],
      scriptSrc:
        process.env.NODE_ENV !== 'production'
          ? [
              "'self'",
              '*.stripe.com',
              "'unsafe-eval'",
              'ws://bbat.tko-aly.localhost:1234',
              'ws://localhost:1234',
            ]
          : ["'self'", '*.stripe.com'],
      connectSrc:
        process.env.NODE_ENV !== 'production'
          ? [
              "'self'",
              'ws://bbat.tko-aly.localhost:1234',
              'ws://localhost:1234',
            ]
          : ["'self'"],
      frameAncestors: ['*.stripe.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
};

export default async (deps: ApiDeps & ModuleDeps) => {
  const app = express()
    .use('/api', (req, res, next) => {
      const { trace: tracing, propagation, context } = opentelemetry;

      const tracer = tracing.getTracer('baseball-bat');
      const name = `[${req.method}] ${req.originalUrl}`;

      const newContext = propagation.extract(context.active(), {
        traceparent: req.headers.traceparent,
        tracestate: req.headers.tracestate,
      });

      const span = (req.span = tracer.startSpan(
        name,
        {
          root: !req.headers.traceparent,
          attributes: {
            [ATTR_HTTP_ROUTE]: req.originalUrl,
            [ATTR_HTTP_REQUEST_METHOD]: req.method,
            parent: req.headers.taceparent,
          },
        },
        newContext,
      ));

      // Set the created span as active in the deserialized context.
      tracing.setSpan(newContext, span);

      const id = crypto.randomBytes(4).toString('hex');
      const start = process.hrtime.bigint();

      const idSegment = deps.logger.isDebugEnabled() ? `[${id}] ` : '';

      res.on('finish', () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start);

        deps.logger.info(
          `${idSegment}${`[${req.method}]`.padEnd(6)} ${req.originalUrl} [${res.statusCode}] [${(duration / 1_000_0000).toFixed(2)}ms]`,
          {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
          },
        );

        span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.statusCode);
        span.end();
      });

      deps.logger.debug(
        `${idSegment}${`[${req.method}]`.padEnd(6)} ${req.originalUrl}`,
      );

      next();
    })
    .use(helmet(helmetConfig))
    .use(
      cors({
        methods: ['GET', 'POST', 'OPTIONS'],
        origin: [deps.config.appUrl],
      }),
    )
    .use(
      express.json({
        verify: (req, _res, buf) => {
          (req as Express.Request).rawBody = buf;
        },
      }),
    )
    .use(cookieParser());

  apiRoutes(deps, deps, app);
  await initServices(app, deps);

  if (process.env.NODE_ENV !== 'production') {
    const staticPath = path.resolve(__dirname, '../../frontend/dist');

    app.use('/', express.static(staticPath));

    app.use('/', (_req, res) =>
      res.sendFile(path.join(staticPath, 'index.html')),
    );
  }

  return app;
};
