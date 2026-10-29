import pg from 'pg';
import { EVENT_CHANNEL } from '../../core/events/event_bus.js';
import { logger } from '../../core/logger.js';
import { LISTENER_RECONNECT_MS } from './realtime.constants.js';
import { dispatch } from './realtime.hub.js';

let client = null;
let reconnectTimer = null;
let stopped = true;

function handleNotification(notification) {
  try {
    dispatch(JSON.parse(notification.payload));
  } catch (error) {
    logger.warn({ err: error }, 'Ignored an invalid realtime event');
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((error) => {
      logger.warn({ err: error }, 'Realtime listener could not reconnect');
      scheduleReconnect();
    });
  }, LISTENER_RECONNECT_MS);
  reconnectTimer.unref();
}

function handleLostConnection(lostClient, error) {
  if (client !== lostClient) return;
  client = null;
  if (error) {
    logger.warn({ err: error }, 'Realtime listener connection lost');
  }
  lostClient.end().catch(() => {});
  scheduleReconnect();
}

async function connect() {
  const next = new pg.Client({ connectionString: process.env.DATABASE_URL });
  next.on('notification', handleNotification);
  next.on('error', (error) => handleLostConnection(next, error));
  next.on('end', () => handleLostConnection(next));

  try {
    await next.connect();
    await next.query(`LISTEN ${EVENT_CHANNEL}`);
  } catch (error) {
    await next.end().catch(() => {});
    throw error;
  }

  client = next;
  logger.info('Realtime listener connected');
}

export async function startEventListener() {
  stopped = false;
  try {
    await connect();
  } catch (error) {
    logger.warn({ err: error }, 'Realtime listener could not connect; retrying in the background');
    scheduleReconnect();
  }
}

export async function stopEventListener() {
  stopped = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const current = client;
  client = null;
  if (current) {
    await current.end();
  }
}

export function isListening() {
  return client !== null;
}
