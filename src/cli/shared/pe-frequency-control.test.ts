import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, closeStore, type Store } from '../../store/db.js';
import { getConfig, setConfig } from '../../store/config.js';
import { ConfigValidationError } from '../../config/prompt-enhancement-errors.js';
import { buildPromptEnhancementFrequencyControlV1 } from './pe-frequency-control.js';

const PROJECT = '/tmp/project-a';
const OTHER_PROJECT = '/tmp/project-b';

const opened: { store: Store; path: string }[] = [];

async function store(): Promise<Store> {
  const path = join(tmpdir(), `nexpath-freq-control-${randomUUID()}.db`);
  const opened_ = await openStore(path);
  opened.push({ store: opened_, path });
  return opened_;
}

afterEach(() => {
  while (opened.length > 0) {
    const entry = opened.pop()!;
    try { closeStore(entry.store); } catch { /* already closed */ }
    try { rmSync(entry.path); } catch { /* best-effort */ }
  }
});

describe('PE popup Ctrl+T — the store side', () => {
  it('reads the project-scoped value first, exactly as the pipeline resolves it', async () => {
    const db = await store();
    setConfig(db, 'advisory_frequency', 'every_event');
    setConfig(db, `advisory_frequency:${PROJECT}`, 'major_only');
    expect(buildPromptEnhancementFrequencyControlV1(db, PROJECT).read()).toBe('major_only');
  });

  it('falls back to the global value, then to undefined', async () => {
    const db = await store();
    expect(buildPromptEnhancementFrequencyControlV1(db, PROJECT).read()).toBeUndefined();
    setConfig(db, 'advisory_frequency', 'optimum');
    expect(buildPromptEnhancementFrequencyControlV1(db, PROJECT).read()).toBe('optimum');
  });

  it('writes project-scoped — the global default and other projects are left alone', async () => {
    const db = await store();
    setConfig(db, 'advisory_frequency', 'optimum');
    setConfig(db, `advisory_frequency:${OTHER_PROJECT}`, 'every_event');

    buildPromptEnhancementFrequencyControlV1(db, PROJECT).write('major_only');

    expect(getConfig(db.db, `advisory_frequency:${PROJECT}`)).toBe('major_only');
    expect(getConfig(db.db, 'advisory_frequency'), 'the global default must not move').toBe('optimum');
    expect(getConfig(db.db, `advisory_frequency:${OTHER_PROJECT}`)).toBe('every_event');
  });

  it('a write is visible to the very next read — the footer hint is the user visible confirmation', async () => {
    const db = await store();
    const control = buildPromptEnhancementFrequencyControlV1(db, PROJECT);
    control.write('optimum');
    expect(control.read()).toBe('optimum');
    control.write('every_event');
    expect(control.read()).toBe('every_event');
  });

  it('refuses a value that is not a frequency level', async () => {
    const db = await store();
    const control = buildPromptEnhancementFrequencyControlV1(db, PROJECT);
    // The chooser can only produce the three valid levels; this is the guard that keeps a future
    // caller from writing something the pipeline would silently treat as unset.
    expect(() => control.write('turbo' as never)).toThrow(ConfigValidationError);
    expect(getConfig(db.db, `advisory_frequency:${PROJECT}`)).toBeUndefined();
  });
});
