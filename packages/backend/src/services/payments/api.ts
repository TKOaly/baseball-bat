import { router } from 'typera-express';
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  unauthorized,
} from 'typera-express/response';
import * as t from 'io-ts';
import * as paymentService from '@/services/payments/definitions';
import * as payerService from '@/services/payers/definitions';
import * as debtService from '@/services/debts/definitions';
import * as bankingService from '@/services/banking/definitions';
import { validateBody } from '@/validate-middleware';
import { euroValue } from '@bbat/common/build/src/currency';
import auth from '@/auth-middleware';
import { RouterFactory } from '@/module';

const factory: RouterFactory = route => {
  const getPayments = route
    .get('/')
    .use(auth())
    .handler(async ({ bus }) => {
      const payments = await bus.exec(paymentService.getPayments);
      return ok(payments);
    });

  const getPayment = route
    .get('/:id')
    .use(
      auth({
        accessLevel: 'normal',
      }),
    )
    .handler(async ({ bus, ...ctx }) => {
      const payment = await bus.exec(
        paymentService.getPayment,
        ctx.routeParams.id,
      );
      const debts = await bus.exec(
        debtService.getDebtsByPayment,
        ctx.routeParams.id,
      );

      if (
        ctx.session.accessLevel !== 'admin' // &&
        // ctx.session.payerId.value !== payment?.payerId?.value
      ) {
        return unauthorized();
      }

      return ok({
        payment,
        debts,
      });
    });

  const registerTransaction = route
    .post('/:id/register')
    .use(auth())
    .use(
      validateBody(
        t.type({
          transactionId: t.string,
          amount: euroValue,
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      const { id } = ctx.routeParams;
      const { amount, transactionId } = ctx.body;

      const transaction = await bus.exec(
        bankingService.getTransaction,
        transactionId,
      );

      if (!transaction) {
        return notFound('No such transaction found');
      }

      const event = await bus.exec(
        paymentService.createPaymentEventFromTransaction,
        {
          transaction,
          amount,
          paymentId: id,
        },
      );

      return ok(event);
    });

  const createInvoice = route
    .post('/create-invoice')
    .use(auth({ accessLevel: 'normal' }))
    .use(
      validateBody(
        t.type({
          debts: t.array(t.string),
          sendEmail: t.boolean,
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      const debts = await Promise.all(
        ctx.body.debts.map(async id => {
          const debt = await bus.exec(debtService.getDebt, id);

          if (!debt) {
            return Promise.reject(badRequest());
          }

          if (
            ctx.session.accessLevel !== 'admin' &&
            debt.payerId.value !== ctx.session.payerId.value
          ) {
            return Promise.reject(unauthorized());
          }

          return debt;
        }),
      );

      if (!debts.every(d => d.payerId.value === debts[0].payerId.value)) {
        return badRequest('All debts do not have the same payer');
      }

      const email = await bus.exec(
        payerService.getPayerPrimaryEmail,
        debts[0].payerId,
      );

      if (!email) {
        throw new Error(
          `Payer ${debts[0].payerId} does not have a primary email`,
        );
      }

      const payment = await bus.exec(debtService.createCombinedPayment, {
        type: 'invoice',
        debts: debts.map(d => d.id),
        options: {
          dueDate: new Date(),
        },
      });

      return ok(payment);
    });

  const createStripePayment = route
    .post('/create-stripe-payment')
    .use(auth({ accessLevel: 'normal' }))
    .use(
      validateBody(
        t.type({
          debts: t.array(t.string),
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      if (process.env.NODE_ENV !== 'development') {
        console.log(process.env.NODE_ENV);
        return forbidden();
      }

      const debts = await Promise.all(
        ctx.body.debts.map(async id => {
          const debt = await bus.exec(debtService.getDebt, id);

          if (!debt) {
            return Promise.reject(badRequest());
          }

          if (
            ctx.session.accessLevel !== 'admin' &&
            debt.payerId.value !== ctx.session.payerId.value
          ) {
            return Promise.reject(unauthorized());
          }

          return debt;
        }),
      );

      if (!debts.every(d => d.payerId.value === debts[0].payerId.value)) {
        return badRequest('All debts do not have the same payer');
      }

      const result = await bus.exec(debtService.createCombinedPayment, {
        type: 'stripe',
        debts: debts.map(d => d.id),
        options: {},
      });

      return ok(result);
    });

  const getOwnPayments = route
    .get('/my')
    .use(
      auth({
        accessLevel: 'normal',
      }),
    )
    .handler(async ({ session, bus }) => {
      const payments = await bus.exec(
        paymentService.getPayerPayments,
        session.payerId,
      );
      return ok(payments);
    });

  const creditPayment = route
    .post('/:id/credit')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      await bus.exec(paymentService.creditPayment, {
        id: ctx.routeParams.id,
        reason: 'manual',
      });

      return ok();
    });

  const deletePaymentEvent = route
    .delete('/events/:id')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const event = await bus.exec(
        paymentService.deletePaymentEvent,
        ctx.routeParams.id,
      );

      if (!event) {
        return notFound();
      }

      return ok(event);
    });

  const updatePaymentEvent = route
    .patch('/events/:id')
    .use(auth())
    .use(
      validateBody(
        t.type({
          amount: euroValue,
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      const event = await bus.exec(paymentService.updatePaymentEvent, {
        id: ctx.routeParams.id,
        amount: ctx.body.amount,
      });

      return ok(event);
    });

  return router(
    getPayments,
    getOwnPayments,
    createInvoice,
    getPayment,
    creditPayment,
    registerTransaction,
    createStripePayment,
    deletePaymentEvent,
    updatePaymentEvent,
  );
};

export default factory;
