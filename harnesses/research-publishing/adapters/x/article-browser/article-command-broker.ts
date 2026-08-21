import { randomUUID } from 'node:crypto';

import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
import type { VisualAssetRef } from '../../../core/types.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';

export type XArticleBrowserCommandKind =
  | 'observe_article_page'
  | 'navigate'
  | 'create_article_draft'
  | 'set_article_title'
  | 'upload_article_cover'
  | 'insert_article_block'
  | 'insert_article_image'
  | 'set_article_image_alt'
  | 'open_article_preview'
  | 'open_publish_review'
  | 'publish_article_once';

export type XArticleBrowserCommandPayload =
  | { readonly kind: 'observe_article_page'; readonly scope: 'index' | 'editor' | 'preview' | 'public_article' }
  | { readonly kind: 'navigate'; readonly url: string }
  | { readonly kind: 'create_article_draft'; readonly target_ref: string }
  | { readonly kind: 'set_article_title'; readonly target_ref: string; readonly title: string }
  | { readonly kind: 'upload_article_cover'; readonly package_root: string; readonly package_digest: string; readonly asset: VisualAssetRef }
  | { readonly kind: 'insert_article_block'; readonly target_ref: string; readonly block_ordinal: number; readonly block: XArticleBlockV1 }
  | { readonly kind: 'insert_article_image'; readonly target_ref: string; readonly block_ordinal: number; readonly package_root: string; readonly package_digest: string; readonly asset: VisualAssetRef }
  | { readonly kind: 'set_article_image_alt'; readonly visual_ref: string; readonly alt_text: string }
  | { readonly kind: 'open_article_preview'; readonly target_ref: string }
  | { readonly kind: 'open_publish_review'; readonly target_ref: string }
  | { readonly kind: 'publish_article_once'; readonly target_ref: string };

export interface IssueXArticleBrowserCommandInput {
  readonly execution_id: string;
  readonly run_id: string;
  readonly draft_id: string | null;
  readonly kind: XArticleBrowserCommandKind;
  readonly purpose: string;
  readonly expected_page_revision: string | null;
  readonly allowed_origin: 'https://x.com';
  readonly side_effect: 'read' | 'write' | 'submit';
  readonly payload: XArticleBrowserCommandPayload;
}

export interface XArticleBrowserCommandV1 extends IssueXArticleBrowserCommandInput {
  readonly schema_version: '1.0';
  readonly command_id: string;
  readonly payload_digest: string;
  readonly issued_at: string;
}

export interface XArticleCommandClaimV1 {
  readonly schema_version: '1.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly claimed: true;
  readonly claimed_at: string;
}

interface XArticleCommandBrokerOptions {
  readonly commandId?: () => string;
  readonly now?: () => Date;
}

export class XArticleCommandBroker {
  private readonly commandId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    options: XArticleCommandBrokerOptions = {}
  ) {
    this.commandId = options.commandId ?? (() => `x_article_command_${randomUUID()}`);
    this.now = options.now ?? (() => new Date());
  }

  async issue(
    input: IssueXArticleBrowserCommandInput,
    commandIdOverride?: string
  ): Promise<XArticleBrowserCommandV1> {
    this.assertId(input.execution_id);
    const command: XArticleBrowserCommandV1 = {
      schema_version: '1.0',
      ...input,
      command_id: commandIdOverride ?? this.commandId(),
      payload_digest: sha256(input.payload),
      issued_at: this.now().toISOString()
    };
    validateContract<XArticleBrowserCommandV1>('x-article-browser-command', command);
    if (await this.store.exists(this.commandPath(command))) {
      const existing = await this.store.readJson<XArticleBrowserCommandV1>(this.commandPath(command));
      const existingStable = { ...existing, issued_at: null };
      const newStable = { ...command, issued_at: null };
      if (sha256(existingStable) !== sha256(newStable)) {
        throw new HarnessError('COMMAND_REPLAY_REJECTED', 'deterministic X Article command identity changed payload');
      }
      return existing;
    }
    await this.store.writeNew(this.commandPath(command), command);
    return command;
  }

  async claim(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1> {
    const stored = await this.store.readJson<XArticleBrowserCommandV1>(this.commandPath(command));
    if (sha256(stored) !== sha256(command)) {
      throw new HarnessError('CONTRACT_INVALID', 'X Article command differs from its persisted envelope');
    }
    const claim: XArticleCommandClaimV1 = {
      schema_version: '1.0', execution_id: command.execution_id,
      command_id: command.command_id, claimed: true, claimed_at: this.now().toISOString()
    };
    try {
      await this.store.writeNew(this.claimPath(command), claim);
    } catch (error) {
      if (error instanceof HarnessError && error.code === 'ARTIFACT_EXISTS') {
        throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article command was already claimed');
      }
      throw error;
    }
    return claim;
  }

  private commandPath(command: Pick<XArticleBrowserCommandV1, 'execution_id' | 'command_id'>): string {
    this.assertId(command.execution_id);
    this.assertId(command.command_id);
    return `runs/${command.execution_id}/x-article/browser/commands/${command.command_id}/command.json`;
  }

  private claimPath(command: Pick<XArticleBrowserCommandV1, 'execution_id' | 'command_id'>): string {
    return this.commandPath(command).replace(/command\.json$/, 'claim.json');
  }

  private assertId(id: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article command identity');
  }
}
