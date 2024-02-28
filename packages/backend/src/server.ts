import express from 'express';
import path from 'path';
import helmet, { HelmetOptions } from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import initServices from '@/services';
import { router } from 'typera-express';
import healthCheck from './api/health-check';
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
    .use((req, res, next) => {
      res.on('finish', () =>
        console.log(`${req.method} ${res.statusCode} ${req.url}`),
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
    .use(cookieParser())
    .use(router(healthCheck).handler());

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
