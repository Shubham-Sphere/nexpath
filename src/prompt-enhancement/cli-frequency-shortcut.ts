/**
 * Ctrl+T — change the advisory frequency from inside the PE popup.
 *
 * The shortcut used to live in the Decision Session popup (`TtySelectFn`: Ctrl+T → root menu →
 * frequency), which is disabled outright (MPS-7), so nobody could reach it any more. The install
 * picker is hidden too (owner ruling 2026-08-10), so the PE popup is the only surface a user
 * actually sees — this puts the control back there. Restored on owner request, 2026-09-18.
 *
 * Everything here is pure or injected: the reducer and the renderer take state and return state or
 * a string, and the loop below takes `readKey`/`paint`/`control` from its caller. The raw-TTY shell
 * in `cli-submit-popup.ts` is the only thing that knows about a terminal, and the store write is the
 * host's — this file never imports one. That matters: `cli-submit-popup.ts` is bundled for the
 * browser, so a `store/db` import here would drag sql.js into the extension.
 *
 * Deliberately NOT here:
 *   - `once_per_session` and `off`. Both stay valid and honoured by the gate; they are reachable
 *     with `nexpath config set advisory_frequency …`, exactly as in the old DS picker.
 *   - any change to the popup's own key decoding. Ctrl+T is handled beside Ctrl+C in the shell's
 *     key loop, so the shared reducer (which the browser also drives) is untouched.
 */

/** The three levels the popup offers, in the order they are listed. */
export const PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1 = [
  { value: 'optimum',     label: 'High',   help: 'Surface every advisory that qualifies' },
  { value: 'every_event', label: 'Medium', help: 'Fewer advisories — capped per session' },
  { value: 'major_only',  label: 'Low',    help: 'Only major findings' },
] as const;

export type PromptEnhancementFrequencyLevelV1 = typeof PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1[number]['value'];

/** Ctrl+T as the terminal delivers it in raw mode. */
export const PROMPT_ENHANCEMENT_FREQUENCY_SHORTCUT_KEY_V1 = '\u0014' as const;

export function isPromptEnhancementFrequencyShortcutKeyV1(raw: string): boolean {
  return raw === PROMPT_ENHANCEMENT_FREQUENCY_SHORTCUT_KEY_V1;
}

/**
 * Display name for a configured value. The two CLI-only levels get their own names rather than
 * being reported as one of the three rows — the footer must never claim "High" to a user who set
 * `off`. An unset/unknown value has no name; the caller shows no level in that case.
 */
export function promptEnhancementFrequencyLabelV1(value: string | undefined): string | undefined {
  const choice = PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1.find((c) => c.value === value);
  if (choice) return choice.label;
  if (value === 'once_per_session') return 'Once per session';
  if (value === 'off') return 'Off';
  return undefined;
}

/**
 * The PE popup footer's Ctrl+T hint, e.g. `Ctrl+T frequency: High`. The level is shown because it
 * IS the confirmation: Enter in the chooser saves and closes, and the repainted popup then names
 * the level that was stored. Without a readable current value the hint stays generic.
 */
export function promptEnhancementFrequencyHintV1(current: string | undefined): string {
  const label = promptEnhancementFrequencyLabelV1(current);
  return label ? `Ctrl+T frequency: ${label}` : 'Ctrl+T frequency';
}

export interface PromptEnhancementFrequencyChooserStateV1 {
  focusIndex: number;
  /** The value the store holds right now — marked "(current)" and used to place the opening focus. */
  current: string | undefined;
}

/** Open the chooser with focus on the configured level (first row when it is unset or CLI-only). */
export function buildPromptEnhancementFrequencyChooserStateV1(current: string | undefined): PromptEnhancementFrequencyChooserStateV1 {
  const index = PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1.findIndex((c) => c.value === current);
  return { focusIndex: index >= 0 ? index : 0, current };
}

export type PromptEnhancementFrequencyChooserResultV1 =
  | { kind: 'pending' }
  | { kind: 'dismiss' }
  | { kind: 'chosen'; level: PromptEnhancementFrequencyLevelV1 };

/**
 * Reduce one key against the chooser. Arrows move, Enter chooses the focused level, Esc leaves it
 * unchanged. Every other key — including Space, which types into a field in the popup behind it —
 * is ignored rather than being allowed to fall through to the popup.
 */
export function reducePromptEnhancementFrequencyChooserV1(
  state: PromptEnhancementFrequencyChooserStateV1,
  raw: string,
): { state: PromptEnhancementFrequencyChooserStateV1; result: PromptEnhancementFrequencyChooserResultV1 } {
  const last = PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1.length - 1;
  if (raw === '\u001b[A') return { state: { ...state, focusIndex: Math.max(0, state.focusIndex - 1) }, result: { kind: 'pending' } };
  if (raw === '\u001b[B') return { state: { ...state, focusIndex: Math.min(last, state.focusIndex + 1) }, result: { kind: 'pending' } };
  if (raw === '\u001b') return { state, result: { kind: 'dismiss' } };
  if (raw === '\r') {
    const choice = PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1[state.focusIndex];
    if (!choice) return { state, result: { kind: 'pending' } };
    return { state, result: { kind: 'chosen', level: choice.value } };
  }
  return { state, result: { kind: 'pending' } };
}

/**
 * ANSI styles, mirroring the popup's own palette (`PROMPT_ENHANCEMENT_CLI_SGR_V1`). Duplicated
 * rather than imported to keep this module free of a cycle with `cli-submit-popup.ts`, which
 * imports the chooser.
 */
const FREQUENCY_SGR_V1 = (() => {
  const e = String.fromCharCode(27);
  return {
    cyan: `${e}[36m`,
    green: `${e}[32m`,
    gray: `${e}[90m`,
    dim: `${e}[2m`,
    bold: `${e}[1m`,
    reset: `${e}[0m`,
  };
})();

const FREQUENCY_CHOOSER_FOOTER_V1 = '↑↓ move · Enter save · Esc back' as const;

/** Render the chooser: a branded header, the three radio rows with their help, and the footer. */
export function renderPromptEnhancementFrequencyChooserFrameV1(
  state: PromptEnhancementFrequencyChooserStateV1,
  options: { colorize?: boolean } = {},
): string {
  const c = options.colorize ? FREQUENCY_SGR_V1 : null;
  const header = '◆ NEXPATH CLI · Advisory frequency';
  const lines: string[] = [
    c ? `${c.cyan}${c.bold}${header}${c.reset}` : header,
    c ? `${c.dim}${'─'.repeat(header.length)}${c.reset}` : '─'.repeat(header.length),
    '',
    c ? `${c.dim}How often nexpath surfaces advisories in this project.${c.reset}` : 'How often nexpath surfaces advisories in this project.',
    '',
  ];
  PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1.forEach((choice, index) => {
    const focused = index === state.focusIndex;
    const label = choice.value === state.current ? `${choice.label} (current)` : choice.label;
    if (c) {
      const bullet = focused ? `${c.green}●${c.reset}` : `${c.gray}○${c.reset}`;
      lines.push(`${c.cyan}│${c.reset} ${bullet} ${focused ? `${c.bold}${label}${c.reset}` : `${c.dim}${label}${c.reset}`}`);
    } else {
      lines.push(`  ${focused ? '●' : '○'} ${label}`);
    }
    if (focused) lines.push(c ? `      ${c.dim}${choice.help}${c.reset}` : `      ${choice.help}`);
  });
  lines.push('', c ? `${c.dim}${FREQUENCY_CHOOSER_FOOTER_V1}${c.reset}` : FREQUENCY_CHOOSER_FOOTER_V1);
  return lines.join('\n');
}

/**
 * Reading and writing the configured level. The popup never touches a store itself: the CLI hosts
 * own the open store and pass this in. When it is absent, Ctrl+T does nothing at all — which is the
 * case for every non-CLI surface (the browser drives the popup through its own interaction).
 */
export interface PromptEnhancementFrequencyControlV1 {
  /** The configured level, project-scoped first then global, or undefined when unset. */
  read: () => string | undefined;
  /** Persist the chosen level. May throw — the caller treats a throw as "not saved". */
  write: (level: PromptEnhancementFrequencyLevelV1) => void;
}

export type PromptEnhancementFrequencyChooserOutcomeV1 =
  | { kind: 'unchanged' }
  | { kind: 'saved'; level: PromptEnhancementFrequencyLevelV1 }
  | { kind: 'failed'; reason: string };

/**
 * Run the chooser to completion against an injected terminal. Returns when the user saves a level,
 * leaves with Esc, or presses Ctrl+C (which closes the chooser, NOT the popup behind it — losing an
 * enhanced prompt the user has been editing because they wanted to check a setting would be a poor
 * trade). A failed write is reported, never thrown: the popup must survive a locked or read-only
 * store.
 */
export async function runPromptEnhancementFrequencyChooserV1(input: {
  control: PromptEnhancementFrequencyControlV1;
  readKey: () => Promise<string>;
  paint: (frame: string) => void;
  colorize?: boolean;
}): Promise<PromptEnhancementFrequencyChooserOutcomeV1> {
  const CTRL_C = String.fromCharCode(3);
  let current: string | undefined;
  try {
    current = input.control.read();
  } catch {
    current = undefined;
  }
  let state = buildPromptEnhancementFrequencyChooserStateV1(current);
  input.paint(renderPromptEnhancementFrequencyChooserFrameV1(state, { colorize: input.colorize }));
  for (;;) {
    const raw = await input.readKey();
    if (raw === CTRL_C) return { kind: 'unchanged' };
    const stepped = reducePromptEnhancementFrequencyChooserV1(state, raw);
    state = stepped.state;
    if (stepped.result.kind === 'dismiss') return { kind: 'unchanged' };
    if (stepped.result.kind === 'chosen') {
      const level = stepped.result.level;
      try {
        input.control.write(level);
      } catch (error) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
      }
      return { kind: 'saved', level };
    }
    input.paint(renderPromptEnhancementFrequencyChooserFrameV1(state, { colorize: input.colorize }));
  }
}
