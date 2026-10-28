export type KV = { key: string; value: string };

export type Prompt = { label: string; raw: string };

export type Provider = { id: string; label: string; config: KV[] };

export type Assertion = {
  type: string;
  value: string;
  threshold: string;
  weight: string;
  metric: string;
  /** Passed to javascript/python assertions as context.config. */
  config: KV[];
};

export type TestCase = {
  /** When set (e.g. file://suite.yaml), the entry loads tests from a file and the other fields are unused. */
  file: string;
  description: string;
  vars: KV[];
  /** Test options; `provider` sets the grader for model-graded assertions. */
  options: KV[];
  assert: Assertion[];
};

export type PromptFile = { ref: string; templated: boolean; path: string; content: string; error: string };

export type ToolchainStatus = {
  nodePath: string;
  nodeVersion: string;
  nodeOK: boolean;
  nodeManaged: boolean;
  minNode: string;
  promptfooVersion: string;
  promptfooPath: string;
  dataDir: string;
};

export type OllamaStatus = {
  used: boolean;
  os: string;
  baseURL: string;
  remote: boolean;
  installed: boolean;
  binPath: string;
  running: boolean;
  models: string[];
  missing: string[];
  error: string;
};

export type AgentCLIStatus = {
  name: string;
  command: string;
  path: string;
  problem: "" | "not-found" | "installer-stub";
};

export type Example = { id: string; title: string; summary: string; kit: boolean };

export type KitStatus = {
  dir: string;
  inHomeDir: boolean;
  used: boolean;
  missing: string[];
  hasPackageJSON: boolean;
  hasNodeModules: boolean;
};

export type Config = {
  description: string;
  prompts: Prompt[];
  providers: Provider[];
  defaultTest: TestCase;
  tests: TestCase[];
  outputPath: string;
  extra: string;
};

export const emptyAssertion = (type = "icontains"): Assertion => ({
  type,
  value: "",
  threshold: "",
  weight: "",
  metric: "",
  config: [],
});

export const emptyTest = (): TestCase => ({ file: "", description: "", vars: [], options: [], assert: [] });

export const GRADER_KEY = "provider";

export const getOption = (t: TestCase, key: string) => t.options.find((o) => o.key === key)?.value ?? "";

export function setOption(t: TestCase, key: string, value: string): TestCase {
  const rest = t.options.filter((o) => o.key !== key);
  const index = t.options.findIndex((o) => o.key === key);
  if (!value) return { ...t, options: rest };
  if (index < 0) return { ...t, options: [{ key, value }, ...rest] };
  return { ...t, options: t.options.map((o) => (o.key === key ? { key, value } : o)) };
}

export const emptyProvider = (): Provider => ({ id: "", label: "", config: [] });

const VAR_PATTERN = /\{\{\s*([A-Za-z_][\w]*)/g;

/** Variables referenced as {{name}} across all prompts, in first-seen order. */
export function promptVars(prompts: Prompt[]): string[] {
  const seen = new Set<string>();
  for (const p of prompts) {
    for (const m of p.raw.matchAll(VAR_PATTERN)) {
      seen.add(m[1]);
    }
  }
  return [...seen];
}
