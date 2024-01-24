import { Router, router } from 'typera-express';
import auth from './auth';
import express from 'express';
import accounting from './accounting';
import banking from './banking';
import centers from './centers';
import debt from './debt';
import email from './email';
import events from './events';
import payers from './payers';
import session from './session';
import payments from './payments';
import reports from './report';
import jobs from './jobs';
import { LocalBus } from '@/bus';
import { Config } from '@/config';
import { AuthService } from '@/auth-middleware';
import { JobService } from '@/services/jobs';
import Stripe from 'stripe';
import { PgClient } from '@/db';
import { RedisClientType } from 'redis';

export type ApiDeps = {
  bus: LocalBus;
  config: Config;
  redis: RedisClientType;
  auth: AuthService;
  pg: PgClient;
  jobs: JobService;
  stripe: Stripe;
};

type ApiFactory = (deps: ApiDeps) => Router;

export default (deps: ApiDeps, app: express.Express) => {
  const routes: Record<string, ApiFactory> = {
    session,
    accounting,
    banking,
    debt,
    events,
    jobs,
    email,
    debtCenters: centers,
    payers,
    payments,
    reports,
  };

  Object.entries(routes).forEach(([path, init]) =>
    app.use(`/api/${path}`, init(deps).handler()),
  );

  app.use('/api', auth(deps).handler());
};
