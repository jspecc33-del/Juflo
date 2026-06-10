/**
 * CreateSession - Application Use Case
 *
 * Orchestrates creating a new session, enforcing uniqueness by name,
 * and persisting via the session repository.
 *
 * @module v3/cli/core/application/use-cases
 */

import { Session } from '../../domains/session-management/entities/session.entity.js';
import type { ISessionRepository } from '../../domains/session-management/repositories/session.repository.js';

export interface CreateSessionCommand {
  name: string;
  memoryNamespace?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionResult {
  success: boolean;
  session?: Session;
  error?: string;
}

export class CreateSessionUseCase {
  constructor(private readonly sessions: ISessionRepository) {}

  async execute(command: CreateSessionCommand): Promise<CreateSessionResult> {
    if (!command.name || command.name.trim().length === 0) {
      return { success: false, error: 'Session name is required' };
    }

    const existing = await this.sessions.findByName(command.name.trim());
    if (existing) {
      return { success: false, error: `Session "${command.name}" already exists` };
    }

    const session = Session.create(command.name, command.memoryNamespace);

    if (command.metadata) {
      for (const [key, value] of Object.entries(command.metadata)) {
        session.setMetadata(key, value);
      }
    }

    await this.sessions.save(session);
    session.markEventsAsCommitted();

    return { success: true, session };
  }
}
