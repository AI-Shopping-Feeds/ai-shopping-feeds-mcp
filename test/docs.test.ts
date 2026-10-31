import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function textFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (['node_modules', 'dist', '.git'].includes(name)) return [];
    if (statSync(join(root, path)).isDirectory()) return textFiles(path);
    return /\.(md|ts|mjs|json|yml)$/.test(name) && name !== 'package-lock.json' ? [path] : [];
  });
}

describe('agent skill', () => {
  const skill = read('skills/ai-shopping-feeds/SKILL.md');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';

  it('has valid Agent Skills frontmatter', () => {
    expect(frontmatter).toMatch(/^name: ai-shopping-feeds$/m);
    const description = frontmatter.match(/^description: (.+)$/m)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it('only mentions tools that exist', () => {
    const known = new Set([...read('docs/tools.md').matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]));
    const groups = new Set([...known].map((name) => name.split('_')[0]));
    const mentioned = [...skill.matchAll(/`([a-z]+_[a-z_*]+)`/g)].map((match) => match[1]);
    const unknown = mentioned.filter((name) => {
      if (name.endsWith('_*')) return !groups.has(name.slice(0, -2));
      return groups.has(name.split('_')[0]) && !known.has(name);
    });
    expect(unknown).toEqual([]);
  });
});

describe('repository text', () => {
  it('uses no star or sparkle glyphs', () => {
    const offenders = textFiles('.').filter((path) => /[\u2605\u2606\u2728]/u.test(read(path)));
    expect(offenders.map((path) => relative(root, join(root, path)))).toEqual([]);
  });
});
