import { randomUUID } from 'node:crypto';
import { sha256, sha256Bytes } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import { createGenerationTask } from '../../core/generation.js';
import { runEvidenceGate, runPrivacyGate } from '../../core/gates.js';
import { validateContract } from '../../core/schema-validator.js';
import { VisualAssetImporter } from '../../core/visual-assets.js';
const SHIPPED_LANGUAGE = /\b(is implemented|is available|has shipped|currently supports|already provides|is production-ready)\b/i;
function slugify(value) {
    const slug = value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
    return slug || 'article';
}
export class ArticleService {
    store;
    runId;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.runId = options.runId ?? (() => `article_${randomUUID()}`);
        this.now = options.now ?? (() => new Date());
    }
    async prepareArticle(packageValue, brief) {
        if (packageValue.status !== 'frozen') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'article generation requires a frozen package');
        }
        const runId = this.runId();
        const task = createGenerationTask({
            run_id: runId,
            branch: 'article',
            mode: `${brief.articleType}:${brief.targetDepth}`,
            language: brief.language
        }, packageValue, [
            'Preserve Claim status and evidence boundaries.',
            'Do not expose internal-only sources.',
            brief.includeOpenQuestions ? 'Include open research questions.' : 'Do not add an open-questions section.'
        ]);
        const prefix = this.runPrefix(runId);
        const metadata = {
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
    async acceptArticleDraft(runId, candidate) {
        const prefix = this.runPrefix(runId);
        const metadata = await this.store.readJson(`${prefix}/run.json`);
        const packageValue = await this.store.readJson(`${prefix}/package.json`);
        const task = await this.store.readJson(`${prefix}/generation-task.json`);
        const draft = validateContract('article-draft', candidate);
        if (draft.run_id !== runId || draft.language !== task.language) {
            throw new HarnessError('CONTRACT_INVALID', 'draft run or language does not match generation task');
        }
        const claimIds = new Set(packageValue.claims.map((claim) => claim.claim_id));
        const sourceIds = new Set(packageValue.sources
            .filter((source) => source.publication_policy !== 'internal_only')
            .map((source) => source.source_id));
        for (const section of draft.sections) {
            if (/!\[[^\]]*\]\([^)]*\)/.test(section.markdown)) {
                throw new HarnessError('VISUAL_ASSET_INVALID', 'Article Markdown images must be declared through a Visual Slot and Canonical Package asset');
            }
            if (section.claim_refs.some((claimId) => !claimIds.has(claimId))) {
                throw new HarnessError('CONTRACT_INVALID', 'draft references a Claim outside the frozen package');
            }
            if (section.source_refs.some((sourceId) => !sourceIds.has(sourceId))) {
                throw new HarnessError('CONTRACT_INVALID', 'draft references a missing or non-public Source');
            }
        }
        const sectionIds = new Set(draft.sections.flatMap((section) => section.section_id === undefined ? [] : [section.section_id]));
        const slotIds = new Set();
        for (const slot of draft.visual_slots ?? []) {
            if (slotIds.has(slot.slot_id)) {
                throw new HarnessError('CONTRACT_INVALID', `duplicate Visual Slot ${slot.slot_id}`);
            }
            slotIds.add(slot.slot_id);
            if (slot.claim_refs.some((claimId) => !claimIds.has(claimId))) {
                throw new HarnessError('VISUAL_CLAIM_REF_INVALID', `Visual Slot ${slot.slot_id} references a Claim outside the frozen package`);
            }
            if (slot.placement.kind === 'after_section' && !sectionIds.has(slot.placement.section_id)) {
                throw new HarnessError('CONTRACT_INVALID', `Visual Slot ${slot.slot_id} references an unknown section`);
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
    async visualStatus(runId) {
        const draft = await this.store.readJson(`${this.runPrefix(runId)}/draft-candidate.json`);
        const candidates = await this.readVisualCandidates(runId);
        const selected = await this.readVisualReview(runId);
        const selectedSlots = new Set(Object.keys(selected?.selected_candidates ?? {}));
        const slots = draft.visual_slots ?? [];
        return {
            slots,
            candidates,
            required_unresolved: slots.filter((slot) => slot.required && !selectedSlots.has(slot.slot_id)).map((slot) => slot.slot_id),
            warnings: slots.filter((slot) => !slot.required && !selectedSlots.has(slot.slot_id)).map((slot) => `optional visual slot ${slot.slot_id} is unresolved`)
        };
    }
    async attachVisual(runId, input) {
        await this.assertArticleMutable(runId);
        const prefix = this.runPrefix(runId);
        const [draft, report] = await Promise.all([
            this.store.readJson(`${prefix}/draft-candidate.json`),
            this.store.readJson(`${prefix}/review-report.json`)
        ]);
        if (!report.passed)
            throw new HarnessError('EVIDENCE_GATE_BLOCKED', 'Content Review must pass before visual import');
        const slot = (draft.visual_slots ?? []).find((candidate) => candidate.slot_id === input.slotId);
        if (slot === undefined)
            throw new HarnessError('VISUAL_SLOT_UNRESOLVED', `Visual Slot ${input.slotId} does not exist`);
        if (input.claimRefs.some((claimId) => !slot.claim_refs.includes(claimId))) {
            throw new HarnessError('VISUAL_CLAIM_REF_INVALID', 'visual candidate exceeds its Slot Claim boundary');
        }
        const candidate = await new VisualAssetImporter(this.store).attach({ ...input, runId });
        await this.store.writeNew(`${prefix}/visual-candidates/${input.candidateId}/candidate.json`, candidate);
        return candidate;
    }
    async removeVisual(runId, candidateId) {
        await this.assertArticleMutable(runId);
        if (!/^[A-Za-z0-9_-]+$/.test(candidateId))
            throw new HarnessError('CONTRACT_INVALID', 'unsafe visual candidate id');
        const candidate = await this.store.readJson(`${this.runPrefix(runId)}/visual-candidates/${candidateId}/candidate.json`);
        await this.store.removeFile(candidate.staged_relative_path);
        if (candidate.editable_source !== null)
            await this.store.removeFile(candidate.editable_source.staged_relative_path);
        await this.store.removeFile(`${this.runPrefix(runId)}/visual-candidates/${candidateId}/candidate.json`);
    }
    async reviewVisual(runId, input) {
        await this.assertArticleMutable(runId);
        const prefix = this.runPrefix(runId);
        const draft = await this.store.readJson(`${prefix}/draft-candidate.json`);
        const candidates = await this.readVisualCandidates(runId);
        const findings = [];
        for (const slot of draft.visual_slots ?? []) {
            const candidateId = input.selectedCandidates[slot.slot_id];
            if (candidateId === undefined) {
                if (slot.required)
                    findings.push({ code: 'VISUAL_SLOT_UNRESOLVED', severity: 'error', message: `required Visual Slot ${slot.slot_id} is unresolved` });
                continue;
            }
            const candidate = candidates.find((value) => value.candidate_id === candidateId && value.slot_id === slot.slot_id);
            if (candidate === undefined)
                findings.push({ code: 'VISUAL_ASSET_INVALID', severity: 'error', message: `selected candidate ${candidateId} does not belong to Slot ${slot.slot_id}` });
        }
        const semanticFlags = [input.claimAlignment, input.boundaryAlignment, input.mobileLegibility, input.singleMessage, input.privacyReview];
        if (semanticFlags.some((value) => !value))
            findings.push({ code: 'VISUAL_REVIEW_BLOCKED', severity: 'error', message: 'Visual Review semantic checks must all pass' });
        const report = validateContract('visual-review-report', {
            schema_version: '1.0', article_run_id: runId, selected_candidates: input.selectedCandidates,
            claim_alignment: input.claimAlignment, boundary_alignment: input.boundaryAlignment,
            mobile_legibility: input.mobileLegibility, single_message: input.singleMessage,
            privacy_review: input.privacyReview, reviewed_by: input.reviewedBy,
            reviewed_at: this.now().toISOString(), passed: findings.every((finding) => finding.severity !== 'error'), findings
        });
        await this.store.writeNew(`${prefix}/visual-review-report.json`, report);
        return report;
    }
    async reviewArticle(runId) {
        const prefix = this.runPrefix(runId);
        const packageValue = await this.store.readJson(`${prefix}/package.json`);
        const draft = await this.store.readJson(`${prefix}/draft-candidate.json`);
        const evidence = runEvidenceGate(packageValue);
        const privacy = runPrivacyGate(draft);
        const findings = [...evidence.findings, ...privacy.findings];
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
        const report = validateContract('review-report', {
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
    async finalizeArticle(runId) {
        const prefix = this.runPrefix(runId);
        if (await this.store.exists(`${prefix}/finalized-package.json`)) {
            return this.store.readJson(`${prefix}/finalized-package.json`);
        }
        const metadata = await this.store.readJson(`${prefix}/run.json`);
        const packageValue = await this.store.readJson(`${prefix}/package.json`);
        const task = await this.store.readJson(`${prefix}/generation-task.json`);
        const draft = await this.store.readJson(`${prefix}/draft-candidate.json`);
        const report = await this.store.readJson(`${prefix}/review-report.json`);
        if (!report.passed) {
            const code = report.findings.some((finding) => finding.code === 'CLAIM_STATUS_LANGUAGE_MISMATCH')
                ? 'EVIDENCE_GATE_BLOCKED'
                : 'PRIVACY_GATE_BLOCKED';
            throw new HarnessError(code, 'article review contains blocking findings', report.findings);
        }
        const slots = draft.visual_slots ?? [];
        const candidates = await this.readVisualCandidates(runId);
        let visualReview = await this.readVisualReview(runId);
        if (visualReview === null && slots.some((slot) => slot.required)) {
            throw new HarnessError('VISUAL_SLOT_UNRESOLVED', 'required Visual Slots need a passed Visual Review');
        }
        if (visualReview === null) {
            const warnings = slots.map((slot) => ({ code: 'VISUAL_SLOT_UNRESOLVED', severity: 'warning', message: `optional Visual Slot ${slot.slot_id} is unresolved` }));
            visualReview = {
                schema_version: '1.0', article_run_id: runId, selected_candidates: {}, claim_alignment: true,
                boundary_alignment: true, mobile_legibility: true, single_message: true, privacy_review: true,
                reviewed_by: 'harness:no-selected-visuals', reviewed_at: this.now().toISOString(), passed: true, findings: warnings
            };
        }
        if (!visualReview.passed)
            throw new HarnessError('VISUAL_SLOT_UNRESOLVED', 'Visual Review contains blocking findings', visualReview.findings);
        const selected = slots.flatMap((slot, index) => {
            const candidateId = visualReview.selected_candidates[slot.slot_id];
            if (candidateId === undefined) {
                if (slot.required)
                    throw new HarnessError('VISUAL_SLOT_UNRESOLVED', `required Visual Slot ${slot.slot_id} is unresolved`);
                return [];
            }
            const candidate = candidates.find((value) => value.candidate_id === candidateId && value.slot_id === slot.slot_id);
            if (candidate === undefined)
                throw new HarnessError('VISUAL_ASSET_INVALID', `selected candidate ${candidateId} is missing`);
            return [{ slot, candidate, placementOrdinal: index + 1 }];
        });
        const selectedPaths = selected.flatMap(({ candidate }) => [
            candidate.asset.relative_path,
            ...(candidate.editable_source === null ? [] : [candidate.editable_source.relative_path])
        ]);
        if (new Set(selectedPaths).size !== selectedPaths.length) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'selected visual assets contain a Package path collision');
        }
        const selectedFiles = new Map();
        for (const { candidate } of selected) {
            const assetBytes = await this.store.readBytes(candidate.staged_relative_path);
            if (sha256Bytes(assetBytes) !== candidate.asset.digest) {
                throw new HarnessError('VISUAL_DIGEST_MISMATCH', `selected visual asset ${candidate.asset.asset_id} changed after import`);
            }
            selectedFiles.set(candidate.asset.relative_path, assetBytes);
            if (candidate.editable_source !== null) {
                const editableBytes = await this.store.readBytes(candidate.editable_source.staged_relative_path);
                if (sha256Bytes(editableBytes) !== candidate.editable_source.digest) {
                    throw new HarnessError('VISUAL_DIGEST_MISMATCH', `editable source for ${candidate.asset.asset_id} changed after import`);
                }
                selectedFiles.set(candidate.editable_source.relative_path, editableBytes);
            }
        }
        const root = `articles/${slugify(draft.title)}/${runId}`;
        const manifestBase = {
            schema_version: '1.0',
            article_run_id: runId,
            bindings: selected.map(({ slot, candidate, placementOrdinal }) => ({
                slot_id: slot.slot_id, asset: candidate.asset, placement_ordinal: placementOrdinal,
                width: candidate.width, height: candidate.height, byte_size: candidate.byte_size,
                normalization_version: candidate.normalization_version, provenance: candidate.provenance,
                editable_source: candidate.editable_source === null ? null : {
                    relative_path: candidate.editable_source.relative_path,
                    digest: candidate.editable_source.digest
                }
            }))
        };
        const manifest = validateContract('visual-manifest', {
            ...manifestBase,
            manifest_digest: sha256(manifestBase)
        });
        const files = {
            'article.md': this.renderArticle(draft, new Map(selected.map(({ slot, candidate }) => [slot.slot_id, candidate.asset]))),
            'article.meta.yaml': this.renderMetadata(draft, metadata),
            'claim-map.json': draft.sections.map((section) => ({
                heading: section.heading,
                claim_refs: section.claim_refs,
                source_refs: section.source_refs
            })),
            'sources.md': this.renderSources(packageValue),
            'source-lineage.json': packageValue.research_lineage,
            'boundary-note.md': this.renderBoundaryNote(packageValue),
            'review-report.json': report,
            'visual-review-report.json': visualReview,
            'visual-manifest.json': manifest,
            'generation-task.json': task,
            'draft-candidate.json': draft
        };
        const digestEntries = [
            ...Object.entries(files).map(([path, value]) => ({ path, digest: sha256(value) })),
            ...selected.flatMap(({ candidate }) => [
                { path: candidate.asset.relative_path, digest: candidate.asset.digest },
                ...(candidate.editable_source === null ? [] : [{ path: candidate.editable_source.relative_path, digest: candidate.editable_source.digest }])
            ])
        ].sort((left, right) => left.path.localeCompare(right.path));
        const digest = sha256(digestEntries);
        const artifacts = [
            ...Object.keys(files).map((name) => `${root}/${name}`),
            ...selected.flatMap(({ candidate }) => [
                `${root}/${candidate.asset.relative_path}`,
                ...(candidate.editable_source === null ? [] : [`${root}/${candidate.editable_source.relative_path}`])
            ])
        ];
        const warnings = slots.filter((slot) => visualReview.selected_candidates[slot.slot_id] === undefined).map((slot) => `optional visual slot ${slot.slot_id} is unresolved`);
        const ref = { root, digest, artifacts, warnings };
        try {
            const existing = await this.store.readJson(`${root}/package-ref.json`);
            if (existing.digest === digest) {
                return existing;
            }
            throw new HarnessError('ARTIFACT_EXISTS', 'final article exists with a different digest');
        }
        catch (error) {
            if (!(error instanceof HarnessError) || error.code !== 'ARTIFACT_NOT_FOUND') {
                throw error;
            }
        }
        const packageFiles = {
            ...files,
            'package-ref.json': ref
        };
        for (const [relativePath, bytes] of selectedFiles) {
            packageFiles[relativePath] = bytes;
        }
        await this.store.writeNewDirectory(root, packageFiles);
        await this.store.writeNew(`${prefix}/finalized-package.json`, ref);
        return ref;
    }
    async createXHandoff(runId, assetId) {
        const finalized = await this.finalizeArticle(runId);
        const metadata = await this.store.readJson(`${this.runPrefix(runId)}/run.json`);
        let visualAsset;
        if (assetId !== undefined) {
            const manifest = await this.store.readJson(`${finalized.root}/visual-manifest.json`);
            visualAsset = manifest.bindings.find((binding) => binding.asset.asset_id === assetId)?.asset;
            if (visualAsset === undefined)
                throw new HarnessError('VISUAL_ASSET_INVALID', `asset ${assetId} is not in the finalized Article Package`);
        }
        const handoff = {
            schema_version: visualAsset === undefined ? '1.0' : '1.1',
            handoff_id: `x_handoff_${runId}`,
            article_run_id: runId,
            article_digest: finalized.digest,
            package_id: metadata.package_id,
            package_version: metadata.package_version,
            requested_at: this.now().toISOString(),
            ...(visualAsset === undefined ? {} : { article_package_root: finalized.root, visual_asset: visualAsset })
        };
        await this.store.writeNew(`${finalized.root}/x-handoff.json`, handoff);
        return handoff;
    }
    runPrefix(runId) {
        if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', 'run id contains unsafe path characters');
        }
        return `runs/${runId}/article`;
    }
    renderArticle(draft, selected = new Map()) {
        const slots = draft.visual_slots ?? [];
        const cover = slots.find((slot) => slot.placement.kind === 'cover');
        const coverMarkdown = cover === undefined || !selected.has(cover.slot_id)
            ? ''
            : `\n\n${this.renderVisual(selected.get(cover.slot_id))}`;
        const sections = draft.sections
            .map((section) => {
            const sectionVisuals = slots.filter((slot) => slot.placement.kind === 'after_section' && slot.placement.section_id === section.section_id)
                .flatMap((slot) => selected.has(slot.slot_id) ? [`\n\n${this.renderVisual(selected.get(slot.slot_id))}`] : [])
                .join('');
            return `## ${section.heading}\n\n${section.markdown}${sectionVisuals}`;
        })
            .join('\n\n');
        const questions = draft.open_questions.length === 0
            ? ''
            : `\n\n## Open questions\n\n${draft.open_questions.map((question) => `- ${question}`).join('\n')}`;
        return `# ${draft.title}\n\n${draft.summary}${coverMarkdown}\n\n${sections}${questions}\n`;
    }
    renderVisual(asset) {
        return `![${asset.alt_text.replaceAll('[', '\\[').replaceAll(']', '\\]')}](${asset.relative_path})`;
    }
    renderMetadata(draft, metadata) {
        return [
            `title: ${JSON.stringify(draft.title)}`,
            `language: ${draft.language}`,
            `run_id: ${metadata.run_id}`,
            `package_id: ${metadata.package_id}`,
            `package_version: ${metadata.package_version}`,
            ''
        ].join('\n');
    }
    renderSources(packageValue) {
        const lines = packageValue.sources
            .filter((source) => source.publication_policy !== 'internal_only')
            .map((source) => source.publication_policy === 'cite'
            ? `- [${source.source_id}](${source.location}) — cite`
            : `- ${source.source_id} — paraphrase_only (location withheld)`);
        return `# Sources\n\n${lines.join('\n')}\n`;
    }
    renderBoundaryNote(packageValue) {
        const section = (title, values) => `## ${title}\n\n${values.map((value) => `- ${value}`).join('\n') || '- None'}`;
        return `# Evidence boundaries\n\n${section('Established', packageValue.boundaries.established)}\n\n${section('Not established', packageValue.boundaries.not_established)}\n\n${section('Explicitly not claimed', packageValue.boundaries.explicitly_not_claimed)}\n\n${section('Planned work', packageValue.boundaries.planned_work)}\n`;
    }
    async readVisualCandidates(runId) {
        const directory = `${this.runPrefix(runId)}/visual-candidates`;
        const entries = await this.store.list(directory);
        const candidates = [];
        for (const entry of entries) {
            if (entry.kind === 'directory')
                candidates.push(await this.store.readJson(`${entry.relative_path}/candidate.json`));
        }
        return candidates;
    }
    async readVisualReview(runId) {
        const path = `${this.runPrefix(runId)}/visual-review-report.json`;
        return await this.store.exists(path) ? this.store.readJson(path) : null;
    }
    async assertArticleMutable(runId) {
        if (await this.store.exists(`${this.runPrefix(runId)}/finalized-package.json`)) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'finalized Article Packages are immutable');
        }
    }
}
//# sourceMappingURL=article-service.js.map