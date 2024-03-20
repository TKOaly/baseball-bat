import { createModule } from '@/module';
import routes from './api';

export default createModule({
  name: 'session',

  routes,

  async setup() {},
});
