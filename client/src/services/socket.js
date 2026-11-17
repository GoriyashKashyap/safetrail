import { io } from 'socket.io-client';
import { SERVER_URL } from './api';

let socket = null;

/** Open an authenticated socket. Replaces any previous connection. */
export const connectSocket = (token) => {
  if (socket) socket.disconnect();
  // No URL in development → same origin, proxied by Vite to the local server.
  socket = io(SERVER_URL || undefined, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) socket.disconnect();
  socket = null;
};
