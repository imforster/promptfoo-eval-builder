import type { AgentCLIStatus } from "./types";

export const cliProblems = (list: AgentCLIStatus[]) => list.filter((s) => s.problem !== "");

// Install commands that are the same on every platform.
const INSTALL: Record<string, string> = {
  copilot: "npm install -g @github/copilot",
  claude: "npm install -g @anthropic-ai/claude-code",
};

// `copilot` and `claude` open a sign-in the first time they run.
const SIGN_IN: Record<string, string> = {
  copilot: "Run copilot once in a terminal and sign in with /login.",
  claude: "Run claude once in a terminal and sign in.",
};

export function cliProblemText(s: AgentCLIStatus): string {
  const lines: string[] = [];
  if (s.problem === "installer-stub") {
    lines.push(
      `${s.name} isn't installed: "${s.command}" on PATH (${s.path}) is only a launcher that offers to install it, so every test would fail.`,
    );
  } else {
    lines.push(`${s.name} isn't installed: "${s.command}" isn't on PATH.`);
  }
  const install = INSTALL[s.command];
  if (install) lines.push(`Install it with: ${install}`);
  if (s.command === "copilot") lines.push("On Windows you can also use: winget install GitHub.Copilot");
  if (!install) lines.push(`Install the ${s.name} CLI and make sure "${s.command}" is on PATH.`);
  const signIn = SIGN_IN[s.command];
  lines.push(signIn ?? `Sign in to ${s.name} in a terminal before running.`);
  lines.push("Then restart this app so it sees the new PATH.");
  return lines.join("\n");
}

/** Log text for a run that is stopped because agent CLIs are missing. */
export const cliHelpText = (list: AgentCLIStatus[]) =>
  ["Not run: this config uses CLI agents that aren't ready.", "", list.map(cliProblemText).join("\n\n")].join("\n");

export function AgentCLINotice(props: { problems: AgentCLIStatus[]; onCheck: () => void }) {
  return (
    <div className="notice warn">
      <strong>CLI agents not ready</strong>
      {props.problems.map((s) => (
        <p key={s.command}>
          {cliProblemText(s)
            .split("\n")
            .map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
        </p>
      ))}
      <div className="run-actions">
        <button onClick={props.onCheck}>Check again</button>
      </div>
    </div>
  );
}
