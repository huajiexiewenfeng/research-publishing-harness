import twitterText, { type ParseTweetOptions } from 'twitter-text';

// twitter-text exports its defaults at runtime, but @types/twitter-text omits configs.
const defaultOptions = (twitterText as typeof twitterText & {
  configs: { defaults: ParseTweetOptions };
}).configs.defaults;

export interface PostTextResult {
  readonly valid: boolean;
  readonly weightedLength: number;
  readonly maxWeightedLength: number | null;
  readonly permillage: number | null;
}

/** null removes the local length cap; platform/account restrictions still apply. */
export function validatePostText(text: string, maxWeightedLength: number | null = 280): PostTextResult {
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
