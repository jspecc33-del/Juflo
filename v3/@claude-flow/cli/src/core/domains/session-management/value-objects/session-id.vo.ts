/**
 * SessionId - Value Object
 *
 * @module v3/cli/core/domains/session-management
 */

import { randomUUID } from 'crypto';
import { ValueObject } from '../../../shared/domain/value-object.js';

interface SessionIdProps {
  value: string;
}

export class SessionId extends ValueObject<SessionIdProps> {
  private constructor(props: SessionIdProps) {
    super(props);
  }

  static create(): SessionId {
    return new SessionId({ value: randomUUID() });
  }

  static fromString(id: string): SessionId {
    if (!id || id.trim().length === 0) {
      throw new Error('SessionId cannot be empty');
    }
    return new SessionId({ value: id.trim() });
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
