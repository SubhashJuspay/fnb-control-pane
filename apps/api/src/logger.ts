import pino, { type Logger as PinoLogger } from 'pino';
import { env } from './env.js';

export type Logger = PinoLogger;

const isDev = env.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
