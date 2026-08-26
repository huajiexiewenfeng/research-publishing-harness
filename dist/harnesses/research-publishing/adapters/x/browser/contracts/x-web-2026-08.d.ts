import type { BrowserObservation, BrowserPublicPostObservation } from '../browser-protocol.js';
import { type XComposerItem, type XComposerState, type XPageContract, type XPageState, type XSubmitControl } from '../page-contract.js';
export declare class XWeb202608Contract implements XPageContract {
    readonly id = "x-web";
    readonly version = "2026-08";
    detectPage(observation: BrowserObservation): XPageState;
    detectAccount(observation: BrowserObservation): {
        readonly handle: string;
    };
    detectComposer(observation: BrowserObservation): XComposerState;
    readComposerAttachments(observation: BrowserObservation): readonly import("../browser-protocol.js").BrowserComposerAttachmentObservation[];
    readComposerItems(observation: BrowserObservation): readonly XComposerItem[];
    detectSubmitControl(observation: BrowserObservation): XSubmitControl;
    detectPublishedPosts(observation: BrowserObservation): readonly BrowserPublicPostObservation[];
    private composerNodes;
    private textareaOrder;
    private findAccountNode;
    private resolveSemanticNode;
}
