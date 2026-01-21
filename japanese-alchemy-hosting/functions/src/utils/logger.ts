import * as functions from "firebase-functions";

class Logger {
  private context: any = null;

  setContext(context: any) {
    this.context = context;
  }

  info(message: string, ...args: any[]) {
    const userId = this.context?.auth?.uid || "anonymous";
    functions.logger.info(`[${userId}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]) {
    const userId = this.context?.auth?.uid || "anonymous";
    functions.logger.error(`[${userId}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]) {
    const userId = this.context?.auth?.uid || "anonymous";
    functions.logger.warn(`[${userId}] ${message}`, ...args);
  }
}

export const logger = new Logger();
