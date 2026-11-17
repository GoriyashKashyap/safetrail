import { useEffect, useRef } from 'react';

/** Subscribe to a Socket.IO event with the latest handler without re-subscribing. */
export default function useSocketEvent(socket, event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return undefined;
    const listener = (payload) => handlerRef.current?.(payload);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}
