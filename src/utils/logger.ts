/**
 * Logging utility for the scraper
 */

import * as fs from 'fs';
import * as path from 'path';

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

class Logger {
  private logFilePath: string;
  private logStream: fs.WriteStream | null = null;

  constructor() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = path.join(logsDir, `scraper-debug-${timestamp}.log`);
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.getTimestamp()}] [${level}] ${message}`;
  }

  private writeToFile(message: string): void {
    if (this.logStream) {
      this.logStream.write(message + '\n');
    }
  }

  debug(message: string): void {
    const formattedMessage = this.formatMessage(LogLevel.DEBUG, message);
    console.log(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  info(message: string): void {
    const formattedMessage = this.formatMessage(LogLevel.INFO, message);
    console.log(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  warn(message: string): void {
    const formattedMessage = this.formatMessage(LogLevel.WARN, message);
    console.warn(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  error(message: string, error?: Error): void {
    const formattedMessage = this.formatMessage(LogLevel.ERROR, message);
    console.error(formattedMessage);
    this.writeToFile(formattedMessage);
    if (error) {
      const errorDetails = error.stack || error.message;
      console.error(errorDetails);
      this.writeToFile(errorDetails);
    }
  }

  progress(current: number, total: number, item: string): void {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const formattedMessage = this.formatMessage(LogLevel.INFO, `Progress: ${current}/${total} (${percentage}%) - ${item}`);
    console.log(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  /**
   * Returns the path to the current log file
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * Close the log stream when done
   */
  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

export const logger = new Logger();
