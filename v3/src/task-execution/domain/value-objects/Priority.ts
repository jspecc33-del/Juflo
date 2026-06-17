import { ValueObject } from '../../../shared/domain';
import type { TaskPriority } from '../../../shared/types';

interface PriorityProps {
  value: TaskPriority;
}

const NUMERIC_VALUE: Record<TaskPriority, number> = { high: 3, medium: 2, low: 1 };

export class Priority extends ValueObject<PriorityProps> {
  private constructor(props: PriorityProps) {
    super(props);
  }

  static high(): Priority {
    return new Priority({ value: 'high' });
  }

  static medium(): Priority {
    return new Priority({ value: 'medium' });
  }

  static low(): Priority {
    return new Priority({ value: 'low' });
  }

  static fromString(value: TaskPriority): Priority {
    return new Priority({ value });
  }

  get value(): TaskPriority {
    return this.props.value;
  }

  getNumericValue(): number {
    return NUMERIC_VALUE[this.value] ?? 2;
  }
}
