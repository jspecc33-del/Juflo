/**
 * Aggregate Root Base Class
 *
 * Base class for entities that are the entry point of a consistency
 * boundary. Tracks a version that increments each time a domain event
 * is applied, for optimistic concurrency / event sourcing.
 */

import { Entity } from './entity';
import type { DomainEvent } from './domain-event';

export abstract class AggregateRoot<T> extends Entity<T> {
  private _version = 0;

  get version(): number {
    return this._version;
  }

  protected incrementVersion(): void {
    this._version++;
  }

  protected applyEvent(event: DomainEvent): void {
    this.addDomainEvent(event);
    this.incrementVersion();
  }
}
