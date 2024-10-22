import { createModule } from '@/module';
import routes from './api';
import startWorker from './worker';

export default createModule({
  name: 'integration',

  routes,

  async setup(context) {
    (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          await startWorker(context);
        } catch (err) {
          context.logger.error(`Worker threw an error: ${err}`);
        }
      }
    })();
  },
});
