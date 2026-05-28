import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "./env.js";

export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "req.headers['x-forwarded-authorization']",
  "req.headers['proxy-authorization']",
  "headers.authorization",
  "headers.cookie",
  "headers['x-api-key']",
  "authorization",
  "cookie",
  "token",
  "apiKey",
  "api_key",
  "signature",
  "sign",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: "[redacted]",
  },
  ...(env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        },
      }
    : {}),
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/health" },
});
