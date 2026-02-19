import http from 'http';
import app from './app';
import { initSignaling } from './sockets/signaling';
import { logger } from './utils/logger';
import { env } from './config/env';

const server = http.createServer(app);

// Initialize WebSocket signaling server
initSignaling(server);

server.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);
});

export default server;
