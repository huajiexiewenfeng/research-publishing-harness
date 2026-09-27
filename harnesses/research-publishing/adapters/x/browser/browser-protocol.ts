import { sha256 } from '../../../core/digest.js';
import type { ErrorCode } from '../../../core/errors.js';
import type { VisualAssetRef } from '../../../core/types.js';

export const BROWSER_COMMAND_KINDS = [
  'observe_page',
  'navigate',
  'click',
  'set_text',
  'press_key',
  'wait',
  'upload_attachment',
  'set_attachment_alt_text'
] as const;
export type BrowserCommandKind = (typeof BROWSER_COMMAND_KINDS)[number];
export type BrowserCapability = BrowserCommandKind | 'file_upload' | 'attachment_alt_text';
export type BrowserSideEffect = 'read' | 'write' | 'submit';

export interface BrowserCapabilityManifest {
  readonly executor: 'codex-chrome';
  readonly executor_version: string;
  readonly browser_family: 'chrome';
  readonly capabilities: readonly BrowserCapability[];
  readonly observed_at: string;
}

export interface BrowserNodeObservation {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly text: string;
  readonly test_id: string | null;
  readonly editable: boolean;
  readonly disabled: boolean;
  readonly parent_ref: string | null;
}

export interface BrowserObservedLink {
  readonly display_url: string;
  readonly expanded_url: string;
}

export interface BrowserPublicPostObservation {
  readonly post_id: string;
  readonly canonical_url: string;
  readonly author_handle: string;
  readonly text: string;
  readonly links: readonly BrowserObservedLink[];
  readonly published_at: string;
  readonly reply_to_id: string | null;
  readonly quoted_post_id?: string | null;
  readonly media?: readonly BrowserPublicMediaObservation[];
}

export interface BrowserComposerAttachmentObservation {
  readonly ref: string;
  readonly ordinal: number;
  readonly kind: 'image';
  readonly mime_type: 'image/png' | 'image/jpeg' | 'image/webp' | null;
  readonly alt_text: string | null;
  readonly status: 'processing' | 'uploaded' | 'failed';
  readonly owned_by_execution: boolean;
}

export interface BrowserPublicMediaObservation {
  readonly kind: 'image';
  readonly alt_text: string | null;
  readonly url: string | null;
}

export interface BrowserObservation {
  readonly schema_version: '2.0';
  readonly observation_id: string;
  readonly execution_id: string;
  readonly command_id: string;
  readonly origin: 'https://x.com';
  readonly canonical_url: string;
  readonly page_revision: string;
  readonly observed_at: string;
  readonly nodes: readonly BrowserNodeObservation[];
  readonly public_posts: readonly BrowserPublicPostObservation[];
  readonly composer_attachments?: readonly BrowserComposerAttachmentObservation[];
  readonly composer_quote_post_id?: string | null;
  readonly quote_controls?: { readonly repost_ref: string | null; readonly quote_ref: string | null };
}

export type BrowserCommandPayload =
  | { readonly kind: 'observe_page'; readonly scope: 'x_page' | 'composer' | 'public_thread' }
  | { readonly kind: 'navigate'; readonly url: string }
  | { readonly kind: 'click'; readonly target_ref: string }
  | { readonly kind: 'set_text'; readonly target_ref: string; readonly text: string }
  | { readonly kind: 'press_key'; readonly target_ref: string; readonly key: string }
  | { readonly kind: 'wait'; readonly delay_ms: 0 | 3000 | 10000 | 30000 | 90000 }
  | {
      readonly kind: 'upload_attachment';
      readonly target_ordinal: number;
      readonly package_root: string;
      readonly package_digest: string;
      readonly asset: VisualAssetRef;
    }
  | {
      readonly kind: 'set_attachment_alt_text';
      readonly target_ordinal: number;
      readonly attachment_ref: string;
      readonly alt_text: string;
    };

export interface IssueBrowserCommandInput {
  readonly execution_id: string;
  readonly run_id: string;
  readonly kind: BrowserCommandKind;
  readonly purpose: string;
  readonly expected_page_revision: string | null;
  readonly allowed_origin: 'https://x.com';
  readonly side_effect: BrowserSideEffect;
  readonly payload: BrowserCommandPayload;
}

export interface BrowserCommand extends IssueBrowserCommandInput {
  readonly schema_version: '2.0';
  readonly command_id: string;
  readonly payload_digest: string;
  readonly issued_at: string;
}

export interface BrowserCommandClaim {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly claimed: true;
  readonly claimed_at: string;
}

export interface BrowserActionResult {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly resulting_page_revision: string | null;
  readonly observation: BrowserObservation | null;
  readonly error_code: ErrorCode | null;
  readonly reported_at: string;
}

export type BrowserObservationInput = Omit<BrowserObservation, 'page_revision'>;

export interface BrowserActionResultInput {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly observation: BrowserObservationInput | null;
  readonly error_code: ErrorCode | null;
  readonly reported_at: string;
}

export function computePageRevision(input: BrowserObservationInput): string {
  return sha256({
    origin: input.origin,
    canonical_url: input.canonical_url,
    nodes: input.nodes,
    public_posts: input.public_posts
    ,composer_attachments: input.composer_attachments ?? [],
    ...(input.composer_quote_post_id === undefined ? {} : { composer_quote_post_id: input.composer_quote_post_id }),
    ...(input.quote_controls === undefined ? {} : { quote_controls: input.quote_controls })
  });
}
