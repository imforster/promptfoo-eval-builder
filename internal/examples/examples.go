// Package examples bundles ready-made promptfoo configs that demonstrate the app.
package examples

import (
	"embed"
	"fmt"

	"promptfoo-eval-builder/internal/evalconfig"
)

//go:embed configs/*.yaml
var files embed.FS

type Example struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
	// Kit is set when the example needs files from Improving's EDD kit (internal/kit).
	Kit bool `json:"kit"`
}

var All = []Example{
	{
		ID:      "quickstart",
		Title:   "Quick start: factual Q&A",
		Summary: "Two prompts across OpenAI and Anthropic models, an array variable, text checks, a rubric, and latency and refusal checks for every test.",
	},
	{
		ID:      "json-output",
		Title:   "Structured JSON output",
		Summary: "Validates extracted data against a JSON schema and checks fields with inline JavaScript assertions.",
	},
	{
		ID:      "improving-edd-demo",
		Title:   "Improving EDD demo (Devin CLI)",
		Summary: "Improving's Evaluation Driven Development demo: deterministic, per-dimension rubric and script-based evals, plus file-based test suites and JSON schema matching. Devin grades the rubrics.",
		Kit:     true,
	},
	{
		ID:      "improving-compare-agents",
		Title:   "Compare CLI coding agents",
		Summary: "Runs the same prompt through Claude Code, GitHub Copilot and Devin CLIs, graded by Claude Haiku, with a shared conciseness check.",
		Kit:     true,
	},
	{
		ID:      "improving-trust-ai",
		Title:   "How to Trust AI: PRD generation",
		Summary: "The ImprovingU \"How to Trust AI\" exercise: scores a generated PRD for clarity and functional and non-functional requirements.",
		Kit:     true,
	},
	{
		ID:      "improving-ollama",
		Title:   "Local model with Ollama",
		Summary: "Uses the kit's Ollama wrapper as both provider and grader, so nothing leaves your machine. Expands @file references in the prompt.",
		Kit:     true,
	},
}

func Load(id string) (evalconfig.Config, error) {
	data, err := files.ReadFile("configs/" + id + ".yaml")
	if err != nil {
		return evalconfig.Config{}, fmt.Errorf("unknown example %q", id)
	}
	return evalconfig.FromYAML(string(data))
}
