import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys, refreshSession } from './api.js';

const STREAM_URL = '/api/v1/events/stream';

const EVENT_TYPES = [
  'ticket.created',
  'ticket.updated',
  'ticket.message.created',
  'ticket.note.created',
  'ticket.triaged',
  'ticket.draft.updated',
];

const RECONNECT_DELAYS_MS = [5000, 10000, 30000];

export function useRealtime(enabled) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let source = null;
    let retryTimer = null;
    let failedAttempts = 0;
    let hasConnectedBefore = false;
    let stopped = false;

    const refreshTickets = () => queryClient.invalidateQueries({ queryKey: queryKeys.tickets });

    function connect() {
      source = new EventSource(STREAM_URL);

      source.onopen = () => {
        if (hasConnectedBefore) {
          refreshTickets();
        }
        hasConnectedBefore = true;
        failedAttempts = 0;
      };

      for (const type of EVENT_TYPES) {
        source.addEventListener(type, refreshTickets);
      }

      source.onerror = () => {
        if (source.readyState !== EventSource.CLOSED) {
          return;
        }
        const delay = RECONNECT_DELAYS_MS[Math.min(failedAttempts, RECONNECT_DELAYS_MS.length - 1)];
        failedAttempts += 1;
        retryTimer = setTimeout(async () => {
          await refreshSession();
          if (!stopped) {
            connect();
          }
        }, delay);
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled, queryClient]);
}
