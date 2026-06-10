/**
 * Core DDD Infrastructure - Public API
 *
 * @module v3/cli/core
 */

// Shared base classes
export { Entity } from './shared/domain/entity.js';
export { ValueObject } from './shared/domain/value-object.js';
export { AggregateRoot } from './shared/domain/aggregate-root.js';

// Session management domain
export { Session } from './domains/session-management/entities/session.entity.js';
export type { SessionStatus, SessionProps } from './domains/session-management/entities/session.entity.js';
export { SessionId } from './domains/session-management/value-objects/session-id.vo.js';
export { InMemorySessionRepository } from './domains/session-management/repositories/session.repository.js';
export type { ISessionRepository } from './domains/session-management/repositories/session.repository.js';

// Health monitoring domain
export { HealthCheck } from './domains/health-monitoring/entities/health-check.entity.js';
export type { HealthStatus, HealthCheckProps } from './domains/health-monitoring/entities/health-check.entity.js';
export { HealthMonitoringService } from './domains/health-monitoring/services/health-monitoring.service.js';
export type { SystemHealthReport, HealthProbe } from './domains/health-monitoring/services/health-monitoring.service.js';

// Application use cases
export { CreateSessionUseCase } from './application/use-cases/create-session.use-case.js';
export type { CreateSessionCommand, CreateSessionResult } from './application/use-cases/create-session.use-case.js';
export { GetHealthStatusUseCase } from './application/use-cases/get-health-status.use-case.js';
export type { GetHealthStatusResult } from './application/use-cases/get-health-status.use-case.js';
