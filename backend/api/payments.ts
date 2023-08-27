import { Inject, Service } from 'typedi';
import { route, router } from 'typera-express';
import { badRequest, forbidden, internalServerError, notFound, ok, unauthorized } from 'typera-express/response';
import * as t from 'io-ts';
import { internalIdentity } from '../../common/types';
import { AuthService } from '../auth-middleware';
import { DebtService } from '../services/debt';
import { PaymentService } from '../services/payements';
import { PayerService } from '../services/payer';
import { UsersService } from '../services/users';
import { validateBody } from '../validate-middleware';
import { euro, formatEuro, sumEuroValues } from '../../common/currency';
import { EmailService } from '../services/email';
import { Config } from '../config';
import { BankingService } from '../services/banking';
import { headers } from 'typera-express/parser';
import Stripe from 'stripe';

@Service()
export class PaymentsApi {
  @Inject(() => Config)
    config: Config;

  @Inject('stripe')
    stripe: Stripe;

  @Inject(() => PaymentService)
    paymentService: PaymentService;

  @Inject(() => BankingService)
    bankingService: BankingService;

  @Inject(() => UsersService)
    usersService: UsersService;

  @Inject(() => PayerService)
    payerService: PayerService;

  @Inject(() => AuthService)
    authService: AuthService;

  @Inject(() => DebtService)
    debtService: DebtService;

  @Inject(() => EmailService)
    emailService: EmailService;

  private getPayments() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const payments = await this.paymentService.getPayments();
        return ok(payments);
      });
  }

  private getPayment() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware({
        accessLevel: 'normal',
      }))
      .handler(async (ctx) => {
        const payment = await this.paymentService.getPayment(ctx.routeParams.id);
        const debts = await this.debtService.getDebtsByPayment(ctx.routeParams.id);

        if (ctx.session.accessLevel !== 'admin' && ctx.session.payerId !== payment?.payerId?.value) {
          return unauthorized();
        }

        return ok({
          payment,
          debts,
        });
      });
  }

  private registerTransaction() {
    return route
      .post('/:id/register')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({
        transactionId: t.string,
      })))
      .handler(async (ctx) => {
        const { id } = ctx.routeParams;
        const { transactionId } = ctx.body;

        const transaction = await this.bankingService.getTransaction(transactionId);

        if (!transaction) {
          return notFound('No such transaction found');
        }

        const event = await this.paymentService.createPaymentEventFromTransaction(transaction, id);

        return ok(event);
      });
  }

  private createInvoice() {
    return route
      .post('/create-invoice')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(validateBody(t.type({
        debts: t.array(t.string),
        sendEmail: t.boolean,
      })))
      .handler(async (ctx) => {
        const debts = await Promise.all(ctx.body.debts.map(async (id) => {
          const debt = await this.debtService.getDebt(id);

          if (!debt) {
            return Promise.reject(badRequest());
          }

          if (ctx.session.accessLevel !== 'admin' && debt.payerId.value !== ctx.session.payerId) {
            return Promise.reject(unauthorized());
          }


          return debt;
        }));

        if (!debts.every(d => d.payerId.value === debts[0].payerId.value)) {
          return badRequest('All debts do not have the same payer');
        }

        const email = await this.payerService.getPayerPrimaryEmail(debts[0].payerId);

        if (!email) {
          throw new Error(`Payer ${debts[0].payerId} does not have a primary email`);
        }

        const payment = await this.paymentService.createInvoice({
          series: 9,
          debts: debts.map(d => d.id),
          title: 'Combined invoice',
          message: 'Invoice for the following debts:\n' + (debts.map(d => ` - ${d.name} (${formatEuro(d.debtComponents.map(dc => dc.amount).reduce(sumEuroValues, euro(0)))})`).join('\n')),
        }, {
          sendNotification: ctx.body.sendEmail,
        });

        return ok(payment);
      });
  }

  private createStripePayment() {
    return route
      .post('/create-stripe-payment')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(validateBody(t.type({
        debts: t.array(t.string),
      })))
      .handler(async (ctx) => {
        if (process.env.NODE_ENV !== 'development') {
          console.log(process.env.NODE_ENV);
          return forbidden();
        }

        const debts = await Promise.all(ctx.body.debts.map(async (id) => {
          const debt = await this.debtService.getDebt(id);

          if (!debt) {
            return Promise.reject(badRequest());
          }

          if (ctx.session.accessLevel !== 'admin' && debt.payerId.value !== ctx.session.payerId) {
            return Promise.reject(unauthorized());
          }


          return debt;
        }));

        if (!debts.every(d => d.payerId.value === debts[0].payerId.value)) {
          return badRequest('All debts do not have the same payer');
        }

        const result = await this.paymentService.createStripePayment({
          debts: debts.map(d => d.id),
        });

        return ok(result);
      });
  }

  private getOwnPayments() {
    return route
      .get('/my')
      .use(this.authService.createAuthMiddleware({
        accessLevel: 'normal',
      }))
      .handler(async ({ session }) => {
        const payments = await this.paymentService.getPayerPayments(internalIdentity(session.payerId));
        return ok(payments);
      });
  }

  private creditPayment() {
    return route
      .post('/:id/credit')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        await this.paymentService.creditPayment(ctx.routeParams.id, 'manual');
        return ok();
      });
  }

  public stripeWebhook() {
    return route
      .post('/')
      .use(headers(t.type({
        'stripe-signature': t.string,
      })))
      .handler(async (ctx) => {
        const secret = this.config.stripeWebhookSecret;

        let event;

        try {
          event = this.stripe.webhooks.constructEvent(ctx.req.body, ctx.headers['stripe-signature'], secret);
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
            return internalServerError('Currencies besides EUR are not supported!');
          }

          await this.paymentService.createPaymentEvent(paymentId, {
            type: 'payment',
            amount: {
              currency: 'eur',
              value: intent.amount,
            },
          });
        } else if (event.type === 'payment_intent.payment_failed') {
          intent = event.data.object as any as Stripe.PaymentIntent;

          await this.paymentService.createPaymentEvent(intent.metadata.paymentId, {
            type: 'failed',
            amount: euro(0),
          });
        } else if (event.type === 'payment_intent.processing') {
          intent = event.data.object as any as Stripe.PaymentIntent;

          await this.paymentService.createPaymentEvent(intent.metadata.paymentId, {
            type: 'other',
            amount: euro(0),
            data: {
              stripe: {
                type: 'processing',
              },
            },
          });
        } else {
          console.log('Other Stripe event: ' + event.type, event);
        }

        return ok();
      });
  }

  router() {
    return router(
      this.getPayments(),
      this.getOwnPayments(),
      this.createInvoice(),
      this.getPayment(),
      this.creditPayment(),
      this.registerTransaction(),
      this.createStripePayment(),
      this.stripeWebhook(),
    );
  }
}
