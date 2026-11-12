import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const plugin = join(root, 'plugin');
const read = (path: string) => readFileSync(join(plugin, path), 'utf8');
const json = (path: string) => JSON.parse(read(path));

const MCP_URL = 'https://app.aishoppingfeeds.com/api/v1/mcp';

function allFiles(dir = plugin): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? allFiles(path) : [path];
  });
}

describe('directory plugin', () => {
  const openai = json('plugin.json');
  const claude = json('.claude-plugin/plugin.json');
  const listing = openai.extensions['com.openai'].interface;

  it('keeps both manifests and the package version in step', () => {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(openai.version).toBe(version);
    expect(claude.version).toBe(version);
    expect(openai.name).toBe(claude.name);
    expect(openai.description).toBe(claude.description);
  });

  it('has a directory-friendly name', () => {
    expect(openai.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(openai.name.length).toBeLessThanOrEqual(64);
    expect(listing.displayName).not.toMatch(/\b(mcp|plugin)\b/i);
  });

  it('stays within the OpenAI listing limits', () => {
    expect(listing.displayName.length).toBeLessThanOrEqual(30);
    expect(listing.shortDescription.length).toBeLessThanOrEqual(30);
    expect(listing.longDescription.length).toBeLessThanOrEqual(4000);
    expect(listing.developerName.length).toBeLessThanOrEqual(80);
    expect(openai.description.length).toBeLessThanOrEqual(4000);
    expect(listing.defaultPrompt.length).toBeLessThanOrEqual(3);
    expect(new Set(listing.defaultPrompt).size).toBe(listing.defaultPrompt.length);
    for (const prompt of listing.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128);
    expect(listing.brandColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
      expect(listing[key]).toMatch(/^https:\/\/[^@]+$/);
    }
  });

  it('uses a supported public category and declares review/publication metadata', () => {
    expect([
      'Business & Operations', 'Communication', 'Creativity', 'Data & Analytics',
      'Developer Tools', 'Education & Research', 'Entertainment', 'Finance',
      'Healthcare', 'Other', 'Productivity', 'Scientific Research', 'Security', 'Travel'
    ]).toContain(listing.category);
    const { review, publication } = openai.extensions['com.openai'];
    expect(review.test_cases.positive).toHaveLength(5);
    expect(review.test_cases.negative).toHaveLength(3);
    for (const entry of review.test_cases.positive) {
      for (const key of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) {
        expect(typeof entry[key]).toBe('string');
        expect(entry[key].trim().length).toBeGreaterThan(0);
      }
    }
    for (const entry of review.test_cases.negative) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(entry.prompt.trim().length).toBeGreaterThan(0);
    }
    expect(review.commerce).toBe(false);
    expect(publication.countries).toEqual([]);
    expect(publication.release_notes.trim().length).toBeGreaterThan(0);
  });

  it('does not advertise pricing in the listing', () => {
    const text = [openai.description, listing.shortDescription, listing.longDescription, ...listing.defaultPrompt].join(' ');
    expect(text).not.toMatch(/\b(free|trial|price|pricing|discount|subscription|upgrade|best|official)\b/i);
  });

  it('points both MCP configs at the hosted server, with no credentials', () => {
    const claudeServer = json('.mcp.json').mcpServers['ai-shopping-feeds'];
    expect(claudeServer).toEqual({ type: 'http', url: MCP_URL });
    const openaiServer = json('mcp.json').mcpServers['ai-shopping-feeds'];
    expect(openaiServer.type).toBe('streamable-http');
    expect(openaiServer.url).toBe(MCP_URL);
    expect(openaiServer.headers).toBeUndefined();
    expect(openaiServer.extensions['com.openai'].auth).toEqual({ type: 'oauth', client: { mode: 'dcr' } });
  });

  it('has square PNG icons meeting the listing and composer size limits', () => {
    for (const key of ['logo', 'composerIcon']) {
      const png = readFileSync(join(plugin, listing[key]));
      const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(width).toBe(height);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(width).toBeGreaterThanOrEqual(key === 'logo' ? 256 : 48);
      expect(png.length).toBeLessThan(5 * 1024 * 1024);
    }
  });

  it('has a README long enough for the Claude directory, and a licence', () => {
    const prose = read('README.md').replace(/```[\s\S]*?```/g, '');
    expect(prose.split(/\s+/).length).toBeGreaterThanOrEqual(40);
    expect(read('LICENSE')).toMatch(/Apache License/);
  });

  it('holds only small, plain files the directories accept', () => {
    for (const file of allFiles()) {
      expect(file).toMatch(/\.(json|md|png|svg)$|LICENSE$/);
      if (!/\.(png|svg)$/.test(file)) expect(statSync(file).size).toBeLessThan(256 * 1024);
    }
  });

  describe('skill', () => {
    const skill = read('skills/ai-shopping-feeds/SKILL.md');

    it('never asks for credentials, codes or payment, or promotes plans', () => {
      expect(skill).not.toMatch(/api[ _-]?key|password|paste|6-digit|\bcode from\b|agent-signup/i);
      expect(skill).not.toMatch(/billing|account_plans|free workspace|\bpaying\b|upgrade/i);
    });

    it('uses provider-neutral wording', () => {
      expect(skill).not.toMatch(/\b(claude|chatgpt|codex|anthropic|openai)\b/i);
    });

    it('only mentions tools the hosted server has', () => {
      const docs = readFileSync(join(root, 'docs/tools.md'), 'utf8');
      const known = new Set([...docs.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]));
      const groups = new Set([...known].map((name) => name.split('_')[0]));
      const mentioned = [...skill.matchAll(/`([a-z]+_[a-z_*]+)`/g)].map((match) => match[1]);
      const unknown = mentioned.filter((name) => {
        if (name.endsWith('_*')) return !groups.has(name.slice(0, -2));
        return groups.has(name.split('_')[0]) && !known.has(name);
      });
      expect(unknown).toEqual([]);
    });
  });

  it('builds an OpenAI ZIP with the portable package only', () => {
    const output = execFileSync(process.execPath, [join(root, 'scripts/build-plugin-zip.mjs')], { encoding: 'utf8' }).trim();
    const entries = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(entries).toEqual(expect.arrayContaining(['plugin.json', 'mcp.json', 'skills/ai-shopping-feeds/SKILL.md', 'assets/logo.png']));
    expect(entries.some((entry) => entry.startsWith('.claude-plugin') || entry === '.mcp.json' || entry === '.app.json')).toBe(false);
    const packaged = JSON.parse(execFileSync('unzip', ['-p', output, 'plugin.json'], { encoding: 'utf8' }));
    expect(packaged).toEqual(openai);
    expect(packaged.apps).toBeUndefined();
    expect(packaged.extensions['com.openai'].apps).toBeUndefined();
  });
});
