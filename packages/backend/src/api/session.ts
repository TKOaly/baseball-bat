import { router } from 'typera-express';
import { ok, redirect } from 'typera-express/response';
import base64url from 'base64url';
import auth from '@/auth-middleware';
import { ApiFactory } from '.';
import {
  getPayerPreferences,
  getPayerProfileByInternalIdentity,
} from '@/modules/payers/definitions';

const factory: ApiFactory = ({ config }, route) => {
  const getSession = route
    .use(auth({ unauthenticated: true }))
    .get('/')
    .handler(async ({ session, bus }) => {
      if (session.authLevel === 'unauthenticated') {
        return ok({
          authLevel: 'unauthenticated',
        });
      }

      const id = session.payerId;

      const payerProfile = await bus.exec(
        getPayerProfileByInternalIdentity,
        id,
      );
      const preferences = await bus.exec(getPayerPreferences, id);

      return ok({
        authLevel: session.authLevel,
        accessLevel: session.accessLevel,
        payerProfile,
        preferences,
      });
    });

  const login = route.get('/login').handler(ctx => {
    const payload = base64url.encode(
      JSON.stringify({
        target: ctx.req.query.target,
      }),
    );

    let redirectUrl = null;

    if (
      ctx.req.query.target === 'welcome' &&
      typeof ctx.req.query.token === 'string'
    ) {
      redirectUrl = `${config.appUrl}/api/auth/merge?token=${encodeURIComponent(
        ctx.req.query.token,
      )}`;
    }

    return redirect(
      302,
      `${config.userServiceUrl}?serviceIdentifier=${
        config.serviceId
      }&payload=${payload}${
        redirectUrl ? `&loginRedirect=${encodeURIComponent(redirectUrl)}` : ''
      }`,
    );
  });

  return router(getSession, login);
};

export default factory;
