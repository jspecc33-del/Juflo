/**
 * GetHealthStatus - Application Use Case
 *
 * Runs all registered health probes and returns a system health report.
 *
 * @module v3/cli/core/application/use-cases
 */

import type {
  HealthMonitoringService,
  SystemHealthReport,
} from '../../domains/health-monitoring/services/health-monitoring.service.js';

export interface GetHealthStatusResult {
  success: boolean;
  report?: SystemHealthReport;
  error?: string;
}

export class GetHealthStatusUseCase {
  constructor(private readonly healthService: HealthMonitoringService) {}

  async execute(runChecks = true): Promise<GetHealthStatusResult> {
    try {
      if (runChecks) {
        await this.healthService.runAllChecks();
      }
      const report = this.healthService.getSystemReport();
      return { success: true, report };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
