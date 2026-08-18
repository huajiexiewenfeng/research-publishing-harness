import { randomUUID } from 'node:crypto';

import { sha256 } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import { createGenerationTask, type GenerationTask } from '../../core/generation.js';
import { runEvidenceGate, runPrivacyGate } from '../../core/gates.js';
import { validateContract } from '../../core/schema-validator.js';
import type {
  Finding,
  ResearchContentPackage,
  ReviewReport
} from '../../core/types.js';
import type { WorkspaceStore } from '../../core/workspace-store.js';

export interface ArticleBrief {
  readonly articleType:
    | 'technical_essay'
    | 'architecture_note'
    | 'engineering_retrospective'
    | 'research_proposal';
  readonly primaryAudience: string;
  readonly language: 'en' | 'zh-CN';
  readonly targetDepth: 'focused' | 'deep';
  readonly includeOpenQuestions: boolean;
}

export interface ArticleDraft {
  readonly schema_version: '1.0';
  readonly run_id: string;
  readonly title: string;
  readonly summary: string;
  readonly language: 'en' | 'zh-CN';
  readonly sections: ReadonlyArray<{
    readonly heading: string;
    readonly markdown: string;
    readonly claim_refs: readonly string[];
    readonly source_refs: readonly string[];
  }>;
  readonly open_questions: readonly string[];
}

export interface ArticleRun {
  readonly run_id: string;
  readonly package_id: string;
  readonly package_version: number;
  readonly generation_task: GenerationTask;
  readonly draft?: ArticleDraft;
}

export interface ArticlePackageRef {
  readonly root: string;
  readonly digest: string;
  readonly artifacts: readonly string[];
}

export interface XHandoff {
  readonly schema_version: '1.0';
  readonly handoff_id: string;
  readonly article_run_id: string;
  readonly article_digest: string;
  readonly package_id: string;
  readonly package_version: number;
  readonly requested_at: string;
}

interface ArticleServiceOptions {
  readonly runId?: () => string;
  readonly now?: () => Date;
}

interface RunMetadata {
  readonly run_id: string;
  readonly package_id: string;
  readonly package_version: number;
  readonly created_at: string;
}

const SHIPPED_LANGUAGE =
  /\b(is implemented|is available|has shipped|currently supports|already provides|is production-ready)\b/i;

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || 'article';
}

export class ArticleService {
  private readonly runId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    options: ArticleServiceOptions = {}
  ) {
    this.runId = options.runId ?? (() => `article_${randomUUID()}`);
    this.now = options.now ?? (() => new Date());
  }

  async prepareArticle(
    packageValue: ResearchContentPackage,
    brief: ArticleBrief
  ): Promise<ArticleRun> {
    if (packageValue.status !== 'frozen') {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'article generation requires a frozen package');
    }
    const runId = this.runId();
    const task = createGenerationTask(
      {
        run_id: runId,
        branch: 'article',
        mode: `${brief.articleType}:${brief.targetDepth}`,
        language: brief.language
      },
      packageValue,
      [
        'Preserve Claim status and evidence boundaries.',
        'Do not expose internal-only sources.',
        brief.includeOpenQuestions ? 'Include open research questions.' : 'Do not add an open-questions section.'
      ]
    );
    const prefix = this.runPrefix(runId);
    const metadata: RunMetadata = {
      run_id: runId,
      package_id: packageValue.package_id,
      package_version: packageValue.version,
      created_at: this.now().toISOString()
    };
    await this.store.writeNew(`${prefix}/run.json`, metadata);
    await this.store.writeNew(`${prefix}/package.json`, packageValue);
    await this.store.writeNew(`${prefix}/brief.json`, brief);
    await this.store.writeNew(`${prefix}/generation-task.json`, task);
    return {
      run_id: runId,
      package_id: packageValue.package_id,
      package_version: packageValue.version,
      generation_task: task
    };
  }

  async acceptArticleDraft(runId: string, candidate: ArticleDraft): Promise<ArticleRun> {
    const prefix = this.runPrefix(runId);
    const metadata = await this.store.readJson<RunMetadata>(`${prefix}/run.json`);
    const packageValue = await this.store.readJson<ResearchContentPackage>(`${prefix}/package.json`);
    const task = await this.store.readJson<GenerationTask>(`${prefix}/generation-task.json`);
    const draft = validateContract<ArticleDraft>('article-draft', candidate);
    if (draft.run_id !== runId || draft.language !== task.language) {
      throw new HarnessError('CONTRACT_INVALID', 'draft run or language does not match generation task');
    }
    const claimIds = new Set(packageValue.claims.map((claim) => claim.claim_id));
    const sourceIds = new Set(
      packageValue.sources
        .filter((source) => source.publication_policy !== 'internal_only')
        .map((source) => source.source_id)
    );
    for (const section of draft.sections) {
      if (section.claim_refs.some((claimId) => !claimIds.has(claimId))) {
        throw new HarnessError('CONTRACT_INVALID', 'draft references a Claim outside the frozen package');
      }
      if (section.source_refs.some((sourceId) => !sourceIds.has(sourceId))) {
        throw new HarnessError('CONTRACT_INVALID', 'draft references a missing or non-public Source');
      }
    }
    await this.store.writeNew(`${prefix}/draft-candidate.json`, draft);
    return {
      run_id: runId,
      package_id: metadata.package_id,
      package_version: metadata.package_version,
      generation_task: task,
      draft
    };
  }

  async reviewArticle(runId: string): Promise<ReviewReport> {
    const prefix = this.runPrefix(runId);
    const packageValue = await this.store.readJson<ResearchContentPackage>(`${prefix}/package.json`);
    const draft = await this.store.readJson<ArticleDraft>(`${prefix}/draft-candidate.json`);
    const evidence = runEvidenceGate(packageValue);
    const privacy = runPrivacyGate(draft);
    const findings: Finding[] = [...evidence.findings, ...privacy.findings];
    const referenced = new Set(draft.sections.flatMap((section) => section.claim_refs));
    for (const claim of packageValue.claims) {
      if (!referenced.has(claim.claim_id)) {
        findings.push({
          code: 'CLAIM_UNREFERENCED',
          severity: 'warning',
          message: `article does not use Claim ${claim.claim_id}`,
          path: `/claims/${claim.claim_id}`
        });
      }
      if (claim.claim_status === 'planned') {
        for (const [index, section] of draft.sections.entries()) {
          if (section.claim_refs.includes(claim.claim_id) && SHIPPED_LANGUAGE.test(section.markdown)) {
            findings.push({
              code: 'CLAIM_STATUS_LANGUAGE_MISMATCH',
              severity: 'error',
              message: `planned Claim ${claim.claim_id} is presented as shipped`,
              path: `/sections/${index}/markdown`
            });
          }
        }
      }
    }
    const report = validateContract<ReviewReport>('review-report', {
      schema_version: '1.0',
      run_id: runId,
      passed: findings.every((finding) => finding.severity !== 'error'),
      gates: ['evidence', 'privacy', 'editorial'],
      findings,
      reviewed_at: this.now().toISOString()
    });
    await this.store.writeNew(`${prefix}/review-report.json`, report);
    return report;
  }

  async finalizeArticle(runId: string): Promise<ArticlePackageRef> {
    const prefix = this.runPrefix(runId);
    const metadata = await this.store.readJson<RunMetadata>(`${prefix}/run.json`);
    const packageValue = await this.store.readJson<ResearchContentPackage>(`${prefix}/package.json`);
    const task = await this.store.readJson<GenerationTask>(`${prefix}/generation-task.json`);
    const draft = await this.store.readJson<ArticleDraft>(`${prefix}/draft-candidate.json`);
    const report = await this.store.readJson<ReviewReport>(`${prefix}/review-report.json`);
    if (!report.passed) {
      const code = report.findings.some((finding) => finding.code === 'CLAIM_STATUS_LANGUAGE_MISMATCH')
        ? 'EVIDENCE_GATE_BLOCKED'
        : 'PRIVACY_GATE_BLOCKED';
      throw new HarnessError(code, 'article review contains blocking findings', report.findings);
    }

    const root = `articles/${slugify(draft.title)}/${runId}`;
    const files: Readonly<Record<string, string | object>> = {
      'article.md': this.renderArticle(draft),
      'article.meta.yaml': this.renderMetadata(draft, metadata),
      'claim-map.json': draft.sections.map((section) => ({
        heading: section.heading,
        claim_refs: section.claim_refs,
        source_refs: section.source_refs
      })),
      'sources.md': this.renderSources(packageValue),
      'review-report.json': report,
      'generation-task.json': task,
      'draft-candidate.json': draft
    };
    const digest = sha256(files);
    const artifacts = Object.keys(files).map((name) => `${root}/${name}`);
    const ref: ArticlePackageRef = { root, digest, artifacts };

    try {
      const existing = await this.store.readJson<ArticlePackageRef>(`${root}/package-ref.json`);
      if (existing.digest === digest) {
        return existing;
      }
      throw new HarnessError('ARTIFACT_EXISTS', 'final article exists with a different digest');
    } catch (error) {
      if (!(error instanceof HarnessError) || error.code !== 'ARTIFACT_NOT_FOUND') {
        throw error;
      }
    }

    for (const [name, value] of Object.entries(files)) {
      await this.store.writeNew(`${root}/${name}`, value);
    }
    await this.store.writeNew(`${root}/package-ref.json`, ref);
    return ref;
  }

  async createXHandoff(runId: string): Promise<XHandoff> {
    const finalized = await this.finalizeArticle(runId);
    const metadata = await this.store.readJson<RunMetadata>(`${this.runPrefix(runId)}/run.json`);
    const handoff: XHandoff = {
      schema_version: '1.0',
      handoff_id: `x_handoff_${runId}`,
      article_run_id: runId,
      article_digest: finalized.digest,
      package_id: metadata.package_id,
      package_version: metadata.package_version,
      requested_at: this.now().toISOString()
    };
    await this.store.writeNew(`${finalized.root}/x-handoff.json`, handoff);
    return handoff;
  }

  private runPrefix(runId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', 'run id contains unsafe path characters');
    }
    return `runs/${runId}/article`;
  }

  private renderArticle(draft: ArticleDraft): string {
    const sections = draft.sections
      .map((section) => `## ${section.heading}\n\n${section.markdown}`)
      .join('\n\n');
    const questions = draft.open_questions.length === 0
      ? ''
      : `\n\n## Open questions\n\n${draft.open_questions.map((question) => `- ${question}`).join('\n')}`;
    return `# ${draft.title}\n\n${draft.summary}\n\n${sections}${questions}\n`;
  }

  private renderMetadata(draft: ArticleDraft, metadata: RunMetadata): string {
    return [
      `title: ${JSON.stringify(draft.title)}`,
      `language: ${draft.language}`,
      `run_id: ${metadata.run_id}`,
      `package_id: ${metadata.package_id}`,
      `package_version: ${metadata.package_version}`,
      ''
    ].join('\n');
  }

  private renderSources(packageValue: ResearchContentPackage): string {
    const lines = packageValue.sources
      .filter((source) => source.publication_policy !== 'internal_only')
      .map((source) => `- [${source.source_id}](${source.location}) — ${source.publication_policy}`);
    return `# Sources\n\n${lines.join('\n')}\n`;
  }
}
