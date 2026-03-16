// backend/src/sockets/turnConfig.ts
import { logger } from '../utils/logger';
// import { env } from '../config/env'; // If you add TURN_API_KEY to env.ts later

/**
 * Interface representing standard WebRTC ICE Server configurations.
 */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Retrieves STUN and TURN server configurations for WebRTC NAT Traversal.
 * * STUN: Discovers the user's public IP address (Free, fast).
 * * TURN: Relays real-time data if a strict firewall blocks P2P connection (Paid, fallback).
 * * Called when a frontend client requests connection details to join a multiplayer workspace.
 */
export const getIceServers = async (): Promise<IceServerConfig[]> => {
  // 1. Always include free public STUN servers (Google's are the most reliable)
  const servers: IceServerConfig[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  try {
    // 2. Optional: Fetch enterprise TURN credentials dynamically.
    // For your hackathon, STUN is usually enough if you test on standard networks.
    // However, if judges test on restricted university/corporate Wi-Fi, you will need TURN.
    
    // Example: Fetching ephemeral credentials from a provider like Metered or Twilio
    /*
    if (env.TURN_API_KEY) {
      const response = await fetch(`https://infrazero.metered.live/api/v1/turn/credentials?apiKey=${env.TURN_API_KEY}`);
      
      if (!response.ok) throw new Error('Failed to fetch TURN credentials');
      
      const turnServers: IceServerConfig[] = await response.json();
      servers.push(...turnServers); // Append paid TURN servers to the free STUN list
    }
    */

    logger.info('[TURN Config] Successfully loaded ICE servers for WebRTC fallback.');
    
  } catch (error) {
    logger.error(`[TURN Config Error] Failed to fetch TURN server list: ${error instanceof Error ? error.message : String(error)}`);
    // If fetching TURN fails, we silently fallback to returning just the free STUN servers.
  }

  return servers;
};