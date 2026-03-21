import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

let ydoc: Y.Doc | null = null;
let provider: WebrtcProvider | null = null;

const resolveSignalingUrl = (): string => {
  const explicit = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (explicit) {
    return explicit.replace(/^http/i, 'ws');
  }

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (apiBase) {
    return apiBase.replace(/^http/i, 'ws').replace(/\/$/, '');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:3001`;
};

export const initCollaboration = (roomId: string) => {
  if (provider) {
    provider.destroy();
  }

  ydoc = new Y.Doc();

  // Connect to your existing signaling server
  provider = new WebrtcProvider(roomId, ydoc, {
    signaling: [resolveSignalingUrl()],
    awareness: provider?.awareness,
  });

  return { ydoc, provider };
};

export const getCollaboration = () => ({ ydoc, provider });

export const destroyCollaboration = () => {
  provider?.destroy();
  ydoc?.destroy();
  ydoc = null;
  provider = null;
};

// Awareness = cursor positions and user presence
export const setLocalUser = (provider: WebrtcProvider, user: { name: string; color: string }) => {
  provider.awareness.setLocalStateField('user', user);
};

export const setLocalCursor = (provider: WebrtcProvider, x: number, y: number) => {
  provider.awareness.setLocalStateField('cursor', { x, y });
};
