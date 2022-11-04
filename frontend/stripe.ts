import { loadStripe } from '@stripe/stripe-js';

export const getStripe = () => loadStripe(process.env.STRIPE_PUB_KEY);
