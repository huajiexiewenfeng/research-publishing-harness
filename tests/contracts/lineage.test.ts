import { describe, expect, it } from 'vitest';

import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import { researchPackage } from '../fixtures/research-package.js';

describe('explicit research lineage', () => {
  it('represents llm-wiki-runtime as extracted from PDC and Obsidian LLM Wiki experience', () => {
    const lineage = [
      {
        from: 'llm-wiki-runtime',
        to: 'project-develop-copilot',
        relationship: 'extracted_from',
        explanation: 'Runtime requirements were extracted from operating the LLM Wiki embedded in PDC.'
      },
      {
        from: 'llm-wiki-runtime',
        to: 'obsidian-llm-wiki',
        relationship: 'built_on',
        explanation: 'The standalone runtime was built after practical use of the Obsidian LLM Wiki workflow.'
      }
    ];
    const value = validateContract('research-content-package', {
      ...researchPackage,
      research_lineage: lineage
    });

    expect(value).toMatchObject({ research_lineage: lineage });
  });
});
