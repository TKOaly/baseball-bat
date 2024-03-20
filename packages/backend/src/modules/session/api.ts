import { RouterFactory } from '@/module';
import auth from '@/auth-middleware';
import { ok, redirect } from 'typera-express/response';
import * as payers from '@/modules/payers/definitions';
import { router } from 'typera-express';
import base64url from 'base64url';

const factory: RouterFactory = (route, { config }) => {
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
        payers.getPayerProfileByInternalIdentity,
        id,
      );
      const preferences = await bus.exec(payers.getPayerPreferences, id);

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
