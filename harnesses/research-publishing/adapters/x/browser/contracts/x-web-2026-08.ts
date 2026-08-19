import { HarnessError } from '../../../../core/errors.js';
import type {
  BrowserNodeObservation,
  BrowserObservation,
  BrowserPublicPostObservation
} from '../browser-protocol.js';
import {
  requireUniqueNode,
  type XComposerItem,
  type XComposerState,
  type XPageContract,
  type XPageState,
  type XSubmitControl
} from '../page-contract.js';

const HANDLE = /@[A-Za-z0-9_]{1,15}/;

export class XWeb202608Contract implements XPageContract {
  readonly id = 'x-web';
  readonly version = '2026-08';

  detectPage(observation: BrowserObservation): XPageState {
    const url = new URL(observation.canonical_url);
    if (
      url.pathname.startsWith('/i/flow/login') ||
      observation.nodes.some((node) => node.test_id === 'loginButton')
    ) {
      return { kind: 'login_required' };
    }
    if (
      url.pathname.startsWith('/account/access') ||
      observation.nodes.some((node) => node.test_id === 'securityChallenge')
    ) {
      return { kind: 'security_challenge' };
    }
    if (observation.public_posts.length > 0) return { kind: 'public_thread' };
    if (this.composerNodes(observation).length > 0) return { kind: 'composer' };
    if (this.findAccountNode(observation.nodes) !== null) return { kind: 'authenticated_x' };
    throw new HarnessError('PAGE_CONTRACT_UNSUPPORTED', 'unrecognized X page semantics');
  }

  detectAccount(observation: BrowserObservation): { readonly handle: string } {
    const node = this.findAccountNode(observation.nodes);
    if (node === null) {
      throw new HarnessError('X_AUTH_REQUIRED', 'X account switcher is unavailable');
    }
    const handle = `${node.text} ${node.name}`.match(HANDLE)?.[0];
    if (handle === undefined) {
      throw new HarnessError('PAGE_CONTRACT_UNSUPPORTED', 'account switcher has no X handle');
    }
    return { handle };
  }

  detectComposer(observation: BrowserObservation): XComposerState {
    const page = this.detectPage(observation);
    if (page.kind === 'login_required') {
      throw new HarnessError('X_AUTH_REQUIRED', 'X login is required');
    }
    if (page.kind === 'security_challenge') {
      throw new HarnessError('X_SECURITY_CHALLENGE', 'X security challenge requires human action');
    }
    if (observation.nodes.some((node) => node.test_id === 'unsentTweet')) {
      throw new HarnessError('DRAFT_CONFLICT', 'an unrelated active X draft is present');
    }
    const items = this.readComposerItems(observation);
    const recognizedRefs = new Set(items.map((item) => item.ref));
    const unknown = observation.nodes.some(
      (node) => node.editable && !recognizedRefs.has(node.ref) && node.text.length > 0
    );
    if (unknown) {
      throw new HarnessError('DRAFT_CONFLICT', 'composer contains unknown editable content');
    }
    const add = this.resolveSemanticNode(
      observation.nodes,
      (node) => node.role === 'button' && /^Add post$/i.test(node.name),
      ['addButton'],
      'Add post',
      true
    );
    return {
      items,
      has_unknown_content: false,
      add_control_ref: add?.ref ?? null
    };
  }

  readComposerItems(observation: BrowserObservation): readonly XComposerItem[] {
    const candidates = this.composerNodes(observation);
    const refs = new Set<string>();
    for (const node of candidates) {
      if (refs.has(node.ref)) {
        throw new HarnessError('PAGE_CONTRACT_UNSUPPORTED', 'duplicate composer item reference');
      }
      refs.add(node.ref);
    }
    return candidates
      .map((node, index) => ({
        node,
        order: this.textareaOrder(node) ?? index
      }))
      .sort((left, right) => left.order - right.order)
      .map(({ node }, index) => ({ ref: node.ref, ordinal: index + 1, text: node.text }));
  }

  detectSubmitControl(observation: BrowserObservation): XSubmitControl {
    const node = this.resolveSemanticNode(
      observation.nodes,
      (candidate) =>
        candidate.role === 'button' && /^(Post|Post all|Reply)$/.test(candidate.name),
      ['tweetButton', 'tweetButtonInline'],
      'submit control'
    );
    if (node === null) {
      throw new HarnessError('PAGE_CONTRACT_UNSUPPORTED', 'X submit control is unavailable');
    }
    const label = /Post all/.test(node.name)
      ? 'Post all'
      : /Reply/.test(node.name)
        ? 'Reply'
        : 'Post';
    return { ref: node.ref, enabled: !node.disabled, label };
  }

  detectPublishedPosts(observation: BrowserObservation): readonly BrowserPublicPostObservation[] {
    if (this.detectPage(observation).kind !== 'public_thread') {
      throw new HarnessError('PAGE_CONTRACT_UNSUPPORTED', 'page is not a public X thread');
    }
    return observation.public_posts;
  }

  private composerNodes(observation: BrowserObservation): BrowserNodeObservation[] {
    return observation.nodes.filter(
      (node) =>
        node.role === 'textbox' &&
        node.editable &&
        (/^(Post|Reply) text$/i.test(node.name) || /^tweetTextarea_\d+$/.test(node.test_id ?? ''))
    );
  }

  private textareaOrder(node: BrowserNodeObservation): number | null {
    const match = node.test_id?.match(/^tweetTextarea_(\d+)$/);
    return match === undefined || match === null ? null : Number(match[1]);
  }

  private findAccountNode(nodes: readonly BrowserNodeObservation[]): BrowserNodeObservation | null {
    return this.resolveSemanticNode(
      nodes,
      (node) => node.role === 'button' && /^(Account|Profile) menu$/i.test(node.name),
      ['SideNav_AccountSwitcher_Button'],
      'account switcher',
      true
    );
  }

  private resolveSemanticNode(
    nodes: readonly BrowserNodeObservation[],
    accessible: (node: BrowserNodeObservation) => boolean,
    testIds: readonly string[],
    purpose: string,
    optional = false
  ): BrowserNodeObservation | null {
    const accessibleMatches = nodes.filter(accessible);
    if (accessibleMatches.length > 0) {
      return requireUniqueNode(nodes, accessible, purpose);
    }
    const testMatches = nodes.filter((node) => node.test_id !== null && testIds.includes(node.test_id));
    if (testMatches.length > 0) {
      return requireUniqueNode(
        nodes,
        (node) => node.test_id !== null && testIds.includes(node.test_id),
        purpose
      );
    }
    const parentMatches = nodes.filter((node) => {
      if (node.parent_ref === null) return false;
      const parent = nodes.find((candidate) => candidate.ref === node.parent_ref);
      return parent !== undefined && parent.test_id !== null && testIds.includes(parent.test_id);
    });
    if (parentMatches.length > 0) {
      return requireUniqueNode(nodes, (node) => parentMatches.includes(node), purpose);
    }
    if (optional) return null;
    return null;
  }
}
