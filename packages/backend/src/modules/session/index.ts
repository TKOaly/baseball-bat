import { createModule } from '@/module';
import { Issuer } from 'openid-client';
import routes from './api';
import { authServiceFactory } from '@/auth-middleware';

export default createModule({
  name: 'session',

  routes,

  async setup({ config, bus, redis }) {
    const issuer = await Issuer.discover(config.userServiceApiUrl);

    const client = new issuer.Client({
      client_id: config.serviceId,
      client_secret: config.serviceSecret,
      response_types: ['code'],
      redirect_uris: [`${config.appUrl}/api/session/callback`],
    });

    const auth = authServiceFactory({
      bus,
      redis,
      config,
    });

    return { client, auth };
  },
});
