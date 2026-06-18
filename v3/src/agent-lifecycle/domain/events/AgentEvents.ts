import { DomainEvent } from '../../../shared/domain';

export class AgentActivatedEvent extends DomainEvent {
  constructor(agentId: string) {
    super(agentId);
  }
}

export class AgentIdledEvent extends DomainEvent {
  constructor(agentId: string) {
    super(agentId);
  }
}

export class AgentTerminatedEvent extends DomainEvent {
  constructor(agentId: string) {
    super(agentId);
  }
}

export class AgentTaskStartedEvent extends DomainEvent {
  constructor(agentId: string, readonly taskId: string) {
    super(agentId);
  }
}

export class AgentTaskCompletedEvent extends DomainEvent {
  constructor(agentId: string, readonly taskId: string, readonly durationMs: number) {
    super(agentId);
  }
}

export class AgentTaskFailedEvent extends DomainEvent {
  constructor(agentId: string, readonly taskId: string, readonly error: string) {
    super(agentId);
  }
}
