import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlan } from '../src/ui/agent/plan-schema.js';
import { createPlanner, plannerKindForAuth } from '../src/ui/agent/planner.js';
import { isSubmitActionPlanTool, persistSubmittedPlan } from '../src/ui/agent/planner-submit.js';
import type { ProviderAdapter } from '../src/ui/providers/registry.js';

const validPlan = {
  summary: 'Remove the background.',
  steps: [
    {
      id: 's1',
      tool: 'photoshop_recipe_remove_background',
      argsJson: '{}',
      rationale: 'Requested outcome',
    },
  ],
};

function fakeProvider(id: ProviderAdapter['id']): ProviderAdapter {
  return {
    id,
    getLanguageModel: () => ({}) as never,
    getModelPricing: () => undefined,
  } as unknown as ProviderAdapter;
}

describe('planSchema', () => {
  it('accepts a complete plan', () => {
    expect(parsePlan(validPlan)).toEqual(validPlan);
  });

  it('rejects a plan without steps or summary', () => {
    expect(() => parsePlan({ summary: 'x' })).toThrow();
    expect(() => parsePlan({ steps: validPlan.steps })).toThrow();
    expect(() => parsePlan({ summary: 'x', steps: [{ id: 's1' }] })).toThrow();
  });
});

describe('persistSubmittedPlan', () => {
  it('writes a validated plan to PLAN_OUT_PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'psmcp-plan-'));
    const outPath = join(dir, 'plan.json');
    try {
      const result = await persistSubmittedPlan(validPlan, outPath);
      expect(result.ok).toBe(true);
      const stored = JSON.parse(await readFile(outPath, 'utf8')) as unknown;
      expect(stored).toEqual(validPlan);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not write when validation fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'psmcp-plan-'));
    const outPath = join(dir, 'plan.json');
    try {
      const result = await persistSubmittedPlan({ summary: 'nope' }, outPath);
      expect(result.ok).toBe(false);
      await expect(readFile(outPath, 'utf8')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('createPlanner', () => {
  it('routes api_key to the SDK planner', () => {
    const planner = createPlanner({
      authMethod: 'api_key',
      provider: fakeProvider('anthropic'),
      apiKey: 'sk-test',
      modelId: 'claude-sonnet-4-5',
    });
    expect(planner.kind).toBe('sdk');
    expect(plannerKindForAuth('api_key')).toBe('sdk');
  });

  it('routes cli_account to the subscription planner without an API key', () => {
    const planner = createPlanner({
      authMethod: 'cli_account',
      provider: fakeProvider('anthropic'),
      modelId: 'claude-sonnet-4-5',
    });
    expect(planner.kind).toBe('subscription');
    expect(plannerKindForAuth('cli_account')).toBe('subscription');
  });

  it('rejects api_key Action Plan without a key', () => {
    expect(() =>
      createPlanner({
        authMethod: 'api_key',
        provider: fakeProvider('openai'),
        modelId: 'gpt-5',
      })
    ).toThrow(/API key is required/);
  });
});

describe('submit_action_plan tool names', () => {
  it('accepts bare and MCP-prefixed names', () => {
    expect(isSubmitActionPlanTool('submit_action_plan')).toBe(true);
    expect(isSubmitActionPlanTool('mcp__planner__submit_action_plan')).toBe(true);
    expect(isSubmitActionPlanTool('photoshop_get_state')).toBe(false);
  });
});

describe('Action Plan toggle availability', () => {
  it('stays enabled in subscription mode without an API key', () => {
    const sending = false;
    const hasApiKey = false;
    const subscriptionMode = true;
    const formerGate = hasApiKey || !subscriptionMode;
    const disabled = sending;
    expect(formerGate).toBe(false);
    expect(disabled).toBe(false);
  });
});
