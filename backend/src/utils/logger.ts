// backend/src/utils/logger.ts

/**
 * ANSI Color Codes for terminal formatting
 */
const colors = {
  reset: '\x1b[0m',
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  debug: '\x1b[34m', // Blue
};

/**
 * Helper function to get the current timestamp in ISO format.
 */
const getTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * A lightweight, zero-dependency logger utility.
 * Formats terminal output with timestamps and color-coded log levels
 * to make debugging your Express server much easier.
 */
export const logger = {
  info: (message: string, ...optionalParams: any[]): void => {
    console.log(
      `${colors.info}[INFO]${colors.reset} [${getTimestamp()}] ${message}`,
      ...optionalParams
    );
  },

  warn: (message: string, ...optionalParams: any[]): void => {
    console.warn(
      `${colors.warn}[WARN]${colors.reset} [${getTimestamp()}] ${message}`,
      ...optionalParams
    );
  },

  error: (message: string, ...optionalParams: any[]): void => {
    console.error(
      `${colors.error}[ERROR]${colors.reset} [${getTimestamp()}] ${message}`,
      ...optionalParams
    );
  },

  debug: (message: string, ...optionalParams: any[]): void => {
    // Optional: Only show debug logs if not in production
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `${colors.debug}[DEBUG]${colors.reset} [${getTimestamp()}] ${message}`,
        ...optionalParams
      );
    }
  },
};