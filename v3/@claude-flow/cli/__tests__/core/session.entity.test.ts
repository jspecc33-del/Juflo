/**
 * Session Entity Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Session } from '../../src/core/domains/session-management/entities/session.entity.js';

describe('Session', () => {
  let session: Session;

  beforeEach(() => {
    session = Session.create('test-session');
  });

  describe('creation', () => {
    it('creates an active session', () => {
      expect(session.name).toBe('test-session');
      expect(session.status).toBe('active');
      expect(session.isActive()).toBe(true);
    });

    it('generates unique ids', () => {
      expect(session.id.equals(Session.create('other').id)).toBe(false);
    });

    it('defaults memoryNamespace to session:<id>', () => {
      expect(session.memoryNamespace).toBe(`session:${session.id.value}`);
    });

    it('accepts a custom memoryNamespace', () => {
      expect(Session.create('ns-session', 'custom:ns').memoryNamespace).toBe('custom:ns');
    });

    it('throws for blank name', () => {
      expect(() => Session.create('')).toThrow();
      expect(() => Session.create('   ')).toThrow();
    });
  });

  describe('agent management', () => {
    it('adds and exposes agent ids', () => {
      session.addAgent('a1');
      session.addAgent('a2');
      expect(session.agentIds).toEqual(expect.arrayContaining(['a1', 'a2']));
    });

    it('deduplicates (set semantics)', () => {
      session.addAgent('a1');
      session.addAgent('a1');
      expect(session.agentIds).toHaveLength(1);
    });

    it('removes agents', () => {
      session.addAgent('a1');
      session.removeAgent('a1');
      expect(session.agentIds).not.toContain('a1');
    });

    it('throws when adding agent to a saved session', () => {
      session.save();
      expect(() => session.addAgent('a')).toThrow('saved');
    });
  });

  describe('task management', () => {
    it('tracks task ids', () => {
      session.addTask('t1');
      expect(session.taskIds).toContain('t1');
    });
  });

  describe('lifecycle', () => {
    it('save → active', () => {
      session.save();
      expect(session.status).toBe('saved');
    });

    it('save → restore → active', () => {
      session.save();
      session.restore();
      expect(session.status).toBe('active');
    });

    it('archive', () => {
      session.archive();
      expect(session.status).toBe('archived');
    });

    it('expire marks as expired', () => {
      session.expire();
      expect(session.isExpired()).toBe(true);
    });

    it('cannot archive an expired session', () => {
      session.expire();
      expect(() => session.archive()).toThrow('expired');
    });

    it('cannot restore an archived session', () => {
      session.archive();
      expect(() => session.restore()).toThrow('archived');
    });
  });

  describe('metadata', () => {
    it('stores key/value metadata', () => {
      session.setMetadata('region', 'us-east');
      expect(session.metadata['region']).toBe('us-east');
    });
  });

  describe('serialization', () => {
    it('toJSON contains all expected fields', () => {
      session.addAgent('a1');
      session.addTask('t1');
      const json = session.toJSON();
      expect(json).toMatchObject({
        name: 'test-session',
        status: 'active',
        agentIds: ['a1'],
        taskIds: ['t1'],
      });
      expect(typeof json['id']).toBe('string');
      expect(typeof json['createdAt']).toBe('string');
    });
  });
});
