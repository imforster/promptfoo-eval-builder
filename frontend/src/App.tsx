import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import {
  KIT_PROVIDERS,
  KIT_REPO,
  PROVIDER_CONFIG_KEYS,
  PROVIDER_SUGGESTIONS,
  TEST_OPTION_KEYS,
  assertionInfo,
} from "./catalog";
import {
  AssertionList,
  AutoTextarea,
  ExternalLink,
  Field,
  KVEditor,
  move,
  remove,
  RowActions,
  TestCaseFields,
  update,
} from "./components";
import {
  GRADER_KEY,
  emptyProvider,
  emptyTest,
  getOption,
  promptVars,
  setOption,
  type Config,
  type Example,
  type KitStatus,
  type PromptFile,
  type ToolchainStatus,
  type TestCase,
} from "./types";
import "./App.css";

type Section = "examples" | "overview" | "prompts" | "providers" | "tests" | "defaults" | "advanced" | "run";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "examples", label: "Examples" },
  { id: "overview", label: "Overview" },
  { id: "prompts", label: "Prompts" },
  { id: "providers", label: "Providers" },
  { id: "tests", label: "Test cases" },
  { id: "defaults", label: "Defaults for all tests" },
  { id: "advanced", label: "Advanced" },
  { id: "run", label: "Run" },
];

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [path, setPath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<Section>("examples");
  const [yaml, setYaml] = useState("");
  const [yamlError, setYamlError] = useState("");
  const [status, setStatus] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  // Separate for Run, where the log usually needs the width more than the YAML does.
  const [showRunPreview, setShowRunPreview] = useState(false);

  useEffect(() => {
    api.newConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (!config) return;
    const handle = setTimeout(() => {
      api
        .toYAML(config)
        .then((text) => {
          setYaml(text);
          setYamlError("");
        })
        .catch((e) => setYamlError(String(e)));
    }, 150);
    return () => clearTimeout(handle);
  }, [config]);

  const edit = useCallback((next: Config) => {
    setConfig(next);
    setDirty(true);
  }, []);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus((s) => (s === message ? "" : s)), 3000);
  };

  const confirmDiscard = async () =>
    !dirty || (await api.confirm("Discard unsaved changes?", "Your changes to this config will be lost.", "Discard"));

  const newConfig = async () => {
    if (!(await confirmDiscard())) return;
    setConfig(await api.newConfig());
    setPath("");
    setDirty(false);
    setSection("overview");
  };

  const loadExample = async (ex: Example) => {
    if (!(await confirmDiscard())) return;
    try {
      setConfig(await api.loadExample(ex.id));
      setPath("");
      setDirty(false);
      setSection("overview");
      flash(
        ex.kit ? `Loaded “${ex.title}”. Save it to a folder, then get the kit files on Run.` : `Loaded “${ex.title}”`,
      );
    } catch (e) {
      api.alert("Could not load example", e);
    }
  };

  const open = async () => {
    if (!(await confirmDiscard())) return;
    try {
      const result = await api.openFile();
      if (!result.path) return;
      setConfig(result.config);
      setPath(result.path);
      setDirty(false);
      flash(`Opened ${basename(result.path)}`);
    } catch (e) {
      api.alert("Could not open file", e);
    }
  };

  const save = async (saveAs = false, override?: Config): Promise<string> => {
    const toSave = override ?? config;
    if (!toSave) return "";
    try {
      const written = await api.save(toSave, saveAs ? "" : path);
      if (!written) return "";
      setPath(written);
      setDirty(false);
      flash(`Saved ${basename(written)}`);
      return written;
    } catch (e) {
      api.alert("Could not save", e);
      return "";
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = async () => {
    if (!config) return;
    try {
      await api.copyYAML(config);
      flash("YAML copied to clipboard");
    } catch (e) {
      api.alert("Could not copy YAML", e);
    }
  };

  const promptFiles = usePromptFiles(config?.prompts ?? null, path);
  // promptfoo renders {{vars}} inside file:// prompts too, so count those.
  const vars = useMemo(() => {
    if (!config) return [];
    const fromFiles = promptFiles
      .flat()
      .filter((f) => f.templated && f.content)
      .map((f) => ({ label: "", raw: f.content }));
    return promptVars([...config.prompts, ...fromFiles]);
  }, [config, promptFiles]);
  const runner = useRunner(config, path, dirty, (c?: Config) => save(false, c), edit);
  const warnings = useMemo(() => (config ? validate(config, vars) : []), [config, vars]);

  if (!config) return <div className="loading">Loading…</div>;

  const previewVisible = section === "run" ? showRunPreview : showPreview;
  const togglePreview = () => (section === "run" ? setShowRunPreview : setShowPreview)((v) => !v);

  const counts: Partial<Record<Section, number>> = {
    prompts: config.prompts.length,
    providers: config.providers.length,
    tests: config.tests.length,
    defaults: config.defaultTest.assert.length + config.defaultTest.vars.length + config.defaultTest.options.length,
  };

  return (
    <div className={`app ${previewVisible ? "" : "no-preview"} ${section === "run" ? "running" : ""}`}>
      <header className="toolbar">
        <div className="title">
          <strong>promptfoo Eval Builder</strong>
          <span className="file" title={path}>
            {path ? basename(path) : "Untitled"}
            {dirty && (
              <span className="dirty" aria-label="Unsaved changes">
                {" "}
                •
              </span>
            )}
          </span>
        </div>
        <div className="actions">
          <button onClick={newConfig}>New</button>
          <button onClick={open}>Open…</button>
          <button onClick={() => save(false)} title="Ctrl/Cmd+S">
            Save
          </button>
          <button onClick={() => save(true)} title="Ctrl/Cmd+Shift+S">
            Save as…
          </button>
          <button onClick={copy}>Copy YAML</button>
          <button onClick={togglePreview}>{previewVisible ? "Hide YAML" : "Show YAML"}</button>
          <button
            className="primary"
            onClick={() => {
              setSection("run");
              runner.runEval();
            }}
            disabled={runner.running || runner.kitBusy || yamlError !== ""}
          >
            {runner.running ? "Running…" : "Run eval"}
          </button>
        </div>
      </header>

      <nav className="sidebar">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? "active" : ""} onClick={() => setSection(s.id)}>
            <span>{s.label}</span>
            {counts[s.id] !== undefined && <span className="count">{counts[s.id]}</span>}
            {s.id === "run" && runner.running && <span className="count">running</span>}
          </button>
        ))}
        {warnings.length > 0 && (
          <div className="warnings">
            <strong>Check before running</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <main className="editor">
        {section === "examples" && <Examples onLoad={loadExample} />}
        {section === "overview" && <Overview config={config} edit={edit} />}
        {section === "prompts" && <Prompts config={config} edit={edit} vars={vars} files={promptFiles} path={path} />}
        {section === "providers" && <Providers config={config} edit={edit} />}
        {section === "tests" && <Tests config={config} edit={edit} vars={vars} />}
        {section === "defaults" && <Defaults config={config} edit={edit} />}
        {section === "advanced" && (
          <Advanced
            config={config}
            edit={edit}
            onImport={(c) => {
              edit(c);
              flash("Imported YAML");
            }}
          />
        )}
        {section === "run" && (
          <Run config={config} path={path} dirty={dirty} hasErrors={yamlError !== ""} runner={runner} />
        )}
      </main>

      {previewVisible && (
        <aside className="preview">
          <div className="preview-head">
            <strong>promptfooconfig.yaml</strong>
            <span className="muted">live preview</span>
          </div>
          {yamlError ? <div className="error">{yamlError}</div> : null}
          <pre className={yamlError ? "stale" : ""}>{yaml}</pre>
        </aside>
      )}

      {status && <div className="toast">{status}</div>}
    </div>
  );
}

type SectionProps = { config: Config; edit: (c: Config) => void };

function Examples({ onLoad }: { onLoad: (ex: Example) => void }) {
  const [examples, setExamples] = useState<Example[]>([]);
  useEffect(() => {
    api.listExamples().then(setExamples);
  }, []);
  const groups = [
    { title: "promptfoo basics", kit: false },
    { title: "Improving EDD kit: CLI coding agents", kit: true },
  ];
  return (
    <section>
      <h2>Examples</h2>
      <p className="lead">
        Ready-made configs that show what the builder can do. Loading one replaces the current config; save it to a
        folder to run it.
      </p>
      {groups
        .filter((g) => examples.some((ex) => ex.kit === g.kit))
        .map((g) => (
          <div key={g.title}>
            <h3>{g.title}</h3>
            {g.kit && (
              <p className="muted">
                These use <ExternalLink href={KIT_REPO}>Improving’s promptfoo EDD kit</ExternalLink>: Node scripts that
                drive Devin, Claude Code, GitHub Copilot, Antigravity, Kiro or Ollama as providers and graders. After
                you save, the Run page downloads the scripts into the config’s folder. You need the matching CLI
                installed and signed in.
              </p>
            )}
            <div className="example-grid">
              {examples
                .filter((ex) => ex.kit === g.kit)
                .map((ex) => (
                  <div className="card example" key={ex.id}>
                    <strong>{ex.title}</strong>
                    <p>{ex.summary}</p>
                    <button onClick={() => onLoad(ex)}>Load example</button>
                  </div>
                ))}
            </div>
          </div>
        ))}
    </section>
  );
}

function Overview({ config, edit }: SectionProps) {
  return (
    <section>
      <h2>Overview</h2>
      <p className="lead">
        Build a promptfoo eval step by step: write <b>prompts</b> with <code>{"{{variables}}"}</code>, choose the{" "}
        <b>providers</b> (models) to compare, then add <b>test cases</b> that fill in the variables and assert on the
        output. The YAML on the right updates as you go. New to promptfoo? Start from one of the <b>Examples</b>.
      </p>
      <Field label="Description" hint="Shown in the promptfoo results viewer.">
        <input
          value={config.description}
          placeholder="e.g. Customer support bot – tone and accuracy"
          onChange={(e) => edit({ ...config, description: e.target.value })}
        />
      </Field>
      <Field
        label="Output path (optional)"
        hint="Write results to a file, e.g. results.json, results.csv or results.html."
      >
        <input
          value={config.outputPath}
          placeholder="results.json"
          onChange={(e) => edit({ ...config, outputPath: e.target.value })}
        />
      </Field>
    </section>
  );
}

/**
 * Reads the files each prompt refers to (file://… or @…), relative to the saved
 * config. Re-reads when the window regains focus, to pick up outside edits.
 */
function usePromptFiles(prompts: Config["prompts"] | null, path: string): PromptFile[][] {
  const [files, setFiles] = useState<PromptFile[][]>([]);
  const [focusCount, setFocusCount] = useState(0);
  useEffect(() => {
    const onFocus = () => setFocusCount((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const raws = JSON.stringify(prompts?.map((p) => p.raw) ?? []);
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      const list: string[] = JSON.parse(raws);
      Promise.all(list.map((raw) => api.promptFiles(path, raw)))
        .then((result) => !cancelled && setFiles(result))
        .catch(() => !cancelled && setFiles([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [raws, path, focusCount]);
  return files;
}

function PromptFileView({ file }: { file: PromptFile }) {
  return (
    <details className="prompt-file" open>
      <summary>
        <code title={file.path}>{file.ref}</code>
        <span className="muted">{file.templated ? "rendered by promptfoo" : "sent as a reference"}</span>
        {!file.error && (
          <button
            type="button"
            className="link-button"
            onClick={(e) => {
              e.preventDefault();
              api.openInDefaultApp(file.path);
            }}
            title={file.path}
          >
            Open
          </button>
        )}
      </summary>
      {file.error ? <div className="error">{file.error}</div> : <pre>{file.content || "(empty file)"}</pre>}
    </details>
  );
}

function Prompts({
  config,
  edit,
  vars,
  files,
  path,
}: SectionProps & { vars: string[]; files: PromptFile[][]; path: string }) {
  const prompts = config.prompts;
  const set = (next: typeof prompts) => edit({ ...config, prompts: next });
  const pick = async () => {
    try {
      return await api.pickPromptFile(path);
    } catch (e) {
      api.alert("Could not choose a file", e);
      return "";
    }
  };
  const chooseFile = async (i: number) => {
    const file = await pick();
    if (!file) return;
    const raw = prompts[i].raw.trim();
    if (raw && !raw.startsWith("file://")) {
      const ok = await api.confirm(
        "Replace the prompt text?",
        `The prompt becomes file://${file}, and promptfoo reads the prompt from that file.`,
        "Replace",
      );
      if (!ok) return;
    }
    set(update(prompts, i, { ...prompts[i], raw: `file://${file}` }));
  };
  const insertRef = async (i: number) => {
    const file = await pick();
    if (!file) return;
    const raw = prompts[i].raw;
    const ref = `@${file}`;
    set(update(prompts, i, { ...prompts[i], raw: raw.trim() ? `${raw.replace(/\s+$/, "")} ${ref}` : ref }));
  };
  return (
    <section>
      <h2>Prompts</h2>
      <p className="lead">
        Each prompt is run against every provider and test case. Reference test variables with <code>{"{{name}}"}</code>
        , or point to a file with <code>file://path/to/prompt.txt</code>. Files a prompt refers to, including{" "}
        <code>@file.md</code> references for CLI agents, are shown below it.
      </p>
      {vars.length > 0 && (
        <p className="vars-found">
          Variables found:{" "}
          {vars.map((v) => (
            <code key={v}>{v}</code>
          ))}
        </p>
      )}
      {prompts.map((p, i) => (
        <div className="card" key={i}>
          <div className="card-head">
            <strong>Prompt {i + 1}</strong>
            <RowActions
              noun="prompt"
              index={i}
              count={prompts.length}
              onMove={(d) => set(move(prompts, i, d))}
              onRemove={() => set(remove(prompts, i))}
            />
          </div>
          <Field label="Label (optional)">
            <input
              value={p.label}
              placeholder="e.g. concise-v2"
              onChange={(e) => set(update(prompts, i, { ...p, label: e.target.value }))}
            />
          </Field>
          <Field label="Prompt text">
            <AutoTextarea
              className="prompt-text"
              rows={4}
              value={p.raw}
              placeholder="You are a helpful assistant. Answer: {{question}}"
              onChange={(e) => set(update(prompts, i, { ...p, raw: e.target.value }))}
            />
          </Field>
          <div className="prompt-file-actions">
            <button
              type="button"
              onClick={() => chooseFile(i)}
              title="Read the whole prompt from a file (file://). promptfoo fills in {{variables}} inside it."
            >
              Choose file…
            </button>
            <button
              type="button"
              onClick={() => insertRef(i)}
              title="Add an @file reference, which kit CLI agents read themselves"
            >
              Insert @reference…
            </button>
            {!path && <span className="muted">Save the config first to get paths relative to it.</span>}
          </div>
          {(files[i] ?? []).map((f) => (
            <PromptFileView key={f.ref} file={f} />
          ))}
        </div>
      ))}
      <button className="add" onClick={() => set([...prompts, { label: "", raw: "" }])}>
        + Add prompt
      </button>
    </section>
  );
}

function Providers({ config, edit }: SectionProps) {
  const providers = config.providers;
  const set = (next: typeof providers) => edit(syncGrader({ ...config, providers: next }, providers));
  return (
    <section>
      <h2>Providers</h2>
      <p className="lead">
        The models or endpoints to evaluate. API keys are read from environment variables such as{" "}
        <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code>. CLI agents from{" "}
        <ExternalLink href={KIT_REPO}>Improving’s EDD kit</ExternalLink> use your signed-in CLI instead. When two
        providers share an ID, give each a distinct label, or promptfoo only runs the first.
      </p>
      <datalist id="provider-ids">
        {PROVIDER_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {providers.map((p, i) => (
        <div className="card" key={i}>
          <div className="card-head">
            <strong>{p.label || p.id || `Provider ${i + 1}`}</strong>
            <RowActions
              noun="provider"
              index={i}
              count={providers.length}
              onMove={(d) => set(move(providers, i, d))}
              onRemove={() => set(remove(providers, i))}
              onDuplicate={() => set([...providers.slice(0, i + 1), structuredClone(p), ...providers.slice(i + 1)])}
            />
          </div>
          <div className="grid-2">
            <Field label="Provider ID" hint="Pick a suggestion or type any promptfoo provider ID.">
              <input
                list="provider-ids"
                value={p.id}
                placeholder="openai:gpt-4.1-mini"
                onChange={(e) => set(update(providers, i, { ...p, id: e.target.value }))}
              />
            </Field>
            <Field label="Label (optional)">
              <input value={p.label} onChange={(e) => set(update(providers, i, { ...p, label: e.target.value }))} />
            </Field>
          </div>
          <h4>Config</h4>
          <KVEditor
            rows={p.config}
            onChange={(cfg) => set(update(providers, i, { ...p, config: cfg }))}
            keyPlaceholder="setting"
            valuePlaceholder="value"
            addLabel="Add setting"
            keySuggestions={PROVIDER_CONFIG_KEYS}
          />
        </div>
      ))}
      <div className="add-row">
        <button className="add" onClick={() => set([...providers, emptyProvider()])}>
          + Add provider
        </button>
        <select
          className="add"
          value=""
          aria-label="Add a CLI agent provider from Improving’s EDD kit"
          onChange={(e) => {
            const preset = KIT_PROVIDERS.find((k) => k.name === e.target.value);
            if (!preset) return;
            const labels = new Set(providers.map((p) => p.label));
            let label = preset.label;
            for (let n = 2; labels.has(label); n++) label = `${preset.label} ${n}`;
            set([
              ...providers,
              { id: preset.id, label, config: preset.config.map(([key, value]) => ({ key, value })) },
            ]);
          }}
        >
          <option value="">+ Add CLI agent (Improving kit)…</option>
          {KIT_PROVIDERS.map((k) => (
            <option key={k.name} value={k.name}>
              {k.name} (needs {k.cli})
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function Tests({ config, edit, vars }: SectionProps & { vars: string[] }) {
  const tests = config.tests;
  const [expanded, setExpanded] = useState<number | null>(tests.length > 0 ? 0 : null);
  const set = (next: TestCase[]) => edit({ ...config, tests: next });
  const add = () => {
    set([...tests, emptyTest()]);
    setExpanded(tests.length);
  };
  return (
    <section>
      <h2>Test cases</h2>
      <p className="lead">
        Each test case fills in the prompt variables and lists assertions the output must pass. Assertions on the
        “Defaults for all tests” page apply to every case.
      </p>
      {tests.map((t, i) => {
        if (t.file) {
          return (
            <div className="card test" key={i}>
              <div className="card-head">
                <strong>Tests from file</strong>
                <RowActions
                  noun="test file"
                  index={i}
                  count={tests.length}
                  onMove={(d) => set(move(tests, i, d))}
                  onRemove={() => set(remove(tests, i))}
                />
              </div>
              <Field
                label="Path"
                hint="A YAML, JSON or CSV file of tests, relative to the config. Edit its contents in a text editor."
              >
                <input
                  className="mono"
                  value={t.file}
                  onChange={(e) => set(update(tests, i, { ...t, file: e.target.value || "file://" }))}
                />
              </Field>
            </div>
          );
        }
        const open = expanded === i;
        return (
          <div className={`card test ${open ? "open" : ""}`} key={i}>
            <div className="card-head">
              <button className="disclosure" onClick={() => setExpanded(open ? null : i)} aria-expanded={open}>
                <span className="chevron">{open ? "▾" : "▸"}</span>
                <strong>{t.description || `Test ${i + 1}`}</strong>
                {!open && <span className="muted summary">{summarize(t)}</span>}
              </button>
              <RowActions
                noun="test"
                index={i}
                count={tests.length}
                onMove={(d) => {
                  set(move(tests, i, d));
                  setExpanded(i + d);
                }}
                onRemove={() => {
                  set(remove(tests, i));
                  setExpanded(null);
                }}
                onDuplicate={() => {
                  set([...tests.slice(0, i + 1), structuredClone(t), ...tests.slice(i + 1)]);
                  setExpanded(i + 1);
                }}
              />
            </div>
            {open && <TestCaseFields test={t} onChange={(next) => set(update(tests, i, next))} promptVars={vars} />}
          </div>
        );
      })}
      <div className="add-row">
        <button className="add" onClick={add}>
          + Add test case
        </button>
        <button className="add" onClick={() => set([...tests, { ...emptyTest(), file: "file://tests.yaml" }])}>
          + Add tests from file
        </button>
      </div>
    </section>
  );
}

function Defaults({ config, edit }: SectionProps) {
  const dt = config.defaultTest;
  const set = (next: TestCase) => edit({ ...config, defaultTest: next });
  const grader = getOption(dt, GRADER_KEY);
  const graderChoices = [...new Set(config.providers.map((p) => p.label || p.id).filter(Boolean))];
  const otherOptions = dt.options.filter((o) => o.key !== GRADER_KEY);
  return (
    <section>
      <h2>Defaults for all tests</h2>
      <p className="lead">
        Variables and assertions here are merged into every test case — handy for checks like latency, cost, or “is not
        a refusal”.
      </p>
      <Field
        label="Grader provider"
        hint={
          <>
            Grades model-graded assertions such as <code>llm-rubric</code>. Defaults to OpenAI. Pick one of your
            providers by label (as the Improving kit does with its CLI agents) or enter any provider ID.
          </>
        }
      >
        <input
          list="grader-choices"
          value={grader}
          placeholder="e.g. Claude Haiku, or openai:gpt-4.1"
          onChange={(e) => set(setOption(dt, GRADER_KEY, e.target.value))}
        />
      </Field>
      {unknownGrader(config) && (
        <div className="error">
          “{grader}” isn’t one of your providers, so promptfoo can’t find it.{" "}
          {graderChoices.length > 0 && (
            <>
              Use{" "}
              {graderChoices.map((g, i) => (
                <span key={g}>
                  {i > 0 && " or "}
                  <button type="button" className="link-button" onClick={() => set(setOption(dt, GRADER_KEY, g))}>
                    {g}
                  </button>
                </span>
              ))}
              ?
            </>
          )}
        </div>
      )}
      <datalist id="grader-choices">
        {graderChoices.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <h4>Variables</h4>
      <KVEditor
        rows={dt.vars}
        onChange={(vars) => set({ ...dt, vars })}
        keyPlaceholder="name"
        valuePlaceholder="value"
        addLabel="Add variable"
      />
      <h4>Assertions</h4>
      <AssertionList asserts={dt.assert} onChange={(assert) => set({ ...dt, assert })} />
      <h4>Other options</h4>
      <KVEditor
        rows={otherOptions}
        onChange={(rows) => set({ ...dt, options: [...dt.options.filter((o) => o.key === GRADER_KEY), ...rows] })}
        keyPlaceholder="option"
        valuePlaceholder="value"
        addLabel="Add option"
        keySuggestions={TEST_OPTION_KEYS}
      />
    </section>
  );
}

function Advanced({ config, edit, onImport }: SectionProps & { onImport: (c: Config) => void }) {
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const doImport = async () => {
    try {
      onImport(await api.fromYAML(paste));
      setPaste("");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <section>
      <h2>Advanced</h2>
      <Field
        label="Additional top-level YAML"
        hint={
          <>
            Anything the form doesn’t cover (e.g. <code>evaluateOptions</code>, <code>env</code>, <code>scenarios</code>
            ) is kept here and appended to the config as-is.
          </>
        }
      >
        <textarea
          className="mono"
          rows={10}
          value={config.extra}
          placeholder={"evaluateOptions:\n  maxConcurrency: 4\n  repeat: 1"}
          onChange={(e) => edit({ ...config, extra: e.target.value })}
        />
      </Field>
      <h3>Import from YAML</h3>
      <p className="lead">
        Paste an existing promptfooconfig.yaml to load it into the form. This replaces the current config.
      </p>
      <textarea className="mono" rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} />
      {error && <div className="error">{error}</div>}
      <button className="add" onClick={doImport} disabled={!paste.trim()}>
        Import
      </button>
    </section>
  );
}

type RunResult = "" | "passed" | "failed";

/**
 * Run state lives at the app level so it survives leaving the Run page: output
 * keeps arriving and Stop keeps working while you edit elsewhere.
 */
function useRunner(
  config: Config | null,
  path: string,
  dirty: boolean,
  save: (c?: Config) => Promise<string>,
  edit: (c: Config) => void,
) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult>("");
  const [noCache, setNoCache] = useState(true);
  const [kitBusy, setKitBusy] = useState(false);
  // Bumped whenever files in the config's folder may have changed.
  const [kitVersion, setKitVersion] = useState(0);
  const [setup, setSetup] = useState<ToolchainStatus | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  // Resolves when the running command finishes, for steps that chain commands.
  const doneWaiter = useRef<((err: string) => void) | null>(null);

  const refreshSetup = useCallback(async () => {
    const status = await api.toolchainStatus().catch(() => null);
    setSetup(status);
    return status;
  }, []);

  useEffect(() => {
    refreshSetup();
  }, [refreshSetup]);

  useEffect(() => {
    const offOut = api.onEvalOutput((line) => setLines((l) => [...l, stripAnsi(line)]));
    const offDone = api.onEvalDone((err) => {
      setRunning(false);
      setResult(err ? "failed" : "passed");
      if (err) setLines((l) => [...l, `\n${err}`]);
      setKitVersion((v) => v + 1);
      doneWaiter.current?.(err);
      doneWaiter.current = null;
    });
    return () => {
      offOut();
      offDone();
    };
  }, []);

  const savedPath = async () => (path && !dirty ? path : save());

  const start = async (command: (path: string) => Promise<void>, target?: string, keepLog = false) => {
    target ??= await savedPath();
    if (!target) return;
    if (!keepLog) setLines([]);
    setResult("");
    setRunning(true);
    try {
      await command(target);
    } catch (e) {
      setRunning(false);
      setLines((l) => [...l, String(e)]);
    }
  };

  // Runs a streaming command and waits for it to finish; returns its error, if any.
  const runAndWait = (command: () => Promise<void>) =>
    new Promise<string>((resolve) => {
      doneWaiter.current = resolve;
      setResult("");
      setRunning(true);
      command().catch((e) => {
        doneWaiter.current = null;
        setRunning(false);
        resolve(String(e));
      });
    });

  const installNode = async (): Promise<boolean> => {
    setSetupBusy(true);
    try {
      await api.installNode();
      return true;
    } catch (e) {
      setLines((l) => [...l, `Could not install Node.js: ${e}`]);
      return false;
    } finally {
      setSetupBusy(false);
      refreshSetup();
    }
  };

  const installPromptfoo = async (): Promise<boolean> => {
    setSetupBusy(true);
    try {
      const err = await runAndWait(api.installPromptfoo);
      if (err) setLines((l) => [...l, "promptfoo wasn’t installed; runs will use npx instead."]);
      return !err;
    } finally {
      setSetupBusy(false);
      refreshSetup();
    }
  };

  /**
   * Makes sure Node.js (new enough for promptfoo) is available, offering to
   * download it, and installs promptfoo once so runs don't wait on npx.
   * Returns "stop" when the run can't go ahead, "installed" when it installed
   * something (so its log is kept), and "ready" otherwise.
   */
  const ensureToolchain = async (): Promise<"stop" | "installed" | "ready"> => {
    let status = await refreshSetup();
    if (!status) return "ready";
    let installed = false;
    if (!status.nodeOK) {
      const found = status.nodePath
        ? `Node.js ${status.nodeVersion} at ${status.nodePath} is too old for promptfoo, which needs ${status.minNode} or later.`
        : `Node.js wasn’t found on this computer. promptfoo needs Node.js ${status.minNode} or later.`;
      const ok = await api.confirm(
        "Install Node.js?",
        `${found}\n\nDownload the current Node.js LTS from nodejs.org into ${status.dataDir}? ` +
          "Only this app uses it, and it needs no admin rights.",
        "Download Node.js",
      );
      if (!ok) {
        setLines([`Not run: ${found}`]);
        return "stop";
      }
      setLines([]);
      if (!(await installNode())) return "stop";
      status = await refreshSetup();
      if (!status?.nodeOK) return "stop";
      installed = true;
    }
    if (!status.promptfooVersion) {
      if (!installed) setLines([]);
      setLines((l) => [...l, "Installing promptfoo into the app’s data folder (one time)…"]);
      await installPromptfoo();
      installed = true;
    }
    return installed ? "installed" : "ready";
  };

  const installKit = async (target?: string): Promise<boolean> => {
    target ??= await savedPath();
    if (!target) return false;
    setKitBusy(true);
    try {
      const written = await api.installKit(target);
      setLines([
        written.length
          ? `Downloaded from ${KIT_REPO}:\n${written.map((f) => `  ${f}`).join("\n")}`
          : "All kit files are already present.",
      ]);
      return true;
    } catch (e) {
      setLines([`Could not download the kit: ${e}`]);
      return false;
    } finally {
      setKitBusy(false);
      setKitVersion((v) => v + 1);
    }
  };

  // promptfoo fails with a bare ENOENT when a referenced kit file is missing, so
  // offer to download the kit before running instead.
  const runEval = async () => {
    if (!config || running || kitBusy || setupBusy) return;
    let target: string;
    const badGrader = unknownGrader(config);
    if (badGrader) {
      // promptfoo would stop with "Could not identify provider", so offer a provider that exists.
      const choice = config.providers.map((p) => p.label || p.id).find(Boolean);
      if (!choice) return;
      const ok = await api.confirm(
        `Grader “${badGrader}” isn’t one of your providers`,
        `promptfoo looks up the grader among your providers’ labels, then as a provider ID, so this run would fail ` +
          `with “Could not identify provider”.\n\nGrade with “${choice}” instead? You can change it on “Defaults for all tests”.`,
        `Use ${choice}`,
      );
      if (!ok) {
        setLines([`Not run: the grader “${badGrader}” doesn’t match a provider label or ID.`]);
        return;
      }
      const fixed = { ...config, defaultTest: setOption(config.defaultTest, GRADER_KEY, choice) };
      edit(fixed);
      target = await save(fixed);
    } else {
      target = await savedPath();
    }
    if (!target) return;
    const toolchain = await ensureToolchain();
    if (toolchain === "stop") return;
    const status = await api.kitStatus(target, config).catch(() => null);
    if (status?.used && status.missing.length > 0) {
      const where = status.inHomeDir
        ? `${status.dir}, your home folder. Consider Save as… into a new folder of its own first.`
        : `${status.dir}.`;
      const ok = await api.confirm(
        "Download the Improving kit files?",
        `This config uses Improving’s EDD kit, but ${status.missing.length} of its files are missing from ${where}\n\n` +
          `They’ll be downloaded from ${KIT_REPO} and then the eval runs. Existing files aren’t overwritten.`,
        "Download and run",
      );
      if (!ok) {
        setLines([`Not run: kit files missing from ${status.dir}:\n${status.missing.map((f) => `  ${f}`).join("\n")}`]);
        return;
      }
      if (!(await installKit(target))) return;
    }
    await start((p) => api.runEval(p, noCache), target, toolchain === "installed");
  };

  const installDeps = () => start(api.installDeps);

  return {
    lines,
    running,
    result,
    noCache,
    setNoCache,
    kitBusy: kitBusy || setupBusy,
    kitVersion,
    runEval,
    installKit,
    installDeps,
    setup,
    installNode,
    installPromptfoo,
  };
}

type Runner = ReturnType<typeof useRunner>;

function Run(props: { config: Config; path: string; dirty: boolean; hasErrors: boolean; runner: Runner }) {
  const {
    lines,
    running,
    result,
    noCache,
    setNoCache,
    kitBusy,
    kitVersion,
    runEval,
    installKit,
    installDeps,
    setup,
    installNode,
    installPromptfoo,
  } = props.runner;
  const [kit, setKit] = useState<KitStatus | null>(null);
  const [opening, setOpening] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const logFontSize = useFitFontSize(logRef, lines);

  useEffect(() => {
    api
      .kitStatus(props.path, props.config)
      .then(setKit)
      .catch(() => setKit(null));
  }, [props.path, props.config, kitVersion]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [lines]);

  const openViewer = async () => {
    setOpening(true);
    try {
      await api.viewResults(props.path);
    } catch (e) {
      api.alert("Could not open the results viewer", e);
    } finally {
      setOpening(false);
    }
  };

  const kitMissing = !props.path || (kit?.missing.length ?? 0) > 0;
  const needsInstall = kit?.hasPackageJSON && !kit.hasNodeModules;

  return (
    <section className="run">
      <h2>Run</h2>
      <p className="lead">
        Saves the config and runs <code>promptfoo eval</code> in its folder. It uses the folder’s own promptfoo when
        installed, then the app’s, then <code>npx promptfoo@latest</code>. Your providers also need API keys in the
        environment, or a signed-in CLI for kit agents.
      </p>
      {setup && (
        <div className={`notice setup ${setup.nodeOK ? "" : "warn"}`}>
          <div>
            <strong>Node.js</strong>{" "}
            {setup.nodeOK ? (
              <span>
                {setup.nodeVersion}{" "}
                <span className="muted">{setup.nodeManaged ? "installed by this app" : setup.nodePath}</span>
              </span>
            ) : setup.nodePath ? (
              <span>
                {setup.nodeVersion} is too old; promptfoo needs {setup.minNode} or later.
              </span>
            ) : (
              <span>not found; promptfoo needs {setup.minNode} or later.</span>
            )}
          </div>
          <div>
            <strong>promptfoo</strong>{" "}
            {setup.promptfooVersion ? (
              <span>
                {setup.promptfooVersion} <span className="muted">installed by this app</span>
              </span>
            ) : (
              <span className="muted">not installed; runs download it with npx</span>
            )}
          </div>
          <div className="run-actions">
            {!setup.nodeOK && (
              <button onClick={installNode} disabled={running || kitBusy}>
                Install Node.js LTS
              </button>
            )}
            {setup.nodeOK && (
              <button onClick={installPromptfoo} disabled={running || kitBusy}>
                {setup.promptfooVersion ? "Update promptfoo" : "Install promptfoo"}
              </button>
            )}
          </div>
        </div>
      )}
      {kit?.used && (
        <div className={`notice ${kitMissing || needsInstall ? "warn" : ""}`}>
          <strong>Uses Improving’s EDD kit</strong>
          {!props.path ? (
            <p>Save the config to a folder, then download the kit’s scripts next to it.</p>
          ) : kit.missing.length > 0 ? (
            <p>
              {kit.missing.length} kit file{kit.missing.length > 1 ? "s are" : " is"} missing from{" "}
              <code>{kit.dir}</code>: {kit.missing.join(", ")}. Downloading never overwrites existing files.
            </p>
          ) : (
            <p>
              All kit files are in <code>{kit.dir}</code>.
            </p>
          )}
          {kit.inHomeDir && kit.missing.length > 0 && (
            <p>
              This config is saved directly in your home folder, so the {kit.missing.length} kit files would land there
              too. Use <b>Save as…</b> and <b>New Folder</b> to give it a folder of its own first.
            </p>
          )}
          {needsInstall && (
            <p>
              Run <code>npm install</code> to get the kit’s pinned promptfoo and <code>ajv</code>, which the matchSchema
              check needs.
            </p>
          )}
          <div className="run-actions">
            {kitMissing && (
              <button onClick={() => installKit()} disabled={kitBusy || running}>
                {kitBusy ? "Downloading…" : props.path ? "Download kit files" : "Save & download kit files"}
              </button>
            )}
            {kit.hasPackageJSON && (
              <button onClick={installDeps} disabled={running || kitBusy}>
                npm install
              </button>
            )}
          </div>
        </div>
      )}
      <div className="run-actions">
        <button className="primary" onClick={runEval} disabled={running || kitBusy || props.hasErrors}>
          {props.dirty || !props.path ? "Save & run" : "Run eval"}
        </button>
        <button onClick={() => api.stopEval()} disabled={!running}>
          Stop
        </button>
        <button onClick={openViewer} disabled={running || opening || !props.path}>
          {opening ? "Starting viewer…" : "Open results viewer"}
        </button>
        <label
          className="checkbox"
          title="promptfoo can’t see changes inside script or prompt files, so cached results can be stale"
        >
          <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
          No cache
        </label>
        {running && <span className="muted">Running…</span>}
        {result === "passed" && <span className="ok">Finished</span>}
        {result === "failed" && <span className="bad">Finished with failures or errors</span>}
      </div>
      <pre className="log" ref={logRef} style={{ fontSize: logFontSize }}>
        {lines.length ? lines.join("\n") : "Output will appear here."}
      </pre>
    </section>
  );
}

const LOG_FONT_MAX = 12;
const LOG_FONT_MIN = 8;

/**
 * Shrinks the log's font so its widest line (e.g. promptfoo's results table) fits the box, down to LOG_FONT_MIN;
 * past that the log scrolls sideways.
 */
function useFitFontSize(ref: React.RefObject<HTMLPreElement | null>, lines: string[]) {
  const [width, setWidth] = useState(0);
  const [charWidth, setCharWidth] = useState(0.6);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `100px ${style.fontFamily}`;
      setCharWidth(ctx.measureText("M".repeat(10)).width / 1000);
    }
    const observer = new ResizeObserver(() => setWidth(contentWidth(el)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  // Also measure after every render: toggling the YAML preview resizes the log
  // without a window resize, and ResizeObserver can lag behind.
  useLayoutEffect(() => {
    if (ref.current) setWidth(contentWidth(ref.current));
  });

  const longest = useMemo(
    () =>
      lines
        .join("\n")
        .split("\n")
        .reduce((max, line) => Math.max(max, line.length), 0),
    [lines],
  );
  if (!width || !longest) return LOG_FONT_MAX;
  const fit = Math.floor((width / (longest * charWidth)) * 10) / 10;
  return Math.max(LOG_FONT_MIN, Math.min(LOG_FONT_MAX, fit));
}

function contentWidth(el: HTMLElement) {
  const style = getComputedStyle(el);
  return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/**
 * The grader when promptfoo can't resolve it: not a provider's label or ID, and
 * not shaped like a provider ID (openai:…, exec:…, file://…).
 */
function unknownGrader(c: Config): string {
  const grader = getOption(c.defaultTest, GRADER_KEY).trim();
  if (!grader || grader.includes(":")) return "";
  const names = new Set(c.providers.flatMap((p) => [p.id.trim(), p.label.trim()]).filter(Boolean));
  return names.has(grader) ? "" : grader;
}

/** Keeps the grader pointing at the same provider when that provider's label or ID is edited. */
function syncGrader(next: Config, before: Config["providers"]): Config {
  const grader = getOption(next.defaultTest, GRADER_KEY);
  if (!grader || next.providers.length !== before.length) return next;
  const i = before.findIndex((p) => (p.label || p.id) === grader);
  if (i < 0) return next;
  const renamed = next.providers[i].label || next.providers[i].id;
  if (!renamed || renamed === grader) return next;
  return { ...next, defaultTest: setOption(next.defaultTest, GRADER_KEY, renamed) };
}

function validate(c: Config, vars: string[]): string[] {
  const out: string[] = [];
  if (!c.prompts.some((p) => p.raw.trim())) out.push("Add at least one prompt.");
  if (!c.providers.some((p) => p.id.trim())) out.push("Add at least one provider.");
  if (c.tests.length === 0) out.push("Add at least one test case.");
  const labelsById = new Map<string, string[]>();
  c.providers.forEach((p) => p.id.trim() && labelsById.set(p.id, [...(labelsById.get(p.id) ?? []), p.label]));
  labelsById.forEach((labels, id) => {
    if (labels.length > 1 && new Set(labels.filter(Boolean)).size < labels.length)
      out.push(`Providers using ${id} need distinct labels.`);
  });
  const grader = getOption(c.defaultTest, GRADER_KEY);
  const badGrader = unknownGrader(c);
  if (badGrader) out.push(`Grader “${badGrader}” doesn’t match a provider label or ID.`);
  const tests = c.tests.filter((t) => !t.file);
  const modelGraded = [c.defaultTest, ...tests].some((t) =>
    t.assert.some((a) => assertionInfo(a.type)?.group === "Model graded"),
  );
  const onlyScripts = c.providers.length > 0 && c.providers.every((p) => /^(exec:|file:\/\/)/.test(p.id.trim()));
  if (modelGraded && onlyScripts && !grader)
    out.push("Model-graded assertions default to an OpenAI grader. Set a grader provider on Defaults.");
  const defaults = new Set(c.defaultTest.vars.map((v) => v.key));
  tests.forEach((t, i) => {
    const set = new Set(t.vars.filter((v) => v.value !== "").map((v) => v.key));
    const missing = vars.filter((v) => !set.has(v) && !defaults.has(v));
    if (missing.length) out.push(`${t.description || `Test ${i + 1}`}: missing ${missing.join(", ")}`);
  });
  const checkAsserts = (where: string, t: TestCase) =>
    t.assert.forEach((a) => {
      const info = assertionInfo(a.type);
      if (info?.thresholdRequired && !a.threshold.trim()) out.push(`${where}: ${a.type} needs a threshold.`);
      if (info && info.value !== "none" && !a.value.trim()) out.push(`${where}: ${a.type} needs a value.`);
    });
  checkAsserts("Defaults", c.defaultTest);
  tests.forEach((t, i) => checkAsserts(t.description || `Test ${i + 1}`, t));
  return out;
}

function summarize(t: TestCase): string {
  if (t.file) return t.file;
  const vars = t.vars.filter((v) => v.value).map((v) => `${v.key}=${truncate(v.value, 24)}`);
  const asserts = t.assert.map((a) => a.type);
  return [...vars, ...(asserts.length ? [`${asserts.length} assertion${asserts.length > 1 ? "s" : ""}`] : [])].join(
    " · ",
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}

function stripAnsi(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
