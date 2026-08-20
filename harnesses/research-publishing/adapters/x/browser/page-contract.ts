import { HarnessError } from '../../../core/errors.js';
import type {
  BrowserNodeObservation,
  BrowserComposerAttachmentObservation,
  BrowserObservation,
  BrowserPublicPostObservation
} from './browser-protocol.js';

export interface XPageContract {
  readonly id: string;
  readonly version: string;
  detectPage(observation: BrowserObservation): XPageState;
  detectAccount(observation: BrowserObservation): { readonly handle: string };
  detectComposer(observation: BrowserObservation): XComposerState;
  readComposerItems(observation: BrowserObservation): readonly XComposerItem[];
  readComposerAttachments(observation: BrowserObservation): readonly BrowserComposerAttachmentObservation[];
  detectSubmitControl(observation: BrowserObservation): XSubmitControl;
  detectPublishedPosts(observation: BrowserObservation): readonly BrowserPublicPostObservation[];
}

export type XPageState =
  | { readonly kind: 'authenticated_x' }
  | { readonly kind: 'login_required' }
  | { readonly kind: 'security_challenge' }
  | { readonly kind: 'composer' }
  | { readonly kind: 'public_thread' };

export interface XComposerItem {
  readonly ref: string;
  readonly ordinal: number;
  readonly text: string;
}

export interface XComposerState {
  readonly items: readonly XComposerItem[];
  readonly has_unknown_content: boolean;
  readonly add_control_ref: string | null;
  readonly attachments: readonly BrowserComposerAttachmentObservation[];
}

export interface XSubmitControl {
  readonly ref: string;
  readonly enabled: boolean;
  readonly label: 'Post' | 'Post all' | 'Reply';
}

export function requireUniqueNode(
  nodes: readonly BrowserNodeObservation[],
  predicate: (node: BrowserNodeObservation) => boolean,
  purpose: string
): BrowserNodeObservation {
  const matches = nodes.filter(predicate);
  if (matches.length !== 1) {
    throw new HarnessError(
      'PAGE_CONTRACT_UNSUPPORTED',
      `expected one ${purpose} node, observed ${matches.length}`
    );
  }
  return matches[0]!;
}
