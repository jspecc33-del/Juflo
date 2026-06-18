/**
 * Domain Event Base Class
 *
 * Base class for events raised by aggregates when their state changes.
 */

export abstract class DomainEvent {
  readonly occurredAt: Date = new Date();

  constructor(readonly aggregateId: string) {}
}
