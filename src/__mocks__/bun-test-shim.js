// bun:test shim for Jest — maps Bun test API to Jest globals.
// Must be CommonJS (.js) so it's evaluated at the right time.

module.exports = {
  describe: globalThis.describe || require('@jest/globals').describe,
  it: globalThis.it || require('@jest/globals').it,
  expect: globalThis.expect || require('@jest/globals').expect,
  beforeEach: globalThis.beforeEach || require('@jest/globals').beforeEach,
  afterEach: globalThis.afterEach || require('@jest/globals').afterEach,
  beforeAll: globalThis.beforeAll || require('@jest/globals').beforeAll,
  afterAll: globalThis.afterAll || require('@jest/globals').afterAll,
  mock: globalThis.jest ? globalThis.jest.fn : require('@jest/globals').jest.fn,
  jest: globalThis.jest || require('@jest/globals').jest,
};
