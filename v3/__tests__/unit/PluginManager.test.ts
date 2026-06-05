/**
 * Unit Tests: PluginManager
 *
 * Tests for plugin lifecycle (load/unload/reload), extension points,
 * dependency validation, and version compatibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginManager } from '../../src/infrastructure/plugins/PluginManager';
import type { Plugin, ExtensionPoint } from '../../src/shared/types';

function createMockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getExtensionPoints: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager({ coreVersion: '3.0.0' });
  });

  describe('initialize / shutdown', () => {
    it('should initialize without error', async () => {
      await expect(manager.initialize()).resolves.toBeUndefined();
    });

    it('should be idempotent on double init', async () => {
      await manager.initialize();
      await expect(manager.initialize()).resolves.toBeUndefined();
    });

    it('should shutdown and unload all plugins', async () => {
      await manager.loadPlugin(createMockPlugin({ id: 'p1' }));
      await manager.loadPlugin(createMockPlugin({ id: 'p2' }));
      await manager.shutdown();
      expect(manager.listPlugins()).toHaveLength(0);
    });
  });

  describe('loadPlugin', () => {
    it('should load a plugin and call initialize', async () => {
      const plugin = createMockPlugin();
      await manager.loadPlugin(plugin);
      expect(plugin.initialize).toHaveBeenCalledOnce();
      expect(manager.listPlugins()).toHaveLength(1);
    });

    it('should register extension points from plugin', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const plugin = createMockPlugin({
        getExtensionPoints: vi.fn().mockReturnValue([
          { name: 'workflow.beforeExecute', handler, priority: 10 },
        ]),
      });

      await manager.loadPlugin(plugin);
      const results = await manager.invokeExtensionPoint('workflow.beforeExecute', {});
      expect(results).toEqual(['result']);
    });

    it('should replace existing plugin with same id', async () => {
      const plugin1 = createMockPlugin({ id: 'p1', version: '1.0.0' });
      const plugin2 = createMockPlugin({ id: 'p1', version: '2.0.0' });

      await manager.loadPlugin(plugin1);
      await manager.loadPlugin(plugin2);

      expect(manager.listPlugins()).toHaveLength(1);
      expect(plugin1.shutdown).toHaveBeenCalled();
    });

    it('should throw when dependency is not loaded', async () => {
      const plugin = createMockPlugin({ id: 'p2', dependencies: ['p1'] });
      await expect(manager.loadPlugin(plugin)).rejects.toThrow('depends on p1');
    });

    it('should load plugin when dependencies are satisfied', async () => {
      await manager.loadPlugin(createMockPlugin({ id: 'p1' }));
      const plugin = createMockPlugin({ id: 'p2', dependencies: ['p1'] });
      await expect(manager.loadPlugin(plugin)).resolves.toBeUndefined();
    });

    it('should throw on config validation failure', async () => {
      const plugin = createMockPlugin({
        configSchema: { required: ['apiKey'] },
      });
      await expect(manager.loadPlugin(plugin, { foo: 'bar' })).rejects.toThrow('apiKey');
    });

    it('should pass config validation when required fields exist', async () => {
      const plugin = createMockPlugin({
        configSchema: { required: ['apiKey'] },
      });
      await expect(manager.loadPlugin(plugin, { apiKey: 'xyz' })).resolves.toBeUndefined();
    });

    it('should throw when plugin requires higher min core version', async () => {
      const plugin = createMockPlugin({ minCoreVersion: '4.0.0' });
      await expect(manager.loadPlugin(plugin)).rejects.toThrow('requires core version');
    });

    it('should throw when plugin requires lower max core version', async () => {
      const plugin = createMockPlugin({ maxCoreVersion: '2.0.0' });
      await expect(manager.loadPlugin(plugin)).rejects.toThrow('requires core version');
    });

    it('should accept plugin within version range', async () => {
      const plugin = createMockPlugin({ minCoreVersion: '2.0.0', maxCoreVersion: '4.0.0' });
      await expect(manager.loadPlugin(plugin)).resolves.toBeUndefined();
    });
  });

  describe('unloadPlugin', () => {
    it('should remove plugin and call shutdown', async () => {
      const plugin = createMockPlugin({ id: 'p1' });
      await manager.loadPlugin(plugin);
      await manager.unloadPlugin('p1');
      expect(plugin.shutdown).toHaveBeenCalled();
      expect(manager.listPlugins()).toHaveLength(0);
    });

    it('should be a no-op for non-existent plugin', async () => {
      await expect(manager.unloadPlugin('nonexistent')).resolves.toBeUndefined();
    });

    it('should throw when another plugin depends on it', async () => {
      await manager.loadPlugin(createMockPlugin({ id: 'p1' }));
      await manager.loadPlugin(createMockPlugin({ id: 'p2', dependencies: ['p1'] }));
      await expect(manager.unloadPlugin('p1')).rejects.toThrow('depends on it');
    });
  });

  describe('reloadPlugin', () => {
    it('should unload old and load new version', async () => {
      const v1 = createMockPlugin({ id: 'p1', version: '1.0.0' });
      const v2 = createMockPlugin({ id: 'p1', version: '2.0.0' });

      await manager.loadPlugin(v1);
      await manager.reloadPlugin('p1', v2);

      expect(v1.shutdown).toHaveBeenCalled();
      expect(v2.initialize).toHaveBeenCalled();
      expect(manager.listPlugins()).toHaveLength(1);
    });
  });

  describe('getPluginMetadata', () => {
    it('should return metadata for loaded plugin', async () => {
      await manager.loadPlugin(createMockPlugin({
        id: 'p1',
        name: 'Plugin One',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Test',
      }));

      const meta = manager.getPluginMetadata('p1');
      expect(meta).toEqual({
        id: 'p1',
        name: 'Plugin One',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Test',
        homepage: undefined,
      });
    });

    it('should return undefined for unknown plugin', () => {
      expect(manager.getPluginMetadata('unknown')).toBeUndefined();
    });
  });

  describe('invokeExtensionPoint', () => {
    it('should return empty array when no handlers registered', async () => {
      const results = await manager.invokeExtensionPoint('unregistered.hook', {});
      expect(results).toEqual([]);
    });

    it('should invoke handlers sorted by priority (higher first)', async () => {
      const order: number[] = [];

      const plugin1 = createMockPlugin({
        id: 'p1',
        priority: 5,
        getExtensionPoints: vi.fn().mockReturnValue([{
          name: 'test.hook',
          handler: vi.fn(async () => { order.push(5); return 'low'; }),
        }]),
      });

      const plugin2 = createMockPlugin({
        id: 'p2',
        priority: 10,
        getExtensionPoints: vi.fn().mockReturnValue([{
          name: 'test.hook',
          handler: vi.fn(async () => { order.push(10); return 'high'; }),
        }]),
      });

      await manager.loadPlugin(plugin1);
      await manager.loadPlugin(plugin2);

      const results = await manager.invokeExtensionPoint('test.hook', {});
      expect(order).toEqual([10, 5]);
      expect(results).toEqual(['high', 'low']);
    });

    it('should catch handler errors and continue', async () => {
      const plugin = createMockPlugin({
        id: 'p1',
        getExtensionPoints: vi.fn().mockReturnValue([{
          name: 'test.hook',
          handler: vi.fn().mockRejectedValue(new Error('handler failed')),
        }]),
      });

      await manager.loadPlugin(plugin);
      const results = await manager.invokeExtensionPoint('test.hook', {});
      expect(results).toHaveLength(1);
      expect((results[0] as any).error).toBe('handler failed');
    });
  });

  describe('getCoreVersion', () => {
    it('should return the configured core version', () => {
      expect(manager.getCoreVersion()).toBe('3.0.0');
    });

    it('should default to 3.0.0 when not configured', () => {
      const m = new PluginManager();
      expect(m.getCoreVersion()).toBe('3.0.0');
    });
  });
});
