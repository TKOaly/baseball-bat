import { Parser, router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import * as emailService from '@/modules/email/definitions';
import auth from '@/auth-middleware';
import { validateBody } from '@/validate-middleware';
import * as t from 'io-ts';
import { RouterFactory } from '@/module';
import { paginationQuery } from '@bbat/common/types';

const factory: RouterFactory = route => {
  const getEmails = route
    .get('/')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ query, bus }) => {
      const emails = await bus.exec(emailService.getEmails, query);
      return ok(emails);
    });

  const getEmailsByDebt = route
    .get('/by-debt/:debt')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query, ...ctx }) => {
      const emails = await bus.exec(emailService.getEmailsByDebt, {
        debtId: ctx.routeParams.debt,
        ...query,
      });
      return ok(emails);
    });

  const getEmail = route
    .get('/:id')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const email = await bus.exec(emailService.getEmail, ctx.routeParams.id);
      return ok(email);
    });

  const renderEmail = route
    .get('/:id/render')
    .handler(async ({ bus, ...ctx }) => {
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
    .use(auth())
    .use(validateBody(t.type({ ids: t.array(t.string) })))
    .handler(async ({ body, bus }) => {
      await Promise.all(
        body.ids.map(async id => {
          await bus.exec(emailService.sendEmail, id);
        }),
      );

      return ok();
    });

  return router(getEmails, getEmail, renderEmail, sendEmails, getEmailsByDebt);
};

export default factory;
