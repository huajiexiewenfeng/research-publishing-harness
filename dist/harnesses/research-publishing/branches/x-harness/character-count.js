import twitterText from 'twitter-text';
export function validatePostText(text, maxWeightedLength = 280) {
    const parsed = twitterText.parseTweet(text);
    return {
        valid: parsed.valid && parsed.weightedLength <= maxWeightedLength,
        weightedLength: parsed.weightedLength,
        maxWeightedLength,
        permillage: Math.floor((parsed.weightedLength / maxWeightedLength) * 1000)
    };
}
//# sourceMappingURL=character-count.js.map