import { route, router } from 'typera-express';
import { internalIdentity } from '@bbat/common/build/src/types';
import { ok, redirect, unauthorized } from 'typera-express/response';
import base64url from 'base64url';
import { ApiDeps } from '.';
import {
  getPayerPreferences,
  getPayerProfileByInternalIdentity,
} from '@/services/payers/definitions';

const init = ({ auth, bus, config }: ApiDeps) => {
  const getSession = route
    .use(auth.createAuthMiddleware({ unauthenticated: true }))
    .get('/')
    .handler(async ({ session, req }) => {
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

      if (!req.cookies.token) {
        return unauthorized();
      }

      const tokenPayload = JSON.parse(
        Buffer.from(req.cookies.token.split('.')[1], 'base64').toString(),
      );

      if (
        tokenPayload.authenticatedTo.split(',').indexOf(config.serviceId) === -1
      ) {
        return unauthorized();
      }

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

export default init;
