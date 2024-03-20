import { RouterFactory } from '@/module';
import Stripe from 'stripe';
import * as t from 'io-ts';
import { router } from 'typera-express';
import { headers } from 'typera-express/parser';
import { badRequest, notFound, ok } from 'typera-express/response';
import * as paymentService from '@/modules/payments/definitions';
import { EuroValue, cents } from '@bbat/common/currency';
import { Parser } from 'typera-express';

export type StripeContext = {
  stripe: Stripe;
  webhookSecret: string;
  publicKey: string;
};

const factory: RouterFactory<StripeContext> = route => {
  const config = route.get('/config').handler(async ({ module }) =>
    ok({
      publicKey: module.publicKey,
    }),
  );

  const getPayment = route
    .use(
      Parser.query(
        t.type({
          intent: t.string,
        }),
      ),
    )
    .get('/get-payment')
    .handler(async ({ bus, query }) => {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const payments = await bus.exec(paymentService.getPaymentsByData, {
        intent: query.intent,
      });

      if (payments.length > 1) {
        console.error(
          `Multiple payments associated with payment intent ${query.intent}`,
        );
        return notFound();
      }

      if (payments.length === 0) {
        return notFound({});
      }

      return ok({
        payment: payments[0],
      });
    });

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
      const { webhookSecret, stripe } = module;

      let event;
      let body = ctx.req.rawBody!; // eslint-disable-line

      try {
        event = stripe.webhooks.constructEvent(
          body,
          ctx.headers['stripe-signature'],
          webhookSecret,
        );
      } catch (err) {
        return badRequest({
          error: `Webhook Error: ${err}`,
        });
      }

      let paymentEvent:
        | ({ payment: string; intent: string } & {
            amount?: EuroValue;
            type?: string;
          })
        | null = null;

      if (event.type.startsWith('charge.')) {
        const chargeEvent = event as Extract<
          typeof event,
          { type: `charge.${string}` }
        >;

        let intent = chargeEvent.data.object.payment_intent;

        if (typeof intent === 'string') {
          intent = await stripe.paymentIntents.retrieve(intent);
        }

        if (!intent) {
          return ok();
        }

        paymentEvent = {
          intent: intent.id,
          payment: intent.metadata.paymentId,
        };

        if (chargeEvent.type === 'charge.dispute.funds_withdrawn') {
          paymentEvent.amount = cents(-chargeEvent.data.object.amount);
        } else if (chargeEvent.type === 'charge.dispute.funds_reinstated') {
          paymentEvent.amount = cents(chargeEvent.data.object.amount);
        }
      }

      if (event.type.startsWith('payment_intent.')) {
        const intentEvent = event as Extract<
          typeof event,
          { type: `payment_intent.${string}` }
        >;
        const intent = intentEvent.data.object;

        paymentEvent = {
          payment: intent.metadata.paymentId,
          intent: intent.id,
        };

        switch (event.type) {
          case 'payment_intent.succeeded':
            paymentEvent.type = 'payment';

            if (intent.currency.toUpperCase() === 'EUR') {
              paymentEvent.amount = cents(intent.amount_received);
            } else {
              console.log(
                'Payment with non-euro currency',
                intent.currency,
                'received.',
              );
            }

            break;

          case 'payment_intent.payment_failed':
          case 'payment_intent.canceled':
            paymentEvent.type = 'failed';
            break;
        }
      }

      if (paymentEvent) {
        await bus.exec(paymentService.createPaymentEvent, {
          paymentId: paymentEvent.payment,
          type: paymentEvent.type ?? 'other',
          amount: paymentEvent.amount ?? cents(0),
          data: {
            stripe: {
              event: {
                id: event.id,
                type: event.type,
              },
              payment_intent: paymentEvent.intent,
            },
          },
          time: undefined,
          transaction: null,
        });
      }

      return ok();
    });

  return router(config, webhook, getPayment);
};

export default factory;
