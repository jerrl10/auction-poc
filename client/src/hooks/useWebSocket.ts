import { useEffect, useMemo } from 'react';
import { websocketService } from '../services/websocket';
import { WebSocketEvent } from '../types';

export function useWebSocket() {
  useEffect(() => {
    // WebSocket service is a singleton - only connects once
    websocketService.connect();

    // Do NOT disconnect on unmount - connection is shared across all components
  }, []);

  return useMemo(
    () => ({
      subscribe: (auctionId: string) => websocketService.subscribeToAuction(auctionId),
      unsubscribe: (auctionId: string) => websocketService.unsubscribeFromAuction(auctionId),
      on: (event: WebSocketEvent, callback: Function) => websocketService.on(event, callback),
      isConnected: () => websocketService.isConnected(),
    }),
    []
  );
}
