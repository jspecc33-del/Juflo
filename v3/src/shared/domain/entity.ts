/**
 * Entity Base Class
 *
 * Base class for domain entities identified by a stable id rather than
 * their attributes. Tracks uncommitted domain events raised during
 * state transitions.
 */

import type { DomainEvent } from './domain-event';

export abstract class Entity<T> {
  protected readonly _id: T;
  private _domainEvents: DomainEvent[] = [];

  constructor(id: T) {
    this._id = id;
  }

  get id(): T {
    return this._id;
  }

  equals(entity?: Entity<T>): boolean {
    if (entity === null || entity === undefined) {
      return false;
    }

    if (this === entity) {
      return true;
    }

    if (!(entity instanceof Entity)) {
      return false;
    }

    return this._id === entity._id;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  getUncommittedEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  markEventsAsCommitted(): void {
    this._domainEvents = [];
  }
}
