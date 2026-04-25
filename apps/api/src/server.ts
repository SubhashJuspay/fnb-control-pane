import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { createYoga } from 'graphql-yoga';
import { buildContext } from './context.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { buildSchema } from './schema/index.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  app.get('/health', async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      version: process.env.APP_VERSION ?? '0.0.0',
    };
  });

  const schema = buildSchema();

  type YogaServerContext = { req: FastifyRequest; reply: FastifyReply };

  const yoga = createYoga<YogaServerContext>({
    schema,
    graphqlEndpoint: '/graphql',
    landingPage: false,
    context: async ({ req }) => {
      const headers = req.headers;
      const tenantSlug = headers['x-tenant-slug'];
      const locationId = headers['x-location-id'];
      const requestIdHeader = headers['x-request-id'];
      return buildContext({
        headers: {
          cookie: headers.cookie,
          'x-tenant-slug': Array.isArray(tenantSlug) ? tenantSlug[0] : tenantSlug,
          'x-location-id': Array.isArray(locationId) ? locationId[0] : locationId,
          'x-request-id': Array.isArray(requestIdHeader)
            ? requestIdHeader[0]
            : requestIdHeader,
        },
      });
    },
    logging: {
      debug: (...a) => {
        logger.debug(a);
      },
      info: (...a) => {
        logger.info(a);
      },
      warn: (...a) => {
        logger.warn(a);
      },
      error: (...a) => {
        logger.error(a);
      },
    },
  });

  app.route({
    url: yoga.graphqlEndpoint,
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      const response = await yoga.handleNodeRequestAndResponse(req, reply, {
        req,
        reply,
      });
      response.headers.forEach((v, k) => {
        reply.header(k, v);
      });
      reply.status(response.status);
      reply.send(response.body);
      return reply;
    },
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  const port = Number(env.API_PORT);
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'api listening');

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ sig }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
