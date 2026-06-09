/**
 * Entity Base Class Tests
 */

import { describe, it, expect } from 'vitest';
import { Entity } from '../../src/core/shared/domain/entity.js';
import type { DomainEvent } from '../../../../shared/src/events/domain-events.js';

class TestEntity extends Entity<string> {
  constructor(id: string) { super(id); }
  exposeAddEvent(event: DomainEvent) { this.addDomainEvent(event); }
}

function makeEvent(id: string): DomainEvent {
  return {
    id,
    type: 'test:event',
    aggregateId: 'agg-1',
    aggregateType: 'agent',
    version: 1,
    timestamp: Date.now(),
    source: 'swarm',
    payload: {},
  };
}

describe('Entity', () => {
  describe('identity', () => {
    it('exposes its id', () => {
      expect(new TestEntity('abc').id).toBe('abc');
    });

    it('equals itself', () => {
      const e = new TestEntity('abc');
      expect(e.equals(e)).toBe(true);
    });

    it('equals another entity with the same id', () => {
      expect(new TestEntity('abc').equals(new TestEntity('abc'))).toBe(true);
    });

    it('is not equal to entity with different id', () => {
      expect(new TestEntity('abc').equals(new TestEntity('xyz'))).toBe(false);
    });

    it('is not equal to undefined', () => {
      expect(new TestEntity('abc').equals(undefined)).toBe(false);
    });
  });

  describe('domain events', () => {
    it('starts with no uncommitted events', () => {
      expect(new TestEntity('abc').getUncommittedEvents()).toHaveLength(0);
    });

    it('collects added events', () => {
      const e = new TestEntity('abc');
      e.exposeAddEvent(makeEvent('evt-1'));
      e.exposeAddEvent(makeEvent('evt-2'));
      expect(e.getUncommittedEvents()).toHaveLength(2);
    });

    it('returns a snapshot (mutating result does not affect internal state)', () => {
      const e = new TestEntity('abc');
      e.exposeAddEvent(makeEvent('evt-1'));
      e.getUncommittedEvents().pop();
      expect(e.getUncommittedEvents()).toHaveLength(1);
    });

    it('clears events after markEventsAsCommitted', () => {
      const e = new TestEntity('abc');
      e.exposeAddEvent(makeEvent('evt-1'));
      e.markEventsAsCommitted();
      expect(e.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
