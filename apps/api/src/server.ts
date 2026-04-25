import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env.js';
import { logger } from './logger.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, disableRequestLogging: true });

  app.get('/health', async () => ({ status: 'ok', version: '0.0.0' }));

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  logger.info({ port: env.API_PORT }, 'api listening');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
