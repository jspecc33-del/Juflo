import { ValueObject } from '../../../shared/domain';
import type { AgentStatus as AgentStatusValue } from '../../../shared/types';

interface AgentStatusProps {
  value: AgentStatusValue;
}

export class AgentStatus extends ValueObject<AgentStatusProps> {
  private constructor(props: AgentStatusProps) {
    super(props);
  }

  static active(): AgentStatus {
    return new AgentStatus({ value: 'active' });
  }

  static idle(): AgentStatus {
    return new AgentStatus({ value: 'idle' });
  }

  static busy(): AgentStatus {
    return new AgentStatus({ value: 'busy' });
  }

  static terminated(): AgentStatus {
    return new AgentStatus({ value: 'terminated' });
  }

  static error(): AgentStatus {
    return new AgentStatus({ value: 'error' });
  }

  static fromString(value: AgentStatusValue): AgentStatus {
    return new AgentStatus({ value });
  }

  get value(): AgentStatusValue {
    return this.props.value;
  }

  isActive(): boolean {
    return this.value === 'active';
  }

  isIdle(): boolean {
    return this.value === 'idle';
  }

  isBusy(): boolean {
    return this.value === 'busy';
  }

  isTerminated(): boolean {
    return this.value === 'terminated';
  }

  isError(): boolean {
    return this.value === 'error';
  }

  isAvailable(): boolean {
    return this.isActive() || this.isIdle();
  }
}
