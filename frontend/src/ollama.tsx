import { useState, type ReactNode } from "react";
import { ClipboardSetText } from "../wailsjs/runtime/runtime";
import { ExternalLink } from "./components";
import type { OllamaStatus } from "./types";

type Platform = "darwin" | "windows" | "linux";

type Step = { text: ReactNode; plain: string; command?: string; or?: Step };

const DOWNLOAD_URL = "https://ollama.com/download";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "darwin", label: "macOS" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
];

const INSTALL_STEPS: Record<Platform, Step[]> = {
  darwin: [
    {
      text: (
        <>
          Download Ollama for macOS from <ExternalLink href={`${DOWNLOAD_URL}/mac`}>ollama.com/download</ExternalLink>,
          open it and move Ollama to Applications. Open Ollama once: it runs in the menu bar and starts the server.
        </>
      ),
      plain: `Download Ollama for macOS from ${DOWNLOAD_URL}/mac, move it to Applications and open it. It runs in the menu bar and starts the server.`,
      or: {
        text: "Or, with Homebrew, install it and start the server as a background service:",
        plain: "Or, with Homebrew:",
        command: "brew install ollama && brew services start ollama",
      },
    },
  ],
  windows: [
    {
      text: (
        <>
          Download and run <b>OllamaSetup.exe</b> from{" "}
          <ExternalLink href={`${DOWNLOAD_URL}/windows`}>ollama.com/download</ExternalLink>. Ollama starts in the system
          tray and runs the server.
        </>
      ),
      plain: `Download and run OllamaSetup.exe from ${DOWNLOAD_URL}/windows. Ollama starts in the system tray and runs the server.`,
      or: {
        text: "Or install it from PowerShell with winget, then start Ollama from the Start menu:",
        plain: "Or, from PowerShell, then start Ollama from the Start menu:",
        command: "winget install Ollama.Ollama",
      },
    },
  ],
  linux: [
    {
      text: "Run the official install script. It installs Ollama and starts it as a systemd service:",
      plain: "Run the official install script, which installs Ollama and starts it as a systemd service:",
      command: "curl -fsSL https://ollama.com/install.sh | sh",
      or: {
        text: (
          <>
            Other options, such as manual or Docker installs, are on{" "}
            <ExternalLink href={`${DOWNLOAD_URL}/linux`}>ollama.com/download</ExternalLink>.
          </>
        ),
        plain: `Other options are at ${DOWNLOAD_URL}/linux.`,
      },
    },
  ],
};

const START_STEPS: Record<Platform, Step[]> = {
  darwin: [
    {
      text: "Open Ollama from Applications, or, if you installed it with Homebrew, start the service:",
      plain: "Open Ollama from Applications, or with Homebrew:",
      command: "brew services start ollama",
    },
  ],
  windows: [
    {
      text: "Start Ollama from the Start menu, or run the server in a terminal:",
      plain: "Start Ollama from the Start menu, or run:",
      command: "ollama serve",
    },
  ],
  linux: [
    {
      text: "Start the service, or run the server in a terminal with ollama serve:",
      plain: "Start the service (or run `ollama serve`):",
      command: "sudo systemctl start ollama",
    },
  ],
};

export const ollamaReady = (s: OllamaStatus) => !s.used || (s.running && s.missing.length === 0);

/** Whether the app can pull the missing models itself. */
export const canPull = (s: OllamaStatus) => s.running && !s.remote && s.binPath !== "" && s.missing.length > 0;

const toPlatform = (os: string): Platform => (os === "darwin" || os === "windows" ? os : "linux");

const pullCommand = (model: string) => `ollama pull ${model}`;

/** Setup instructions for the log when a run is stopped because Ollama isn't ready. */
export function ollamaHelpText(s: OllamaStatus): string {
  const platform = toPlatform(s.os);
  const label = PLATFORMS.find((p) => p.id === platform)!.label;
  const line = (st: Step, indent: string): string =>
    `${indent}${st.plain}${st.command ? `\n${indent}    ${st.command}` : ""}${st.or ? `\n${line(st.or, indent)}` : ""}`;
  const steps = (list: Step[]) => list.map((st) => line(st, "  "));
  const pulls = s.missing.map((m) => `      ${pullCommand(m)}`);
  if (s.remote && !s.running) {
    return [
      `Not run: this config uses the Ollama server at ${s.baseURL}, which isn't answering.`,
      "Start Ollama on that computer, or fix the provider's host and port.",
    ].join("\n");
  }
  if (!s.installed) {
    return [
      `Not run: this config uses Ollama, which isn't installed on this computer.`,
      "",
      `To install it on ${label}:`,
      ...steps(INSTALL_STEPS[platform]),
      "",
      "Then download the model this config uses:",
      ...pulls,
      "",
      "Instructions for other systems are on the Run page.",
    ].join("\n");
  }
  if (!s.running) {
    return [
      `Not run: Ollama is installed but its server isn't running at ${s.baseURL}.`,
      "",
      ...steps(START_STEPS[platform]),
      ...(pulls.length ? ["", "Then make sure the model is downloaded:", ...pulls] : []),
    ].join("\n");
  }
  return [
    `Not run: Ollama doesn't have ${plural(s.missing.length, "the model", "the models")} this config uses. Download ${plural(s.missing.length, "it", "them")} with:`,
    ...pulls,
  ].join("\n");
}

export function OllamaNotice(props: {
  status: OllamaStatus;
  busy: boolean;
  onCheck: () => void;
  onPull: (models: string[]) => void;
}) {
  const s = props.status;
  const [platform, setPlatform] = useState<Platform>(toPlatform(s.os));
  const ready = ollamaReady(s);
  const models = s.models.map((m) => <code key={m}>{m}</code>);

  let body: ReactNode;
  if (ready) {
    body = (
      <p>
        Running at <code>{s.baseURL}</code> with {joinNodes(models)}.
      </p>
    );
  } else if (s.remote && !s.running) {
    body = (
      <p>
        No Ollama server is answering at <code>{s.baseURL}</code>. Start Ollama on that computer, or fix the provider’s{" "}
        <code>host</code> and <code>port</code>.
      </p>
    );
  } else if (!s.installed) {
    body = (
      <>
        <p>
          This config runs {joinNodes(models)} on Ollama, which isn’t installed on this computer. Install it, then
          download the model{s.models.length > 1 ? "s" : ""}:
        </p>
        <PlatformTabs value={platform} onChange={setPlatform} current={toPlatform(s.os)} />
        <Steps
          steps={[
            ...INSTALL_STEPS[platform],
            ...s.missing.map((m) => ({ text: "Download the model:", plain: "", command: pullCommand(m) })),
          ]}
        />
      </>
    );
  } else if (!s.running) {
    body = (
      <>
        <p>
          Ollama is installed, but its server isn’t running at <code>{s.baseURL}</code>.
        </p>
        <PlatformTabs value={platform} onChange={setPlatform} current={toPlatform(s.os)} />
        <Steps steps={START_STEPS[platform]} />
      </>
    );
  } else {
    body = (
      <>
        <p>
          Ollama is running, but {joinNodes(s.missing.map((m) => <code key={m}>{m}</code>))}{" "}
          {s.missing.length > 1 ? "aren’t" : "isn’t"} downloaded yet. Models are several GB, so this can take a while.
        </p>
        {!canPull(s) && <Steps steps={s.missing.map((m) => ({ text: "", plain: "", command: pullCommand(m) }))} />}
      </>
    );
  }

  return (
    <div className={`notice ollama ${ready ? "" : "warn"}`}>
      <strong>Uses Ollama</strong>
      {body}
      <div className="run-actions">
        {canPull(s) && (
          <button onClick={() => props.onPull(s.missing)} disabled={props.busy}>
            Download {s.missing.length > 1 ? `${s.missing.length} models` : s.missing[0]}
          </button>
        )}
        {!ready && (
          <button onClick={props.onCheck} disabled={props.busy}>
            Check again
          </button>
        )}
      </div>
    </div>
  );
}

function PlatformTabs(props: { value: Platform; current: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="platform-tabs" role="tablist" aria-label="Operating system">
      {PLATFORMS.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={props.value === p.id}
          className={props.value === p.id ? "active" : ""}
          onClick={() => props.onChange(p.id)}
        >
          {p.label}
          {p.id === props.current && <span className="muted"> (this computer)</span>}
        </button>
      ))}
    </div>
  );
}

function Steps(props: { steps: Step[] }) {
  return (
    <ol className="ollama-steps">
      {props.steps.map((st, i) => (
        <li key={i}>
          <StepBody step={st} />
          {st.or && (
            <div className="step-or">
              <StepBody step={st.or} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function StepBody({ step }: { step: Step }) {
  return (
    <>
      {step.text}
      {step.command && <Command command={step.command} />}
    </>
  );
}

function Command(props: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await ClipboardSetText(props.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="command">
      <code>{props.command}</code>
      <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

function joinNodes(nodes: ReactNode[]): ReactNode {
  return nodes.flatMap((n, i) => (i === 0 ? [n] : [i === nodes.length - 1 ? " and " : ", ", n]));
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}
