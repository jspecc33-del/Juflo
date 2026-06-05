/**
 * Unit Tests: MemoryEntity Domain Entity
 *
 * Tests for memory creation, embedding management, metadata updates, and querying.
 */

import { describe, it, expect } from 'vitest';
import { MemoryEntity } from '../../src/memory/domain/Memory';
import type { Memory } from '../../src/memory/domain/Memory';

function createMemoryConfig(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    agentId: 'agent-1',
    content: 'Test memory content',
    type: 'task',
    timestamp: 1700000000000,
    ...overrides,
  };
}

describe('MemoryEntity', () => {
  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.id).toBe('mem-1');
      expect(mem.agentId).toBe('agent-1');
      expect(mem.content).toBe('Test memory content');
      expect(mem.type).toBe('task');
      expect(mem.timestamp).toBe(1700000000000);
    });

    it('should default metadata to empty object when not provided', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.metadata).toEqual({});
    });

    it('should use current time when timestamp is 0', () => {
      const before = Date.now();
      const mem = new MemoryEntity(createMemoryConfig({ timestamp: 0 }));
      // timestamp 0 is falsy, so constructor uses Date.now()
      expect(mem.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('hasEmbedding', () => {
    it('should return false when no embedding set', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.hasEmbedding()).toBe(false);
    });

    it('should return false for empty embedding array', () => {
      const mem = new MemoryEntity(createMemoryConfig({ embedding: [] }));
      expect(mem.hasEmbedding()).toBe(false);
    });

    it('should return true when embedding has values', () => {
      const mem = new MemoryEntity(createMemoryConfig({ embedding: [0.1, 0.2, 0.3] }));
      expect(mem.hasEmbedding()).toBe(true);
    });
  });

  describe('getEmbeddingDimension', () => {
    it('should return undefined when no embedding', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.getEmbeddingDimension()).toBeUndefined();
    });

    it('should return length of embedding array', () => {
      const mem = new MemoryEntity(createMemoryConfig({ embedding: [0.1, 0.2, 0.3] }));
      expect(mem.getEmbeddingDimension()).toBe(3);
    });
  });

  describe('updateContent', () => {
    it('should update the content field', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      mem.updateContent('Updated content');
      expect(mem.content).toBe('Updated content');
    });
  });

  describe('setEmbedding', () => {
    it('should set the embedding', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      mem.setEmbedding([0.5, 0.6]);
      expect(mem.embedding).toEqual([0.5, 0.6]);
      expect(mem.hasEmbedding()).toBe(true);
    });
  });

  describe('updateMetadata', () => {
    it('should merge new metadata with existing', () => {
      const mem = new MemoryEntity(createMemoryConfig({ metadata: { key1: 'val1' } }));
      mem.updateMetadata({ key2: 'val2' });
      expect(mem.metadata).toEqual({ key1: 'val1', key2: 'val2' });
    });

    it('should overwrite existing keys', () => {
      const mem = new MemoryEntity(createMemoryConfig({ metadata: { key1: 'old' } }));
      mem.updateMetadata({ key1: 'new' });
      expect(mem.metadata).toEqual({ key1: 'new' });
    });
  });

  describe('matches', () => {
    it('should match when query is empty', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({})).toBe(true);
    });

    it('should match when agentId matches', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({ agentId: 'agent-1' })).toBe(true);
    });

    it('should not match when agentId differs', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({ agentId: 'agent-2' })).toBe(false);
    });

    it('should match when type matches', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({ type: 'task' })).toBe(true);
    });

    it('should not match when type differs', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({ type: 'event' })).toBe(false);
    });

    it('should match when id matches', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({ id: 'mem-1' })).toBe(true);
    });

    it('should combine filters with AND logic', () => {
      const mem = new MemoryEntity(createMemoryConfig());
      expect(mem.matches({ agentId: 'agent-1', type: 'task' })).toBe(true);
      expect(mem.matches({ agentId: 'agent-1', type: 'event' })).toBe(false);
    });
  });

  describe('getAge', () => {
    it('should return positive age for past timestamps', () => {
      const mem = new MemoryEntity(createMemoryConfig({ timestamp: Date.now() - 5000 }));
      expect(mem.getAge()).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('toJSON', () => {
    it('should return a plain object', () => {
      const mem = new MemoryEntity(createMemoryConfig({ embedding: [1, 2] }));
      const json = mem.toJSON();
      expect(json.id).toBe('mem-1');
      expect(json.embedding).toEqual([1, 2]);
      expect(json).not.toBeInstanceOf(MemoryEntity);
    });
  });

  describe('fromConfig', () => {
    it('should create a MemoryEntity from config', () => {
      const mem = MemoryEntity.fromConfig(createMemoryConfig({ id: 'from-cfg' }));
      expect(mem).toBeInstanceOf(MemoryEntity);
      expect(mem.id).toBe('from-cfg');
    });
  });

  describe('createTaskMemory', () => {
    it('should create a task-type memory', () => {
      const mem = MemoryEntity.createTaskMemory('agent-1', 'task done', 'task-42');
      expect(mem.type).toBe('task');
      expect(mem.agentId).toBe('agent-1');
      expect(mem.content).toBe('task done');
      expect(mem.metadata?.taskId).toBe('task-42');
    });
  });

  describe('createContextMemory', () => {
    it('should create a context-type memory', () => {
      const mem = MemoryEntity.createContextMemory('agent-1', 'some context');
      expect(mem.type).toBe('context');
      expect(mem.content).toBe('some context');
    });
  });

  describe('createEventMemory', () => {
    it('should create an event-type memory', () => {
      const mem = MemoryEntity.createEventMemory('agent-1', 'spawn', 'Agent spawned');
      expect(mem.type).toBe('event');
      expect(mem.content).toBe('Agent spawned');
      expect(mem.metadata?.eventType).toBe('spawn');
    });
  });
});
