# promptfoo Eval Builder

A desktop app, built with [Wails](https://wails.io/), for writing [promptfoo](https://www.promptfoo.dev/) eval
configs (`promptfooconfig.yaml`) with forms instead of editing YAML by hand.

- **Examples**: load a ready-made config: a quick start, structured JSON output, and four built on Improving's EDD kit
  (see below).
- **Prompts**: write prompt templates. `{{variables}}` are detected automatically.
- **Providers**: pick a model from suggestions or enter any promptfoo provider ID, plus config such as `temperature`.
- **Test cases**: every detected prompt variable gets an input. Add assertions from a grouped catalog (text match,
  structure, model-graded, code, metrics), with a short hint per type, a negate toggle (`not-` prefix), threshold,
  weight and metric name.
- **Test files**: list entries such as `file://suite.yaml` that load more tests from a file.
- **Defaults for all tests**: `defaultTest` vars and assertions, e.g. latency or cost limits, and the grader provider
  (`options.provider`) for model-graded assertions.
- **Advanced**: keeps any top-level keys the form doesn't model (`evaluateOptions`, `env`, `scenarios`, …), and
  imports an existing config from pasted YAML.
- **Run**: saves the config and runs `promptfoo eval` next to it, streaming the output. It uses the folder's installed
  promptfoo if there is one, then the app's own copy, and `npx promptfoo@latest` otherwise. **No cache** (on by default) adds `--no-cache`. You can
  also open the promptfoo results viewer.

## Node.js and promptfoo

promptfoo needs Node.js 22.22 or later. At startup the app adds your login shell's `PATH` and common install folders
(Homebrew, `/usr/local/bin`, Volta), because apps opened from Finder or the Dock get only a minimal system `PATH`.

If Node.js still isn't found, or is too old, **Run** offers to download the current LTS from nodejs.org, checked against
its published SHA-256 sums. The first run also installs promptfoo once. Both go into the app's data folder
(`~/Library/Application Support/promptfoo-eval-builder` on macOS), need no admin rights, and are only used by this app.
The Run page shows what's in use and has buttons to install or update them.

## Improving's EDD kit

[improving/promptfoo](https://github.com/improving/promptfoo) is an Evaluation Driven Development kit: Node scripts
that run CLI coding agents (Devin, Claude Code, GitHub Copilot, Google Antigravity, Kiro) or a local Ollama model as
promptfoo `exec:` providers. Each script also works as a grader, so a provider's label can be picked as the grader.

- **Providers** has an **Add CLI agent (Improving kit)** menu with a preset for each script.
- `javascript` assertions take a **Config** (`context.config`), e.g. `schemaPath` for the kit's `matchSchema-script.js`.
- When a config references kit files, **Run** offers to download the missing ones from the kit's `main` branch into the
  config's folder (existing files are never overwritten), and to run `npm install` for the kit's pinned promptfoo and
  `ajv`.

You need the matching CLI installed and signed in. Examples and presets live in `internal/examples/configs` and
`frontend/src/catalog.ts`.

A live YAML preview updates as you edit, and a checklist flags common mistakes (a test missing a prompt variable,
`latency` without a threshold, and so on). Open and save regular YAML files, so you can switch between the app and a
text editor.

## Ollama

Configs that run on [Ollama](https://ollama.com), through promptfoo's `ollama:` providers or graders or the kit's
`ollama.js`, need an Ollama server. The Run page checks the server the config points at (`OLLAMA_BASE_URL`, or the
script's `host` and `port`) and says what's missing:

- **Not installed**: install steps for macOS, Windows and Linux, starting with this computer's, with copyable commands.
- **Installed but not running**: how to start the server.
- **Model not downloaded**: a button that runs `ollama pull` for the config's models.

**Run** stops with the same instructions instead of failing every test with a connection error or a 404.

## Value formats

- List assertions (`contains-any`, `icontains-all`, …) take one value per line.
- A variable or assertion value written as a JSON array or object, e.g. `["Paris", "Lyon"]`, is written as structured
  YAML. promptfoo runs a test once for each item in an array variable.
- Provider config values are typed: `0.2` becomes a number and `true` a boolean.

Configs that use features the form doesn't model (for example `tests: file://tests.csv`, or a provider with
`transform`) still load. Those sections show up in **Advanced** and are written back unchanged.

## Prerequisites

- Go 1.25 or later
- Node.js 20.19 or later for the frontend build (Vite 7). The built app finds or installs its own Node.js for running promptfoo
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Platform dependencies, which `wails doctor` reports. On Ubuntu 24.04:
  `sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev`

## Development

```bash
wails dev            # add -tags webkit2_41 on Linux distributions that ship webkit2gtk-4.1
```

This runs the app with hot reload. The frontend is also served at http://localhost:34115, where the Go bindings can
be called from browser devtools.

## Build

```bash
wails build          # add -tags webkit2_41 on Linux distributions that ship webkit2gtk-4.1
```

The binary is written to `build/bin/`.

## Tests

```bash
go test ./internal/...
KIT_LIVE=1 go test -run TestInstallLive ./internal/kit   # downloads the kit from GitHub
TOOLCHAIN_LIVE=1 go test -run TestInstallNodeLive ./internal/toolchain   # downloads Node.js
```

## Layout

| Path                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `internal/evalconfig`   | Form model and conversion to and from promptfoo YAML              |
| `internal/examples`     | Bundled example configs shown on the Examples page                |
| `internal/kit`          | Downloads Improving's EDD kit files next to a config              |
| `internal/ollama`       | Checks that the Ollama server and models a config uses are ready  |
| `internal/promptfile`   | Finds and reads files a prompt refers to                          |
| `internal/toolchain`    | Finds, or installs, Node.js and promptfoo                         |
| `app.go`                | Methods bound to the frontend: file dialogs, save, run eval      |
| `frontend/src`          | React + TypeScript UI                                             |
| `frontend/src/catalog.ts` | Assertion types and provider suggestions shown in the UI        |
| `frontend/wailsjs`      | Bindings generated by Wails (`wails generate module`)             |
