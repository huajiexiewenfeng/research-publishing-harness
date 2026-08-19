import {
  type BrowserNodeObservation,
  type BrowserObservation,
  type BrowserObservationInput,
  type BrowserPublicPostObservation,
  computePageRevision
} from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';

function node(
  ref: string,
  role: string,
  name: string,
  text: string,
  overrides: Partial<BrowserNodeObservation> = {}
): BrowserNodeObservation {
  return {
    ref,
    role,
    name,
    text,
    test_id: null,
    editable: false,
    disabled: false,
    parent_ref: null,
    ...overrides
  };
}

function observed(
  id: string,
  canonicalUrl: string,
  nodes: readonly BrowserNodeObservation[],
  publicPosts: readonly BrowserPublicPostObservation[] = []
): BrowserObservation {
  const input: BrowserObservationInput = {
    schema_version: '2.0',
    observation_id: id,
    execution_id: 'exec_fixture',
    command_id: `cmd_${id}`,
    origin: 'https://x.com',
    canonical_url: canonicalUrl,
    observed_at: '2026-08-19T04:00:00.000Z',
    nodes,
    public_posts: publicPosts
  };
  return { ...input, page_revision: computePageRevision(input) };
}

const account = node('account_switcher', 'button', 'Account menu', '@runtime_ai', {
  test_id: 'SideNav_AccountSwitcher_Button'
});

export const loggedIn = observed('obs_logged_in', 'https://x.com/home', [account]);

export const emptyComposer = observed('obs_empty', 'https://x.com/compose/post', [
  account,
  node('item_1', 'textbox', 'Post text', '', {
    test_id: 'tweetTextarea_0',
    editable: true
  }),
  node('add_post', 'button', 'Add post', 'Add post', { test_id: 'addButton' }),
  node('submit_one', 'button', 'Post', 'Post', { test_id: 'tweetButton', disabled: true })
]);

export const filledThread = observed('obs_thread', 'https://x.com/compose/post', [
  account,
  node('item_1', 'textbox', 'Post text', 'First locked item', {
    test_id: 'tweetTextarea_0', editable: true
  }),
  node('item_2', 'textbox', 'Post text', 'Second locked item', {
    test_id: 'tweetTextarea_1', editable: true
  }),
  node('item_3', 'textbox', 'Post text', 'Third locked item', {
    test_id: 'tweetTextarea_2', editable: true
  }),
  node('add_post', 'button', 'Add post', 'Add post', { test_id: 'addButton' }),
  node('submit_all', 'button', 'Post all', 'Post all', { test_id: 'tweetButton' })
]);

export const activeDraft = observed('obs_draft', 'https://x.com/compose/post', [
  account,
  node('draft_marker', 'status', 'Unsent post', 'Existing draft', { test_id: 'unsentTweet' }),
  node('item_1', 'textbox', 'Post text', 'Unrelated draft content', {
    test_id: 'tweetTextarea_0', editable: true
  })
]);

export const loginPage = observed('obs_login', 'https://x.com/i/flow/login', [
  node('sign_in', 'button', 'Sign in', 'Sign in', { test_id: 'loginButton' })
]);

export const securityChallenge = observed('obs_security', 'https://x.com/account/access', [
  node('challenge', 'heading', 'Verify your account', 'Verify your account', {
    test_id: 'securityChallenge'
  })
]);

const posts: readonly BrowserPublicPostObservation[] = [
  {
    post_id: '100',
    canonical_url: 'https://x.com/runtime_ai/status/100',
    author_handle: '@runtime_ai',
    text: 'First locked item',
    links: [],
    published_at: '2026-08-19T04:01:00.000Z',
    reply_to_id: null
  },
  {
    post_id: '101',
    canonical_url: 'https://x.com/runtime_ai/status/101',
    author_handle: '@runtime_ai',
    text: 'Second locked item',
    links: [],
    published_at: '2026-08-19T04:01:01.000Z',
    reply_to_id: '100'
  }
];

export const publicThread = observed(
  'obs_public',
  'https://x.com/runtime_ai/status/100',
  [account],
  posts
);

export const unknownPage = observed('obs_unknown', 'https://x.com/settings', [
  node('settings', 'heading', 'Settings', 'Settings')
]);
