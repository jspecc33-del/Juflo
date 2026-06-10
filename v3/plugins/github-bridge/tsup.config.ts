/**
 * tsup Configuration for GitHub Bridge Plugin
 *
 * Single entry point, dual ESM/CJS output with type declarations.
 */

import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

const banner = `/**
 * @claude-flow/plugin-github-bridge v${pkg.version}
 * Live GitHub API integration via Octokit
 * @license MIT
 */`;

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  treeshake: true,
  minify: false,
  clean: true,
  sourcemap: true,
  target: 'node20',
  platform: 'node',
  banner: {
    js: banner,
  },
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
  external: ['@octokit/rest', 'zod', 'zod-to-json-schema'],
});
