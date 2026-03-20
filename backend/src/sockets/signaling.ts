// backend/src/sockets/signaling.ts
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { WEBSOCKET_CONFIG } from '../config/constants';

/**
 * Initializes the WebRTC Signaling Server for Yjs multiplayer collaboration.
 * * y-webrtc requires a Pub/Sub signaling server to exchange initial 
 * connection information (SDP offers, answers, and ICE candidates) 
 * so peers can establish direct P2P connections.
 * * @param server The running HTTP(S) server instance from Express
 */
export const setupSignalingServer = (server: HttpServer): void => {
  const wss = new WebSocketServer({ server });

  // Maps a topic (room ID) to a Set of connected WebSocket clients
  const topics = new Map<string, Set<WebSocket>>();
  const rooms = new Map<string, Set<WebSocket>>();

  // Utility to send a JSON message safely
  const send = (conn: WebSocket, message: object) => {
    if (conn.readyState !== WebSocket.OPEN) return;
    try {
      conn.send(JSON.stringify(message));
    } catch (e) {
      conn.close();
    }
  };

  wss.on('connection', (conn: WebSocket) => {
    let isAlive = true;
    const subscribedTopics = new Set<string>();
    const joinedWorkspaces = new Set<string>();
    let connectionUserId = '';

    const broadcastToRoom = (workspaceId: string, payload: object) => {
      const members = rooms.get(workspaceId);
      if (!members) return;
      members.forEach((member) => {
        if (member !== conn) {
          send(member, payload);
        }
      });
    };

    logger.info('[Signaling Server] New client connected');

    // Keep-alive mechanisms
    conn.on('pong', () => {
      isAlive = true;
    });

    conn.on('message', (messageRaw: Buffer) => {
      try {
        const message = JSON.parse(messageRaw.toString());

        if (message && message.type) {
          switch (message.type) {
            case 'subscribe':
              // Client wants to join specific rooms (topics)
              (message.topics || []).forEach((topicName: string) => {
                if (typeof topicName === 'string') {
                  let topic = topics.get(topicName);
                  if (!topic) {
                    topic = new Set();
                    topics.set(topicName, topic);
                  }
                  
                  // Enforce room limits
                  if (topic.size >= WEBSOCKET_CONFIG.MAX_CLIENTS_PER_ROOM) {
                    logger.warn(`[Signaling Server] Room ${topicName} is full.`);
                    return; 
                  }

                  topic.add(conn);
                  subscribedTopics.add(topicName);
                }
              });
              break;

            case 'unsubscribe':
              // Client is leaving rooms
              (message.topics || []).forEach((topicName: string) => {
                const topic = topics.get(topicName);
                if (topic) {
                  topic.delete(conn);
                  if (topic.size === 0) {
                    topics.delete(topicName);
                  }
                }
                subscribedTopics.delete(topicName);
              });
              break;

            case 'publish':
              // Client is sending WebRTC signaling data to a room
              if (message.topic) {
                const receivers = topics.get(message.topic);
                if (receivers) {
                  receivers.forEach((receiver) => {
                    if (receiver !== conn) {
                      send(receiver, message);
                    }
                  });
                }
              }
              break;

            case 'ping':
              send(conn, { type: 'pong' });
              break;

            case 'join_workspace':
              if (typeof message.workspaceId === 'string' && message.workspaceId.trim()) {
                const workspaceId = message.workspaceId;
                let room = rooms.get(workspaceId);
                if (!room) {
                  room = new Set();
                  rooms.set(workspaceId, room);
                }
                room.add(conn);
                joinedWorkspaces.add(workspaceId);
                connectionUserId = typeof message.userId === 'string' ? message.userId : connectionUserId;
                broadcastToRoom(workspaceId, {
                  type: 'user_joined',
                  userId: message.userId,
                  userName: message.userName,
                });
              }
              break;

            case 'cursor_move':
              if (typeof message.workspaceId === 'string' && message.workspaceId.trim()) {
                broadcastToRoom(message.workspaceId, {
                  type: 'cursor_update',
                  userId: message.userId,
                  x: message.x,
                  y: message.y,
                });
              }
              break;

            case 'node_move':
              if (typeof message.workspaceId === 'string' && message.workspaceId.trim()) {
                broadcastToRoom(message.workspaceId, {
                  type: 'node_moved',
                  userId: message.userId,
                  nodeId: message.nodeId,
                  x: message.x,
                  y: message.y,
                });
              }
              break;

            case 'graph_replace':
              if (typeof message.workspaceId === 'string' && message.workspaceId.trim()) {
                broadcastToRoom(message.workspaceId, {
                  type: 'graph_updated',
                  nodes: message.nodes,
                  edges: message.edges,
                });
              }
              break;

            default:
              logger.warn(`[Signaling Server] Unknown message type: ${message.type}`);
              break;
          }
        }
      } catch (err) {
        logger.error('[Signaling Server] Failed to parse incoming message.');
      }
    });

    conn.on('close', () => {
      logger.info('[Signaling Server] Client disconnected');
      joinedWorkspaces.forEach((workspaceId) => {
        const room = rooms.get(workspaceId);
        if (room) {
          room.delete(conn);
          if (connectionUserId) {
            room.forEach((member) => {
              send(member, { type: 'user_left', userId: connectionUserId });
            });
          }
          if (room.size === 0) {
            rooms.delete(workspaceId);
          }
        }
      });
      joinedWorkspaces.clear();

      subscribedTopics.forEach((topicName) => {
        const topic = topics.get(topicName);
        if (topic) {
          topic.delete(conn);
          if (topic.size === 0) {
            topics.delete(topicName);
          }
        }
      });
      subscribedTopics.clear();
    });

    // Setup ping interval to terminate dead connections
    const pingInterval = setInterval(() => {
      if (!isAlive) {
        conn.terminate();
        return;
      }
      isAlive = false;
      conn.ping();
    }, WEBSOCKET_CONFIG.PING_INTERVAL_MS);

    conn.on('close', () => clearInterval(pingInterval));
  });

  logger.info('[Signaling Server] WebRTC Signaling initialized.');
};