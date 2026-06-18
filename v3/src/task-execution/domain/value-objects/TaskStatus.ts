import { ValueObject } from '../../../shared/domain';
import type { TaskStatus as TaskStatusValue } from '../../../shared/types';

interface TaskStatusProps {
  value: TaskStatusValue;
}

export class TaskStatus extends ValueObject<TaskStatusProps> {
  private constructor(props: TaskStatusProps) {
    super(props);
  }

  static pending(): TaskStatus {
    return new TaskStatus({ value: 'pending' });
  }

  static inProgress(): TaskStatus {
    return new TaskStatus({ value: 'in-progress' });
  }

  static completed(): TaskStatus {
    return new TaskStatus({ value: 'completed' });
  }

  static failed(): TaskStatus {
    return new TaskStatus({ value: 'failed' });
  }

  static cancelled(): TaskStatus {
    return new TaskStatus({ value: 'cancelled' });
  }

  static fromString(value: TaskStatusValue): TaskStatus {
    return new TaskStatus({ value });
  }

  get value(): TaskStatusValue {
    return this.props.value;
  }

  isPending(): boolean {
    return this.value === 'pending';
  }

  isInProgress(): boolean {
    return this.value === 'in-progress';
  }

  isCompleted(): boolean {
    return this.value === 'completed';
  }

  isFailed(): boolean {
    return this.value === 'failed';
  }

  isCancelled(): boolean {
    return this.value === 'cancelled';
  }
}
