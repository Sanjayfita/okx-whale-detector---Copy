import WebSocket from 'ws';

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
  private readonly ws: WebSocket;

  private onCandleUpdate?: (
    candle: OKXCandle,
  ) => void;

  constructor() {
    this.ws = new WebSocket(
      'wss://ws.okx.com:8443/ws/v5/business',
    );

    this.ws.on(
      'open',
      () => {
        console.log(
          'Connected to OKX Candle WebSocket',
        );
      },
    );

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
            'OKX Candle event:',
            message,
          );

          return;
        }

        if (
          message.arg?.channel ===
            'candle1m' &&
          message.data?.length > 0
        ) {
          const values =
            message.data[0];

          const candle: OKXCandle = {
            instId:
              message.arg.instId,

            timestamp: Number(
              values[0],
            ),
            open: Number(
              values[1],
            ),
            high: Number(
              values[2],
            ),
            low: Number(
              values[3],
            ),
            close: Number(
              values[4],
            ),
            volume: Number(
              values[5],
            ),
            volumeCurrency: Number(
              values[6],
            ),
            volumeCurrencyQuote:
              Number(values[7]),
            confirm:
              values[8] === '1',
          };

          this.onCandleUpdate?.(
            candle,
          );
        }
      },
    );

    this.ws.on(
      'error',
      (error: Error) => {
        console.error(
          'OKX Candle WebSocket error:',
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
  }
  public onCandle(
    callback: (candle: OKXCandle) => void,
  ): void {
    this.onCandleUpdate = callback;
  }
  
  public subscribeToCandles(
    instId: string,
  ): void {
    const subscribeMessage = {
      op: 'subscribe',
      args: [
        {
          channel: 'candle1m',
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

  public close(): void {
    this.ws.close();
  }
}