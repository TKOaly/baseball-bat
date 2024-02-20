import { createScope } from './bus';
import * as t from 'io-ts';

const appScope = createScope('app');

export const shutdown = appScope.defineEvent('shutdown', t.void);
