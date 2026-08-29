const ALLOWED_EXPRESSION_STATUS = {
    verified: ['verified', 'observed', 'inferred', 'hypothesis'],
    shipped: ['shipped', 'observed', 'exploring', 'hypothesis'],
    validated: ['validated', 'observed', 'exploring', 'hypothesis'],
    observed: ['observed', 'exploring', 'hypothesis'],
    inferred: ['inferred', 'hypothesis'],
    exploring: ['exploring', 'hypothesis'],
    planned: ['planned', 'exploring', 'hypothesis'],
    hypothesis: ['hypothesis']
};
export function canExpressClaimAs(source, target) {
    return ALLOWED_EXPRESSION_STATUS[source].includes(target);
}
const SHIPPED_LANGUAGE = /\b(is implemented|is available|has shipped|currently supports|already provides|is production-ready|production ready)\b/i;
export function claimLanguageMatchesBoundary(status, text) {
    return !(['exploring', 'planned', 'hypothesis'].includes(status) &&
        SHIPPED_LANGUAGE.test(text));
}
//# sourceMappingURL=claim-boundary.js.map