export const X_ARTICLE_HOST_PROTOCOL = 'x-article-host-bridge/v3.5' as const;

export const X_ARTICLE_CONTROL_ROUTES = [
  'x-article fast-path audit --workspace <path> --input <input.json> --output json',
  'x-article fast-path confirm --workspace <path> --input <input.json> --output json',
  'x-article fast-path prepare --workspace <path> --audit <path> --confirmation <path> --capabilities <path> --release-set <path> [--observation <path>] --output json',
  'x-article fast-path status --workspace <path> --execution <id> --output json',
  'x-article fast-path recover --workspace <path> --execution <id> --output json',
  'x-article browser prepare --workspace <path> --plan <path> --capabilities <path> --output json',
  'x-article browser prepare-existing-media --workspace <path> --plan <path> --observation <path> --capabilities <path> --output json',
  'x-article browser resume-editor --workspace <path> --execution <id> --output json',
  'x-article browser confirm-publish --workspace <path> --execution <id> --confirmation <path> --output json',
  'x-article browser materialization-status --workspace <path> --execution <id> --output json'
] as const;
