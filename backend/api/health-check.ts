import { route } from 'typera-express';
import { ok } from 'typera-express/response';

export default route
  .get('/health')
  .handler(() => ok({ message: 'Hello world' }));
