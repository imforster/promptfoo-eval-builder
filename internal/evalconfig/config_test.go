package evalconfig

import (
	"reflect"
	"strings"
	"testing"
)

func TestToYAML(t *testing.T) {
	c := Config{
		Description: "Capitals",
		Prompts: []Prompt{
			{Raw: "Q: {{question}}"},
			{Label: "multi", Raw: "line one\nline two {{question}}"},
		},
		Providers: []Provider{
			{ID: "openai:gpt-4.1-mini"},
			{ID: "anthropic:messages:claude-sonnet-4-5", Label: "sonnet", Config: []KV{{"temperature", "0.2"}, {"max_tokens", "512"}}},
		},
		DefaultTest: TestCase{Assert: []Assertion{{Type: "latency", Threshold: "5000"}}},
		Tests: []TestCase{{
			Description: "France",
			Vars:        []KV{{"question", "What is the capital of France?"}, {"count", "3"}},
			Assert: []Assertion{
				{Type: "icontains", Value: "Paris"},
				{Type: "contains-any", Value: `["Paris", "paris", ""]`},
				{Type: "llm-rubric", Value: "Is concise", Threshold: "0.8", Metric: "quality"},
			},
		}},
		Extra: "evaluateOptions:\n  maxConcurrency: 2\n",
	}
	want := `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Capitals
prompts:
  - 'Q: {{question}}'
  - label: multi
    raw: |-
      line one
      line two {{question}}
providers:
  - openai:gpt-4.1-mini
  - id: anthropic:messages:claude-sonnet-4-5
    label: sonnet
    config:
      temperature: 0.2
      max_tokens: 512
defaultTest:
  assert:
    - type: latency
      threshold: 5000
tests:
  - description: France
    vars:
      question: What is the capital of France?
      count: "3"
    assert:
      - type: icontains
        value: Paris
      - type: contains-any
        value:
          - Paris
          - paris
      - type: llm-rubric
        value: Is concise
        threshold: 0.8
        metric: quality
evaluateOptions:
  maxConcurrency: 2
`
	got, err := ToYAML(c)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestRoundTrip(t *testing.T) {
	c := Config{
		Description: "Round trip",
		Prompts:     []Prompt{{Raw: "Hi {{name}}"}, {Label: "l", Raw: "Bye {{name}}"}},
		Providers: []Provider{
			{ID: "openai:gpt-4.1-mini", Config: []KV{}},
			{ID: "echo", Label: "e", Config: []KV{{"temperature", "0.2"}}},
		},
		DefaultTest: TestCase{
			Vars:    []KV{{"name", "Bob"}},
			Options: []KV{{"provider", "Grader"}},
			Assert:  []Assertion{{Type: "is-json", Config: []KV{}}},
		},
		Tests: []TestCase{
			{
				Description: "one",
				Vars:        []KV{{"name", `["Ann","Bo"]`}},
				Options:     []KV{},
				Assert: []Assertion{
					{Type: "contains-any", Value: `["a","b"]`, Weight: "2", Config: []KV{}},
					{Type: "regex", Value: "[abc]+", Config: []KV{}},
					{Type: "javascript", Value: "file://check.js:fn", Config: []KV{{"schemaPath", "./schema.json"}}},
				},
			},
			{File: "file://suite.yaml", Vars: []KV{}, Options: []KV{}, Assert: []Assertion{}},
		},
		OutputPath: "out.json",
		Extra:      "sharing: false\n",
	}
	text, err := ToYAML(c)
	if err != nil {
		t.Fatal(err)
	}
	got, err := FromYAML(text)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, c) {
		t.Fatalf("got %+v\nwant %+v", got, c)
	}
}

func TestFromYAMLKeepsUnmodeledSectionsAsExtra(t *testing.T) {
	got, err := FromYAML(`prompts: [file://prompt.txt]
providers: [echo]
tests: file://tests.csv
env:
  FOO: bar
`)
	if err != nil {
		t.Fatal(err)
	}
	want := Config{
		Prompts:     []Prompt{{Raw: "file://prompt.txt"}},
		Providers:   []Provider{{ID: "echo", Config: []KV{}}},
		DefaultTest: emptyTest(),
		Tests:       []TestCase{},
		Extra:       "tests: file://tests.csv\nenv:\n  FOO: bar\n",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

func TestToYAMLRejectsConflictingExtra(t *testing.T) {
	_, err := ToYAML(Config{Description: "x", Extra: "description: y\n"})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestImprovingStyleConfig(t *testing.T) {
	text := `prompts:
  - "@prompt-under-test.md {{request}}"
defaultTest:
  options:
    provider: Devin SWE-1.6
providers:
  - id: "exec: node ./devin.js"
    label: Devin SWE-1.6
    config:
      model: SWE-1.6
tests:
  - vars:
      request: Explain recursion
    assert:
      - type: javascript
        value: file://./matchSchema-script.js:matchesSchema
        config:
          schemaPath: ./example.schema.json
  - file://fileBased.testSuite.yaml
`
	c, err := FromYAML(text)
	if err != nil {
		t.Fatal(err)
	}
	if c.Extra != "" {
		t.Fatalf("expected everything to be modeled, got extra:\n%s", c.Extra)
	}
	if got := c.DefaultTest.Options; !reflect.DeepEqual(got, []KV{{"provider", "Devin SWE-1.6"}}) {
		t.Fatalf("grader: %+v", got)
	}
	if len(c.Tests) != 2 || c.Tests[1].File != "file://fileBased.testSuite.yaml" {
		t.Fatalf("tests: %+v", c.Tests)
	}
	out, err := ToYAML(c)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"  options:\n    provider: Devin SWE-1.6\n",
		"        config:\n          schemaPath: ./example.schema.json\n",
		"  - file://fileBased.testSuite.yaml\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}
