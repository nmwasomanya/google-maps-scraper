/**
 * Logging utility for the scraper
 */

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.getTimestamp()}] [${level}] ${message}`;
  }

  debug(message: string): void {
    console.log(this.formatMessage(LogLevel.DEBUG, message));
  }

  info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message));
  }

  warn(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message));
  }

  error(message: string, error?: Error): void {
    console.error(this.formatMessage(LogLevel.ERROR, message));
    if (error) {
      console.error(error.stack || error.message);
    }
  }

  progress(current: number, total: number, item: string): void {
    const percentage = Math.round((current / total) * 100);
    console.log(this.formatMessage(LogLevel.INFO, `Progress: ${current}/${total} (${percentage}%) - ${item}`));
  }
}

export const logger = new Logger();
