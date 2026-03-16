// backend/src/index.ts
import { app, server } from './app';
import { logger } from './utils/logger';

/**
 * InfraZero Backend Entry Point
 * * In our architecture, app.ts handles the heavy lifting of assembling
 * the middlewares, routes, and WebSockets. This index.ts file acts strictly
 * as the clean entry point that Node.js / Render / Docker will look for when 
 * running the `npm start` command.
 */

// Handle uncaught exceptions and unhandled promise rejections globally
// to prevent the Node.js process from crashing silently and ensure
// the server shuts down gracefully.
process.on('uncaughtException', (err: Error) => {
  logger.error(`[Uncaught Exception] ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error(`[Unhandled Rejection] ${reason}`);
  // Attempt to close the server gracefully before exiting
  server.close(() => {
    process.exit(1);
  });
});

// Export the app for potential serverless usage (e.g., Vercel API routes)
export default app;