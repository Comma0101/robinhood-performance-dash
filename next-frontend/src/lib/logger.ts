import fs from 'fs';
import path from 'path';

// Only use file logging on server side
const isServer = typeof window === 'undefined';

class Logger {
  private logFilePath: string;

  constructor() {
    this.logFilePath = path.join(process.cwd(), 'debug.log');
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
  }

  private writeToFile(message: string) {
    if (!isServer) return;

    try {
      fs.appendFileSync(this.logFilePath, message, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(message: string, data?: any) {
    const formatted = this.formatMessage('INFO', message, data);
    console.log(message, data || '');
    this.writeToFile(formatted);
  }

  error(message: string, data?: any) {
    const formatted = this.formatMessage('ERROR', message, data);
    console.error(message, data || '');
    this.writeToFile(formatted);
  }

  debug(message: string, data?: any) {
    const formatted = this.formatMessage('DEBUG', message, data);
    console.log(message, data || '');
    this.writeToFile(formatted);
  }

  section(title: string) {
    const separator = '='.repeat(80);
    const formatted = `\n${separator}\n${title}\n${separator}\n`;
    console.log(formatted);
    this.writeToFile(formatted);
  }

  clear() {
    if (!isServer) return;

    try {
      fs.writeFileSync(this.logFilePath, '', 'utf8');
    } catch (error) {
      console.error('Failed to clear log file:', error);
    }
  }
}

export const logger = new Logger();
