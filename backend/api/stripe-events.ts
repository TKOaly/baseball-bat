import Stripe from 'stripe'
import { route, router } from 'typera-express'
import { badRequest, ok } from 'typera-express/response'
import { PgClient } from '../db'
import { updatePaymentStatus } from '../services/payer'

const receiveEvent = (pg: PgClient, stripe: Stripe, endpointSecret: string) =>
  route.post('/').handler(async ({ req }) => {
    const signature = req.header('stripe-signature')

    if (!signature) {
      return badRequest('No signature header present')
    }

    const event = await stripe.webhooks.constructEventAsync(
      req.body,
      signature,
      endpointSecret
    )

    switch (event.type) {
      case 'paymnet_intent.succeeded':
      case 'payment_intent.canceled':
      case 'payment_intent.payment_failed':
      case 'payment_intent.requires_action':
        const { id, status } = event.data.object as Stripe.PaymentIntent
        await updatePaymentStatus(pg, id, status)
    }

    return ok({ ok: true })
  })

export default (pg: PgClient, stripe: Stripe, endpointSecret: string) =>
  router(receiveEvent(pg, stripe, endpointSecret))
