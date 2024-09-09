import { SkipModule, createModule } from '@/module';
import routes from './api';
import startWorker from './worker';

export default createModule({
  name: 'integration',

  routes,

  async setup({ pool, bus, nats, config }) {
    if (!config.integrationSecret) {
      console.log(`Integration secret missing; skipping integration module.`);
      return SkipModule;
    }

    if (!config.nats) {
      console.log(`NATS not configured; skipping integration module.`);
      return SkipModule;
    }

    (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          await startWorker(pool, bus, config, nats);
        } catch (err) {
          console.error('Worker threw an error:', err);
        }
      }
    })();

    return;
  },
});
