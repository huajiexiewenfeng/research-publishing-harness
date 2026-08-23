import { sha256, sha256Bytes } from './digest.js';
import { EvidenceObjectStore } from './evidence-object-store.js';
import { HarnessError } from './errors.js';
import { chunkCanonicalMarkdown, normalizeCanonicalUtf8 } from './markdown-chunker.js';
import { RESEARCH_MEMORY_POLICY_V1 } from './research-memory-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type {
  ArtifactRefV2,
  ArtifactRole,
  QueryableCanonicalDocumentV1
} from './research-memory-types.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface ProjectCanonicalDocumentInput {
  readonly document_id: string;
  readonly document_role: ArtifactRole;
  readonly track_id: string;
  readonly increment_ref: string;
  readonly artifact_ref: ArtifactRefV2;
  readonly language: string;
}

export type CanonicalDocumentProjectionResult =
  | Readonly<{
      status: 'projected';
      manifest: QueryableCanonicalDocumentV1;
      manifest_path: string;
    }>
  | Readonly<{
      status: 'evidence_only';
      reason: 'non_text_media' | 'lossy_decode';
      artifact_ref: ArtifactRefV2;
    }>;

function chunkLocalPath(documentId: string, ordinal: number, digest: `sha256:${string}`): string {
  const hex = digest.slice('sha256:'.length);
  return `memory/evidence/documents/${documentId}/chunks/${String(ordinal).padStart(4, '0')}-${hex}.txt`;
}

export class CanonicalDocumentService {
  private readonly objects: EvidenceObjectStore;

  constructor(private readonly store: WorkspaceStore) {
    this.objects = new EvidenceObjectStore(store);
  }

  async project(input: ProjectCanonicalDocumentInput): Promise<CanonicalDocumentProjectionResult> {
    if (!STABLE_ID_PATTERN.test(input.document_id) || !STABLE_ID_PATTERN.test(input.track_id)) {
      throw new HarnessError('CONTRACT_INVALID', 'Document and Track ids must be ASCII-safe stable ids');
    }
    if (input.document_role !== input.artifact_ref.role) {
      throw new HarnessError('CONTRACT_INVALID', 'Document role must match its Artifact role');
    }
    await this.objects.verify(input.artifact_ref);
    const object = await this.store.readContainedArtifact(input.artifact_ref.object_path);
    const normalized = normalizeCanonicalUtf8(object.content, input.artifact_ref.media_type);
    if (normalized.status === 'evidence_only') {
      return { ...normalized, artifact_ref: input.artifact_ref };
    }

    const chunks = chunkCanonicalMarkdown(
      normalized.text,
      RESEARCH_MEMORY_POLICY_V1.max_chars_per_chunk
    );
    const entries: Record<string, string | object | Uint8Array> = {};
    const descriptors = chunks.map((chunk) => {
      const bytes = Buffer.from(chunk.text, 'utf8');
      const chunkDigest = sha256Bytes(bytes);
      const digestHex = chunkDigest.slice('sha256:'.length);
      entries[`chunks/${String(chunk.ordinal).padStart(4, '0')}-${digestHex}.txt`] = bytes;
      return {
        chunk_id: `chunk_${digestHex.slice(0, 32)}_${chunk.ordinal}`,
        ordinal: chunk.ordinal,
        record_path: `domains/research-publishing/tracks/${input.track_id}/documents/${input.document_id}/chunks/${String(chunk.ordinal).padStart(4, '0')}-${digestHex}.md`,
        chunk_digest: chunkDigest,
        char_start: chunk.char_start,
        char_end: chunk.char_end,
        heading_path: [...chunk.heading_path],
        byte_size: bytes.length
      };
    });
    const body = {
      schema_version: 'queryable-canonical-document/v1' as const,
      document_id: input.document_id,
      document_role: input.document_role,
      increment_ref: input.increment_ref,
      artifact_ref: input.artifact_ref,
      full_content_digest: sha256Bytes(Buffer.from(normalized.text, 'utf8')),
      chunk_policy_version: 'canonical-markdown-chunks/v1' as const,
      chunks: descriptors,
      language: input.language,
      privacy_classification: input.artifact_ref.privacy_classification,
      instruction_policy: 'data_only' as const
    };
    const manifest = validateContract<QueryableCanonicalDocumentV1>('queryable-canonical-document', {
      ...body,
      manifest_digest: sha256(body)
    });
    entries['manifest.json'] = manifest;
    const root = `memory/evidence/documents/${input.document_id}`;
    await this.store.writeNewDirectory(root, entries);
    return { status: 'projected', manifest, manifest_path: `${root}/manifest.json` };
  }

  async reconstruct(manifest: QueryableCanonicalDocumentV1): Promise<string> {
    const ordered = [...manifest.chunks].sort((left, right) => left.ordinal - right.ordinal);
    let expectedStart = 0;
    const parts: string[] = [];
    for (const descriptor of ordered) {
      if (descriptor.char_start !== expectedStart || descriptor.char_end < descriptor.char_start) {
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Canonical document chunks are not contiguous');
      }
      const path = chunkLocalPath(manifest.document_id, descriptor.ordinal, descriptor.chunk_digest);
      const bytes = await this.store.readBytes(path);
      if (sha256Bytes(bytes) !== descriptor.chunk_digest || bytes.length !== descriptor.byte_size) {
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Canonical document chunk digest does not match');
      }
      const decoded = normalizeCanonicalUtf8(bytes, 'text/plain');
      if (decoded.status !== 'normalized') {
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Canonical document chunk is not UTF-8 text');
      }
      if (decoded.text.length !== descriptor.char_end - descriptor.char_start) {
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Canonical document chunk character range does not match');
      }
      parts.push(decoded.text);
      expectedStart = descriptor.char_end;
    }
    const text = parts.join('');
    if (sha256Bytes(Buffer.from(text, 'utf8')) !== manifest.full_content_digest) {
      throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Canonical document reconstruction digest does not match');
    }
    return text;
  }
}
