import express from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/errorHandler';
import aiRoutes from './routes/ai.routes';
import webhookRoutes from './routes/webhooks.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/health', healthRoutes);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
