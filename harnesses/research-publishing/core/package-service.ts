import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { runEvidenceGate, runPrivacyGate, runResearchGate } from './gates.js';
import { validateContract } from './schema-validator.js';
import type { Candidate, ResearchContentPackage, ReviewReport } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';

type CandidateQualification = Readonly<Pick<Candidate, 'novelty_hint'>>;

export class PackageService {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async captureCandidate(candidate: Candidate): Promise<Candidate> {
    const valid = validateContract<Candidate>('candidate', candidate);
    await this.store.writeNew(`candidates/${valid.candidate_id}.json`, valid);
    return valid;
  }

  async qualifyCandidate(
    candidateId: string,
    qualification: Partial<CandidateQualification>
  ): Promise<Candidate> {
    const captured = await this.store.readJson<Candidate>(`candidates/${candidateId}.json`);
    const novelty = qualification.novelty_hint?.trim();
    if (
      captured.research_track.trim().length === 0 ||
      captured.thesis_hint.trim().length === 0 ||
      novelty === undefined ||
      novelty.length === 0
    ) {
      throw new HarnessError(
        'RESEARCH_GATE_BLOCKED',
        'candidate must contribute a thesis and explicit research increment'
      );
    }

    const qualified = validateContract<Candidate>('candidate', {
      ...captured,
      novelty_hint: novelty,
      status: 'evidence_ready'
    });
    await this.store.writeNew(`candidates/${candidateId}.qualified.json`, qualified);
    return qualified;
  }

  async buildPackage(
    candidate: Candidate,
    packageValue: ResearchContentPackage
  ): Promise<ResearchContentPackage> {
    if (candidate.status !== 'evidence_ready') {
      throw new HarnessError('RESEARCH_GATE_BLOCKED', 'candidate is not evidence-ready');
    }
    const valid = validateContract<ResearchContentPackage>('research-content-package', packageValue);
    const research = runResearchGate(valid);
    if (!research.passed) {
      throw new HarnessError('RESEARCH_GATE_BLOCKED', 'research gate blocked package', research.findings);
    }
    await this.store.writeNew(this.packagePath(valid), valid);
    return valid;
  }

  async reviewPackage(packageValue: ResearchContentPackage): Promise<{
    package: ResearchContentPackage;
    report: ReviewReport;
  }> {
    const gates = [
      runResearchGate(packageValue),
      runEvidenceGate(packageValue),
      runPrivacyGate(packageValue)
    ];
    const findings = gates.flatMap((gate) => gate.findings);
    const passed = gates.every((gate) => gate.passed);
    const reviewedAt = this.now().toISOString();
    const nextPackage = validateContract<ResearchContentPackage>('research-content-package', {
      ...packageValue,
      version: packageValue.version + 1,
      status: 'reviewed',
      updated_at: reviewedAt
    });
    const report = validateContract<ReviewReport>('review-report', {
      schema_version: '1.0',
      run_id: `package:${packageValue.package_id}:v${nextPackage.version}`,
      passed,
      gates: gates.map((gate) => gate.gate),
      findings,
      reviewed_at: reviewedAt
    });
    if (!passed) {
      const firstFailed = gates.find((gate) => !gate.passed)?.gate;
      const code =
        firstFailed === 'research'
          ? 'RESEARCH_GATE_BLOCKED'
          : firstFailed === 'evidence'
            ? 'EVIDENCE_GATE_BLOCKED'
            : 'PRIVACY_GATE_BLOCKED';
      throw new HarnessError(code, `${firstFailed ?? 'review'} gate blocked package`, report);
    }

    await this.store.writeNew(this.packagePath(nextPackage), nextPackage);
    await this.store.writeNew(this.reviewPath(nextPackage), report);
    return { package: nextPackage, report };
  }

  async freezePackage(packageValue: ResearchContentPackage): Promise<{
    package: ResearchContentPackage;
    digest: string;
  }> {
    if (packageValue.status !== 'reviewed') {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'only a reviewed package may freeze');
    }
    const frozen = validateContract<ResearchContentPackage>('research-content-package', {
      ...packageValue,
      version: packageValue.version + 1,
      status: 'frozen',
      updated_at: this.now().toISOString()
    });
    const digest = sha256(frozen);
    await this.store.writeNew(this.packagePath(frozen), frozen);
    await this.store.writeNew(this.digestPath(frozen), `${digest}\n`);
    return { package: frozen, digest };
  }

  private packagePath(packageValue: Pick<ResearchContentPackage, 'package_id' | 'version'>): string {
    return `packages/${packageValue.package_id}/v${packageValue.version}/package.json`;
  }

  private reviewPath(packageValue: Pick<ResearchContentPackage, 'package_id' | 'version'>): string {
    return `packages/${packageValue.package_id}/v${packageValue.version}/review-report.json`;
  }

  private digestPath(packageValue: Pick<ResearchContentPackage, 'package_id' | 'version'>): string {
    return `packages/${packageValue.package_id}/v${packageValue.version}/package.digest`;
  }
}
