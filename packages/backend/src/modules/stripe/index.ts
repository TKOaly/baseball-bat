import { getPayment, paymentTypeIface } from '../payments/definitions';
import { createModule } from '@/module';
import Stripe from 'stripe';
import routes from './api';

export default createModule({
  name: 'stripe',

  routes,

  async setup({ bus, config }) {
    const stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2023-10-16',
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

        return {
          clientSecret: intent.client_secret,
          intent: intent.id,
        };
      },
    });

    return {
      stripe,
      secret: config.stripeWebhookSecret,
    };
  },
});
