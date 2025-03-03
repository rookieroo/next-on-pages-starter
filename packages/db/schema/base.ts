// noinspection TypeScriptValidateTypes

import { integer, sqliteTable, text, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Users table - core user information
export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  openid: text("openid").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
  avatar: text("avatar"),
  permission: integer("permission").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// OAuth accounts linked to users
export const oauthAccounts = sqliteTable("oauth_accounts", {
  id: integer("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'google' or 'github'
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// Stripe customers
export const stripeCustomers = sqliteTable("stripe_customers", {
  id: integer("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// Subscriptions
export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  stripeCurrentPeriodEnd: integer("stripe_current_period_end", { mode: "timestamp" }),
  status: text("status").notNull(), // 'active', 'canceled', 'past_due', etc.
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// CloudFlare KV Cache table (for session/token storage)
export const kvCache = sqliteTable("kv_cache", {
  key: integer("key").primaryKey(),
  value: blob("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// Products/Prices (synced from Stripe)
export const products = sqliteTable("products", {
  id: integer("id").primaryKey(),
  stripeProductId: text("stripe_product_id").unique(),
  name: text("name").notNull(),
  description: text("description"),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const prices = sqliteTable("prices", {
  id: integer("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  stripePriceId: text("stripe_price_id").unique(),
  currency: text("currency").notNull(),
  type: text("type").notNull(), // 'one_time' or 'recurring'
  interval: text("interval"), // 'month' or 'year' for recurring
  intervalCount: integer("interval_count"),
  unitAmount: integer("unit_amount"),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});