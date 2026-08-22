import { sha256 } from '../../../core/digest.js';
function links(value) {
    return value.flatMap((block) => {
        if ('runs' in block)
            return block.runs.flatMap((run) => run.link === null ? [] : [run.link]);
        if ('items' in block)
            return block.items.flatMap((item) => item.flatMap((run) => run.link === null ? [] : [run.link]));
        return [];
    });
}
export function verifyPublicXArticle(plan, article, now = new Date()) {
    const expectedHandle = plan.intent.target_account.slice(1);
    const urlMatch = article.canonical_url.match(/^https:\/\/x\.com\/([^/]+)\/(?:article|status)\/(\d+)$/);
    const identityMatch = urlMatch !== null && urlMatch[1].toLowerCase() === expectedHandle.toLowerCase() && urlMatch[2] === article.article_id;
    const authorMatch = article.author_handle.toLowerCase() === plan.intent.target_account.toLowerCase();
    const contentMatch = article.title === plan.intent.document.title && sha256(article.blocks) === sha256(plan.intent.document.blocks);
    const linksMatch = sha256(links(article.blocks)) === sha256(links(plan.intent.document.blocks));
    const expectedMedia = plan.intent.visuals;
    let mediaMatch = true;
    if (article.visuals.length !== expectedMedia.length) {
        mediaMatch = false;
    }
    else {
        for (let index = 0; index < expectedMedia.length; index += 1) {
            const expected = expectedMedia[index];
            const observed = article.visuals[index];
            const placementMatches = expected.placement.kind === 'cover'
                ? observed.kind === 'cover'
                : observed.kind === 'inline' && observed.block_ordinal === expected.placement.block_ordinal;
            if (!placementMatches || observed.status !== 'uploaded') {
                mediaMatch = false;
                break;
            }
            if (observed.alt_text === null) {
                mediaMatch = null;
            }
            else if (observed.alt_text !== expected.asset.alt_text) {
                mediaMatch = false;
                break;
            }
        }
    }
    const base = {
        article_id: article.article_id,
        canonical_url: article.canonical_url,
        author_match: authorMatch && identityMatch,
        content_match: contentMatch,
        links_match: linksMatch,
        media_match: mediaMatch,
        verified_at: now.toISOString()
    };
    if (!base.author_match || !contentMatch || !linksMatch || mediaMatch === false) {
        return { kind: 'conflict', ...base };
    }
    return mediaMatch === null
        ? { kind: 'media_unverified', ...base }
        : { kind: 'full_match', ...base };
}
//# sourceMappingURL=article-public-verifier.js.map