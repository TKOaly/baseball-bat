import { RouterFactory } from '@/module';
import Stripe from 'stripe';
import * as t from 'io-ts';
import { router } from 'typera-express';
import { headers } from 'typera-express/parser';
import { badRequest, internalServerError, ok } from 'typera-express/response';
import * as paymentService from '@/services/payments/definitions';
import { cents, euro } from '@bbat/common/currency';

export type StripeContext = {
  stripe: Stripe;
  secret: string;
};

const factory: RouterFactory<StripeContext> = route => {
  const webhook = route
    .post('/webhook')
    .use(
      headers(
        t.type({
          'stripe-signature': t.string,
        }),
      ),
    )
    .handler(async ({ bus, module, ...ctx }) => {
      const { secret, stripe } = module;

      let event;
      let body = ctx.req.rawBody!; // eslint-disable-line

      try {
        event = stripe.webhooks.constructEvent(
          body,
          ctx.headers['stripe-signature'],
          secret,
        );
      } catch (err) {
        console.log(err, typeof body, ctx.headers['stripe-signature'], secret);
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

  return router(webhook);
};

export default factory;
