import { getConfig } from '../../store/config.js';
import { setAdvisoryFrequency } from './config-setters.js';
import type { Store } from '../../store/db.js';
import type {
  PromptEnhancementFrequencyControlV1,
  PromptEnhancementFrequencyLevelV1,
} from '../../prompt-enhancement/cli-frequency-shortcut.js';

/**
 * The store side of the PE popup's Ctrl+T shortcut (owner request 2026-09-18). The popup itself
 * never opens or imports a store — it is bundled for the browser — so each CLI host hands it this.
 *
 * Scope matches the Decision Session picker this restores, and the pipeline's own lookup order
 * (`auto.ts`: `advisory_frequency:<projectRoot>` ?? `advisory_frequency`): the chooser READS
 * project-scoped-then-global, and WRITES project-scoped. A choice made in one project's popup
 * therefore takes effect immediately for that project and leaves every other project alone —
 * `nexpath config set advisory_frequency <level>` remains the way to move the global default.
 */
export function buildPromptEnhancementFrequencyControlV1(
  store: Store,
  projectRoot: string,
): PromptEnhancementFrequencyControlV1 {
  const projectKey = `advisory_frequency:${projectRoot}`;
  return {
    read: () => getConfig(store.db, projectKey) ?? getConfig(store.db, 'advisory_frequency') ?? undefined,
    // Validated by setAdvisoryFrequency; a throw is reported to the chooser as "not saved" rather
    // than taking the popup down.
    write: (level: PromptEnhancementFrequencyLevelV1) => setAdvisoryFrequency(store, projectKey, level),
  };
}
