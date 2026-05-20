import { io } from 'socket.io-client';

let socketInstance = null;

function getSocketBaseUrl() {
  return (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace('/api', '');
}

function getAccessToken() {
  return localStorage.getItem('flexcart_token');
}

export function getOrCreateSocket() {
  const token = getAccessToken();
  if (!token) return null;

  if (!socketInstance) {
    socketInstance = io(getSocketBaseUrl(), {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { token }
    });
  } else {
    socketInstance.auth = { token };
  }

  return socketInstance;
}

export function connectSocket() {
  const socket = getOrCreateSocket();
  if (!socket) return null;

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (!socketInstance) return;
  socketInstance.disconnect();
}
