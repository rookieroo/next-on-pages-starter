import {initializeApp} from "firebase/app";
import {getMessaging} from "firebase/messaging";
import type {Env} from "../db/db";
import {getEnv} from "./di";
import Stripe from "stripe";

export type STRIPE_SUB_CACHE =
  | {
  subscriptionId: string | null;
  status: Stripe.Subscription.Status;
  priceId: string | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  paymentMethod: {
    brand: string | null; // e.g., "visa", "mastercard"
    last4: string | null; // e.g., "4242"
  } | null;
}
  | {
  status: "none";
};

const allowedEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "invoice.marked_uncollectible",
  "invoice.payment_succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
] as Stripe.Event.Type[];

export async function processEvent(event: Stripe.Event) {
  // Skip processing if the event isn't one I'm tracking (list of all events below)
  if (!allowedEvents.includes(event.type)) return;

  // All the events I track have a customerId
  const { customer: customerId } = event?.data?.object as {
    customer: string; // Sadly TypeScript does not know this
  };

  // This helps make it typesafe and also lets me know if my assumption is wrong
  if (typeof customerId !== "string") {
    throw new Error(
      `[STRIPE HOOK][CANCER] ID isn't string.\nEvent type: ${event.type}`
    );
  }

  return await syncStripeDataToKV(customerId);
}

// The contents of this function should probably be wrapped in a try/catch
export async function syncStripeDataToKV(customerId: string) {
  // Fetch latest subscription data from Stripe
  const env: Env = getEnv();
  const stripe = new Stripe(env.STRIPE_API_KEY);
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 1,
    status: "all",
    expand: ["data.default_payment_method"],
  });

  if (subscriptions.data.length === 0) {
    const subData = { status: "none" };
    await env.BINDING_NAME.put.set(`stripe:user:${customerId}`, subData);
    return subData;
  }

  // If a user can have multiple subscriptions, that's your problem
  const subscription = subscriptions.data[0];

  // Store complete subscription state
  const subData = {
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: subscription.items.data[0].price.id,
    currentPeriodEnd: subscription.current_period_end,
    currentPeriodStart: subscription.current_period_start,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    paymentMethod:
      subscription.default_payment_method &&
      typeof subscription.default_payment_method !== "string"
        ? {
          brand: subscription.default_payment_method.card?.brand ?? null,
          last4: subscription.default_payment_method.card?.last4 ?? null,
        }
        : null,
  };

  // Store the data in your KV
  await env.BINDING_NAME.put.set(`stripe:customer:${customerId}`, subData);
  return subData;
}

export const pushover = async (param: any) => {
  const url = "https://api.pushover.net/1/messages.json"
  const env: Env = getEnv();

  const params = {
    ...param,
    token: env.PUSHOVER_API_TOKEN,
    user: env.PUSHOVER_USER_KEY,
    title: env.NEXT_PUBLIC_APP_URL
  }
  const data = new URLSearchParams();
  Object.keys(params).map(k => data.append(k, params[k]))

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: data
  })
}

async function sendWebhook(url: string, data: any) {
  return await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
}

export async function notify(webhook_url: string, message: string) {

// See: https://firebase.google.com/docs/web/learn-more#config-object
  const firebaseConfig = {
    apiKey: "API_KEY",
    authDomain: "PROJECT_ID.firebaseapp.com",
    // The value of `databaseURL` depends on the location of the database
    databaseURL: "https://DATABASE_NAME.firebaseio.com",
    projectId: "PROJECT_ID",
    storageBucket: "PROJECT_ID.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID",
    // For Firebase JavaScript SDK v7.20.0 and later, `measurementId` is an optional field
    measurementId: "G-MEASUREMENT_ID",
  };

// Initialize Firebase
  const app = initializeApp(firebaseConfig);


// Initialize Firebase Cloud Messaging and get a reference to the service
  const messaging = getMessaging(app);
}