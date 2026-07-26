import WebSocket from 'ws';
import type { OrderBookLevel } from '../../types/orderbook';
import {
  isOrderBookLevel,
  isRecord,
} from './okxValidation';

export interface OKXOrderBookUpdate {
  instId: string;
  action: 'snapshot' | 'update';
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  timestamp: number;
  seqId: number;
  prevSeqId: number;
}

export interface OKXCandleUpdate {
  instId: string;
  interval: string;
  candle: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    confirmed: boolean;
  };
}

export class OKXWebSocketClient {
  private ws: WebSocket | null = null;
private reconnectTimer?: NodeJS.Timeout;
private heartbeatTimer?: NodeJS.Timeout;
private reconnectAttempt = 0;
private intentionallyClosed = false;
private hasConnectedOnce = false;
private onReconnectCallback?: () => void;
private readonly url =
  'wss://ws.okx.com:8443/ws/v5/public';

private readonly orderBookSubscriptions =
  new Map<string, string>();

private readonly candleSubscriptions =
  new Map<
    string,
    {
      instId: string;
      interval: string;
    }
  >();

  private onOrderBookUpdate?: (
    update: OKXOrderBookUpdate,
  ) => void;

  private onCandleUpdate?: (
    update: OKXCandleUpdate,
  ) => void;

  constructor() {
  this.connect();
}
private connect(): void {
  if (this.intentionallyClosed) {
    return;
  }

  const ws = new WebSocket(
    this.url,
    {
      maxPayload:
        2 * 1024 * 1024,
      perMessageDeflate: false,
    },
  );

  this.ws = ws;

  ws.on('open', () => {
  const isReconnect =
    this.hasConnectedOnce;

  this.hasConnectedOnce = true;
  this.reconnectAttempt = 0;

  console.log(
    isReconnect
      ? 'Reconnected to OKX WebSocket'
      : 'Connected to OKX WebSocket',
  );

  /*
   * Reset local state before sending
   * subscriptions. This ensures that
   * the new snapshot cannot mix with
   * data from the previous connection.
   */
  if (isReconnect) {
    this.onReconnectCallback?.();
  }

  this.startHeartbeat();
  this.resubscribeAll();
});

  ws.on(
    'message',
    data => {
      this.handleMessage(data);
    },
  );

  ws.on('error', error => {
    console.error(
      'OKX WebSocket error:',
      error,
    );
  });

  ws.on('close', () => {
    console.log(
      '❌ Disconnected from OKX WebSocket',
    );

    this.stopHeartbeat();

    if (!this.intentionallyClosed) {
      this.scheduleReconnect();
    }
  });
}

private handleMessage(
  data: WebSocket.RawData,
): void {
  const rawMessage =
    data.toString();

  if (rawMessage === 'pong') {
    return;
  }

  let message: unknown;

  try {
    message = JSON.parse(
      rawMessage,
    );
  } catch (error) {
    console.error(
      'Failed to parse OKX WebSocket message:',
      error,
    );

    return;
  }

  /*
   * JSON.parse can return anything:
   * an object, array, string, number,
   * boolean, or null.
   */
  if (!isRecord(message)) {
    console.error(
      'Rejected non-object OKX message',
    );

    return;
  }

  /*
   * Subscription confirmations and
   * OKX error messages have an event.
   */
  if (
    typeof message.event ===
    'string'
  ) {
    console.log(
      'OKX event:',
      message,
    );

    return;
  }

  /*
   * A market-data message must contain
   * an arg object.
   */
  if (!isRecord(message.arg)) {
    console.error(
      'Rejected OKX message without valid arg',
    );

    return;
  }

  const channel =
    message.arg.channel;

  const instId =
    message.arg.instId;

  if (
    typeof channel !== 'string' ||
    typeof instId !== 'string'
  ) {
    console.error(
      'Rejected OKX message with invalid channel or instId',
    );

    return;
  }

  if (!Array.isArray(message.data)) {
    console.error(
      'Rejected OKX message without valid data array',
    );

    return;
  }

  if (message.data.length === 0) {
    return;
  }

  if (channel === 'books') {
    const orderBook =
      message.data[0];

    if (!isRecord(orderBook)) {
      console.error(
        'Rejected malformed OKX order-book object',
      );

      return;
    }

    if (
      !Array.isArray(
        orderBook.asks,
      ) ||
      !orderBook.asks.every(
        isOrderBookLevel,
      ) ||
      !Array.isArray(
        orderBook.bids,
      ) ||
      !orderBook.bids.every(
        isOrderBookLevel,
      )
    ) {
      console.error(
        'Rejected malformed OKX order-book payload',
      );

      return;
    }

    const timestamp =
      Number(orderBook.ts);

    const seqId =
      Number(orderBook.seqId);

    const prevSeqId =
      Number(orderBook.prevSeqId);

    if (
      !Number.isFinite(
        timestamp,
      ) ||
      !Number.isSafeInteger(
        seqId,
      ) ||
      !Number.isSafeInteger(
        prevSeqId,
      )
    ) {
      console.error(
        'Rejected invalid OKX sequence or timestamp',
      );

      return;
    }

    if (
      message.action !==
        'snapshot' &&
      message.action !==
        'update'
    ) {
      console.error(
        'Rejected invalid OKX order-book action',
      );

      return;
    }
const update:
  OKXOrderBookUpdate = {
  instId,
  action:
    message.action,
  asks:
    orderBook.asks,
  bids:
    orderBook.bids,
  timestamp,
  seqId,
  prevSeqId,
};

try {
  this.onOrderBookUpdate?.(
    update,
  );
} catch (error) {
  console.error(
    `Order-book callback failed for ` +
    `${update.instId}:`,
    error,
  );
}
   
    return;
  }

  if (
    channel.startsWith(
      'candle',
    )
  ) {
    const rawCandle =
      message.data[0];

    if (
      !Array.isArray(
        rawCandle,
      ) ||
      rawCandle.length < 9
    ) {
      console.error(
        'Rejected malformed OKX candle payload',
      );

      return;
    }

    const timestamp =
      Number(rawCandle[0]);

    const open =
      Number(rawCandle[1]);

    const high =
      Number(rawCandle[2]);

    const low =
      Number(rawCandle[3]);

    const close =
      Number(rawCandle[4]);

    const volume =
      Number(rawCandle[5]);

    if (
      !Number.isFinite(
        timestamp,
      ) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      console.error(
        'Rejected invalid OKX candle values',
      );

      return;
    }

    const update:
  OKXCandleUpdate = {
  instId,
  interval:
    channel.replace(
      'candle',
      '',
    ),
  candle: {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    confirmed:
      rawCandle[8] ===
      '1',
  },
};

try {
  this.onCandleUpdate?.(
    update,
  );
} catch (error) {
  console.error(
    `Candle callback failed for ` +
    `${update.instId}:`,
    error,
  );
}
  }
}

private scheduleReconnect(): void {
  if (this.reconnectTimer) {
    return;
  }

  const delayMs =
    Math.min(
      30_000,
      1_000 *
        2 ** this.reconnectAttempt,
    );

  this.reconnectAttempt += 1;

  console.log(
    `Reconnecting OKX WebSocket in ` +
    `${delayMs / 1_000}s...`,
  );

  this.reconnectTimer =
    setTimeout(() => {
      this.reconnectTimer =
        undefined;

      this.connect();
    }, delayMs);
}

private startHeartbeat(): void {
  this.stopHeartbeat();

  this.heartbeatTimer =
    setInterval(() => {
      if (
        this.ws?.readyState ===
        WebSocket.OPEN
      ) {
        this.ws.send('ping');
      }
    }, 20_000);
}

private stopHeartbeat(): void {
  if (this.heartbeatTimer) {
    clearInterval(
      this.heartbeatTimer,
    );

    this.heartbeatTimer =
      undefined;
  }
}

private resubscribeAll(): void {
  for (
    const [
      instId,
      instType,
    ]
    of this.orderBookSubscriptions
  ) {
    this.sendOrderBookSubscription(
      instId,
      instType,
    );
  }

  for (
    const subscription
    of this.candleSubscriptions.values()
  ) {
    this.sendCandleSubscription(
      subscription.instId,
      subscription.interval,
    );
  }
}

private sendOrderBookSubscription(
  instId: string,
  instType: string,
): void {
  if (
    this.ws?.readyState !==
    WebSocket.OPEN
  ) {
    return;
  }

  this.ws.send(
    JSON.stringify({
      op: 'subscribe',
      args: [
        {
          channel: 'books',
          instId,
          instType,
        },
      ],
    }),
  );

  console.log(
    `📘 Subscribed to ${instId} order book`,
  );
}

private sendCandleSubscription(
  instId: string,
  interval: string,
): void {
  if (
    this.ws?.readyState !==
    WebSocket.OPEN
  ) {
    return;
  }

  this.ws.send(
    JSON.stringify({
      op: 'subscribe',
      args: [
        {
          channel:
            `candle${interval}`,
          instId,
        },
      ],
    }),
  );

  console.log(
    `📈 Subscribed to ${instId} ` +
    `${interval} candles`,
  );
}

public onReconnect(
  callback: () => void,
): void {
  this.onReconnectCallback =
    callback;
}

  public onOrderBook(
    callback: (
      update: OKXOrderBookUpdate,
    ) => void,
  ): void {
    this.onOrderBookUpdate =
      callback;
  }

  public onCandle(
    callback: (
      update: OKXCandleUpdate,
    ) => void,
  ): void {
    this.onCandleUpdate =
      callback;
  }

public subscribeToOrderBook(
  instId: string,
  instType: string = 'SPOT',
): void {
  if (instType !== 'SPOT') {
    throw new Error(
      `Unsupported instrument type: ` +
      `${instType}. ` +
      'The current notional calculation ' +
      'supports SPOT instruments only.',
    );
  }

  this.orderBookSubscriptions.set(
    instId,
    instType,
  );

  this.sendOrderBookSubscription(
    instId,
    instType,
  );
}

public subscribeToCandle(
  instId: string,
  interval: string,
): void {
  const normalizedInterval =
    interval
      .trim()
      .toLowerCase();

  const subscriptionKey =
    `${instId}:${normalizedInterval}`;

  this.candleSubscriptions.set(
    subscriptionKey,
    {
      instId,
      interval:
        normalizedInterval,
    },
  );

  this.sendCandleSubscription(
    instId,
    normalizedInterval,
  );
}

public close(): void {
  if (this.intentionallyClosed) {
    return;
  }

  this.intentionallyClosed = true;

  if (this.reconnectTimer) {
    clearTimeout(
      this.reconnectTimer,
    );

    this.reconnectTimer =
      undefined;
  }

  this.stopHeartbeat();

  console.log(
    'Closing OKX WebSocket intentionally...',
  );

  this.ws?.close();
  this.ws = null;
}
}