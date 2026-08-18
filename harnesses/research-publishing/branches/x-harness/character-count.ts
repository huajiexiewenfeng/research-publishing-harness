import { parseTweet } from 'twitter-text';

export interface PostTextResult {
  readonly valid: boolean;
  readonly weightedLength: number;
  readonly maxWeightedLength: number;
  readonly permillage: number;
}

export function validatePostText(text: string, maxWeightedLength = 280): PostTextResult {
  const parsed = parseTweet(text);
  return {
    valid: parsed.valid && parsed.weightedLength <= maxWeightedLength,
    weightedLength: parsed.weightedLength,
    maxWeightedLength,
    permillage: Math.floor((parsed.weightedLength / maxWeightedLength) * 1000)
  };
}
