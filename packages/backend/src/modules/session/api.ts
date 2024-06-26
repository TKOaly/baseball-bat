import { RouterFactory } from '@/module';
import { Client } from 'openid-client';
import auth, { AuthService } from '@/auth-middleware';
import {
  badRequest,
  internalServerError,
  notFound,
  ok,
  redirect,
  unauthorized,
} from 'typera-express/response';
import * as payers from '@/modules/payers/definitions';
import { router } from 'typera-express';
import { emailIdentity, tkoalyIdentity } from '@bbat/common/types';
import * as t from 'io-ts';
import { Parser } from 'typera-express';
import { sendEmailDirect } from '../email/definitions';

const sendAuthCodeBody = t.type({
  email: t.string,
});

const validateAuthCodeBody = t.type({
  id: t.string,
  code: t.string,
});

type Module = {
  client: Client;
  auth: AuthService;
};

const factory: RouterFactory<Module> = (route, { config }) => {
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

  const callback = route.get('/callback').handler(async ctx => {
    const { bus } = ctx;
    const { client, auth } = ctx.module;

    const params = client.callbackParams(ctx.req);
    const tokenSet = await client.callback(
      `${config.appUrl}/api/session/callback`,
      params,
    );
    const claims = tokenSet.claims();

    const payerProfile = await bus.exec(
      payers.createPayerProfileFromTkoalyIdentity,
      {
        id: tkoalyIdentity(parseInt(claims.sub, 10)),
      },
    );

    if (!payerProfile || payerProfile.disabled) {
      return redirect(302, '/');
    }

    const sessionToken = await auth.createSession();
    const { token } = await auth.createAuthToken(payerProfile.id, sessionToken);
    await auth.resolveAuthToken(token);

    return redirect(
      302,
      `${config.appUrl}/?token=${encodeURIComponent(token)}`,
    );
  });

  const login = route.get('/login').handler(ctx => {
    const { client } = ctx.module;

    /*const payload = base64url.encode(
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
    }*/

    const url = client.authorizationUrl({
      scope: 'openid role profile membership',
    });

    return redirect(302, url);

    /*
      `${config.userServiceUrl}?serviceIdentifier=${
        config.serviceId
      }&payload=${payload}${
        redirectUrl ? `&loginRedirect=${encodeURIComponent(redirectUrl)}` : ''
      }`,
    );*/
  });

  const destroySession = route
    .delete('/')
    .use(
      auth({
        unauthenticated: true,
      }),
    )
    .handler(async ctx => {
      await ctx.module.auth.destroySession(ctx.session.token);

      return ok();
    });

  const createSession = route.post('/').handler(async ctx => {
    const token = await ctx.module.auth.createSession();
    return ok({ token });
  });

  const authenticateSession = route
    .post('/authenticate')
    .use(
      Parser.body(
        t.type({
          id: t.string,
          remote: t.boolean,
        }),
      ),
    )
    .use(
      auth({
        unauthenticated: true,
      }),
    )
    .handler(async ({ body, session, bus, module }) => {
      const { auth } = module;
      const authenticated = await auth.getAuthTokenStatus(body.id);

      if (!authenticated) {
        console.log('Not authenticated!');
        return unauthorized({
          message: 'Not authenticated!',
        });
      }

      const payerId = await auth.getAuthTokenPayerId(body.id);

      if (!payerId) {
        console.log('No such user');

        return internalServerError();
      }

      const payerProfile = await bus.exec(
        payers.getPayerProfileByInternalIdentity,
        payerId,
      );

      if (!payerProfile) {
        console.log('Could not fetch user');
        return internalServerError();
      }

      let sessionToken: string | null = session.token;

      if (body.remote) {
        sessionToken = await auth.getAuthTokenSession(body.id);
      }

      if (!sessionToken) {
        return badRequest();
      }

      await auth.authenticate(bus, sessionToken, payerId, 'email');

      return ok();
    });

  const sendAuthCode = route
    .post('/request-code')
    .use(
      auth({
        unauthenticated: true,
      }),
    )
    .use(Parser.body(sendAuthCodeBody))
    .handler(async ({ body, session, bus, module }) => {
      const payer = await bus.exec(
        payers.getPayerProfileByEmailIdentity,
        emailIdentity(body.email),
      );

      if (!payer) {
        return notFound();
      }

      const { token, code } = await module.auth.createAuthToken(
        payer.id,
        session.token,
      );

      await bus.exec(sendEmailDirect, {
        recipient: body.email,
        subject: 'Your Authentication Code',
        template: 'auth-code',
        payload: {
          code,
        },
      });

      return ok({ id: token });
    });

  const validateAuthCode = route
    .post('/validate-code')
    .use(
      auth({
        unauthenticated: true,
      }),
    )
    .use(Parser.body(validateAuthCodeBody))
    .handler(async ({ body, module }) => {
      const valid = await module.auth.validateAuthTokenCode(body.id, body.code);

      if (valid) {
        await module.auth.resolveAuthToken(body.id);

        return ok({ success: true });
      }

      return ok({ success: false });
    });

  return router(
    authenticateSession,
    sendAuthCode,
    validateAuthCode,
    destroySession,
    callback,
    createSession,
    getSession,
    login,
  );
};

export default factory;
