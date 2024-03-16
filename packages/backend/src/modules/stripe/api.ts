import { RouterFactory } from '@/module';
import Stripe from 'stripe';
import * as t from 'io-ts';
import { router } from 'typera-express';
import { headers } from 'typera-express/parser';
import { badRequest, ok } from 'typera-express/response';
import * as paymentService from '@/modules/payments/definitions';
import { EuroValue, cents } from '@bbat/common/currency';

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

  return router(webhook);
};

export default factory;
