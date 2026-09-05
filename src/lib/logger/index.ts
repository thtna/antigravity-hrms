export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private currentLevel: LogLevel;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info';
    this.currentLevel = LOG_LEVEL_PRIORITY[envLevel] !== undefined ? envLevel : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.currentLevel];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): string {
    const timestamp = new Date().toISOString();
    const isProd = process.env.NODE_ENV === 'production';

    const payload: Record<string, unknown> = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(context && { context }),
    };

    if (error) {
      if (error instanceof Error) {
        payload.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        payload.error = error;
      }
    }

    if (isProd) {
      return JSON.stringify(payload);
    }

    // Pretty colored console formatting in development
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[34m', // Blue
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const tag = `${colors[level]}[${level.toUpperCase()}]${reset}`;
    const ctxStr = context ? ` \x1b[90m${JSON.stringify(context)}\x1b[0m` : '';

    return `${timestamp} ${tag} ${message}${ctxStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage('error', message, context, error));
  }

  createScopedLogger(moduleName: string) {
    return {
      debug: (msg: string, ctx?: LogContext) => this.debug(msg, { ...ctx, module: moduleName }),
      info: (msg: string, ctx?: LogContext) => this.info(msg, { ...ctx, module: moduleName }),
      warn: (msg: string, ctx?: LogContext) => this.warn(msg, { ...ctx, module: moduleName }),
      error: (msg: string, err?: unknown, ctx?: LogContext) =>
        this.error(msg, err, { ...ctx, module: moduleName }),
    };
  }
}

export const logger = new Logger();
