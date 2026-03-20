// backend/src/app.ts
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';

// Config & Utils
import { env } from './config/env';
import { logger } from './utils/logger';

// Routes
import healthRoutes from './routes/health.routes';
import aiRoutes from './routes/ai.routes';
import webhookRoutes from './routes/webhooks.routes';
import authRoutes from './routes/auth.routes';
import projectsRoutes from './routes/projects.routes';
import simulationsRoutes from './routes/simulations.routes';

// Middlewares & Sockets
import { errorHandler } from './middlewares/errorHandler';
import { setupSignalingServer } from './sockets/signaling';

// Initialize Express and HTTP Server
const app = express();
const server = http.createServer(app);

/**
 * 1. Global Security & CORS Middlewares
 */
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN, // Matches your Vite frontend (defaults to localhost:5173 in env.ts)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

/**
 * 2. Webhook Routes (CRITICAL ORDERING)
 * * Must be mounted BEFORE express.json()
 * Webhooks require the raw, unparsed buffer to verify cryptographic signatures.
 * If express.json() runs first, it destroys the raw stream and verification fails.
 */
app.use('/api/webhooks', webhookRoutes);

/**
 * 3. Standard Body Parsing Middlewares
 * For all normal REST endpoints, safely parse the JSON payload into req.body.
 */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * 4. Standard API Routes
 */
app.use('/api/health', healthRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/simulations', simulationsRoutes);

// Contract-first v1 routes (preferred by frontend API contract)
app.use('/v1/health', healthRoutes);
app.use('/v1/auth', authRoutes);
app.use('/v1/projects', projectsRoutes);
app.use('/v1/ai', aiRoutes);
app.use('/v1/simulations', simulationsRoutes);

/**
 * 5. Global Error Handling
 * Catches any unhandled errors from the routes above and formats them for the frontend.
 * Must be the absolute last middleware injected into Express.
 */
app.use(errorHandler);

/**
 * 6. Initialize WebRTC Signaling
 * Attaches the Yjs Pub/Sub WebSocket server to the existing HTTP server instance 
 * to handle real-time multiplayer cursor synchronization.
 */
setupSignalingServer(server);

/**
 * 7. Server Bootstrapping
 */
if (env.NODE_ENV !== 'test') {
  const PORT = env.PORT || 8080;
  server.listen(PORT, () => {
    logger.info(`🚀 InfraZero Backend running on port ${PORT} in ${env.NODE_ENV} mode.`);
  });
}

export { app, server };
