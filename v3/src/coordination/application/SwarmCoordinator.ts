/**
 * SwarmCoordinator
 *
 * Thin application-layer facade over three domain services:
 * - AgentRegistry   — agent lifecycle
 * - TaskDistributor — load-balanced assignment
 * - TopologyManager — connection topology
 *
 * Per DDD decomposition (ADR-DDD-001).
 */

import { EventEmitter } from 'events';
import { AgentRegistry } from '../domain/AgentRegistry';
import { TaskDistributor } from '../domain/TaskDistributor';
import { TopologyManager } from '../domain/TopologyManager';
import type {
  AgentConfig,
  AgentMessage,
  AgentMetrics,
  ConsensusDecision,
  ConsensusResult,
  MeshConnection,
  MemoryBackend,
  PluginManagerInterface,
  SwarmConfig,
  SwarmHierarchy,
  SwarmState,
  SwarmTopology,
  Task as ITask,
  TaskAssignment,
  TaskResult
} from '../../shared/types';
import { Agent } from '../../agent-lifecycle/domain/Agent';

export interface SwarmCoordinatorOptions extends SwarmConfig {
  topology: SwarmTopology;
  memoryBackend?: MemoryBackend;
  eventBus?: EventEmitter;
  pluginManager?: PluginManagerInterface;
}

export class SwarmCoordinator {
  private registry: AgentRegistry;
  private distributor: TaskDistributor;
  private topology: TopologyManager;
  private memoryBackend?: MemoryBackend;
  private eventBus: EventEmitter;
  private pluginManager?: PluginManagerInterface;
  private initialized: boolean = false;

  constructor(options: SwarmCoordinatorOptions) {
    this.eventBus = options.eventBus ?? new EventEmitter();
    this.memoryBackend = options.memoryBackend;
    this.pluginManager = options.pluginManager;
    this.registry = new AgentRegistry(this.eventBus, this.memoryBackend);
    this.distributor = new TaskDistributor();
    this.topology = new TopologyManager(options.topology);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.registry.clear();
    this.initialized = false;
  }

  async spawnAgent(config: AgentConfig): Promise<Agent> {
    const agent = await this.registry.spawn(config);
    this.topology.addAgent(agent, this.registry.list());
    return agent;
  }

  async listAgents(): Promise<Agent[]> {
    return this.registry.list();
  }

  async terminateAgent(agentId: string): Promise<void> {
    this.registry.terminate(agentId);
    this.topology.removeAgent(agentId);
  }

  async distributeTasks(tasks: ITask[]): Promise<TaskAssignment[]> {
    return this.distributor.distribute(tasks, this.registry.list());
  }

  async executeTask(agentId: string, task: ITask): Promise<TaskResult> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      return { taskId: task.id, status: 'failed', error: `Agent ${agentId} not found`, agentId };
    }

    const start = Date.now();
    const result = await agent.executeTask(task);
    const duration = Date.now() - start;

    this.registry.recordTaskResult(
      agentId,
      result.status as 'completed' | 'failed',
      duration
    );

    if (this.memoryBackend) {
      await this.memoryBackend.store({
        id: `task-result-${task.id}`,
        agentId,
        content: `Task ${task.id} ${result.status}`,
        type: result.status === 'completed' ? 'task-complete' : 'event',
        timestamp: Date.now(),
        metadata: { taskId: task.id, status: result.status, duration, error: result.error },
      });
    }

    return result;
  }

  async executeTasksConcurrently(tasks: ITask[]): Promise<TaskResult[]> {
    const assignments = await this.distributeTasks(tasks);
    return Promise.all(
      assignments.map(async a => {
        const task = tasks.find(t => t.id === a.taskId);
        if (!task) return { taskId: a.taskId, status: 'failed' as const, error: 'Task not found' };
        return this.executeTask(a.agentId, task);
      })
    );
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    this.eventBus.emit('agent:message', { ...message, timestamp: Date.now() });
  }

  async getSwarmState(): Promise<SwarmState> {
    const agents = this.registry.list();
    const leader = agents.find(a => a.role === 'leader');
    return {
      agents,
      topology: this.topology.getTopology(),
      leader: leader?.id,
      activeConnections: this.topology.getConnections().length,
    };
  }

  getTopology(): SwarmTopology {
    return this.topology.getTopology();
  }

  async getHierarchy(): Promise<SwarmHierarchy> {
    return this.topology.getHierarchy(this.registry.list());
  }

  async getMeshConnections(): Promise<MeshConnection[]> {
    return this.topology.getConnections();
  }

  async scaleAgents(config: { type: string; count: number }): Promise<void> {
    await this.registry.scale(config);
    this.topology.reconfigure(this.topology.getTopology(), this.registry.list());
  }

  async reachConsensus(decision: ConsensusDecision, agentIds: string[]): Promise<ConsensusResult> {
    const votes = agentIds
      .filter(id => this.registry.get(id))
      .map(agentId => ({ agentId, vote: Math.random() > 0.5 ? 'approve' : 'reject' }));

    const approves = votes.filter(v => v.vote === 'approve').length;
    return {
      decision: approves > votes.length / 2 ? decision.payload : null,
      votes,
      consensusReached: approves > votes.length / 2,
    };
  }

  async resolveTaskDependencies(tasks: ITask[]): Promise<ITask[]> {
    return this.distributor.resolveOrder(tasks);
  }

  async getAgentMetrics(agentId: string): Promise<AgentMetrics> {
    return this.registry.getMetrics(agentId);
  }

  async reconfigure(config: { topology: SwarmTopology }): Promise<void> {
    this.topology.reconfigure(config.topology, this.registry.list());
  }
}

export { SwarmCoordinator as default };
