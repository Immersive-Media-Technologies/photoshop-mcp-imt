import type { GetPromptResult, PromptArgument } from '@modelcontextprotocol/sdk/types.js';

export function argString(args: Record<string, string>, key: string, defaultValue: string): string {
  const raw = args[key];
  if (typeof raw !== 'string' || raw.trim() === '') return defaultValue;
  return raw.trim();
}

export function argInt(args: Record<string, string>, key: string, defaultValue: number): number {
  const raw = args[key];
  if (typeof raw !== 'string' || raw.trim() === '') return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export function argBool(args: Record<string, string>, key: string, defaultValue: boolean): boolean {
  const raw = args[key];
  if (typeof raw !== 'string') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  return defaultValue;
}

export function argEnum<T extends string>(
  args: Record<string, string>,
  key: string,
  options: readonly T[],
  defaultValue: T
): T {
  const raw = args[key];
  if (typeof raw !== 'string') return defaultValue;
  const v = raw.trim().toLowerCase();
  const hit = options.find((o) => o.toLowerCase() === v);
  return hit ?? defaultValue;
}

export function argList(args: Record<string, string>, key: string, defaultValue: string[]): string[] {
  const raw = args[key];
  if (typeof raw !== 'string' || raw.trim() === '') return defaultValue;
  return raw
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function userPrompt(description: string, text: string): GetPromptResult {
  return {
    description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

export interface PhotoshopPromptTemplate {
  name: string;
  description: string;
  arguments: PromptArgument[];
  handler: (args: Record<string, string>) => GetPromptResult;
}

export interface PromptDefinition {
  prompt: {
    name: string;
    description?: string;
    arguments?: PromptArgument[];
  };
  handler: (args: Record<string, string>) => GetPromptResult;
}

export function toPromptDefinition(t: PhotoshopPromptTemplate): PromptDefinition {
  return {
    prompt: {
      name: t.name,
      description: t.description,
      arguments: t.arguments,
    },
    handler: t.handler,
  };
}
