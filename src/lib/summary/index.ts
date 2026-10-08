import { MOCK_SCENARIOS, MockSummaryProvider, type MockScenario } from './mock-provider';
import type { SummaryProvider } from './provider';

/**
 * Picks the configured provider. Only the mock exists today; a real one would
 * implement SummaryProvider and be selected here by SUMMARY_PROVIDER.
 * The scenario switch only affects the mock, so it is safe to expose in the UI.
 */
export function getSummaryProvider(scenario?: unknown): SummaryProvider {
  const s = MOCK_SCENARIOS.includes(scenario as MockScenario) ? (scenario as MockScenario) : 'normal';
  return new MockSummaryProvider(s);
}

export { MOCK_SCENARIOS, type MockScenario };
