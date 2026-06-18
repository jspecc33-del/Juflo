import { DomainEvent } from '../../../shared/domain';

export class TaskStartedEvent extends DomainEvent {
  constructor(taskId: string) {
    super(taskId);
  }
}

export class TaskAssignedEvent extends DomainEvent {
  constructor(taskId: string, readonly agentId: string) {
    super(taskId);
  }
}

export class TaskPriorityChangedEvent extends DomainEvent {
  constructor(taskId: string, readonly previousPriority: string, readonly newPriority: string) {
    super(taskId);
  }
}

export class TaskCompletedEvent extends DomainEvent {
  constructor(taskId: string, readonly durationMs?: number) {
    super(taskId);
  }
}

export class TaskFailedEvent extends DomainEvent {
  constructor(taskId: string, readonly error?: string) {
    super(taskId);
  }
}

export class TaskCancelledEvent extends DomainEvent {
  constructor(taskId: string) {
    super(taskId);
  }
}
