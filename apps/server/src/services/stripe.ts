import Elysia, {t} from "elysia";
import type {Env} from "../db/db";
import {setup} from "../setup";
import {getEnv} from "../utils/di";
import Stripe from "stripe";
import {processEvent, syncStripeDataToKV} from "../utils/webhook";

export function StripeSerive() {
  const env: Env = getEnv();
  const stripe = new Stripe(env.STRIPE_API_KEY);

  return new Elysia({aot: false})
    .use(setup())
    .group('/stripe', (group) =>
      group
        .get("/checkout", async ({redirect, uid, email, query: {priceId}}) => {
          if (!uid) return "not login";
          // stripe customer kv
          // Get the stripeCustomerId from your KV store
          let stripeCustomerId = await env.BINDING_NAME.get(`stripe:user:${uid}`);

          // Create a new Stripe customer if this user doesn't have one
          if (!stripeCustomerId) {
            const newCustomer = await stripe.customers.create({
              email: email,
              metadata: {
                userId: uid, // DO NOT FORGET THIS
              },
            });

            // Store the relation between userId and stripeCustomerId in your KV
            await env.BINDING_NAME.put(`stripe:user:${uid}`, newCustomer.id);
            stripeCustomerId = newCustomer.id;
          }

          // ALWAYS create a checkout with a stripeCustomerId. They should enforce this.
          const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            billing_address_collection: 'auto',
            line_items: [
              {
                price: priceId,
                // For metered billing, do not pass quantity
                quantity: 1,
              },
            ],
            mode: 'subscription',
            success_url: `${env.NEXT_PUBLIC_APP_URL}/success`,
          });
          redirect(session.url!)
        })

        .get("/success", async ({uid, cid}) => {
          if (!uid) return "not login";
          if (!cid) {
            return "no record"
          }

          await syncStripeDataToKV(cid);
        })

        .post('/create-portal-session', async (
          {
            body,
            cookie: {redirect_to}
          }) => {
          const { session_id } = body as any;
          const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);

          const portalSession = await stripe.billingPortal.sessions.create({
            customer: checkoutSession.customer as string,
            return_url: redirect_to.value as string,
          });

          return {
            status: 303,
            headers: { Location: portalSession.url },
          };
        })

        // Webhook endpoint for Stripe
        .post('/', async (
          {
            body,
            cid,
            request,
            cookie: {redirect_to},
            context
          }) => {
          // syncStripeDataToKV
          const subData = await syncStripeDataToKV(cid);

          let event = body;
          const signature = request.headers.get('Stripe-Signature');
          if (!signature) return new Response('No signature', {status: 400})
          // Replace this endpoint secret with your endpoint's unique secret
          // If you are testing with the CLI, find the secret by running 'stripe listen'
          // If you are using an endpoint defined with the API or dashboard, look in your webhook settings
          // at https://dashboard.stripe.com/webhooks
          const endpointSecret = env.STRIPE_WEBHOOK_SECRET;
          // Only verify the event if you have an endpoint secret defined.
          // Otherwise use the basic event deserialized with JSON.parse
          if (endpointSecret) {
            // Get the signature sent by Stripe
            try {
              const rawBody = await request.text();
              event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                endpointSecret
              );
            } catch (err) {
              console.log(`⚠️  Webhook signature verification failed.`, err instanceof Error ? err.message : 'Unknown error');
              return new Response('Invalid code', {status: 400})
            }
          context.waitUntil(processEvent(event as Stripe.Event));
          // waitUntil(processEvent(event));
          return new Response('received', {status: 200})
        }
      })
    );
}
