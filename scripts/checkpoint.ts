// Write a progress checkpoint: rug_royale_internal/progress/checkpoints/<timestamp>-<slug>.md
//
//   pnpm checkpoint <slug> [--verify]
//
// Captures git state since the previous checkpoint and, with --verify, the
// anchor build / Rust test / TS test results. The "Summary", "Decisions",
// and "Next" sections are left for the author (human or Claude) to fill in.
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "rug_royale_internal/progress/checkpoints");

const args = process.argv.slice(2);
const verify = args.includes("--verify");
const slug = args
  .filter((a) => !a.startsWith("--"))
  .join("-")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
if (!slug) {
  console.error("usage: pnpm checkpoint <slug> [--verify]");
  process.exit(1);
}

const sh = (cmd: string) => {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
};

// Runs a verification step and returns a one-line result plus the output tail.
const check = (label: string, cmd: string) => {
  try {
    const out = execSync(`${cmd} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { line: `- ${label}: PASS`, tail: tail(out) };
  } catch (e: any) {
    return {
      line: `- ${label}: FAIL`,
      tail: tail(`${e.stdout ?? ""}${e.stderr ?? ""}`),
    };
  }
};
const tail = (s: string) => s.trim().split("\n").slice(-8).join("\n");

mkdirSync(DIR, { recursive: true });
const previous = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .pop();
// Checkpoints live in the private rug_royale_internal repo, so the baseline for "since last
// checkpoint" is the code-repo HEAD recorded in the previous checkpoint's "Branch / HEAD" line.
const prevHead = previous
  ? readFileSync(path.join(DIR, previous), "utf8").match(
      /\*\*Branch \/ HEAD:\*\* `[^`]*` \/ ([0-9a-f]{7,40})/
    )?.[1]
  : undefined;
const base = prevHead
  ? sh(`git rev-parse --verify --quiet ${prevHead}^{commit}`)
  : "";
const range = base ? `${base}..HEAD` : "HEAD";

const now = new Date();
const stamp = now
  .toISOString()
  .slice(0, 16)
  .replace(/[-:]/g, "")
  .replace("T", "-");
const file = path.join(DIR, `${stamp}-${slug}.md`);
if (existsSync(file)) {
  console.error(`exists: ${file}`);
  process.exit(1);
}

const branch = sh("git rev-parse --abbrev-ref HEAD") || "(no commits)";
const head = sh("git log -1 --format='%h %s'") || "(no commits)";
const author = sh("git config user.name") || "unknown";
const commits = sh(`git log --format='- %h %s (%an)' ${range}`) || "- none";
const dirty = sh("git status --short") || "clean";

let verification =
  "_Not run. Use `pnpm checkpoint <slug> --verify` to record build and test results._";
if (verify) {
  const results = [
    check("anchor build", "anchor build"),
    check("cargo test", "cargo test -p rug_royale"),
    check("ts tests", "pnpm -s test:ts"),
  ];
  verification = results
    .map((r) => `${r.line}\n\n\`\`\`\n${r.tail}\n\`\`\``)
    .join("\n\n");
}

const body = `# Checkpoint: ${slug}

- **When:** ${now.toISOString()}
- **Who:** ${author}
- **Branch / HEAD:** \`${branch}\` / ${head}
- **Previous checkpoint:** ${previous ?? "none"}

## Summary

<!-- What changed and why, in 2-5 bullets. -->

## Decisions

<!-- Decisions made since the last checkpoint, with PRD section refs. "None" is fine. -->

## Next

<!-- The next 1-3 concrete tasks, with owner and PRD section. -->

## Commits since previous checkpoint

${commits}

## Working tree

\`\`\`
${dirty}
\`\`\`

## Verification

${verification}
`;

writeFileSync(file, body);
console.log(path.relative(ROOT, file));
