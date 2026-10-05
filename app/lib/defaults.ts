// PRD §5 defaults, shown when Config isn't on devnet yet so the create form still renders.
const U = 1_000_000n;
export const DEFAULT_TIERS = [1_000n * U, 10_000n * U, 100_000n * U];
export const DEFAULT_WINDOWS = [120, 300, 600, 900];
export const DEFAULT_MAX_ENTRY = 1_000_000_000n;
export const DEFAULT_RAKE_BPS = 250;

export const JOIN_DEADLINES = [
  { label: "10 min", secs: 600 },
  { label: "1 hour", secs: 3_600 },
  { label: "6 hours", secs: 21_600 },
  { label: "24 hours", secs: 86_000 }, // just under the 86,400 s cap so clock skew can't trip DeadlineTooFar
];
