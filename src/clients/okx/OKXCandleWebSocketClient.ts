import WebSocket from 'ws';
import {isRecord,} from './okxValidation';

export interface OKXCandle {
  instId: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeCurrency: number;
  volumeCurrencyQuote: number;
  confirm: boolean;
}

export class OKXCandleWebSocketClient {
  private ws: WebSocket | null = null;
private reconnectTimer?: NodeJS.Timeout;
private heartbeatTimer?: NodeJS.Timeout;
private reconnectAttempt = 0;
private intentionallyClosed = false; 

private readonly url =
  'wss://ws.okx.com:8443/ws/v5/business';


private readonly candleSubscriptions =
  new Set<string>();

   

  private onCandleUpdate?: (
    candle: OKXCandle
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
    console.log(
      'Connected to OKX Candle WebSocket',
    );

    this.reconnectAttempt = 0;
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
      'OKX Candle WebSocket error:',
      error,
    );
  });

  ws.on('close', () => {
    console.log(
      '❌ Disconnected from OKX Candle WebSocket',
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
      'Failed to parse Candle WebSocket message:',
      error,
    );

    return;
  }

  if (!isRecord(message)) {
    console.error(
      'Rejected non-object OKX candle message',
    );

    return;
  }

  if (
    typeof message.event ===
    'string'
  ) {
    console.log(
      'OKX Candle event:',
      message,
    );

    return;
  }

  if (!isRecord(message.arg)) {
    console.error(
      'Rejected candle message without valid arg',
    );

    return;
  }

  const channel =
    message.arg.channel;

  const instId =
    message.arg.instId;

  if (
    channel !== 'candle1m' ||
    typeof instId !== 'string'
  ) {
    return;
  }

  if (
    !Array.isArray(
      message.data,
    ) ||
    message.data.length === 0
  ) {
    console.error(
      'Rejected candle message without valid data',
    );

    return;
  }

  const values =
    message.data[0];

  if (
    !Array.isArray(values) ||
    values.length < 9
  ) {
    console.error(
      'Rejected malformed OKX candle payload',
    );

    return;
  }

  const timestamp =
    Number(values[0]);

  const open =
    Number(values[1]);

  const high =
    Number(values[2]);

  const low =
    Number(values[3]);

  const close =
    Number(values[4]);

  const volume =
    Number(values[5]);

  const volumeCurrency =
    Number(values[6]);

  const volumeCurrencyQuote =
    Number(values[7]);

  if (
    !Number.isFinite(
      timestamp,
    ) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(volume) ||
    !Number.isFinite(
      volumeCurrency,
    ) ||
    !Number.isFinite(
      volumeCurrencyQuote,
    )
  ) {
    console.error(
      'Rejected invalid OKX candle values',
    );

    return;
  }

  const candle: OKXCandle = {
    instId,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    volumeCurrency,
    volumeCurrencyQuote,
    confirm:
      values[8] === '1',
  };

 try {
  this.onCandleUpdate?.(
    candle,
  );
} catch (error) {
  console.error(
    `Candle callback failed for ` +
    `${candle.instId}:`,
    error,
  );
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
    `Reconnecting Candle WebSocket in ` +
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
    const instId
    of this.candleSubscriptions
  ) {
    this.sendCandleSubscription(
      instId,
    );
  }
}

private sendCandleSubscription(
  instId: string,
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
          channel: 'candle1m',
          instId,
        },
      ],
    }),
  );

  console.log(
    `📈 Subscribed to ${instId} 1m candles`,
  );
}

  public onCandle(
    callback: (candle: OKXCandle) => void,
  ): void {
    this.onCandleUpdate = callback;
  }
  
  public subscribeToCandle(
  instId: string,
): void {
  this.candleSubscriptions.add(
    instId,
  );

  this.sendCandleSubscription(
    instId,
  );
}

public close(): void {
  this.intentionallyClosed = true;

  if (this.reconnectTimer) {
    clearTimeout(
      this.reconnectTimer,
    );

    this.reconnectTimer =
      undefined;
  }

  this.stopHeartbeat();
  this.ws?.close();
  this.ws = null;
}
}