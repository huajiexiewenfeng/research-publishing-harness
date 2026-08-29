import { sha256 } from '../../../core/digest.js';
export const BROWSER_COMMAND_KINDS = [
    'observe_page',
    'navigate',
    'click',
    'set_text',
    'press_key',
    'wait',
    'upload_attachment',
    'set_attachment_alt_text'
];
export function computePageRevision(input) {
    return sha256({
        origin: input.origin,
        canonical_url: input.canonical_url,
        nodes: input.nodes,
        public_posts: input.public_posts,
        composer_attachments: input.composer_attachments ?? []
    });
}
//# sourceMappingURL=browser-protocol.js.map