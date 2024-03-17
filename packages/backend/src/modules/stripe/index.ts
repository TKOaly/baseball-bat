import {
  getPayment,
  onStatusChanged,
  paymentTypeIface,
} from '../payments/definitions';
import { createModule } from '@/module';
import Stripe from 'stripe';
import routes from './api';
import { createEmail, sendEmail } from '../email/definitions';
import { getDebtsByPayment } from '../debts/definitions';
import { getPayerPrimaryEmail } from '../payers/definitions';
import { Payment } from '@bbat/common/types';

const isStripePayment = (
  payment: Payment,
): payment is Omit<Payment, 'data'> & { data: { intent: string } } =>
  payment.type === 'stripe' &&
  !!payment.data &&
  'intent' in payment.data &&
  typeof payment.data.intent === 'string';

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

    bus.on(onStatusChanged, async ({ paymentId, status }, _, bus) => {
      if (status !== 'paid') {
        return;
      }

      const payment = await bus.exec(getPayment, paymentId);

      if (!payment) {
        console.error('Payment not found!');
        return;
      }

      if (!isStripePayment(payment)) {
        return;
      }

      const intent = await stripe.paymentIntents.retrieve(payment.data.intent, {
        expand: ['latest_charge'],
      });

      const debts = await bus.exec(getDebtsByPayment, paymentId);
      const [{ payerId }] = debts;
      const email = await bus.exec(getPayerPrimaryEmail, payerId);

      if (!email) {
        console.error(`Email not found for payer ${payerId}!`);
        return;
      }

      const created = await bus.exec(createEmail, {
        template: 'stripe-paid',
        recipient: email.email,
        subject: `[Payment Confirmation] ${payment.title}`,
        payload: {
          debts,
          payment,
          intent,
        },
      });

      if (!created) {
        console.error('Failed to create receipt email!');
        return;
      }

      await bus.exec(sendEmail, created.id);
    });

    return {
      stripe,
      secret: config.stripeWebhookSecret,
    };
  },
});
