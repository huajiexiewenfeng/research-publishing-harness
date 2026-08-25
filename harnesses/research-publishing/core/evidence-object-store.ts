import { HarnessError } from './errors.js';
import { assertArtifactAdmissible } from './artifact-admission-policy.js';
import { createArtifactRefV2 } from './research-memory-contracts.js';
import type {
  ArtifactRefV2,
  ArtifactRole,
  PrivacyClassification
} from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface ContainedArtifactInput {
  readonly workspace_relative_path: string;
  readonly role: ArtifactRole;
  readonly media_type: string;
  readonly canonical: boolean;
  readonly privacy_classification: PrivacyClassification;
}

export interface EvidenceObjectPutResult {
  readonly status: 'created' | 'already_exists';
  readonly artifact_ref: ArtifactRefV2;
}

export class EvidenceObjectStore {
  constructor(private readonly store: WorkspaceStore) {}

  async put(input: ContainedArtifactInput): Promise<EvidenceObjectPutResult> {
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
    } catch (error) {
      if (!(error instanceof HarnessError) || error.code !== 'ARTIFACT_EXISTS') throw error;
      await this.verify(artifactRef);
      return { status: 'already_exists', artifact_ref: artifactRef };
    }
  }

  async verify(ref: ArtifactRefV2): Promise<void> {
    const object = await this.store.readContainedArtifact(ref.object_path);
    if (object.digest !== ref.digest || object.bytes !== ref.byte_size) {
      throw new HarnessError(
        'MEMORY_EVIDENCE_CORRUPT',
        `Evidence object bytes do not match ${ref.digest}`
      );
    }
  }
}
