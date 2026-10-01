import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import type { PromptDefinition } from '../prompts/_shared.js';

export type { PromptDefinition };

export interface PromptHandler {
  (args: Record<string, string>): Promise<GetPromptResult> | GetPromptResult;
}

export class PromptRegistry {
  private logger: Logger;
  private prompts: Map<string, PromptDefinition>;

  constructor() {
    this.logger = new Logger('PromptRegistry');
    this.prompts = new Map();
  }

  register(name: string, definition: PromptDefinition): void {
    if (this.prompts.has(name)) {
      this.logger.warn(`Prompt '${name}' already registered, overwriting`);
    }
    this.prompts.set(name, definition);
    this.logger.debug(`Registered prompt: ${name}`);
  }

  has(name: string): boolean {
    return this.prompts.has(name);
  }

  list(): Prompt[] {
    return Array.from(this.prompts.values()).map((def) => def.prompt);
  }

  async get(name: string, args: Record<string, string>): Promise<GetPromptResult> {
    const def = this.prompts.get(name);
    if (!def) {
      throw new Error(`Prompt not found: ${name}`);
    }
    this.logger.debug(`Resolving prompt: ${name}`);
    return await def.handler(args);
  }

  count(): number {
    return this.prompts.size;
  }
}
