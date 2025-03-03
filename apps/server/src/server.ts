import cors from '@elysiajs/cors';
import { serverTiming } from '@elysiajs/server-timing';
import { Elysia } from 'elysia';
import { StorageService } from './services/storage';
import { UserService } from './services/user';
import { ConfigService } from './services/config';
import { StripeSerive } from './services/stripe';

export const app = () => new Elysia({ aot: false })
  .group('/api', app => app
    .use(cors(
      {
        aot: false,
        origin: '*',
        methods: '*',
        allowedHeaders: [
          'authorization',
          'content-type',
          'notion_access_token'
        ],
        maxAge: 600,
        credentials: true,
        preflight: true
      }
    ))
    .use(serverTiming({
      enabled: true,
    }))
    .use(UserService())
    .use(StorageService())
    .use(StripeSerive())
    .use(ConfigService())
    .get('/', () => "Hi, Elysia!")
    .onError(({path, params, code}) => {
      if (code === 'NOT_FOUND')
        return `${path} ${JSON.stringify(params)} not found`
    })
  )

export type App = ReturnType<typeof app>;