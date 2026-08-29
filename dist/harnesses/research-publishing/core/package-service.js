import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { runClaimBoundaryGate, runEvidenceGate, runPrivacyGate, runResearchGate, runResearchLineageGate } from './gates.js';
import { validatePackageMemoryBinding } from './memory-package.js';
import { notifyTerminalSafely } from './research-terminal-hooks.js';
import { validateContract } from './schema-validator.js';
export class PackageService {
    store;
    now;
    terminalNotifier;
    constructor(store, now = () => new Date(), terminalNotifier = null) {
        this.store = store;
        this.now = now;
        this.terminalNotifier = terminalNotifier;
    }
    async captureCandidate(candidate) {
        const valid = validateContract('candidate', candidate);
        await this.store.writeNew(`candidates/${valid.candidate_id}.json`, valid);
        return valid;
    }
    async qualifyCandidate(candidateId, qualification) {
        const captured = await this.store.readJson(`candidates/${candidateId}.json`);
        const novelty = qualification.novelty_hint?.trim();
        if (captured.research_track.trim().length === 0 ||
            captured.thesis_hint.trim().length === 0 ||
            novelty === undefined ||
            novelty.length === 0) {
            throw new HarnessError('RESEARCH_GATE_BLOCKED', 'candidate must contribute a thesis and explicit research increment');
        }
        const qualified = validateContract('candidate', {
            ...captured,
            novelty_hint: novelty,
            status: 'evidence_ready'
        });
        await this.store.writeNew(`candidates/${candidateId}.qualified.json`, qualified);
        return qualified;
    }
    async buildPackage(candidate, packageValue) {
        if (candidate.status !== 'evidence_ready') {
            throw new HarnessError('RESEARCH_GATE_BLOCKED', 'candidate is not evidence-ready');
        }
        if (packageValue.status !== 'draft') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'a new package must begin in draft state');
        }
        const valid = validatePackageMemoryBinding(validateContract('research-content-package', {
            ...packageValue,
            status: 'evidence_ready',
            updated_at: this.now().toISOString()
        }));
        const research = runResearchGate(valid);
        if (!research.passed) {
            throw new HarnessError('RESEARCH_GATE_BLOCKED', 'research gate blocked package', research.findings);
        }
        await this.store.writeNew(this.packagePath(valid), valid);
        return valid;
    }
    async reviewPackage(packageValue) {
        if (packageValue.status !== 'evidence_ready') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'only an evidence-ready package may be reviewed');
        }
        validatePackageMemoryBinding(packageValue);
        const gates = packageValue.schema_version === '1.2'
            ? [
                runResearchLineageGate(packageValue),
                runEvidenceGate(packageValue),
                runClaimBoundaryGate(packageValue),
                runPrivacyGate(packageValue)
            ]
            : [
                runResearchGate(packageValue),
                runEvidenceGate(packageValue),
                runPrivacyGate(packageValue)
            ];
        const findings = gates.flatMap((gate) => gate.findings);
        const passed = gates.every((gate) => gate.passed);
        const reviewedAt = this.now().toISOString();
        const nextPackage = validatePackageMemoryBinding(validateContract('research-content-package', {
            ...packageValue,
            version: packageValue.version + 1,
            status: 'reviewed',
            updated_at: reviewedAt
        }));
        const report = validateContract('review-report', {
            schema_version: '1.0',
            run_id: `package:${packageValue.package_id}:v${nextPackage.version}`,
            passed,
            gates: gates.map((gate) => gate.gate),
            findings,
            reviewed_at: reviewedAt
        });
        if (!passed) {
            const firstFailed = gates.find((gate) => !gate.passed)?.gate;
            const code = firstFailed === 'research' || firstFailed === 'research_lineage'
                ? 'RESEARCH_GATE_BLOCKED'
                : firstFailed === 'evidence' || firstFailed === 'claim_boundary'
                    ? 'EVIDENCE_GATE_BLOCKED'
                    : 'PRIVACY_GATE_BLOCKED';
            throw new HarnessError(code, `${firstFailed ?? 'review'} gate blocked package`, report);
        }
        await this.store.writeNew(this.packagePath(nextPackage), nextPackage);
        await this.store.writeNew(this.reviewPath(nextPackage), report);
        return { package: nextPackage, report };
    }
    async freezePackage(packageValue) {
        if (packageValue.status !== 'reviewed') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'only a reviewed package may freeze');
        }
        validatePackageMemoryBinding(packageValue);
        const frozen = validatePackageMemoryBinding(validateContract('research-content-package', {
            ...packageValue,
            version: packageValue.version + 1,
            status: 'frozen',
            updated_at: this.now().toISOString()
        }));
        const digest = sha256(frozen);
        await this.store.writeNew(this.packagePath(frozen), frozen);
        await this.store.writeNew(this.digestPath(frozen), `${digest}\n`);
        await notifyTerminalSafely(this.store, this.terminalNotifier, {
            notification_id: `package_finalized_${frozen.package_id}_${frozen.version}`,
            kind: 'package_finalized', publication_kind: null,
            workspace_relative_path: this.packagePath(frozen), role: 'research_package',
            media_type: 'application/json', canonical: true,
            privacy_classification: frozen.privacy.contains_private_material ? 'restricted' : 'internal',
            occurred_at: frozen.updated_at
        });
        return { package: frozen, digest };
    }
    packagePath(packageValue) {
        return `packages/${packageValue.package_id}/v${packageValue.version}/package.json`;
    }
    reviewPath(packageValue) {
        return `packages/${packageValue.package_id}/v${packageValue.version}/review-report.json`;
    }
    digestPath(packageValue) {
        return `packages/${packageValue.package_id}/v${packageValue.version}/package.digest`;
    }
}
//# sourceMappingURL=package-service.js.map