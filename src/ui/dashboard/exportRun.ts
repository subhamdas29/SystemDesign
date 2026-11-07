/**
 * Browser-side RunResult JSON Exporter.
 * Initiates download of a simulation run payload.
 */

import { RunResult } from '../../types/metrics';

export function exportRunAsJson(runResult: RunResult): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(runResult, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute(
    'download',
    `simulation-run-${runResult.seed}-${Math.round(runResult.timestamp / 1000)}.json`
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
