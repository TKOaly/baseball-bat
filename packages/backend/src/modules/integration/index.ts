import { createModule } from "@/module";
import routes from "./api";
import startWorker from './worker'; 

export default createModule({
  name: 'integration',

  routes,

  async setup({ pool, bus, nats, config }) {
    (async () => {
      while (true) {
        try {
          await startWorker(pool, bus, config, nats);
        } catch (err) {
          console.error('Worker threw an error:', err);
        }
      }
    })();
  }
});
