/**
 * Entity - DDD Base Class
 *
 * Abstract base for all domain entities. Identity is the defining
 * characteristic; two entities with the same ID are the same entity
 * regardless of other property values.
 *
 * @module v3/cli/core/shared/domain
 */

import type { DomainEvent } from '../../../../../shared/src/events/domain-events.js';

export abstract class Entity<TId> {
  protected readonly _id: TId;
  private _domainEvents: DomainEvent[] = [];

  protected constructor(id: TId) {
    this._id = id;
  }

  get id(): TId {
    return this._id;
  }

  public equals(other?: Entity<TId>): boolean {
    if (!other || !(other instanceof Entity)) return false;
    if (this === other) return true;
    return JSON.stringify(this._id) === JSON.stringify(other._id);
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public getUncommittedEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }

  public markEventsAsCommitted(): void {
    this._domainEvents = [];
  }
}
