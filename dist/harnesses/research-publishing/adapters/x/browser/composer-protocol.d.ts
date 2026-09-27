import { type ErrorCode } from '../../../core/errors.js';
import { type PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import type { BrowserObservation, IssueBrowserCommandInput } from './browser-protocol.js';
import type { XPageContract } from './page-contract.js';
export interface ComposerContext {
    readonly plan: PublicationPlanV2 | PublicationPlanV2_1;
    readonly expected_account: string;
    readonly created_item_refs: readonly string[];
    readonly next_ordinal: number;
    readonly add_retry_count: number;
    readonly last_page_revision: string | null;
    readonly attachment_command_issued?: boolean;
    readonly alt_text_command_issued?: boolean;
    readonly attachment_retry_count?: number;
    readonly quote_entry_step?: number;
}
export type ComposerDecision = {
    readonly kind: 'command';
    readonly input: IssueBrowserCommandInput;
    readonly next_context: ComposerContext;
} | {
    readonly kind: 'verified';
    readonly page_revision: string;
    readonly submit_ref: string;
} | {
    readonly kind: 'blocked';
    readonly code: ErrorCode;
    readonly message: string;
};
export declare function nextComposerDecision(context: ComposerContext, observation: BrowserObservation, contract: XPageContract): ComposerDecision;
