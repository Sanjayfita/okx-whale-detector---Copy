import { appConfig } from '../config/appConfig';
import { CorrelatedAlertLogReader } from '../recording/CorrelatedAlertLogReader';
import {
  aggregateCorrelatedAlerts,
  parseCorrelatedAlertInspectOptions,
} from '../recording/correlatedAlertInspection';

const run = async (): Promise<void> => {
  const options = parseCorrelatedAlertInspectOptions(
    process.argv.slice(2),
    appConfig.correlatedAlertRecording.outputPath,
  );
  const result = await new CorrelatedAlertLogReader().read(options.filePath, {
    maximumRecords: options.limit,
  });
  const inspection = aggregateCorrelatedAlerts(result.records, options.latest);

  console.log('CORRELATED ALERT LOG\n');
  console.log(`File: ${options.filePath}`);
  console.log(`Valid alerts: ${inspection.totalValidAlerts}`);
  console.log(`Malformed lines: ${result.malformedLines.length}`);

  for (const malformed of result.malformedLines) {
    console.warn(
      `Malformed line ${malformed.lineNumber}: ${malformed.message}`,
    );
  }

  console.log('\nBy severity:');
  for (const [severity, count] of Object.entries(inspection.countsBySeverity)) {
    console.log(`${severity}: ${count}`);
  }

  console.log('\nBy event:');
  for (const [eventType, count] of Object.entries(
    inspection.countsByEventType,
  )) {
    console.log(`${eventType}: ${count}`);
  }

  console.log('\nTop symbols:');
  const symbols = Object.entries(inspection.countsBySymbol).sort(
    ([leftSymbol, leftCount], [rightSymbol, rightCount]) =>
      rightCount - leftCount || leftSymbol.localeCompare(rightSymbol),
  );

  for (const [symbol, count] of symbols) {
    console.log(`${symbol}: ${count}`);
  }

  console.log(
    `\nLatest alert timestamp: ${
      inspection.latestAlertTimestamp === undefined
        ? 'N/A'
        : new Date(inspection.latestAlertTimestamp).toISOString()
    }`,
  );
  console.log('\nLatest alerts:');

  for (const record of inspection.latestAlerts) {
    const { alert } = record;
    console.log(
      `${new Date(alert.createdAt).toISOString()} | ${alert.symbol} | ` +
        `${alert.severity} | ${alert.eventType} | ` +
        `${alert.combinedConfidence.toFixed(1)}%`,
    );
  }
};

void run().catch((error: unknown) => {
  console.error(
    'Correlated alert inspection failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
