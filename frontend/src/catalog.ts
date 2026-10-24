export type ValueKind = "none" | "text" | "list" | "code" | "rubric" | "number";

export type AssertionType = {
  type: string;
  group: string;
  value: ValueKind;
  threshold?: boolean;
  thresholdRequired?: boolean;
  hint: string;
};

export const ASSERTION_TYPES: AssertionType[] = [
  { type: "equals", group: "Text match", value: "text", hint: "Output exactly matches the value." },
  { type: "contains", group: "Text match", value: "text", hint: "Output contains the value (case-sensitive)." },
  { type: "icontains", group: "Text match", value: "text", hint: "Output contains the value (case-insensitive)." },
  { type: "contains-any", group: "Text match", value: "list", hint: "Output contains at least one of the values." },
  { type: "contains-all", group: "Text match", value: "list", hint: "Output contains every value." },
  { type: "icontains-any", group: "Text match", value: "list", hint: "Case-insensitive contains-any." },
  { type: "icontains-all", group: "Text match", value: "list", hint: "Case-insensitive contains-all." },
  { type: "starts-with", group: "Text match", value: "text", hint: "Output starts with the value." },
  { type: "regex", group: "Text match", value: "text", hint: "Output matches the regular expression." },
  { type: "word-count", group: "Text match", value: "text", hint: "Word count equals a number, or {min, max}." },

  {
    type: "is-json",
    group: "Structure",
    value: "none",
    hint: "Output is valid JSON. Optionally give a JSON schema as the value.",
  },
  { type: "contains-json", group: "Structure", value: "none", hint: "Output contains valid JSON." },
  { type: "is-xml", group: "Structure", value: "none", hint: "Output is valid XML." },
  { type: "is-sql", group: "Structure", value: "none", hint: "Output is valid SQL." },
  {
    type: "is-valid-openai-tools-call",
    group: "Structure",
    value: "none",
    hint: "Output is a valid OpenAI tools call.",
  },
  { type: "is-refusal", group: "Structure", value: "none", hint: "Output is a refusal to answer." },

  {
    type: "llm-rubric",
    group: "Model graded",
    value: "rubric",
    threshold: true,
    hint: "An LLM grades the output against your rubric.",
  },
  {
    type: "g-eval",
    group: "Model graded",
    value: "rubric",
    threshold: true,
    hint: "Chain-of-thought LLM grading against criteria.",
  },
  {
    type: "factuality",
    group: "Model graded",
    value: "rubric",
    hint: "Output is factually consistent with the reference answer.",
  },
  {
    type: "model-graded-closedqa",
    group: "Model graded",
    value: "rubric",
    hint: "Output meets the stated criterion (closed QA).",
  },
  {
    type: "answer-relevance",
    group: "Model graded",
    value: "none",
    threshold: true,
    hint: "Output is relevant to the original query.",
  },
  {
    type: "context-faithfulness",
    group: "Model graded",
    value: "none",
    threshold: true,
    hint: "Output is grounded in the `context` var.",
  },
  {
    type: "context-recall",
    group: "Model graded",
    value: "text",
    threshold: true,
    hint: "Ground truth appears in the `context` var.",
  },
  {
    type: "context-relevance",
    group: "Model graded",
    value: "none",
    threshold: true,
    hint: "Context is relevant to the query.",
  },
  {
    type: "similar",
    group: "Model graded",
    value: "text",
    threshold: true,
    hint: "Embedding cosine similarity to the value.",
  },
  { type: "moderation", group: "Model graded", value: "none", hint: "Output passes a moderation check." },

  {
    type: "javascript",
    group: "Code",
    value: "code",
    threshold: true,
    hint: "JS expression or file://path.js. `output` and `context` are in scope; return boolean or score.",
  },
  {
    type: "python",
    group: "Code",
    value: "code",
    threshold: true,
    hint: "Python expression or file://path.py. `output` and `context` are in scope.",
  },
  { type: "webhook", group: "Code", value: "text", hint: "POST output to a URL that returns {pass: boolean}." },

  {
    type: "levenshtein",
    group: "Metrics",
    value: "text",
    threshold: true,
    hint: "Edit distance to the value is at most the threshold.",
  },
  {
    type: "rouge-n",
    group: "Metrics",
    value: "text",
    threshold: true,
    hint: "ROUGE-N score against the value is at least the threshold.",
  },
  {
    type: "bleu",
    group: "Metrics",
    value: "text",
    threshold: true,
    hint: "BLEU score against the value is at least the threshold.",
  },
  {
    type: "latency",
    group: "Metrics",
    value: "none",
    threshold: true,
    thresholdRequired: true,
    hint: "Response time in milliseconds is at most the threshold.",
  },
  {
    type: "cost",
    group: "Metrics",
    value: "none",
    threshold: true,
    thresholdRequired: true,
    hint: "Inference cost in USD is at most the threshold.",
  },
  {
    type: "perplexity",
    group: "Metrics",
    value: "none",
    threshold: true,
    hint: "Perplexity is at most the threshold.",
  },
];

export const NEGATE_PREFIX = "not-";

export function splitNegation(type: string): { negated: boolean; base: string } {
  return type.startsWith(NEGATE_PREFIX)
    ? { negated: true, base: type.slice(NEGATE_PREFIX.length) }
    : { negated: false, base: type };
}

export function assertionInfo(type: string): AssertionType | undefined {
  const { base } = splitNegation(type);
  return ASSERTION_TYPES.find((a) => a.type === base);
}

export const ASSERTION_GROUPS = [...new Set(ASSERTION_TYPES.map((a) => a.group))];

export const PROVIDER_SUGGESTIONS = [
  "openai:gpt-4.1",
  "openai:gpt-4.1-mini",
  "openai:gpt-4o-mini",
  "openai:o4-mini",
  "anthropic:messages:claude-sonnet-4-5",
  "anthropic:messages:claude-haiku-4-5",
  "anthropic:messages:claude-opus-4-1",
  "google:gemini-2.5-pro",
  "google:gemini-2.5-flash",
  "vertex:gemini-2.5-pro",
  "bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "azure:chat:<deployment-name>",
  "ollama:chat:llama3.1",
  "http",
  "file://provider.py",
  "exec: python my_script.py",
  "exec: node ./devin.js",
  "exec: node ./claude.js",
  "exec: node ./gh_copilot.js",
  "exec: node ./agy.js",
  "exec: node ./kiro.js",
  "exec: node ./ollama.js",
  "file://devinProvider.js",
  "echo",
];

export type ProviderPreset = { name: string; id: string; label: string; config: [string, string][]; cli: string };

/**
 * CLI-agent providers from Improving's EDD kit (https://github.com/improving/promptfoo). Each script works as both
 * provider and grader, so a preset's label can also be picked as the grader on “Defaults for all tests”.
 */
export const KIT_PROVIDERS: ProviderPreset[] = [
  {
    name: "Devin CLI",
    id: "exec: node ./devin.js",
    label: "Devin SWE-1.6",
    config: [["model", "SWE-1.6"]],
    cli: "devin",
  },
  {
    name: "Devin CLI (file provider, long prompts on Windows)",
    id: "file://devinProvider.js",
    label: "Devin SWE-1.6 (file provider)",
    config: [["model", "SWE-1.6"]],
    cli: "devin",
  },
  {
    name: "Claude Code CLI",
    id: "exec: node ./claude.js",
    label: "Claude Haiku",
    config: [["model", "haiku"]],
    cli: "claude",
  },
  {
    name: "GitHub Copilot CLI",
    id: "exec: node ./gh_copilot.js",
    label: "GitHub Haiku",
    config: [["model", "claude-haiku-4.5"]],
    cli: "copilot",
  },
  {
    name: "Google Antigravity CLI",
    id: "exec: node ./agy.js",
    label: "Gemini Flash",
    config: [["model", "gemini-3.5-flash"]],
    cli: "agy",
  },
  {
    name: "Kiro CLI",
    id: "exec: node ./kiro.js",
    label: "Kiro Sonnet",
    config: [["model", "claude-sonnet-4.6"]],
    cli: "kiro-cli",
  },
  {
    name: "Ollama (local)",
    id: "exec: node ./ollama.js",
    label: "Ollama Llama",
    config: [
      ["host", "localhost"],
      ["port", "11434"],
      ["model", "llama3.1"],
      ["documentRoot", "./"],
    ],
    cli: "ollama",
  },
];

export const KIT_REPO = "https://github.com/improving/promptfoo";

export const PROVIDER_CONFIG_KEYS = [
  "temperature",
  "max_tokens",
  "top_p",
  "apiKeyEnvar",
  "apiBaseUrl",
  "url",
  "method",
  "systemPrompt",
  "model",
  "host",
  "port",
  "endpoint",
  "documentRoot",
];

/** Test options; `provider` (the grader) has its own field. */
export const TEST_OPTION_KEYS = ["transform", "rubricPrompt", "storeOutputAs", "disableVarExpansion", "runSerially"];
