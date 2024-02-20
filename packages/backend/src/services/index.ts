import { ModuleDeps } from '@/app';

import debts from './debts';
import accounting from './accounting';
import banking from './banking';
import debtCenters from './debt-centers';
import email from './email';
import events from './events';
import payments from './payments';
import payers from './payers';
import users from './users';
import invoices from './invoices';
import stripe from './stripe';

export default async (deps: ModuleDeps) => {
  await Promise.all([
    accounting(deps),
    banking(deps),
    debtCenters(deps),
    debts(deps),
    email(deps),
    events(deps),
    payers(deps),
    users(deps),
    payments(deps),
    invoices(deps),
    stripe(deps),
  ]);
};
