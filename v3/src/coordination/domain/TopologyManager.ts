/**
 * TopologyManager — Domain Service
 *
 * Manages swarm topology: mesh connections, hierarchy, reconfiguration.
 * Extracted from SwarmCoordinator per DDD bounded-context decomposition.
 */

import { Agent } from '../../agent-lifecycle/domain/Agent';
import type { MeshConnection, SwarmHierarchy, SwarmTopology } from '../../shared/types';

export class TopologyManager {
  private connections: MeshConnection[] = [];
  private topology: SwarmTopology;

  constructor(topology: SwarmTopology) {
    this.topology = topology;
  }

  /**
   * Rebuild connections when a new agent is added.
   */
  addAgent(agent: Agent, allAgents: Agent[]): void {
    if (this.topology === 'mesh') {
      for (const other of allAgents) {
        if (other.id !== agent.id) {
          this.connections.push({ from: agent.id, to: other.id, type: 'peer' });
        }
      }
    } else if (this.topology === 'hierarchical') {
      const leader = allAgents.find(a => a.role === 'leader');
      if (leader && agent.role !== 'leader') {
        this.connections.push({ from: agent.id, to: leader.id, type: 'leader' });
      }
    }
  }

  /**
   * Remove all connections for a terminated agent.
   */
  removeAgent(agentId: string): void {
    this.connections = this.connections.filter(
      c => c.from !== agentId && c.to !== agentId
    );
  }

  /**
   * Switch topology and rebuild all connections.
   */
  reconfigure(topology: SwarmTopology, agents: Agent[]): void {
    this.topology = topology;
    this.connections = [];
    for (const agent of agents) {
      this.addAgent(agent, agents);
    }
  }

  getConnections(): MeshConnection[] {
    return this.connections;
  }

  getTopology(): SwarmTopology {
    return this.topology;
  }

  getHierarchy(agents: Agent[]): SwarmHierarchy {
    const leader = agents.find(a => a.role === 'leader');
    return {
      leader: leader?.id ?? '',
      workers: agents
        .filter(a => a.role !== 'leader')
        .map(a => ({ id: a.id, parent: a.parent ?? leader?.id ?? '' })),
    };
  }
}
