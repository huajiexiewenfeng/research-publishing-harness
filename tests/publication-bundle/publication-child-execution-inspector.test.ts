import { describe, expect, it } from 'vitest';

import { WorkspacePublicationChildExecutionInspector } from '../../harnesses/research-publishing/core/publication-child-execution-inspector.js';
import {
  createApprovedPublicationBundleFixture,
  startBundleArticleExecution
} from '../fixtures/publication-bundle.js';

describe('PublicationChildExecutionInspector', () => {
  it('reads only the exact installed Article execution artifacts', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    const inspected = await new WorkspacePublicationChildExecutionInspector(fixture.store)
      .inspectArticle(snapshot.execution_id);
    expect(inspected.snapshot).toEqual(snapshot);
    expect(inspected.plan.plan_digest).toBe(fixture.authorization.child_plan_digest);
    expect(inspected.approval).toEqual(fixture.authorization.child_approval);
    expect(inspected.installed_plan_ref.path).toBe(
      `runs/${snapshot.execution_id}/x-article/browser/plan.json`
    );
  });
});
