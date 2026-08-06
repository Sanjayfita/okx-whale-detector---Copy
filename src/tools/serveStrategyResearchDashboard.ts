import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

interface ParsedNdjson {
  readonly records: readonly Record<string, unknown>[];
  readonly malformed: number;
}

interface StrategyDashboardSnapshot {
  readonly evaluationId: string;
  readonly generatedAt: number;
  readonly counts: {
    readonly candidateRecords: number;
    readonly qualificationDecisions: number;
    readonly qualified: number;
    readonly rejected: number;
    readonly completedOutcomes: number;
    readonly pendingOutcomes: number;
    readonly whaleIncrementalObservations: number;
    readonly malformedRecords: number;
  };
  readonly latestQualification?: Record<string, unknown>;
  readonly latestOutcome?: Record<string, unknown>;
  readonly qualificationByInstrument: readonly {
    readonly instrumentId: string;
    readonly decisions: number;
    readonly qualified: number;
    readonly rejected: number;
  }[];
  readonly qualificationByDirection: readonly {
    readonly direction: string;
    readonly decisions: number;
    readonly qualified: number;
    readonly rejected: number;
  }[];
  readonly outcomeSummary: {
    readonly observations: number;
    readonly wins: number;
    readonly winRatePercent: number | null;
    readonly averageGrossReturnPercent: number | null;
  };
  readonly paperOnly: true;
  readonly liveOrderExecutionAllowed: false;
  readonly orderExecutionAuthorized: false;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeEvaluationId = (value: string): string => {
  const id = value.trim();
  if (
    id.length === 0 ||
    id === '.' ||
    id === '..' ||
    id.includes('/') ||
    id.includes('\\')
  ) {
    throw new Error('Evaluation ID must be a safe directory name');
  }
  return id;
};

const parseNdjson = (filePath: string): ParsedNdjson => {
  if (!existsSync(filePath)) return { records: [], malformed: 0 };
  const lines = readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  const records: Record<string, unknown>[] = [];
  let malformed = 0;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isRecord(parsed)) records.push(parsed);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { records, malformed };
};

const nestedRecord = (
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined => {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
};

const booleanOf = (
  record: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined => {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

const stringOf = (
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
};

const numberOf = (
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

const qualificationOf = (
  record: Record<string, unknown>,
): Record<string, unknown> | undefined => nestedRecord(record, 'qualification');

const candidateOf = (
  record: Record<string, unknown>,
): Record<string, unknown> | undefined =>
  nestedRecord(qualificationOf(record), 'candidate');

const readPendingCount = (filePath: string): number => {
  if (!existsSync(filePath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(parsed) && Array.isArray(parsed.pending)
      ? parsed.pending.length
      : 0;
  } catch {
    return 0;
  }
};

const summarizeQualifications = (
  records: readonly Record<string, unknown>[],
  groupKey: 'instrumentId' | 'direction',
): readonly {
  readonly key: string;
  readonly decisions: number;
  readonly qualified: number;
  readonly rejected: number;
}[] => {
  const groups = new Map<
    string,
    { decisions: number; qualified: number; rejected: number }
  >();
  for (const record of records) {
    const candidate = candidateOf(record);
    const qualification = qualificationOf(record);
    const key = stringOf(candidate, groupKey) ?? 'UNKNOWN';
    const group = groups.get(key) ?? {
      decisions: 0,
      qualified: 0,
      rejected: 0,
    };
    group.decisions += 1;
    if (booleanOf(qualification, 'qualified') === true) group.qualified += 1;
    else group.rejected += 1;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort(
      (left, right) =>
        right.decisions - left.decisions || left.key.localeCompare(right.key),
    );
};

export const createStrategyDashboardSnapshot = (input: {
  readonly evaluationId: string;
  readonly projectDirectory?: string;
  readonly generatedAt?: number;
}): StrategyDashboardSnapshot => {
  const evaluationId = safeEvaluationId(input.evaluationId);
  const directory = path.resolve(
    input.projectDirectory ?? process.cwd(),
    'data',
    'strategy-evaluations',
    evaluationId,
  );
  const candidates = parseNdjson(
    path.join(directory, 'strategy-candidates.ndjson'),
  );
  const qualifications = parseNdjson(
    path.join(directory, 'strategy-qualifications.ndjson'),
  );
  const outcomes = parseNdjson(path.join(directory, 'strategy-outcomes.ndjson'));
  const whale = parseNdjson(
    path.join(directory, 'whale-incremental-observations.ndjson'),
  );
  const qualified = qualifications.records.filter(
    (record) => booleanOf(qualificationOf(record), 'qualified') === true,
  ).length;
  const outcomeReturns = outcomes.records
    .map((record) =>
      numberOf(nestedRecord(record, 'observation') ?? record, 'grossReturnPercent'),
    )
    .filter((value): value is number => value !== undefined);
  const wins = outcomeReturns.filter((value) => value > 0).length;
  const byInstrument = summarizeQualifications(
    qualifications.records,
    'instrumentId',
  ).map((group) => ({ instrumentId: group.key, ...group }));
  const byDirection = summarizeQualifications(
    qualifications.records,
    'direction',
  ).map((group) => ({ direction: group.key, ...group }));

  return Object.freeze({
    evaluationId,
    generatedAt: input.generatedAt ?? Date.now(),
    counts: Object.freeze({
      candidateRecords: candidates.records.length,
      qualificationDecisions: qualifications.records.length,
      qualified,
      rejected: qualifications.records.length - qualified,
      completedOutcomes: outcomes.records.length,
      pendingOutcomes: readPendingCount(
        path.join(directory, 'pending-strategy-outcomes.json'),
      ),
      whaleIncrementalObservations: whale.records.length,
      malformedRecords:
        candidates.malformed +
        qualifications.malformed +
        outcomes.malformed +
        whale.malformed,
    }),
    latestQualification: qualifications.records.at(-1),
    latestOutcome: outcomes.records.at(-1),
    qualificationByInstrument: Object.freeze(byInstrument),
    qualificationByDirection: Object.freeze(byDirection),
    outcomeSummary: Object.freeze({
      observations: outcomeReturns.length,
      wins,
      winRatePercent:
        outcomeReturns.length === 0 ? null : (wins / outcomeReturns.length) * 100,
      averageGrossReturnPercent:
        outcomeReturns.length === 0
          ? null
          : outcomeReturns.reduce((sum, value) => sum + value, 0) /
            outcomeReturns.length,
    }),
    paperOnly: true,
    liveOrderExecutionAllowed: false,
    orderExecutionAuthorized: false,
  });
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? 'N/A' : `${value.toFixed(4)}%`;

const formatNumber = (value: number | undefined, digits = 4): string =>
  value === undefined ? 'N/A' : value.toFixed(digits);

const formatTime = (value: number | undefined): string =>
  value === undefined ? 'N/A' : new Date(value).toLocaleString('en-PH');

const renderList = (value: unknown): string => {
  if (!Array.isArray(value) || value.length === 0) {
    return '<span class="muted">None</span>';
  }
  return `<ul>${value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
};

const renderField = (
  label: string,
  value: string,
  className = '',
): string =>
  `<div class="detail"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value ${className}">${value}</div></div>`;

const renderRawDetails = (
  title: string,
  record: Record<string, unknown> | undefined,
): string => {
  if (record === undefined) return '';
  return `<details><summary>${escapeHtml(title)}</summary><pre>${escapeHtml(
    JSON.stringify(record, null, 2),
  )}</pre></details>`;
};

const renderLatestQualification = (
  record: Record<string, unknown> | undefined,
): string => {
  if (record === undefined) {
    return '<p class="muted">No qualification has been recorded.</p>';
  }
  const qualification = qualificationOf(record);
  const candidate = nestedRecord(qualification, 'candidate');
  const whale = nestedRecord(qualification, 'whaleAssessment');
  const features = nestedRecord(whale, 'features');
  const qualified = booleanOf(qualification, 'qualified') === true;
  const direction = stringOf(candidate, 'direction') ?? 'UNKNOWN';
  return `
    <div class="status-line ${qualified ? 'status-pass' : 'status-reject'}">${qualified ? 'QUALIFIED' : 'REJECTED'} · ${escapeHtml(direction)}</div>
    <div class="details-grid">
      ${renderField('Instrument', escapeHtml(stringOf(candidate, 'instrumentId') ?? 'N/A'))}
      ${renderField('Strategy', escapeHtml(stringOf(candidate, 'strategyId') ?? 'N/A'))}
      ${renderField('Generated', escapeHtml(formatTime(numberOf(candidate, 'generatedAt'))))}
      ${renderField('Reference price', escapeHtml(formatNumber(numberOf(candidate, 'referencePrice'))))}
      ${renderField('Expected move', escapeHtml(formatPercent(numberOf(candidate, 'expectedMovePercent'))))}
      ${renderField('Estimated net edge', escapeHtml(formatPercent(numberOf(qualification, 'estimatedNetEdgePercent'))))}
      ${renderField('Base confidence', escapeHtml(formatNumber(numberOf(candidate, 'baseConfidence'), 2)))}
      ${renderField('Adjusted confidence', escapeHtml(formatNumber(numberOf(qualification, 'adjustedConfidence'), 2)))}
      ${renderField('Regime', escapeHtml(stringOf(candidate, 'regime') ?? 'N/A'))}
      ${renderField('Holding horizon', `${escapeHtml(formatNumber(numberOf(candidate, 'holdingHorizonMinutes'), 0))} minutes`)}
      ${renderField('Whale alignment', escapeHtml(stringOf(whale, 'alignment') ?? 'N/A'))}
      ${renderField('Whale authenticity', escapeHtml(stringOf(whale, 'authenticity') ?? 'N/A'))}
      ${renderField('Trade-flow confirmation', escapeHtml(formatPercent(numberOf(features, 'tradeFlowConfirmationScore'))))}
      ${renderField('Spoof probability', escapeHtml(formatPercent(numberOf(features, 'spoofProbability'))))}
    </div>
    <h3>Strategy rationale</h3>${renderList(candidate?.rationale)}
    <h3>Qualification reasons</h3>${renderList(qualification?.reasons)}
    <h3>Whale assessment</h3>${renderList(whale?.reasons)}
    ${renderRawDetails('Show raw qualification record', record)}
  `;
};

const renderLatestOutcome = (
  record: Record<string, unknown> | undefined,
): string => {
  if (record === undefined) {
    return '<p class="muted">No completed outcome has been recorded yet.</p>';
  }
  const observation = nestedRecord(record, 'observation') ?? record;
  const grossReturn = numberOf(observation, 'grossReturnPercent');
  const profitable = grossReturn !== undefined && grossReturn > 0;
  return `
    <div class="status-line ${profitable ? 'status-pass' : 'status-reject'}">${profitable ? 'PROFITABLE OUTCOME' : 'LOSING / FLAT OUTCOME'}</div>
    <div class="details-grid">
      ${renderField('Instrument', escapeHtml(stringOf(observation, 'instrumentId') ?? 'N/A'))}
      ${renderField('Direction', escapeHtml(stringOf(observation, 'direction') ?? 'N/A'))}
      ${renderField('Strategy', escapeHtml(stringOf(observation, 'strategyId') ?? 'N/A'))}
      ${renderField('Generated', escapeHtml(formatTime(numberOf(observation, 'generatedAt'))))}
      ${renderField('Observed', escapeHtml(formatTime(numberOf(observation, 'outcomeObservedAt'))))}
      ${renderField('Horizon', `${escapeHtml(formatNumber(numberOf(observation, 'horizonMinutes'), 0))} minutes`)}
      ${renderField('Entry reference', escapeHtml(formatNumber(numberOf(observation, 'referencePrice'))))}
      ${renderField('Outcome price', escapeHtml(formatNumber(numberOf(observation, 'outcomePrice'))))}
      ${renderField('Gross return', escapeHtml(formatPercent(grossReturn)), profitable ? 'positive' : 'negative')}
      ${renderField('Whale group', escapeHtml(stringOf(observation, 'whaleGroup') ?? 'N/A'))}
      ${renderField('Final qualified', booleanOf(observation, 'finalQualified') === true ? 'Yes' : 'No')}
      ${renderField('Spread at entry', escapeHtml(formatPercent(numberOf(observation, 'spreadPercent'))))}
      ${renderField('Depth notional', escapeHtml(formatNumber(numberOf(observation, 'depthNotionalQuote'), 2)))}
      ${renderField('Realized volatility', escapeHtml(formatPercent(numberOf(observation, 'realizedVolatilityPercent'))))}
    </div>
    ${renderRawDetails('Show raw outcome record', record)}
  `;
};

const renderGroupRows = (
  groups: readonly {
    readonly key: string;
    readonly decisions: number;
    readonly qualified: number;
    readonly rejected: number;
  }[],
): string =>
  groups
    .map(
      (group) =>
        `<tr><td>${escapeHtml(group.key)}</td><td>${group.decisions}</td><td>${group.qualified}</td><td>${group.rejected}</td><td>${group.decisions === 0 ? '0.00%' : `${((group.qualified / group.decisions) * 100).toFixed(2)}%`}</td></tr>`,
    )
    .join('');

export const renderStrategyResearchDashboardHtml = (
  snapshot: StrategyDashboardSnapshot,
): string => {
  const instrumentGroups = snapshot.qualificationByInstrument.map((group) => ({
    key: group.instrumentId,
    decisions: group.decisions,
    qualified: group.qualified,
    rejected: group.rejected,
  }));
  const directionGroups = snapshot.qualificationByDirection.map((group) => ({
    key: group.direction,
    decisions: group.decisions,
    qualified: group.qualified,
    rejected: group.rejected,
  }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>Strategy Research Dashboard</title>
<style>
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#e8eef8;background:#07111f}*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(135deg,#07111f,#102a45);min-height:100vh}.wrap{max-width:1500px;margin:auto}.header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.badge{background:#113b2d;border:1px solid #30d58b;color:#b2f4d5;padding:10px 14px;border-radius:10px;font-weight:750}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:14px;margin:22px 0}.card,.panel{background:rgba(14,31,52,.95);border:1px solid #294a6d;border-radius:14px;padding:18px;box-shadow:0 12px 30px rgba(0,0,0,.22)}.label{color:#91aac6;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}.value{font-size:1.7rem;font-weight:750;margin-top:7px}.panel{margin-top:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(470px,1fr));gap:16px}h1,h2{margin-top:0}h3{font-size:1rem;color:#bcd0e6;margin:18px 0 8px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:520px}th,td{text-align:right;padding:10px;border-bottom:1px solid #263f5d}th:first-child,td:first-child{text-align:left}th{color:#9fb8d2}.details-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.detail{background:#0a192a;border:1px solid #213d5c;border-radius:9px;padding:11px}.detail-label{font-size:.72rem;color:#91aac6;text-transform:uppercase;letter-spacing:.06em}.detail-value{font-size:.98rem;font-weight:650;margin-top:5px;overflow-wrap:anywhere}.status-line{display:inline-block;padding:8px 12px;border-radius:8px;font-weight:800;margin-bottom:14px}.status-pass{background:#103b2c;border:1px solid #2dd481;color:#aaf2d0}.status-reject{background:#401b22;border:1px solid #ff6f7d;color:#ffc1c8}details{margin-top:16px;border-top:1px solid #294a6d;padding-top:12px}summary{cursor:pointer;color:#acd8ff;font-weight:650}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#081625;border:1px solid #213d5c;padding:14px;border-radius:10px;max-height:400px;overflow:auto;color:#c9ddf2}ul{margin:8px 0 0;padding-left:20px}li{margin:5px 0}.positive{color:#55dfa0}.negative{color:#ff9090}.muted{color:#91aac6}.footer{color:#8fa4bd;margin:20px 4px;font-size:.9rem}code{color:#acd8ff}
</style></head><body><main class="wrap">
<div class="header"><div><h1>Strategy Research Dashboard</h1><p>Evaluation: <code>${escapeHtml(snapshot.evaluationId)}</code> · refreshes every 10 seconds</p></div><div class="badge">READ ONLY · PAPER ONLY · EXECUTION DISABLED</div></div>
<div class="cards">
<div class="card"><div class="label">Candidate records</div><div class="value">${snapshot.counts.candidateRecords}</div></div>
<div class="card"><div class="label">Qualification decisions</div><div class="value">${snapshot.counts.qualificationDecisions}</div></div>
<div class="card"><div class="label">Qualified</div><div class="value positive">${snapshot.counts.qualified}</div></div>
<div class="card"><div class="label">Rejected</div><div class="value">${snapshot.counts.rejected}</div></div>
<div class="card"><div class="label">Pending outcomes</div><div class="value">${snapshot.counts.pendingOutcomes}</div></div>
<div class="card"><div class="label">Completed outcomes</div><div class="value">${snapshot.counts.completedOutcomes}</div></div>
<div class="card"><div class="label">Outcome win rate</div><div class="value">${formatPercent(snapshot.outcomeSummary.winRatePercent)}</div></div>
<div class="card"><div class="label">Average gross return</div><div class="value ${snapshot.outcomeSummary.averageGrossReturnPercent !== null && snapshot.outcomeSummary.averageGrossReturnPercent >= 0 ? 'positive' : 'negative'}">${formatPercent(snapshot.outcomeSummary.averageGrossReturnPercent)}</div></div>
<div class="card"><div class="label">Whale observations</div><div class="value">${snapshot.counts.whaleIncrementalObservations}</div></div>
<div class="card"><div class="label">Malformed records</div><div class="value">${snapshot.counts.malformedRecords}</div></div>
</div>
<div class="grid">
<section class="panel"><h2>Qualifications by instrument</h2><div class="table-wrap"><table><thead><tr><th>Instrument</th><th>Decisions</th><th>Qualified</th><th>Rejected</th><th>Pass rate</th></tr></thead><tbody>${renderGroupRows(instrumentGroups)}</tbody></table></div></section>
<section class="panel"><h2>Qualifications by direction</h2><div class="table-wrap"><table><thead><tr><th>Direction</th><th>Decisions</th><th>Qualified</th><th>Rejected</th><th>Pass rate</th></tr></thead><tbody>${renderGroupRows(directionGroups)}</tbody></table></div></section>
</div>
<div class="grid">
<section class="panel"><h2>Latest qualification</h2>${renderLatestQualification(snapshot.latestQualification)}</section>
<section class="panel"><h2>Latest completed outcome</h2>${renderLatestOutcome(snapshot.latestOutcome)}</section>
</div>
<p class="footer">Research analytics only. This server reads local strategy research files and cannot place orders or authorize execution. Generated at ${new Date(snapshot.generatedAt).toISOString()}.</p>
</main></body></html>`;
};

export const createStrategyResearchDashboardServer = (
  evaluationId: string,
): Server =>
  createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(
        JSON.stringify({
          status: 'ok',
          mode: 'paper-only',
          evaluationId,
          liveOrderExecutionAllowed: false,
          orderExecutionAuthorized: false,
        }),
      );
      return;
    }
    try {
      const snapshot = createStrategyDashboardSnapshot({ evaluationId });
      if (request.url === '/api/snapshot') {
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify(snapshot));
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(renderStrategyResearchDashboardHtml(snapshot));
    } catch (error: unknown) {
      response.writeHead(500, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

const main = (): void => {
  const evaluationId = safeEvaluationId(
    process.argv[2] ?? 'strategy-eval-2026-08-06-v1',
  );
  const port = Number(process.env.STRATEGY_DASHBOARD_PORT ?? 4175);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('STRATEGY_DASHBOARD_PORT must be a valid port');
  }
  const server = createStrategyResearchDashboardServer(evaluationId);
  server.listen(port, '127.0.0.1', () => {
    console.log(`Strategy research dashboard: http://127.0.0.1:${port}`);
    console.log(`Evaluation ID: ${evaluationId}`);
    console.log('Read-only paper research. All order execution remains disabled.');
  });
  const stop = (): void => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

if (require.main === module) main();
