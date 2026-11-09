import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publicPhaserTypes } from './build-rules.mjs';

describe('build rules', () => {
  it('points the Phaser types at the SDK types in the same repository', () => {
    assert.equal(publicPhaserTypes("import type { SBPlay } from '@superbox-play/sdk';"), "import type { SBPlay } from '../../../sdk/dist/types/index.js';");
  });
});
