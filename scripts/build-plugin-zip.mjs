#!/usr/bin/env node
// Builds the ZIP that the OpenAI plugin portal takes. It holds only the
// portable package; the Claude directory reads the plugin/ folder from GitHub.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = join(root, 'plugin');
const { name, version } = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
const outDir = join(root, 'dist-plugin');
const output = join(outDir, `${name}-${version}.zip`);

mkdirSync(outDir, { recursive: true });
rmSync(output, { force: true });
execFileSync('zip', ['-r', '-q', '-X', output, 'plugin.json', 'mcp.json', 'skills', 'assets', 'README.md', 'LICENSE'], {
  cwd: pluginDir,
  stdio: 'inherit'
});
console.log(output);
