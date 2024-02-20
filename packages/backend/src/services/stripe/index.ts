import { ModuleDeps } from '@/app';
import {
  createPaymentEvent,
  getPayment,
  paymentTypeIface,
} from '../payments/definitions';
import { cents } from '@bbat/common/currency';

export default ({ bus, stripe }: ModuleDeps) => {
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
};
