import { ValueObject } from '../../../shared/domain';

interface AgentIdProps {
  value: string;
}

export class AgentId extends ValueObject<AgentIdProps> {
  private constructor(props: AgentIdProps) {
    super(props);
  }

  static create(value: string): AgentId {
    if (!value || value.trim().length === 0) {
      throw new Error('AgentId cannot be empty');
    }
    return new AgentId({ value });
  }

  get value(): string {
    return this.props.value;
  }
}
