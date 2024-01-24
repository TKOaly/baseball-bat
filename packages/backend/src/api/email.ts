import { route, router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import * as emailService from '@/services/email/definitions';
import { validateBody } from '../validate-middleware';
import * as t from 'io-ts';
import { ApiDeps } from '.';

export default ({ auth, bus }: ApiDeps) => {
  const getEmails = route
    .get('/')
    .use(auth.createAuthMiddleware())
    .handler(async () => {
      const emails = await bus.exec(emailService.getEmails);
      return ok(emails);
    });

  const getEmailsByDebt = route
    .get('/by-debt/:debt')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const emails = await bus.exec(
        emailService.getEmailsByDebt,
        ctx.routeParams.debt,
      );
      return ok(emails);
    });

  const getEmail = route
    .get('/:id')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const email = await bus.exec(emailService.getEmail, ctx.routeParams.id);
      return ok(email);
    });

  const renderEmail = route.get('/:id/render').handler(async ctx => {
    const email = await bus.exec(emailService.getEmail, ctx.routeParams.id);

    if (!email) {
      return notFound();
    }

    ctx.res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");

    if (email.html) {
      ctx.res.setHeader('Content-Type', 'text/html');
      return ok(email.html);
    } else {
      ctx.res.setHeader('Content-Type', 'text/text');
      return ok(email.text);
    }
  });

  const sendEmails = route
    .post('/send')
    .use(auth.createAuthMiddleware())
    .use(validateBody(t.type({ ids: t.array(t.string) })))
    .handler(async ({ body }) => {
      await Promise.all(
        body.ids.map(async id => {
          await bus.exec(emailService.sendEmail, id);
        }),
      );

      return ok();
    });

  return router(getEmails, getEmail, renderEmail, sendEmails, getEmailsByDebt);
};
