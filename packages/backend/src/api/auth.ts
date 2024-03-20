import { router } from 'typera-express';
import {
  internalServerError,
  redirect,
  ok,
  badRequest,
  notFound,
  unauthorized,
} from 'typera-express/response';
import * as usersService from '@/modules/users/definitions';
import * as payerService from '@/modules/payers/definitions';
import * as emailService from '@/modules/email/definitions';
import {
  emailIdentity,
  TkoalyIdentity,
  tkoalyIdentity,
} from '@bbat/common/build/src/types';
import { validateBody } from '../validate-middleware';
import * as t from 'io-ts';
import { ApiFactory } from '.';
import { getTokenUpstreamUser } from '@/modules/users/definitions';
import { createPayerProfileFromTkoalyIdentity } from '@/modules/payers/definitions';
import { authServiceFactory } from '@/auth-middleware';

const sendAuthCodeBody = t.type({
  email: t.string,
});

const validateAuthCodeBody = t.type({
  id: t.string,
  code: t.string,
});

const factory: ApiFactory = ({ config, bus, redis }, route) => {
  const auth = authServiceFactory({
    bus,
    redis,
    config,
  });

  const authCompleted = route
    .get('/auth/auth-completed')
    .handler(async ({ req, bus }) => {
      const upstreamUser = await bus.exec(
        getTokenUpstreamUser,
        req.cookies.token,
      );

      if (!upstreamUser) {
        return internalServerError();
      }

      const payerProfile = await bus.exec(
        createPayerProfileFromTkoalyIdentity,
        {
          id: upstreamUser.id,
        },
      );

      if (!payerProfile) {
        return internalServerError();
      }

      const sessionToken = await auth.createSession();
      const { token } = await auth.createAuthToken(
        payerProfile.id,
        sessionToken,
      );
      await auth.resolveAuthToken(token);

      return redirect(302, `${config.appUrl}/?token=${token}`);
    });

  const getUsers = route
    .get('/users')
    .use(auth.createAuthMiddleware())
    .handler(async ({ bus }) => {
      const users = await bus.exec(usersService.getUpstreamUsers);

      return ok(users);
    });

  const getUser = route
    .get('/users/:id')
    .use(
      auth.createAuthMiddleware({
        accessLevel: 'normal',
      }),
    )
    .handler(async ctx => {
      const { bus } = ctx;
      let userId: TkoalyIdentity;

      if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
        return unauthorized();
      }

      if (ctx.routeParams.id === 'me') {
        const profile = await bus.exec(
          payerService.getPayerProfileByInternalIdentity,
          ctx.session.payerId,
        );

        if (profile && profile.tkoalyUserId) {
          userId = profile?.tkoalyUserId;
        } else {
          return notFound();
        }
      } else {
        try {
          userId = tkoalyIdentity(parseInt(ctx.routeParams.id));
        } catch {
          return notFound();
        }
      }

      const user = await bus.exec(usersService.getUpstreamUserById, {
        id: userId,
      });

      if (!user) {
        return notFound();
      }

      return ok(user);
    });

  const initSession = route.post('/auth/init').handler(async () => {
    const token = await auth.createSession();
    return ok({ token });
  });

  const mergeSession = route
    .get('/auth/merge')
    .use(
      auth.createAuthMiddleware({
        accessLevel: 'normal',
        allowQueryToken: true,
      }),
    )
    .handler(async ({ session, bus, req }) => {
      const upstreamUser = await bus.exec(
        usersService.getTokenUpstreamUser,
        req.cookies.token,
      );

      if (!upstreamUser) {
        return internalServerError();
      }

      const associatedProfile = await bus.exec(
        payerService.getPayerProfileByTkoalyIdentity,
        upstreamUser.id,
      );

      if (associatedProfile) {
        await bus.exec(payerService.mergeProfiles, {
          primary: associatedProfile.id,
          secondary: session.payerId,
        });
      } else {
        await bus.exec(payerService.setProfileTkoalyIdentity, {
          id: session.payerId,
          tkoalyId: upstreamUser.id,
        });
      }

      await bus.exec(payerService.updatePayerPreferences, {
        id: session.payerId,
        preferences: {
          hasConfirmedMembership: true,
        },
      });

      return redirect(302, `${config.appUrl}`);
    });

  const authenticateSession = route
    .post('/auth/authenticate')
    .use(
      validateBody(
        t.type({
          id: t.string,
          remote: t.boolean,
        }),
      ),
    )
    .use(
      auth.createAuthMiddleware({
        unauthenticated: true,
      }),
    )
    .handler(async ({ body, session, bus }) => {
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
        payerService.getPayerProfileByInternalIdentity,
        payerId,
      );

      if (!payerProfile) {
        console.log('Could not fetch user');
        return internalServerError();
      }

      if (!payerProfile.tkoalyUserId) {
        return unauthorized({
          message:
            'Use of the service is currently limited. Please try again later!',
        });
      }

      const upstreamUser = await bus.exec(usersService.getUpstreamUserById, {
        id: payerProfile.tkoalyUserId,
      });

      if (upstreamUser?.role !== 'yllapitaja') {
        return unauthorized({
          message:
            'Use of the service is currently limited. Please try again later!',
        });
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

  const destroySession = route
    .post('/auth/destroy-session')
    .use(
      auth.createAuthMiddleware({
        unauthenticated: true,
      }),
    )
    .handler(async ctx => {
      await auth.destroySession(ctx.session.token);

      return ok();
    });

  const sendAuthCode = route
    .post('/auth/request-code')
    .use(
      auth.createAuthMiddleware({
        unauthenticated: true,
      }),
    )
    .use(validateBody(sendAuthCodeBody))
    .handler(async ({ body, session, bus }) => {
      const payer = await bus.exec(
        payerService.getPayerProfileByEmailIdentity,
        emailIdentity(body.email),
      );

      if (!payer) {
        return notFound();
      }

      const { token, code } = await auth.createAuthToken(
        payer.id,
        session.token,
      );

      await bus.exec(emailService.sendEmailDirect, {
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
    .post('/auth/validate-code')
    .use(
      auth.createAuthMiddleware({
        unauthenticated: true,
      }),
    )
    .use(validateBody(validateAuthCodeBody))
    .handler(async ({ body }) => {
      const valid = await auth.validateAuthTokenCode(body.id, body.code);

      if (valid) {
        await auth.resolveAuthToken(body.id);

        return ok({ success: true });
      }

      return ok({ success: false });
    });

  const confirmAuthWithLink = route
    .get('/auth/confirm')
    .handler(async ({ req }) => {
      if (
        typeof req.query.id !== 'string' ||
        typeof req.query.secret !== 'string'
      ) {
        return badRequest();
      }

      const valid = await auth.validateAuthTokenSecret(
        req.query.id,
        req.query.secret,
      );

      if (!valid) {
        return unauthorized({});
      }

      await auth.resolveAuthToken(req.query.id);

      return redirect(
        302,
        `${config.appUrl}/auth/email/confirm/${req.query.id}`,
      );
    });

  const pollAuthStatus = route
    .post('/auth/poll-status')
    .use(validateBody(t.type({ id: t.string })))
    .handler(async ({ body }) => {
      return ok({
        authenticated: await auth.getAuthTokenStatus(body.id, 3),
      });
    });

  const renderTemplate = route
    .get('/template/:name/:type')
    .handler(async ctx => {
      if (ctx.routeParams.type !== 'html' && ctx.routeParams.type !== 'text') {
        return badRequest();
      }

      return notFound();

      /* TODO return ok(
        await bus.exec(emailService.renderTemplate, {
          name: ctx.routeParams.name,
          type: ctx.routeParams.type,
          payload: {},
        }),
      ); */
    });

  return router(
    getUsers,
    authCompleted,
    validateAuthCode,
    pollAuthStatus,
    sendAuthCode,
    confirmAuthWithLink,
    renderTemplate,
    initSession,
    authenticateSession,
    getUser,
    destroySession,
    mergeSession,
  );
};

export default factory;
