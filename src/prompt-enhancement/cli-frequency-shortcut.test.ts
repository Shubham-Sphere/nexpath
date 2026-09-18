import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1,
  PROMPT_ENHANCEMENT_FREQUENCY_SHORTCUT_KEY_V1,
  buildPromptEnhancementFrequencyChooserStateV1,
  isPromptEnhancementFrequencyShortcutKeyV1,
  promptEnhancementFrequencyHintV1,
  promptEnhancementFrequencyLabelV1,
  reducePromptEnhancementFrequencyChooserV1,
  renderPromptEnhancementFrequencyChooserFrameV1,
  runPromptEnhancementFrequencyChooserV1,
  type PromptEnhancementFrequencyControlV1,
  type PromptEnhancementFrequencyLevelV1,
} from './cli-frequency-shortcut.js';
import {
  PROMPT_ENHANCEMENT_CLI_FOOTER_V1,
  renderPromptEnhancementPopupFrameV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';
import type { PromptEnhancementPopupRenderModelV1 } from './popup-render-model.js';

const ESC = String.fromCharCode(27);
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const ENTER = String.fromCharCode(13);
const CTRL_C = String.fromCharCode(3);

/** A control backed by a plain variable — the store side is the CLI host's, not the popup's. */
function fakeControl(initial?: string): PromptEnhancementFrequencyControlV1 & { saved: string[] } {
  const saved: string[] = [];
  let value = initial;
  return {
    saved,
    read: () => value,
    write: (level) => { saved.push(level); value = level; },
  };
}

/** Drive the chooser with a fixed key script; extra reads reject so a runaway loop fails loudly. */
function keyScript(keys: readonly string[]): () => Promise<string> {
  let index = 0;
  return async () => {
    if (index >= keys.length) throw new Error('the chooser read past the end of the key script');
    return keys[index++]!;
  };
}

describe('PE popup Ctrl+T — the shortcut key', () => {
  it('is Ctrl+T, and nothing else', () => {
    expect(PROMPT_ENHANCEMENT_FREQUENCY_SHORTCUT_KEY_V1).toBe(String.fromCharCode(20));
    expect(isPromptEnhancementFrequencyShortcutKeyV1(String.fromCharCode(20))).toBe(true);
    // The keys the popup itself uses must never be mistaken for it — Ctrl+J (newline in the editor),
    // Ctrl+C (close), Enter, Esc, Space, a plain 't', and an uppercase 'T'.
    for (const other of [String.fromCharCode(10), CTRL_C, ENTER, ESC, ' ', 't', 'T', UP, DOWN, '']) {
      expect(isPromptEnhancementFrequencyShortcutKeyV1(other), other).toBe(false);
    }
  });
});

describe('PE popup Ctrl+T — level names', () => {
  it('names the three popup levels the way the install picker does', () => {
    expect(promptEnhancementFrequencyLabelV1('optimum')).toBe('High');
    expect(promptEnhancementFrequencyLabelV1('every_event')).toBe('Medium');
    expect(promptEnhancementFrequencyLabelV1('major_only')).toBe('Low');
  });

  it('names the two CLI-only levels as themselves — never as one of the three rows', () => {
    // A user who ran `nexpath config set advisory_frequency off` must not be told "High".
    expect(promptEnhancementFrequencyLabelV1('once_per_session')).toBe('Once per session');
    expect(promptEnhancementFrequencyLabelV1('off')).toBe('Off');
  });

  it('has no name for an unset or unrecognised value, and the hint then stays generic', () => {
    expect(promptEnhancementFrequencyLabelV1(undefined)).toBeUndefined();
    expect(promptEnhancementFrequencyLabelV1('')).toBeUndefined();
    expect(promptEnhancementFrequencyLabelV1('turbo')).toBeUndefined();
    expect(promptEnhancementFrequencyHintV1(undefined)).toBe('Ctrl+T frequency');
    expect(promptEnhancementFrequencyHintV1('turbo')).toBe('Ctrl+T frequency');
  });

  it('the hint names the configured level, which is what confirms a save', () => {
    expect(promptEnhancementFrequencyHintV1('optimum')).toBe('Ctrl+T frequency: High');
    expect(promptEnhancementFrequencyHintV1('major_only')).toBe('Ctrl+T frequency: Low');
    expect(promptEnhancementFrequencyHintV1('off')).toBe('Ctrl+T frequency: Off');
  });
});

describe('PE popup Ctrl+T — chooser state and reducer', () => {
  it('opens focused on the configured level', () => {
    expect(buildPromptEnhancementFrequencyChooserStateV1('every_event').focusIndex).toBe(1);
    expect(buildPromptEnhancementFrequencyChooserStateV1('major_only').focusIndex).toBe(2);
    expect(buildPromptEnhancementFrequencyChooserStateV1('optimum').focusIndex).toBe(0);
  });

  it('falls back to the first row when the configured level has no row (unset, or CLI-only)', () => {
    for (const value of [undefined, '', 'off', 'once_per_session']) {
      const state = buildPromptEnhancementFrequencyChooserStateV1(value);
      expect(state.focusIndex, String(value)).toBe(0);
      // …and it still remembers what is configured, so no row is falsely marked "(current)".
      expect(state.current).toBe(value);
    }
  });

  it('arrows move one row and stop at both ends', () => {
    let state = buildPromptEnhancementFrequencyChooserStateV1('optimum');
    state = reducePromptEnhancementFrequencyChooserV1(state, UP).state;
    expect(state.focusIndex, 'up at the top must not wrap or go negative').toBe(0);
    state = reducePromptEnhancementFrequencyChooserV1(state, DOWN).state;
    expect(state.focusIndex).toBe(1);
    state = reducePromptEnhancementFrequencyChooserV1(state, DOWN).state;
    state = reducePromptEnhancementFrequencyChooserV1(state, DOWN).state;
    expect(state.focusIndex, 'down at the bottom must not run past the last row').toBe(2);
    expect(reducePromptEnhancementFrequencyChooserV1(state, DOWN).result).toEqual({ kind: 'pending' });
  });

  it('Enter chooses the FOCUSED level, not the current one', () => {
    const state = buildPromptEnhancementFrequencyChooserStateV1('optimum');
    const moved = reducePromptEnhancementFrequencyChooserV1(state, DOWN).state;
    expect(reducePromptEnhancementFrequencyChooserV1(moved, ENTER).result).toEqual({ kind: 'chosen', level: 'every_event' });
    // …and from the unmoved state it chooses the row the focus actually sits on.
    expect(reducePromptEnhancementFrequencyChooserV1(state, ENTER).result).toEqual({ kind: 'chosen', level: 'optimum' });
  });

  it('Esc dismisses, and every other key is swallowed rather than reaching the popup underneath', () => {
    const state = buildPromptEnhancementFrequencyChooserStateV1('optimum');
    expect(reducePromptEnhancementFrequencyChooserV1(state, ESC).result).toEqual({ kind: 'dismiss' });
    // Space types into the popup's body field — while the chooser is open it must do nothing at all.
    for (const key of [' ', 'x', String.fromCharCode(10), `${ESC}[C`]) {
      const stepped = reducePromptEnhancementFrequencyChooserV1(state, key);
      expect(stepped.result, key).toEqual({ kind: 'pending' });
      expect(stepped.state.focusIndex, key).toBe(state.focusIndex);
    }
  });
});

describe('PE popup Ctrl+T — the chooser frame', () => {
  it('lists the three levels, marks the configured one, and shows only the focused row help', () => {
    const state = buildPromptEnhancementFrequencyChooserStateV1('major_only');
    const frame = renderPromptEnhancementFrequencyChooserFrameV1(state);
    expect(frame).toContain('High');
    expect(frame).toContain('Medium');
    expect(frame).toContain('Low (current)');
    expect(frame).toContain(PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1[2]!.help);
    expect(frame).not.toContain(PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1[0]!.help);
    // The focused row is the one carrying the filled bullet.
    const focusedLine = frame.split('\n').find((line) => line.includes('●'));
    expect(focusedLine).toContain('Low');
    expect(frame).toContain('Enter save');
    expect(frame).toContain('Esc back');
  });

  it('marks no row current when the configured level is CLI-only', () => {
    const frame = renderPromptEnhancementFrequencyChooserFrameV1(buildPromptEnhancementFrequencyChooserStateV1('off'));
    expect(frame).not.toContain('(current)');
  });

  it('never leaks the hidden levels as choices', () => {
    const frame = renderPromptEnhancementFrequencyChooserFrameV1(buildPromptEnhancementFrequencyChooserStateV1('optimum'));
    expect(frame).not.toContain('Once per session');
    expect(frame.toLowerCase()).not.toContain('disable all advisories');
  });
});

describe('PE popup Ctrl+T — the run loop', () => {
  it('saves the chosen level and reports it', async () => {
    const control = fakeControl('optimum');
    const painted: string[] = [];
    const outcome = await runPromptEnhancementFrequencyChooserV1({
      control,
      readKey: keyScript([DOWN, DOWN, ENTER]),
      paint: (frame) => painted.push(frame),
    });
    expect(outcome).toEqual({ kind: 'saved', level: 'major_only' });
    expect(control.saved).toEqual(['major_only']);
    // It repainted on open and after each move — a chooser that never paints is invisible.
    expect(painted.length).toBe(3);
    expect(painted[0]).toContain('High (current)');
  });

  it('Esc leaves the configured level untouched', async () => {
    const control = fakeControl('every_event');
    const outcome = await runPromptEnhancementFrequencyChooserV1({
      control,
      readKey: keyScript([DOWN, ESC]),
      paint: () => {},
    });
    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(control.saved, 'moving the focus must not write anything by itself').toEqual([]);
  });

  it('Ctrl+C closes the chooser only — it never writes, and never reports a save', async () => {
    const control = fakeControl('optimum');
    const outcome = await runPromptEnhancementFrequencyChooserV1({
      control,
      readKey: keyScript([CTRL_C]),
      paint: () => {},
    });
    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(control.saved).toEqual([]);
  });

  it('a failed write is reported, not thrown — the popup behind it must survive a locked store', async () => {
    const control: PromptEnhancementFrequencyControlV1 = {
      read: () => 'optimum',
      write: () => { throw new Error('database is locked'); },
    };
    const outcome = await runPromptEnhancementFrequencyChooserV1({
      control,
      readKey: keyScript([DOWN, ENTER]),
      paint: () => {},
    });
    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' && outcome.reason).toContain('database is locked');
  });

  it('a failed READ still opens the chooser, with nothing marked current', async () => {
    const saved: string[] = [];
    const control: PromptEnhancementFrequencyControlV1 = {
      read: () => { throw new Error('config read failed'); },
      write: (level) => { saved.push(level); },
    };
    const painted: string[] = [];
    const outcome = await runPromptEnhancementFrequencyChooserV1({
      control,
      readKey: keyScript([ENTER]),
      paint: (frame) => painted.push(frame),
    });
    expect(painted[0]).not.toContain('(current)');
    expect(outcome).toEqual({ kind: 'saved', level: 'optimum' });
    expect(saved).toEqual(['optimum']);
  });

  it('colorize reaches the frame (the live popup renders in colour, the tests do not)', async () => {
    const painted: string[] = [];
    await runPromptEnhancementFrequencyChooserV1({
      control: fakeControl('optimum'),
      readKey: keyScript([ESC]),
      paint: (frame) => painted.push(frame),
      colorize: true,
    });
    expect(painted[0]).toContain(ESC);
  });
});

describe('PE popup Ctrl+T — the footer hint', () => {
  function view(): PromptEnhancementCliPopupViewV1 {
    const model = {
      title: 'Nexpath · Prompt enhancement',
      editorHeading: 'Use enhanced prompt',
      identity: { enhancementId: 'e1', currentBodyId: 'b1', bodyRevision: 1, validationDecisionId: 'v1' },
      body: { editable: true },
      publicCopy: { trustCues: [] },
      controls: {
        additionalDetails: { availability: 'available' },
        directional: [],
        feedback: { availability: 'available', label: 'Feedback' },
        original: { availability: 'available' },
      },
    } as unknown as PromptEnhancementPopupRenderModelV1;
    return { model, editedBodyText: 'BODY', additionalDetailsText: '' };
  }

  it('is absent by default — a surface that cannot act on Ctrl+T must not advertise it', () => {
    const frame = renderPromptEnhancementPopupFrameV1(view(), { focusIndex: 0, helpExpanded: false });
    expect(frame).toContain(PROMPT_ENHANCEMENT_CLI_FOOTER_V1);
    expect(frame).not.toContain('Ctrl+T');
  });

  it('is appended to the footer line, leaving the existing footer text intact', () => {
    const frame = renderPromptEnhancementPopupFrameV1(
      view(),
      { focusIndex: 0, helpExpanded: false, frequencyHint: promptEnhancementFrequencyHintV1('optimum') },
    );
    const footerLine = frame.split('\n').find((line) => line.includes(PROMPT_ENHANCEMENT_CLI_FOOTER_V1));
    expect(footerLine).toContain('Ctrl+T frequency: High');
    // One line, not two — the frame height is measured against a probe render and must not shift.
    expect(frame.split('\n').length).toBe(
      renderPromptEnhancementPopupFrameV1(view(), { focusIndex: 0, helpExpanded: false }).split('\n').length,
    );
  });
});

describe('PE popup Ctrl+T — wiring', () => {
  const sourceOf = (...parts: string[]): string => readFileSync(join(__dirname, '..', ...parts), 'utf8');

  it('the popup shell opens the chooser on the shortcut and forwards the control', () => {
    // The raw-TTY shell cannot be unit-tested (it needs a real console), so this pins the four lines
    // that connect the tested pieces to it. Remove any of them and Ctrl+T silently does nothing.
    const shell = sourceOf('prompt-enhancement', 'cli-submit-popup.ts');
    expect(shell).toContain('createPromptEnhancementCliPopupInteractionV1(input.onFirstRender, input.frequencyControl)');
    expect(shell).toContain('isPromptEnhancementFrequencyShortcutKeyV1(raw)');
    expect(shell).toContain('runPromptEnhancementFrequencyChooserV1({');
    expect(shell).toContain('frequencyHint: frequencyHint()');
  });

  it('the shared key decoder stays unaware of Ctrl+T, so the browser panel is untouched', () => {
    // `decodePromptEnhancementCliKeyV1` and the interaction reducer also drive the browser, which has
    // no store and no chooser. Ctrl+T is handled in the terminal shell's key loop, beside Ctrl+C.
    const shell = sourceOf('prompt-enhancement', 'cli-submit-popup.ts');
    const decoder = shell.slice(shell.indexOf('export function decodePromptEnhancementCliKeyV1'));
    const decoderBody = decoder.slice(0, decoder.indexOf('export interface'));
    expect(decoderBody).not.toContain('u0014');
    expect(decoderBody.toLowerCase()).not.toContain('frequency');
  });

  it('every CLI host that opens the popup supplies a control', () => {
    // Three surfaces render the PE popup: the UserPromptSubmit hook's direct TTY, the Stop hook's
    // direct TTY, and the spawned popup window. A host that forgets this shows no Ctrl+T at all.
    for (const host of [
      ['cli', 'commands', 'auto.ts'],
      ['cli', 'commands', 'stop.ts'],
      ['cli', 'commands', 'prompt-enhancement-popup-host.ts'],
    ]) {
      const source = sourceOf(...host);
      expect(source, host.join('/')).toContain('frequencyControl: buildPromptEnhancementFrequencyControlV1(');
    }
  });
});

describe('PE popup Ctrl+T — bundling', () => {
  it('the chooser imports no store, so the browser bundle stays free of sql.js', () => {
    // `cli-submit-popup.ts` is imported by the browser's PE host, and it imports this file. The store
    // side deliberately lives in `cli/shared/pe-frequency-control.ts`, which only the CLI hosts import.
    const source = readFileSync(join(__dirname, 'cli-frequency-shortcut.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    expect(imports, 'this module must stay dependency-free').toEqual([]);
    // …and no back door: no dynamic import, no require, no re-export of another module.
    expect(source).not.toMatch(/require\s*\(|import\s*\(|^\s*export\s+\*/m);
  });
});
