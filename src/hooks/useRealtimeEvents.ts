'use client';

import { useEffect, useRef } from 'react';

type EventHandler = (data: unknown) => void;

interface UseRealtimeEventsOptions {
  onTransactionCreated?: EventHandler;
  onTransactionUpdated?: EventHandler;
  onTransactionDeleted?: EventHandler;
  onAccountUpdated?: EventHandler;
  onAccountCreated?: EventHandler;
  onConnected?: EventHandler;
}

export function useRealtimeEvents(handlers: UseRealtimeEventsOptions) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isCancelled = false;

    function connect() {
      if (isCancelled) return;
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current.onConnected?.(data);
      });

      eventSource.addEventListener('transaction_created', (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current.onTransactionCreated?.(data);
      });

      eventSource.addEventListener('transaction_updated', (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current.onTransactionUpdated?.(data);
      });

      eventSource.addEventListener('transaction_deleted', (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current.onTransactionDeleted?.(data);
      });

      eventSource.addEventListener('account_updated', (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current.onAccountUpdated?.(data);
      });

      eventSource.addEventListener('account_created', (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current.onAccountCreated?.(data);
      });

      eventSource.onerror = () => {
        eventSource?.close();
        if (!isCancelled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      isCancelled = true;
      eventSource?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);
}
