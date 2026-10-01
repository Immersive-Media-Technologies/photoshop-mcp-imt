import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/config.js', () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from '../src/ui/config.js';
import { getServerAnalyticsContext } from '../src/analytics/context.js';

describe('getServerAnalyticsContext', () => {
  it('still returns context when UI SQLite/config cannot load', () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new Error('Could not locate the bindings file');
    });

    expect(() => getServerAnalyticsContext()).not.toThrow();
    const ctx = getServerAnalyticsContext();
    expect(ctx.analytics_enabled).toBeTypeOf('boolean');
    expect(ctx.privacy_mode).toBe(!ctx.analytics_enabled);
    expect(ctx.action_plan_enabled).toBe(true);
  });

  it('reads Action Plan from UI config when SQLite is available', () => {
    vi.mocked(loadConfig).mockReturnValue({
      providers: {},
      activeProvider: 'anthropic',
      activeModel: 'claude-sonnet-5',
      actionPlanBeta: false,
      customProvider: null,
    });

    expect(getServerAnalyticsContext().action_plan_enabled).toBe(false);
  });
});
