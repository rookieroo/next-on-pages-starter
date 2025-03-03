import { and, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { users, notion_connections } from "@db/schema/base";
import type { DB } from "../_worker";
import { setup } from "../setup";
import { getDB, getEnv } from "../utils/di";
import { pushover } from "../utils/webhook";
import { generateState } from "arctic";
import { Client } from "@notionhq/client";
import type { Env } from "../db/db";

type NewUser = typeof users.$inferInsert;

type Profile = {
  openid?: string;
  name?: string;
  avatar?: string;
  email?: string;
  permission?: number | null;
};

export function UserService() {
  const db: DB = getDB();
  const env: Env = getEnv();
  const state = generateState();

  return new Elysia({ aot: false }).use(setup()).group("/auth", (group) =>
    group
      .get("/google", async ({ oauth2, redirect }) => {
        const url = await oauth2.createURL("Google", {
          scopes: ["profile", "email"],
        });
        url.searchParams.set("access_type", "offline");

        redirect(url.href);
      })

      .get(
        "/google/callback",
        async ({
          jwt,
          oauth2,
          request,
          set,
          redirect,
          store,
          query,
          cookie: { token, redirect_to },
        }) => {
          const { code } = query;
          if (!code || typeof code !== "string") {
            return new Response("Invalid code", { status: 400 });
          }
          const tokens = await oauth2.authorize("Google");
          const response = await fetch(
            "https://openidconnect.googleapis.com/v1/userinfo",
            {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            },
          );
          const u: any = await response.json();
          const profile: Profile = {
            openid: u.sub,
            name: u.name || u.given_name || u.family_name,
            avatar: u.picture,
            email: u.email,
            permission: 0,
          };
          if (!profile.openid) throw new Error("OpenID is required");
          await db.query.users
            .findFirst({ where: eq(users.openid, profile.openid) })
            .then(async (user: any) => {
              if (user) {
                profile.permission = user.permission;
                await db
                  .update(users)
                  .set(profile)
                  .where(eq(users.id, user.id))
                  .returning({ updatedId: users.id });
                token.set({
                  value: await jwt.sign({ id: user.id }),
                  expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                  path: "/",
                });
                await pushover({
                  message: `${user?.name}: Sign In`, // required
                  sound: "Pushover (default)",
                  device: "iphone",
                  priority: -1,
                });
              } else {
                // if no user exists, set permission to 1
                // store.anyUser is a global state to cache the existence of any user
                await pushover({
                  message: `${profile?.name}: Sign Up`, // required
                  sound: "Bike",
                  device: "iphone",
                  priority: 1,
                });
                if (!(await store.anyUser(db))) {
                  const realTimeCheck =
                    (await db.query.users.findMany())?.length > 0;
                  if (!realTimeCheck) {
                    profile.permission = 1;
                    store.anyUser = async (_: DB) => true;
                  }
                }
                const result = await db
                  .insert(users)
                  .values(profile as NewUser)
                  .returning({ insertedId: users.id });
                if (!result || result.length === 0) {
                  throw new Error("Failed to register");
                } else {
                  token.set({
                    value: await jwt.sign({ id: result[0].insertedId }),
                    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                    path: "/",
                  });
                }
              }
            });
          const redirect_host =
            redirect_to.value ||
            request.headers.get("referer")?.slice(0, -1) ||
            "";
          const redirect_url = `${redirect_host}/callback?token=${token.value}`;
          set.headers["content-type"] = "text/html";
          redirect(redirect_url);
        },
      )
      .get(
        "/github",
        ({ oauth2, headers: { referer }, cookie: { redirect_to } }) => {
          if (!referer) {
            return "Referer not found";
          }
          const referer_url = new URL(referer);
          redirect_to.value = `${referer_url.protocol}//${referer_url.host}`;
          return oauth2.redirect("GitHub", { scopes: ["read:user"] });
        },
      )
      .get(
        "/github/callback",
        async ({
          jwt,
          oauth2,
          set,
          redirect,
          store,
          query,
          cookie: { token, redirect_to, state },
        }) => {
          console.log("state", state.value);
          console.log("p_state", query.state);

          const gh_token = await oauth2.authorize("GitHub");
          // request https://api.github.com/user for user info
          const response = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${gh_token.accessToken}`,
              Accept: "application/json",
              "User-Agent": "elysia",
            },
          });
          const user: any = await response.json();
          const profile: Profile = {
            openid: user.id,
            name: user.name || user.login,
            avatar: user.avatar_url,
            permission: 0,
          };
          if (!profile.openid) throw new Error("OpenID is required");
          await db.query.users
            .findFirst({ where: eq(users.openid, profile.openid) })
            .then(async (user) => {
              if (user) {
                profile.permission = user.permission;
                await db
                  .update(users)
                  .set(profile)
                  .where(eq(users.id, user.id));
                token.set({
                  value: await jwt.sign({ id: user.id }),
                  expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                  path: "/",
                });
                await pushover({
                  message: `${user?.name}: Sign In`, // required
                  sound: "Pushover (default)",
                  device: "iphone",
                  priority: -1,
                });
              } else {
                // if no user exists, set permission to 1
                // store.anyUser is a global state to cache the existence of any user
                await pushover({
                  message: `${user!.name}: Sign Up`, // required
                  sound: "Bike",
                  device: "iphone",
                  priority: 1,
                });
                if (!(await store.anyUser(db))) {
                  const realTimeCheck =
                    (await db.query.users.findMany())?.length > 0;
                  if (!realTimeCheck) {
                    profile.permission = 1;
                    store.anyUser = async (_: DB) => true;
                  }
                }
                const result = await db
                  .insert(users)
                  .values(profile as NewUser)
                  .returning({ insertedId: users.id });
                if (!result || result.length === 0) {
                  throw new Error("Failed to register");
                } else {
                  token.set({
                    value: await jwt.sign({ id: result[0].insertedId }),
                    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                    path: "/",
                  });
                }
              }
            });
          const redirect_host = redirect_to.value || "";
          const redirect_url = `${redirect_host}/callback?token=${token.value}`;
          set.headers["content-type"] = "text/html";
          redirect(redirect_url);
        },
        {
          query: t.Object({
            state: t.String(),
            code: t.String(),
          }),
        },
      )
      .get("/profile", async ({ set, uid }) => {
        if (!uid) {
          set.status = 403;
          return "Permission denied";
        }
        const uid_num = parseInt(uid);
        const user = await db.query.users.findFirst({
          where: eq(users.id, uid_num),
        });
        if (!user) {
          set.status = 404;
          return "User not found";
        }
        return {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          permission: user.permission === 1,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      })
      .get(
        "/notion",
        async ({
          oauth2,
          query: { current_url },
          cookie: { redirect_to, notion_state },
        }) => {
          const url = await oauth2.createURL("Notion");
          url.searchParams.set("state", state);
          notion_state.set({
            value: state,
            expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            path: "/",
          });
          redirect_to.set({
            value: current_url,
            expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            path: "/",
          });
          return url.href;
        },
      )
      .get(
        "/notion/callback",
        async ({
          set,
          redirect,
          request,
          jwt,
          uid,
          pay_level,
          query,
          cookie: { token, redirect_to, notion_state, notion_access_token },
        }) => {
          if (query.state !== notion_state.value) {
            throw new Error("Invalid state parameter");
          }
          // const d = {
          //   uid,
          //   code,
          //   state,
          //   notion_state,
          //   redirect_to,
          //   query,
          //   oauth2,
          //   user_id,
          //   token,
          //   set,
          // }
          // return new Response(JSON.stringify(d), {status: 400})

          const response = await fetch(
            "https://api.notion.com/v1/oauth/token",
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString("base64")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                grant_type: "authorization_code",
                code: query.code,
                redirect_uri: env.NOTION_AUTH_CALLBACK,
              }),
            },
          );

          const data: any = await response.json();
          const {
            access_token,
            workspace_id,
            workspace_name,
            workspace_icon,
            owner,
          } = data;
          // return new Response(JSON.stringify({data}), {status: 400});

          // uid 不存在时，即为临时用户
          const userId = uid ? uid : -1;
          let user: any = {};
          if (owner?.type == "user" && owner?.user) {
            user = owner?.user;
          } else {
            const notion = new Client({ auth: access_token });
            const res = await notion.users.list({});
            user = res?.results?.length > 0 ? res?.results[0] : {};
          }
          const profile: Profile = {
            openid: user.id,
            name: user.name,
            avatar: user.avatar_url,
            email: user.person.email,
            permission: 0,
          };

          await db.query.users
            .findFirst({ where: eq(users.email, (profile as NewUser)?.email) })
            .then(async (user) => {
              if (user) {
                profile.permission = user?.permission;
                await db
                  .update(users)
                  .set(profile)
                  .where(eq(users.id, user.id));
                token.set({
                  value: await jwt.sign({ id: user.id }),
                  expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                  path: "/",
                });
              } else {
                const result = await db
                  .insert(users)
                  .values(profile as NewUser)
                  .returning({ insertedId: users.id });
                if (!result || result.length === 0) {
                  throw new Error("Failed to register");
                } else {
                  // no need to set token
                  token.set({
                    value: await jwt.sign({ id: result[0].insertedId }),
                    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                    path: "/",
                  });
                }
              }
            });

          const connect = {
            uid: userId,
            notion_workspace_id: workspace_id,
            notion_access_token: access_token,
            workspace_name,
            workspace_icon,
          };
          // new Response(JSON.stringify({connect, uid}), {status: 400});
          const exist = await db.query.notion_connections.findFirst({
            where: and(
              eq(notion_connections.uid, userId),
              eq(notion_connections.notion_workspace_id, workspace_id),
            ),
          });
          if (exist) {
            await db
              .update(notion_connections)
              .set(connect)
              .where(
                and(
                  eq(notion_connections.uid, uid),
                  eq(notion_connections.notion_workspace_id, workspace_id),
                ),
              );
          } else {
            const workspace_length = (
              await db.query.notion_connections.findMany({
                where: eq(notion_connections.uid, userId),
              })
            )?.length;
            if (pay_level == 0 && workspace_length > 0) {
              return "Upgrade to Premium";
            }
            if (pay_level == 1 && workspace_length > 4) {
              return "Upgrade to Enterprise";
            }
            const result = await db
              .insert(notion_connections)
              .values(connect)
              .returning({ insertedId: notion_connections.id });
            if (!result || result.length === 0) {
              throw new Error("Failed to connect");
            }
          }
          notion_access_token.set({
            value: access_token,
            expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            path: "/",
          });
          const redirect_host =
            redirect_to.value ||
            request.headers.get("referer")?.slice(0, -1) ||
            "";
          const redirect_url = `${redirect_host}/callback?token=${token.value}`;
          set.headers["content-type"] = "text/html";
          redirect(redirect_url);
        },
      ),
  );
}
