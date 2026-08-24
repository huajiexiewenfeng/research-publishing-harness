import { describe, expect, it } from 'vitest';

import {
  isTerminalPublicationBundlePhase,
  transitionPublicationBundle
} from '../../harnesses/research-publishing/core/publication-bundle-state.js';

describe('Publication Bundle state machine', () => {
  it('accepts the exact Article-first happy path', () => {
    const phases = [
      'planned',
      'approved',
      'article_authorized',
      'article_in_progress',
      'article_verified',
      'single_materialized',
      'single_authorized',
      'single_in_progress',
      'completed'
    ] as const;
    for (let index = 0; index < phases.length - 1; index += 1) {
      expect(transitionPublicationBundle(phases[index]!, phases[index + 1]!))
        .toBe(phases[index + 1]);
    }
  });

  it('does not advance an unknown Article outcome to Single materialization', () => {
    expect(() => transitionPublicationBundle('article_outcome_unknown', 'single_materialized'))
      .toThrowError(/invalid Publication Bundle transition/);
    expect(transitionPublicationBundle('article_outcome_unknown', 'article_in_progress'))
      .toBe('article_in_progress');
  });

  it.each([
    'article_verification_conflict',
    'article_terminal_failure',
    'single_verification_conflict',
    'single_terminal_failure',
    'approval_expired',
    'completed'
  ] as const)('treats %s as terminal', (phase) => {
    expect(isTerminalPublicationBundlePhase(phase)).toBe(true);
    expect(() => transitionPublicationBundle(phase, 'planned'))
      .toThrowError(/invalid Publication Bundle transition/);
  });
});
