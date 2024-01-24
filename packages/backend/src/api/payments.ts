import { route, router } from 'typera-express';
import {
  badRequest,
  forbidden,
  internalServerError,
  notFound,
  ok,
  unauthorized,
} from 'typera-express/response';
import * as t from 'io-ts';
import * as paymentService from '@/services/payments/definitions';
import * as payerService from '@/services/payers/definitions';
import * as debtService from '@/services/debts/definitions';
import * as bankingService from '@/services/banking/definitions';
import { internalIdentity } from '@bbat/common/build/src/types';
import { validateBody } from '../validate-middleware';
import {
  cents,
  euro,
  euroValue,
  formatEuro,
  sumEuroValues,
} from '@bbat/common/build/src/currency';
import { headers } from 'typera-express/parser';
import Stripe from 'stripe';
import { ApiDeps } from '.';

export default ({ auth, bus, config, stripe }: ApiDeps) => {
  const getPayments = route
    .get('/')
    .use(auth.createAuthMiddleware())
    .handler(async () => {
      const payments = await bus.exec(paymentService.getPayments);
      return ok(payments);
    });

  const getPayment = route
    .get('/:id')
    .use(
      auth.createAuthMiddleware({
        accessLevel: 'normal',
      }),
    )
    .handler(async ctx => {
      const payment = await bus.exec(
        paymentService.getPayment,
        ctx.routeParams.id,
      );
      const debts = await bus.exec(
        debtService.getDebtsByPayment,
        ctx.routeParams.id,
      );

      if (
        ctx.session.accessLevel !== 'admin' &&
        ctx.session.payerId.value !== payment?.payerId?.value
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
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.type({
          transactionId: t.string,
          amount: euroValue,
        }),
      ),
    )
    .handler(async ctx => {
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
    .use(auth.createAuthMiddleware({ accessLevel: 'normal' }))
    .use(
      validateBody(
        t.type({
          debts: t.array(t.string),
          sendEmail: t.boolean,
        }),
      ),
    )
    .handler(async ctx => {
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

      const payment = await bus.exec(paymentService.createInvoice, {
        invoice: {
          series: 9,
          debts: debts.map(d => d.id),
          title: 'Combined invoice',
          date: null,
          referenceNumber: null,
          paymentNumber: null,
          message:
            'Invoice for the following debts:\n' +
            debts
              .map(
                d =>
                  ` - ${d.name} (${formatEuro(
                    d.debtComponents
                      .map(dc => dc.amount)
                      .reduce(sumEuroValues, euro(0)),
                  )})`,
              )
              .join('\n'),
        },
        options: {
          sendNotification: ctx.body.sendEmail,
        },
      });

      return ok(payment);
    });

  const createStripePayment = route
    .post('/create-stripe-payment')
    .use(auth.createAuthMiddleware({ accessLevel: 'normal' }))
    .use(
      validateBody(
        t.type({
          debts: t.array(t.string),
        }),
      ),
    )
    .handler(async ctx => {
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

      const result = await bus.exec(paymentService.createStripePayment, {
        debts: debts.map(d => d.id),
      });

      return ok(result);
    });

  const getOwnPayments = route
    .get('/my')
    .use(
      auth.createAuthMiddleware({
        accessLevel: 'normal',
      }),
    )
    .handler(async ({ session }) => {
      const payments = await bus.exec(
        paymentService.getPayerPayments,
        session.payerId,
      );
      return ok(payments);
    });

  const creditPayment = route
    .post('/:id/credit')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      await bus.exec(paymentService.creditPayment, {
        id: ctx.routeParams.id,
        reason: 'manual',
      });

      return ok();
    });

  const stripeWebhook = route
    .post('/')
    .use(
      headers(
        t.type({
          'stripe-signature': t.string,
        }),
      ),
    )
    .handler(async ctx => {
      const secret = config.stripeWebhookSecret;

      let event;

      try {
        event = stripe.webhooks.constructEvent(
          ctx.req.body,
          ctx.headers['stripe-signature'],
          secret,
        );
      } catch (err) {
        console.log(err, typeof ctx.req.body, ctx.headers['stripe-signature']);
        return badRequest({
          error: `Webhook Error: ${err}`,
        });
      }

      let intent;

      if (event.type === 'payment_intent.succeeded') {
        intent = event.data.object as any as Stripe.PaymentIntent;

        const paymentId = intent.metadata.paymentId;

        if (intent.currency !== 'eur') {
          return internalServerError(
            'Currencies besides EUR are not supported!',
          );
        }

        await bus.exec(paymentService.createPaymentEvent, {
          paymentId,
          type: 'payment',
          amount: cents(intent.amount),
          data: {},
          time: undefined,
          transaction: null,
        });
      } else if (event.type === 'payment_intent.payment_failed') {
        intent = event.data.object as any as Stripe.PaymentIntent;

        const { paymentId } = intent.metadata;

        await bus.exec(paymentService.createPaymentEvent, {
          paymentId,
          type: 'failed',
          amount: euro(0),
          data: {},
          time: undefined,
          transaction: null,
        });
      } else if (event.type === 'payment_intent.processing') {
        intent = event.data.object as any as Stripe.PaymentIntent;

        const { paymentId } = intent.metadata;

        await bus.exec(paymentService.createPaymentEvent, {
          paymentId,
          type: 'other',
          amount: euro(0),
          data: {
            stripe: {
              type: 'processing',
            },
          },
          time: undefined,
          transaction: null,
        });
      } else {
        console.log('Other Stripe event: ' + event.type, event);
      }

      return ok();
    });

  const deletePaymentEvent = route
    .delete('/events/:id')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
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
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.type({
          amount: euroValue,
        }),
      ),
    )
    .handler(async ctx => {
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
    stripeWebhook,
    deletePaymentEvent,
    updatePaymentEvent,
  );
};
