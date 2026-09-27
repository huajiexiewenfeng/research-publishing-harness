import twitterText, {} from 'twitter-text';
// twitter-text exports its defaults at runtime, but @types/twitter-text omits configs.
const defaultOptions = twitterText.configs.defaults;
/** null removes the local length cap; platform/account restrictions still apply. */
export function validatePostText(text, maxWeightedLength = 280) {
    const parsed = twitterText.parseTweet(text, {
        ...defaultOptions,
        maxWeightedTweetLength: maxWeightedLength ?? Number.POSITIVE_INFINITY
    });
    return {
        valid: text.trim().length > 0 && parsed.valid,
        weightedLength: parsed.weightedLength,
        maxWeightedLength,
        permillage: maxWeightedLength === null ? null : parsed.permillage
    };
}
//# sourceMappingURL=character-count.js.map