import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';

export interface Env {
    CLOUDFLARE_ACCOUNT_ID: string;
    CLOUDFLARE_API_TOKEN: string;
    CLOUDFLARE_DB_ID: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_AUTH_CALLBACK: string;
    NOTION_CLIENT_ID: string;
    NOTION_CLIENT_SECRET: string;
    NOTION_AUTH_CALLBACK: string;
    DISCORD_CLIENT_ID: string;
    DISCORD_CLIENT_SECRET: string;
    DISCORD_AUTH_CALLBACK: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_AUTH_CALLBACK: string;
    PUSHOVER_API_TOKEN: string,
    PUSHOVER_USER_KEY: string,
    NEXT_PUBLIC_APP_URL: string,
    DB: D1Database;
    BINDING_NAME: KVNamespace,
    STRIPE_API_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    JWT_SECRET: string;
    FRONTEND_URL: string;
    S3_REGION: string,
    S3_ENDPOINT: string,
    S3_ACCESS_KEY_ID: string,
    S3_SECRET_ACCESS_KEY: string,
    S3_ACCESS_HOST: string,
    S3_BUCKET: string,
    S3_FOLDER: string,
    S3_CACHE_FOLDER: string,
    S3_FORCE_PATH_STYLE: string,
    WEBHOOK_URL: string,
}

export function db(env: Env) {
    return drizzle(env.DB);
}

export default db;