export function documentFromEditor(editor) {
    const covers = editor.visuals.filter((visual) => visual.kind === 'cover');
    return {
        schema_version: '1.0',
        title: editor.title,
        cover_asset_id: covers.length === 1 ? covers[0].asset_id : null,
        blocks: editor.blocks
    };
}
export function pageKindNeedsDraft(kind) {
    return kind === 'article_editor' || kind === 'article_preview' || kind === 'publish_review';
}
//# sourceMappingURL=article-page-contract.js.map