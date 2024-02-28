import { createModule } from '@/module';
import routes from './api';

export default createModule({
  name: 'search',

  routes,

  // eslint-disable-next-line
  async setup() {
    // Module contains only API routes
  },
});
