import WebSocket from 'ws';
import type { OrderBookLevel } from '../../types/orderbook';

export interface OKXOrderBookUpdate {
  instId: string;
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
  private readonly ws: WebSocket;

  private onOrderBookUpdate?: (
    update: OKXOrderBookUpdate,
  ) => void;

  private onCandleUpdate?: (
    update: OKXCandleUpdate,
  ) => void;

  constructor() {
    this.ws = new WebSocket(
      'wss://ws.okx.com:8443/ws/v5/public',
    );

    this.ws.on('open', () => {
      console.log(
        'Connected to OKX WebSocket',
      );
    });

    this.ws.on(
      'message',
      (data: WebSocket.RawData) => {
       let message;
try {
  message = JSON.parse(data.toString());
} catch (error) {
  console.error('Failed to parse WebSocket message:', error);
  return;
}

        if (message.event) {
          console.log(
            'OKX event:',
            message,
          );
          return;
        }

        if (
          message.arg?.channel ===
            'books' &&
          message.data?.length > 0
        ) {
          const orderBook =
            message.data[0];

          this.onOrderBookUpdate?.({
            instId: message.arg.instId,
            asks: orderBook.asks,
            bids: orderBook.bids,
            timestamp: Number(
              orderBook.ts,
            ),
            seqId: Number(
              orderBook.seqId,
            ),
            prevSeqId: Number(
              orderBook.prevSeqId,
            ),
          });
        }

        if (
          message.arg?.channel?.startsWith(
            'candle',
          ) &&
          message.data?.length > 0
        ) {
          const rawCandle =
            message.data[0];

          this.onCandleUpdate?.({
            instId:
              message.arg.instId,
            interval:
              message.arg.channel.replace(
                'candle',
                '',
              ),
            candle: {
              timestamp: Number(
                rawCandle[0],
              ),
              open: Number(
                rawCandle[1],
              ),
              high: Number(
                rawCandle[2],
              ),
              low: Number(
                rawCandle[3],
              ),
              close: Number(
                rawCandle[4],
              ),
              volume: Number(
                rawCandle[5],
              ),
              confirmed:
                rawCandle[8] === '1',
            },
          });
        }
      },
    );

    this.ws.on(
      'error',
      (error: Error) => {
        console.error(
          'OKX WebSocket error:',
          error,
        );
      },
    );

    this.ws.on('close', () => {
  console.log('Disconnected from OKX WebSocket. Reconnecting in 5s...');
  setTimeout(() => {
    this.ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    // Re-attach all event listeners (you'll need to refactor this into a method)
  }, 5000);
});

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
    const subscribeMessage = {
      op: 'subscribe',
      args: [
        {
          channel: 'books',
          instId,
          instType,
        },
      ],
    };

    if (
      this.ws.readyState ===
      WebSocket.OPEN
    ) {
      this.ws.send(
        JSON.stringify(
          subscribeMessage,
        ),
      );
    } else {
      this.ws.once(
        'open',
        () => {
          this.ws.send(
            JSON.stringify(
              subscribeMessage,
            ),
          );
        },
      );
    }
  }

  public subscribeToCandle(
    instId: string,
    interval: string,
  ): void {
    const normalizedInterval =
      interval
        .trim()
        .toLowerCase();

    const subscribeMessage = {
      op: 'subscribe',
      args: [
        {
          channel:
            `candle${normalizedInterval}`,
          instId,
        },
      ],
    };

    const sendSubscription = () => {
      if (
        this.ws.readyState ===
        WebSocket.OPEN
      ) {
        this.ws.send(
          JSON.stringify(
            subscribeMessage,
          ),
        );

        console.log(
          `📈 Subscribed to ${instId} ` +
          `${normalizedInterval} candles`,
        );
      }
    };

    if (
      this.ws.readyState ===
      WebSocket.OPEN
    ) {
      sendSubscription();
    } else {
      this.ws.once(
        'open',
        sendSubscription,
      );
    }
  }
}