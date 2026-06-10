/**
 * AggregateRoot - DDD Base Class
 *
 * Consistency boundary for a cluster of domain entities.
 * Extends Entity with versioning for optimistic concurrency.
 *
 * @module v3/cli/core/shared/domain
 */

import { Entity } from './entity.js';
import type { DomainEvent } from '../../../../../shared/src/events/domain-events.js';

export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _version = 0;

  get version(): number {
    return this._version;
  }

  protected applyEvent(event: DomainEvent): void {
    this.addDomainEvent(event);
    this._version++;
  }
}
