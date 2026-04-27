import { io } from 'socket.io-client';

const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : undefined;

export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket'],
});