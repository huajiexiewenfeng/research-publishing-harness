import { expect, it } from 'vitest';

import { assertPackagedXArticleCliHelp } from '../../tools/check-packaged-x-article-cli.js';

const protocol = 'x-article-host-bridge/v3.5';
const route = 'x-article fast-path audit --workspace <path>';

it('rejects packaged CLI help missing the Host protocol marker', () => {
  expect(() => assertPackagedXArticleCliHelp({
    help: route,
    protocol,
    routes: [route]
  })).toThrow(/protocol/i);
});

it('rejects any missing source route', () => {
  expect(() => assertPackagedXArticleCliHelp({
    help: `Host protocol: ${protocol}`,
    protocol,
    routes: [route]
  })).toThrow(/route/i);
});

it('accepts the exact complete source protocol and route surface', () => {
  expect(() => assertPackagedXArticleCliHelp({
    help: `Host protocol: ${protocol}\n${route}`,
    protocol,
    routes: [route]
  })).not.toThrow();
});
