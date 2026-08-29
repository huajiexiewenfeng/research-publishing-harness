import { HarnessError } from './errors.js';
import { assertArtifactAdmissible } from './artifact-admission-policy.js';
import { createArtifactRefV2 } from './research-memory-contracts.js';
export class EvidenceObjectStore {
    store;
    constructor(store) {
        this.store = store;
    }
    async put(input) {
        const source = await this.store.readContainedArtifact(input.workspace_relative_path);
        assertArtifactAdmissible({
            ...input,
            bytes: source.content,
            allow_restricted: true
        });
        const artifactRef = createArtifactRefV2({
            ...input,
            workspace_relative_path: source.relative_path,
            digest: source.digest,
            byte_size: source.bytes
        });
        try {
            await this.store.writeNewBytes(artifactRef.object_path, source.content);
            await this.verify(artifactRef);
            return { status: 'created', artifact_ref: artifactRef };
        }
        catch (error) {
            if (!(error instanceof HarnessError) || error.code !== 'ARTIFACT_EXISTS')
                throw error;
            await this.verify(artifactRef);
            return { status: 'already_exists', artifact_ref: artifactRef };
        }
    }
    async verify(ref) {
        const object = await this.store.readContainedArtifact(ref.object_path);
        if (object.digest !== ref.digest || object.bytes !== ref.byte_size) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', `Evidence object bytes do not match ${ref.digest}`);
        }
    }
}
//# sourceMappingURL=evidence-object-store.js.map