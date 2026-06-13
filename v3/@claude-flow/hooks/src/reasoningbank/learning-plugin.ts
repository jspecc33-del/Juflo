/**
 * V3 ReasoningBank - Decision Transformer Learning Plugin
 *
 * Optional integration with AgentDB's offline-RL learning plugins via
 * `agentic-flow/reasoningbank`. Pattern outcomes recorded by ReasoningBank
 * are logged as single-step experience tuples (state = pattern embedding,
 * action = routed agent index, reward = outcome) and used to train a
 * Decision Transformer that can suggest agent routing from past experience.
 *
 * Follows the same optional-dependency convention as the rest of
 * ReasoningBank: `agentic-flow` is not a hard dependency, dynamic import
 * is wrapped in try/catch, and every method is a safe no-op when the
 * package is unavailable.
 *
 * @module @claude-flow/hooks/reasoningbank/learning-plugin
 */

/**
 * Single-step RL experience tuple logged after a pattern outcome.
 */
export interface ExperienceTuple {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
  domain: string;
}

/**
 * Training metrics returned by the Decision Transformer adapter.
 */
export interface LearningMetrics {
  loss: number;
  valLoss?: number;
  duration: number;
  epochs: number;
}

/**
 * A learned agent-routing suggestion derived from past experiences.
 */
export interface ActionSuggestion {
  action: number;
  confidence: number;
}

interface AgentDBLearningAdapter {
  insertPattern(pattern: Record<string, unknown>): Promise<unknown>;
  train(options: {
    epochs: number;
    batchSize: number;
    learningRate?: number;
    validationSplit?: number;
  }): Promise<LearningMetrics>;
  retrieveWithReasoning(
    queryEmbedding: Float32Array,
    options: { domain: string; k: number; synthesizeContext?: boolean; minConfidence?: number }
  ): Promise<{ memories: Array<{ pattern: { action: number }; similarity: number }> }>;
}

/**
 * Decision Transformer learning plugin.
 *
 * Wraps `agentic-flow/reasoningbank`'s `createAgentDBAdapter` with
 * `enableLearning: true`. All methods are safe no-ops if the optional
 * `agentic-flow` package is not installed.
 */
export class LearningPlugin {
  private adapter: AgentDBLearningAdapter | null = null;
  private initialized = false;

  /**
   * Initialize the learning adapter. Safe to call even when
   * `agentic-flow` is not installed -- the plugin simply stays
   * unavailable and all other methods become no-ops.
   */
  async initialize(dbPath: string, cacheSize = 1000): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // Use a variable specifier so TS doesn't try to resolve type
      // declarations for this optional, possibly-uninstalled package
      const moduleName = 'agentic-flow/reasoningbank';
      const mod: any = await import(/* webpackIgnore: true */ moduleName);
      this.adapter = await mod.createAgentDBAdapter({
        dbPath,
        enableLearning: true,
        enableReasoning: true,
        cacheSize,
      });
    } catch {
      this.adapter = null;
    }
  }

  /** Whether the Decision Transformer adapter loaded successfully. */
  get available(): boolean {
    return this.adapter !== null;
  }

  /**
   * Log a pattern outcome as a single-step experience tuple
   * (state = pattern embedding, action = routed agent index, reward = outcome).
   */
  async recordExperience(experience: ExperienceTuple): Promise<void> {
    if (!this.adapter) return;

    try {
      await this.adapter.insertPattern({
        id: '',
        type: 'experience',
        domain: experience.domain,
        pattern_data: JSON.stringify({
          embedding: Array.from(experience.state),
          pattern: {
            state: Array.from(experience.state),
            action: experience.action,
            reward: experience.reward,
            next_state: Array.from(experience.nextState),
            done: experience.done,
          },
        }),
        confidence: experience.reward > 0 ? 0.9 : 0.5,
        usage_count: 1,
        success_count: experience.reward > 0 ? 1 : 0,
        created_at: Date.now(),
        last_used: Date.now(),
      });
    } catch (error) {
      console.warn('[LearningPlugin] Failed to record experience:', error);
    }
  }

  /**
   * Train the Decision Transformer on accumulated experiences.
   * Returns null if the learning plugin is unavailable or training fails.
   */
  async train(options: { epochs?: number; batchSize?: number } = {}): Promise<LearningMetrics | null> {
    if (!this.adapter) return null;

    try {
      return await this.adapter.train({
        epochs: options.epochs ?? 50,
        batchSize: options.batchSize ?? 32,
      });
    } catch (error) {
      console.warn('[LearningPlugin] Training failed:', error);
      return null;
    }
  }

  /**
   * Suggest a routing action from learned experiences.
   * Returns null if unavailable or no confident match exists.
   */
  async suggestAction(queryEmbedding: Float32Array, domain: string, k = 5): Promise<ActionSuggestion | null> {
    if (!this.adapter) return null;

    try {
      const result = await this.adapter.retrieveWithReasoning(queryEmbedding, {
        domain,
        k,
        synthesizeContext: false,
        minConfidence: 0.5,
      });

      const best = result.memories?.[0];
      if (!best) return null;

      return { action: best.pattern.action, confidence: best.similarity };
    } catch (error) {
      console.warn('[LearningPlugin] Action suggestion failed:', error);
      return null;
    }
  }
}
