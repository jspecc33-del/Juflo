import { ValueObject } from '../../../shared/domain';

interface TaskIdProps {
  value: string;
}

export class TaskId extends ValueObject<TaskIdProps> {
  private constructor(props: TaskIdProps) {
    super(props);
  }

  static create(value: string): TaskId {
    if (!value || value.trim().length === 0) {
      throw new Error('TaskId cannot be empty');
    }
    return new TaskId({ value });
  }

  get value(): string {
    return this.props.value;
  }
}
