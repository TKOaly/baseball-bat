import Stripe from 'stripe'
import { Inject, Service } from 'typedi'
import { route, router } from 'typera-express'
import { badRequest, ok } from 'typera-express/response'
import { Config } from '../config'
import { PgClient } from '../db'
import { PayerService } from '../services/payer'

@Service()
export class StripeEventsApi {
  @Inject(() => PayerService)
  payerService: PayerService

  @Inject('stripe')
  stripe: Stripe

  @Inject(() => Config)
  config: Config

  receiveEvent() {
    return route
      .post('/')
      .handler(async ({ req }) => {
        const signature = req.header('stripe-signature')

        if (!signature) {
          return badRequest('No signature header present')
        }

        const event = await this.stripe.webhooks.constructEventAsync(
          req.body,
          signature,
          this.config.stripeWebhookEndpointSecret,
        )

        switch (event.type) {
          case 'paymnet_intent.succeeded':
          case 'payment_intent.canceled':
          case 'payment_intent.payment_failed':
          case 'payment_intent.requires_action':
            const { id, status } = event.data.object as Stripe.PaymentIntent
            await this.payerService.updatePaymentStatus(id, status)
        }

        return ok({ ok: true })
      })
  }

  router() {
    return router(
      this.receiveEvent(),
    )
  }
}
