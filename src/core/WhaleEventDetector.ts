import type { Whale } from '../types/whale';

export type WhaleEventType =
| 'NEW'
| 'REMOVED'
| 'INCREASED'
| 'DECREASED'
| 'MOVED';

export interface WhaleEvent {
type: WhaleEventType;
whale: Whale;
previous?: Whale;
}

interface TrackedWhale {
whale: Whale;
lastSeen: number;
}

export class WhaleEventDetector {
private previousWhales =
new Map<string, TrackedWhale>();

private readonly removalGracePeriodMs =
2_000;

private readonly movementPriceTolerance = (
price: number,
): number => {
if (
price >= 50_000
) {
return 100;
}


if (
  price >= 1_000
) {
  return 10;
}

if (
  price >= 10
) {
  return 0.5;
}

return 0.01;


};

public detect(
currentWhales: Whale[],
): WhaleEvent[] {
const events: WhaleEvent[] = [];


const now =
  Date.now();

const currentMap =
  new Map<string, Whale>();

const matchedPreviousKeys =
  new Set<string>();

/*
 * FIRST PASS
 *
 * Detect:
 * - NEW
 * - INCREASED
 * - DECREASED
 * - MOVED
 */

for (
  const whale of currentWhales
) {
  const exactKey =
    this.getKey(
      whale,
    );

  currentMap.set(
    exactKey,
    whale,
  );

  const previous =
    this.previousWhales.get(
      exactKey,
    );

  /*
   * EXACT PRICE MATCH
   */

  if (
    previous
  ) {
    matchedPreviousKeys.add(
      exactKey,
    );

    const change =
      whale.notionalUSD -
      previous.whale.notionalUSD;

    const changePercent =
      Math.abs(
        change /
        previous.whale.notionalUSD,
      ) * 100;

    if (
      changePercent >= 10 &&
      Math.abs(
        change,
      ) >= 100_000
    ) {
      events.push({
        type:
          change > 0
            ? 'INCREASED'
            : 'DECREASED',

        whale,

        previous:
          previous.whale,
      });
    }

    this.previousWhales.set(
      exactKey,
      {
        whale,

        lastSeen:
          now,
      },
    );

    continue;
  }

  /*
   * NO EXACT PRICE MATCH
   *
   * Try to find a nearby
   * previous whale.
   */

  const movedFrom =
    this.findPossibleMovedWhale(
      whale,
      matchedPreviousKeys,
    );

  if (
    movedFrom
  ) {
    const previousKey =
      movedFrom.key;

    const previousWhale =
      movedFrom.tracked.whale;

    matchedPreviousKeys.add(
      previousKey,
    );

    events.push({
      type: 'MOVED',

      whale,

      previous:
        previousWhale,
    });

    this.previousWhales.delete(
      previousKey,
    );

    this.previousWhales.set(
      exactKey,
      {
        whale,

        lastSeen:
          now,
      },
    );

    continue;
  }

  /*
   * COMPLETELY NEW WHALE
   */

  events.push({
    type: 'NEW',

    whale,
  });

  this.previousWhales.set(
    exactKey,
    {
      whale,

      lastSeen:
        now,
    },
  );
}

/*
 * SECOND PASS
 *
 * Detect REMOVED whales.
 */

for (
  const [
    key,
    tracked,
  ]
  of this.previousWhales
) {
  if (
    matchedPreviousKeys.has(
      key,
    )
  ) {
    continue;
  }

  if (
    currentMap.has(
      key,
    )
  ) {
    continue;
  }

  const timeSinceLastSeen =
    now -
    tracked.lastSeen;

  if (
    timeSinceLastSeen >=
    this.removalGracePeriodMs
  ) {
    events.push({
      type: 'REMOVED',

      whale:
        tracked.whale,
    });

    this.previousWhales.delete(
      key,
    );
  }
}

return events;


}

private findPossibleMovedWhale(
current: Whale,

matchedPreviousKeys: Set<string>,

):
{
key: string; tracked: TrackedWhale;
} | undefined { for (
const [
key, tracked,
]
of this.previousWhales
) {
if (matchedPreviousKeys.has(
key,)
) {
continue;
}


  const previous =
    tracked.whale;

  if (
    previous.side !==
    current.side
  ) {
    continue;
  }

  const priceDifference =
    Math.abs(
      current.price -
      previous.price,
    );

  const tolerance =
    this.movementPriceTolerance(
      previous.price,
    );

  if (
    priceDifference >
    tolerance
  ) {
    continue;
  }

  const sizeRatio =
    current.size /
    previous.size;

  if (
    sizeRatio < 0.8 ||
    sizeRatio > 1.2
  ) {
    continue;
  }

  return {
    key,

    tracked,
  };
}

return undefined;


}

private getKey(
whale: Whale,
): string {
return (
`${whale.side}:${whale.price}`
);
}

public reset(): void {
this.previousWhales.clear();
}
}
