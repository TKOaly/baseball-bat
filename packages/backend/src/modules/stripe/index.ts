import {
  createPaymentEvent,
  getPayment,
  paymentTypeIface,
} from '../payments/definitions';
import { cents } from '@bbat/common/currency';
import { createModule } from '@/module';
import Stripe from 'stripe';
import routes from './api';

export default createModule({
  name: 'stripe',

  routes,

  async setup({ bus, config }) {
    const stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2020-08-27',
    });

    bus.provideNamed(paymentTypeIface, 'stripe', {
      async createPayment({ paymentId }, _, bus) {
        const payment = await bus.exec(getPayment, paymentId);

        if (payment === null) {
          throw new Error('Failed to create payment.');
        }

        const intent = await stripe.paymentIntents.create({
          amount: -payment.balance.value,
          currency: payment.balance.currency,
          automatic_payment_methods: {
            enabled: true,
          },
          metadata: {
            paymentId: payment.id,
          },
        });

        if (intent.client_secret === null) {
          return Promise.reject();
        }

        await bus.exec(createPaymentEvent, {
          paymentId: payment.id,
          type: 'stripe.intent-created',
          amount: cents(0),
          transaction: null,
          data: {
            intent: intent.id,
          },
        });

        return {
          clientSecret: intent.client_secret,
        };
      },
    });

    return {
      stripe,
      secret: config.stripeWebhookSecret,
    };
  },
});
