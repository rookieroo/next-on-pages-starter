import {eq} from "drizzle-orm";
import Elysia, {t} from "elysia";
import {oauth2} from "elysia-oauth2";
import type {DB} from "./_worker";
import type {Env} from "./db/db";
import {users} from '@db/schema/base';
import {getDB, getEnv} from "./utils/di";
import jwt from "./utils/jwt";

const anyUser = async (db: DB) => (await db.query.users.findMany())?.length > 0

export function setup() {
  const db: DB = getDB();
  const env: Env = getEnv();
  const gh_client_id = env.P_GITHUB_CLIENT_ID;
  const gh_client_secret = env.P_GITHUB_CLIENT_SECRET;
  const google_client_id = env.GOOGLE_CLIENT_ID;
  const google_client_secret = env.GOOGLE_CLIENT_SECRET;
  const google_auth_callback = env.GOOGLE_AUTH_CALLBACK;
  const JWT_SECRET = env.JWT_SECRET;

  if (!gh_client_id || !gh_client_secret) {
    throw new Error('Please set P_GITHUB_CLIENT_ID and P_GITHUB_CLIENT_SECRET');
  }
  if (!JWT_SECRET) {
    throw new Error('Please set JWT_SECRET');
  }
  const oauth = oauth2({
    GitHub: [
      gh_client_id,
      gh_client_secret
    ],
    Google: [
      google_client_id,
      google_client_secret,
      google_auth_callback
    ]
  })

  return new Elysia({aot: false, name: 'setup'})
    .state('anyUser', anyUser)
    .use(oauth)
    .use(
      jwt({
        aot: false,
        name: 'jwt',
        secret: JWT_SECRET,
        schema: t.Object({
          id: t.Integer(),
        })
      })
    )
    .derive({as: 'global'}, async ({headers, jwt}) => {
      const authorization = headers['authorization']
      if (!authorization) {
        return {};
      }
      const token = authorization.split(' ')[1]
      if (process.env.NODE_ENV?.toLowerCase() === 'test') {
        console.warn('Now in test mode, skip jwt verification.')
        try {
          return JSON.parse(token);
        } catch (e) {
          return {};
        }
      }
      const profile = await jwt.verify(token)
      if (!profile) {
        return {};
      }

      const user = await db.query.users.findFirst({where: eq(users.id, profile.id)})
      if (!user) {
        return {};
      }
      let stripeCustomerId = await env.BINDING_NAME.get(`stripe:user:${user.id}`);

      return {
        uid: user.id,
        cid: stripeCustomerId,
        email: user.email,
        name: user.name,
        admin: user.permission === 1,
      }
    })
}