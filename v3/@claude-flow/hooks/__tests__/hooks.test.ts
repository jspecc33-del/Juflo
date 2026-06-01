import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRegistry } from '../src/registry/index.js';
import { HookExecutor } from '../src/executor/index.js';
import { HookEvent, HookPriority } from '../src/types.js';
import type { HookContext, HookResult } from '../src/types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function successHandler(): HookResult {
  return { success: true };
}

function failHandler(): HookResult {
  return { success: false, error: 'handler failed' };
}

function abortHandler(): HookResult {
  return { success: true, abort: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// HookEvent & HookPriority enums
// ──────────────────────────────────────────────────────────────────────────────

describe('HookEvent', () => {
  it('defines lifecycle event constants', () => {
    expect(HookEvent.PreEdit).toBe('pre-edit');
    expect(HookEvent.PostEdit).toBe('post-edit');
    expect(HookEvent.PreCommand).toBe('pre-command');
    expect(HookEvent.PostCommand).toBe('post-command');
    expect(HookEvent.PreTask).toBe('pre-task');
    expect(HookEvent.PostTask).toBe('post-task');
    expect(HookEvent.SessionStart).toBe('session-start');
    expect(HookEvent.SessionEnd).toBe('session-end');
    expect(HookEvent.AgentSpawn).toBe('agent-spawn');
    expect(HookEvent.AgentTerminate).toBe('agent-terminate');
  });
});

describe('HookPriority', () => {
  it('orders priorities numerically so Critical runs before Background', () => {
    expect(HookPriority.Critical).toBeGreaterThan(HookPriority.High);
    expect(HookPriority.High).toBeGreaterThan(HookPriority.Normal);
    expect(HookPriority.Normal).toBeGreaterThan(HookPriority.Low);
    expect(HookPriority.Low).toBeGreaterThan(HookPriority.Background);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HookRegistry
// ──────────────────────────────────────────────────────────────────────────────

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  describe('register()', () => {
    it('returns a unique string ID', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('increments size with each registration', () => {
      expect(registry.size).toBe(0);
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      expect(registry.size).toBe(1);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      expect(registry.size).toBe(2);
    });

    it('stores the provided name in the entry', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal, {
        name: 'my-hook',
      });
      expect(registry.get(id)?.name).toBe('my-hook');
    });

    it('enables the hook by default', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      expect(registry.get(id)?.enabled).toBe(true);
    });

    it('respects the enabled:false option', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal, {
        enabled: false,
      });
      expect(registry.get(id)?.enabled).toBe(false);
    });

    it('generates unique IDs for concurrent registrations', () => {
      const ids = Array.from({ length: 10 }, () =>
        registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal)
      );
      expect(new Set(ids).size).toBe(10);
    });
  });

  describe('unregister()', () => {
    it('removes a registered hook and returns true', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      expect(registry.unregister(id)).toBe(true);
      expect(registry.has(id)).toBe(false);
    });

    it('returns false for an unknown ID', () => {
      expect(registry.unregister('nonexistent-id')).toBe(false);
    });

    it('decrements size after unregistering', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.unregister(id);
      expect(registry.size).toBe(0);
    });

    it('removes the hook from the event index so getForEvent omits it', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.unregister(id);
      expect(registry.getForEvent(HookEvent.PreEdit)).toHaveLength(0);
    });
  });

  describe('getForEvent()', () => {
    it('returns empty array when no hooks are registered for the event', () => {
      expect(registry.getForEvent(HookEvent.PreEdit)).toEqual([]);
    });

    it('returns only hooks registered for the requested event', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      expect(registry.getForEvent(HookEvent.PreEdit)).toHaveLength(1);
    });

    it('sorts hooks by priority descending (Critical before Background)', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Background, { name: 'bg' });
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Critical, { name: 'crit' });
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal, { name: 'norm' });
      const entries = registry.getForEvent(HookEvent.PreEdit);
      expect(entries[0].name).toBe('crit');
      expect(entries[entries.length - 1].name).toBe('bg');
    });

    it('excludes disabled hooks when enabledOnly is true (default)', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.disable(id);
      expect(registry.getForEvent(HookEvent.PreEdit, true)).toHaveLength(0);
    });

    it('includes disabled hooks when enabledOnly is false', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.disable(id);
      expect(registry.getForEvent(HookEvent.PreEdit, false)).toHaveLength(1);
    });
  });

  describe('enable() / disable()', () => {
    it('disabling a hook sets enabled to false', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.disable(id);
      expect(registry.get(id)?.enabled).toBe(false);
    });

    it('enabling a disabled hook sets enabled to true', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal, {
        enabled: false,
      });
      registry.enable(id);
      expect(registry.get(id)?.enabled).toBe(true);
    });

    it('enable returns false for unknown ID', () => {
      expect(registry.enable('ghost')).toBe(false);
    });

    it('disable returns false for unknown ID', () => {
      expect(registry.disable('ghost')).toBe(false);
    });
  });

  describe('list()', () => {
    it('returns all hooks when no filter is applied', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.High);
      expect(registry.list()).toHaveLength(2);
    });

    it('filters by event type', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      const result = registry.list({ event: HookEvent.PreEdit });
      expect(result).toHaveLength(1);
      expect(result[0].event).toBe(HookEvent.PreEdit);
    });

    it('filters by enabled status', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      registry.disable(id);
      const enabled = registry.list({ enabled: true });
      expect(enabled).toHaveLength(1);
      expect(enabled[0].event).toBe(HookEvent.PostEdit);
    });

    it('filters by minimum priority', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Background);
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Critical);
      const highPriority = registry.list({ minPriority: HookPriority.High });
      expect(highPriority).toHaveLength(1);
      expect(highPriority[0].priority).toBe(HookPriority.Critical);
    });

    it('filters by name pattern', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal, { name: 'security-check' });
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal, { name: 'metrics-log' });
      const security = registry.list({ namePattern: /^security/ });
      expect(security).toHaveLength(1);
      expect(security[0].name).toBe('security-check');
    });
  });

  describe('getStats()', () => {
    it('reports zero hooks on a fresh registry', () => {
      const stats = registry.getStats();
      expect(stats.totalHooks).toBe(0);
      expect(stats.enabledHooks).toBe(0);
      expect(stats.disabledHooks).toBe(0);
    });

    it('counts enabled vs disabled hooks correctly', () => {
      const id = registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      registry.disable(id);
      const stats = registry.getStats();
      expect(stats.totalHooks).toBe(2);
      expect(stats.enabledHooks).toBe(1);
      expect(stats.disabledHooks).toBe(1);
    });

    it('tracks hooks per event type', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      const stats = registry.getStats();
      expect(stats.hooksByEvent[HookEvent.PreEdit]).toBe(2);
      expect(stats.hooksByEvent[HookEvent.PostEdit]).toBe(1);
    });

    it('reflects recorded execution statistics', () => {
      registry.recordExecution(true, 10);
      registry.recordExecution(false, 20);
      const stats = registry.getStats();
      expect(stats.totalExecutions).toBe(2);
      expect(stats.totalFailures).toBe(1);
      expect(stats.avgExecutionTime).toBe(15);
    });
  });

  describe('clear()', () => {
    it('removes all hooks and resets size to 0', () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PostEdit, successHandler, HookPriority.Normal);
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.getForEvent(HookEvent.PreEdit)).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HookExecutor
// ──────────────────────────────────────────────────────────────────────────────

describe('HookExecutor', () => {
  let registry: HookRegistry;
  let executor: HookExecutor;

  beforeEach(() => {
    registry = new HookRegistry();
    executor = new HookExecutor(registry);
  });

  describe('execute() with no registered hooks', () => {
    it('returns success with zero hooks executed', async () => {
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.success).toBe(true);
      expect(result.hooksExecuted).toBe(0);
      expect(result.hooksFailed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('returns executionTime as a non-negative number', async () => {
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('execute() with successful hooks', () => {
    it('executes all registered hooks and reports success', async () => {
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.success).toBe(true);
      expect(result.hooksExecuted).toBe(2);
      expect(result.hooksFailed).toBe(0);
    });

    it('populates finalContext with the event', async () => {
      registry.register(HookEvent.PreTask, successHandler, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreTask, {
        task: { id: 't-1', description: 'Build', agent: 'coder' },
      });
      expect(result.finalContext?.event).toBe(HookEvent.PreTask);
    });

    it('collects warnings from hooks that emit them', async () => {
      registry.register(HookEvent.PreEdit, () => ({
        success: true,
        warnings: ['watch out'],
      }), HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.warnings).toContain('watch out');
    });

    it('collects messages from hooks that emit them', async () => {
      registry.register(HookEvent.PreEdit, () => ({
        success: true,
        message: 'hook ran',
      }), HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.messages).toContain('hook ran');
    });
  });

  describe('execute() with failing hooks', () => {
    it('reports failure and stops on first failure by default', async () => {
      const second = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.PreEdit, failHandler, HookPriority.High);
      registry.register(HookEvent.PreEdit, second, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.success).toBe(false);
      expect(result.hooksFailed).toBe(1);
      expect(second).not.toHaveBeenCalled();
    });

    it('continues executing hooks when continueOnError is true', async () => {
      const second = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.PreEdit, failHandler, HookPriority.High);
      registry.register(HookEvent.PreEdit, second, HookPriority.Normal);
      const result = await executor.execute(
        HookEvent.PreEdit,
        {},
        { continueOnError: true }
      );
      expect(second).toHaveBeenCalled();
      expect(result.hooksExecuted).toBe(2);
    });

    it('captures error message in individual hook result', async () => {
      registry.register(HookEvent.PreEdit, failHandler, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('handler failed');
    });
  });

  describe('execute() with aborting hooks', () => {
    it('stops execution and sets aborted flag', async () => {
      const second = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.PreEdit, abortHandler, HookPriority.High);
      registry.register(HookEvent.PreEdit, second, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.aborted).toBe(true);
      expect(second).not.toHaveBeenCalled();
    });

    it('marks overall result as failed when aborted', async () => {
      registry.register(HookEvent.PreEdit, abortHandler, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      // aborted means hooksFailed===0 but aborted===true → success===false
      expect(result.success).toBe(false);
    });
  });

  describe('execute() priority ordering', () => {
    it('runs Critical priority hooks before Low priority hooks', async () => {
      const order: string[] = [];
      registry.register(
        HookEvent.PreEdit,
        () => { order.push('low'); return { success: true }; },
        HookPriority.Low
      );
      registry.register(
        HookEvent.PreEdit,
        () => { order.push('critical'); return { success: true }; },
        HookPriority.Critical
      );
      await executor.execute(HookEvent.PreEdit, {});
      expect(order[0]).toBe('critical');
      expect(order[1]).toBe('low');
    });
  });

  describe('execute() with throwing handler', () => {
    it('treats a thrown exception as a failed hook result', async () => {
      registry.register(HookEvent.PreEdit, () => {
        throw new Error('exploded');
      }, HookPriority.Normal);
      const result = await executor.execute(HookEvent.PreEdit, {});
      expect(result.success).toBe(false);
      expect(result.results[0].error).toBe('exploded');
    });
  });

  describe('preEdit() / postEdit() convenience methods', () => {
    it('preEdit executes PreEdit hooks', async () => {
      const handler = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.PreEdit, handler, HookPriority.Normal);
      await executor.preEdit('/src/foo.ts', 'modify');
      expect(handler).toHaveBeenCalled();
      const ctx: HookContext = handler.mock.calls[0][0];
      expect(ctx.file?.path).toBe('/src/foo.ts');
      expect(ctx.file?.operation).toBe('modify');
    });

    it('postEdit executes PostEdit hooks with duration in context', async () => {
      const handler = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.PostEdit, handler, HookPriority.Normal);
      await executor.postEdit('/src/bar.ts', 'create', 42);
      const ctx: HookContext = handler.mock.calls[0][0];
      expect(ctx.duration).toBe(42);
    });
  });

  describe('sessionStart() / sessionEnd() convenience methods', () => {
    it('sessionStart passes session ID in context', async () => {
      const handler = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.SessionStart, handler, HookPriority.Normal);
      await executor.sessionStart('sess-abc');
      const ctx: HookContext = handler.mock.calls[0][0];
      expect(ctx.session?.id).toBe('sess-abc');
    });

    it('sessionEnd passes session ID in context', async () => {
      const handler = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.SessionEnd, handler, HookPriority.Normal);
      await executor.sessionEnd('sess-abc');
      const ctx: HookContext = handler.mock.calls[0][0];
      expect(ctx.session?.id).toBe('sess-abc');
    });
  });

  describe('agentSpawn() / agentTerminate() convenience methods', () => {
    it('agentSpawn passes agent ID and type in context', async () => {
      const handler = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.AgentSpawn, handler, HookPriority.Normal);
      await executor.agentSpawn('ag-1', 'coder');
      const ctx: HookContext = handler.mock.calls[0][0];
      expect(ctx.agent?.id).toBe('ag-1');
      expect(ctx.agent?.type).toBe('coder');
    });

    it('agentTerminate passes status in context', async () => {
      const handler = vi.fn().mockReturnValue({ success: true });
      registry.register(HookEvent.AgentTerminate, handler, HookPriority.Normal);
      await executor.agentTerminate('ag-1', 'coder', 'terminated');
      const ctx: HookContext = handler.mock.calls[0][0];
      expect(ctx.agent?.status).toBe('terminated');
    });
  });

  describe('event emitter integration', () => {
    it('emits hook:executed event on success', async () => {
      const emitter = { emit: vi.fn() };
      executor.setEventEmitter(emitter);
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      await executor.execute(HookEvent.PreEdit, {});
      const eventNames = emitter.emit.mock.calls.map((c) => c[0]);
      expect(eventNames).toContain('hook:executed');
    });

    it('emits hook:failed event on failure', async () => {
      const emitter = { emit: vi.fn() };
      executor.setEventEmitter(emitter);
      registry.register(HookEvent.PreEdit, failHandler, HookPriority.Normal);
      await executor.execute(HookEvent.PreEdit, {}, { continueOnError: true });
      const eventNames = emitter.emit.mock.calls.map((c) => c[0]);
      expect(eventNames).toContain('hook:failed');
    });

    it('emits hooks:completed event after all hooks run', async () => {
      const emitter = { emit: vi.fn() };
      executor.setEventEmitter(emitter);
      registry.register(HookEvent.PreEdit, successHandler, HookPriority.Normal);
      await executor.execute(HookEvent.PreEdit, {});
      const eventNames = emitter.emit.mock.calls.map((c) => c[0]);
      expect(eventNames).toContain('hooks:completed');
    });
  });
});
