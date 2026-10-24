// Package evalconfig models a promptfoo eval config in a form-friendly shape and
// converts it to and from promptfooconfig.yaml.
package evalconfig

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

type KV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type Prompt struct {
	Label string `json:"label"`
	Raw   string `json:"raw"`
}

type Provider struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Config []KV   `json:"config"`
}

type Assertion struct {
	Type      string `json:"type"`
	Value     string `json:"value"`
	Threshold string `json:"threshold"`
	Weight    string `json:"weight"`
	Metric    string `json:"metric"`
	// Config is passed to javascript/python assertions as context.config.
	Config []KV `json:"config"`
}

type TestCase struct {
	// File, when set, makes this entry a reference to a file of tests (e.g.
	// file://suite.yaml) and the other fields are ignored.
	File        string `json:"file"`
	Description string `json:"description"`
	Vars        []KV   `json:"vars"`
	// Options holds test options such as provider, the grader for model-graded assertions.
	Options []KV        `json:"options"`
	Assert  []Assertion `json:"assert"`
}

type Config struct {
	Description string     `json:"description"`
	Prompts     []Prompt   `json:"prompts"`
	Providers   []Provider `json:"providers"`
	DefaultTest TestCase   `json:"defaultTest"`
	Tests       []TestCase `json:"tests"`
	OutputPath  string     `json:"outputPath"`
	// Extra holds top-level keys the form does not model, as YAML.
	Extra string `json:"extra"`
}

func New() Config {
	return Config{
		Prompts:     []Prompt{{Raw: "Answer the following question concisely: {{question}}"}},
		Providers:   []Provider{{ID: "openai:gpt-4.1-mini", Config: []KV{}}},
		DefaultTest: emptyTest(),
		Tests: []TestCase{{
			Description: "Capital of France",
			Vars:        []KV{{Key: "question", Value: "What is the capital of France?"}},
			Options:     []KV{},
			Assert:      []Assertion{{Type: "icontains", Value: "Paris", Config: []KV{}}},
		}},
	}
}

func ToYAML(c Config) (string, error) {
	doc := mapping()
	addString(doc, "description", c.Description)

	if prompts := promptsNode(c.Prompts); prompts != nil {
		addNode(doc, "prompts", prompts)
	}
	if providers := providersNode(c.Providers); providers != nil {
		addNode(doc, "providers", providers)
	}
	if dt, err := testNode(c.DefaultTest); err != nil {
		return "", fmt.Errorf("defaultTest: %w", err)
	} else if dt != nil {
		addNode(doc, "defaultTest", dt)
	}
	tests := sequence()
	for i, t := range c.Tests {
		if strings.TrimSpace(t.File) != "" {
			tests.Content = append(tests.Content, stringNode(strings.TrimSpace(t.File)))
			continue
		}
		n, err := testNode(t)
		if err != nil {
			return "", fmt.Errorf("test %d: %w", i+1, err)
		}
		if n == nil {
			n = mapping()
			addNode(n, "vars", mapping())
		}
		tests.Content = append(tests.Content, n)
	}
	if len(tests.Content) > 0 {
		addNode(doc, "tests", tests)
	}
	addString(doc, "outputPath", c.OutputPath)

	if strings.TrimSpace(c.Extra) != "" {
		var extra yaml.Node
		if err := yaml.Unmarshal([]byte(c.Extra), &extra); err != nil {
			return "", fmt.Errorf("advanced YAML: %w", err)
		}
		if len(extra.Content) != 1 || extra.Content[0].Kind != yaml.MappingNode {
			return "", fmt.Errorf("advanced YAML must be a mapping of top-level keys")
		}
		for i := 0; i+1 < len(extra.Content[0].Content); i += 2 {
			key := extra.Content[0].Content[i].Value
			if hasKey(doc, key) {
				return "", fmt.Errorf("advanced YAML redefines %q, which is set by the form", key)
			}
			doc.Content = append(doc.Content, extra.Content[0].Content[i], extra.Content[0].Content[i+1])
		}
	}

	out, err := encode(doc)
	if err != nil {
		return "", err
	}
	return "# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n" + out, nil
}

func FromYAML(text string) (Config, error) {
	c := Config{
		Prompts:     []Prompt{},
		Providers:   []Provider{},
		DefaultTest: emptyTest(),
		Tests:       []TestCase{},
	}
	var root yaml.Node
	if err := yaml.Unmarshal([]byte(text), &root); err != nil {
		return c, err
	}
	if len(root.Content) == 0 {
		return c, nil
	}
	doc := root.Content[0]
	if doc.Kind != yaml.MappingNode {
		return c, fmt.Errorf("expected a YAML mapping at the top level")
	}

	extra := mapping()
	for i := 0; i+1 < len(doc.Content); i += 2 {
		key, val := doc.Content[i], doc.Content[i+1]
		handled := true
		var err error
		switch key.Value {
		case "description":
			c.Description, handled = scalar(val)
		case "outputPath":
			c.OutputPath, handled = scalar(val)
		case "prompts":
			var prompts []Prompt
			if prompts, handled = parsePrompts(val); handled {
				c.Prompts = prompts
			}
		case "providers":
			var providers []Provider
			if providers, handled, err = parseProviders(val); handled {
				c.Providers = providers
			}
		case "defaultTest":
			var t TestCase
			t, handled, err = parseTest(val)
			if handled {
				c.DefaultTest = t
			}
		case "tests":
			var tests []TestCase
			if tests, handled, err = parseTests(val); handled {
				c.Tests = tests
			}
		default:
			handled = false
		}
		if err != nil {
			return c, fmt.Errorf("%s: %w", key.Value, err)
		}
		if !handled {
			extra.Content = append(extra.Content, key, val)
		}
	}
	if len(extra.Content) > 0 {
		out, err := encode(extra)
		if err != nil {
			return c, err
		}
		c.Extra = out
	}
	return c, nil
}

func encode(n *yaml.Node) (string, error) {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(n); err != nil {
		return "", err
	}
	if err := enc.Close(); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func promptsNode(prompts []Prompt) *yaml.Node {
	seq := sequence()
	for _, p := range prompts {
		if strings.TrimSpace(p.Raw) == "" {
			continue
		}
		if p.Label == "" {
			seq.Content = append(seq.Content, stringNode(p.Raw))
			continue
		}
		m := mapping()
		addString(m, "label", p.Label)
		addString(m, "raw", p.Raw)
		seq.Content = append(seq.Content, m)
	}
	if len(seq.Content) == 0 {
		return nil
	}
	return seq
}

func providersNode(providers []Provider) *yaml.Node {
	seq := sequence()
	for _, p := range providers {
		if strings.TrimSpace(p.ID) == "" {
			continue
		}
		cfg := kvNode(p.Config, true)
		if p.Label == "" && cfg == nil {
			seq.Content = append(seq.Content, stringNode(p.ID))
			continue
		}
		m := mapping()
		addString(m, "id", p.ID)
		addString(m, "label", p.Label)
		if cfg != nil {
			addNode(m, "config", cfg)
		}
		seq.Content = append(seq.Content, m)
	}
	if len(seq.Content) == 0 {
		return nil
	}
	return seq
}

func testNode(t TestCase) (*yaml.Node, error) {
	m := mapping()
	addString(m, "description", t.Description)
	if vars := kvNode(t.Vars, false); vars != nil {
		addNode(m, "vars", vars)
	}
	if opts := kvNode(t.Options, true); opts != nil {
		addNode(m, "options", opts)
	}
	asserts := sequence()
	for i, a := range t.Assert {
		if a.Type == "" {
			continue
		}
		n, err := assertionNode(a)
		if err != nil {
			return nil, fmt.Errorf("assertion %d (%s): %w", i+1, a.Type, err)
		}
		asserts.Content = append(asserts.Content, n)
	}
	if len(asserts.Content) > 0 {
		addNode(m, "assert", asserts)
	}
	if len(m.Content) == 0 {
		return nil, nil
	}
	return m, nil
}

func assertionNode(a Assertion) (*yaml.Node, error) {
	m := mapping()
	addString(m, "type", a.Type)
	if a.Value != "" {
		addNode(m, "value", valueNode(a.Value))
	}
	for _, f := range []struct{ key, val string }{{"threshold", a.Threshold}, {"weight", a.Weight}} {
		if strings.TrimSpace(f.val) == "" {
			continue
		}
		if _, err := strconv.ParseFloat(strings.TrimSpace(f.val), 64); err != nil {
			return nil, fmt.Errorf("%s must be a number, got %q", f.key, f.val)
		}
		addNode(m, f.key, typedNode(strings.TrimSpace(f.val)))
	}
	addString(m, "metric", a.Metric)
	if cfg := kvNode(a.Config, true); cfg != nil {
		addNode(m, "config", cfg)
	}
	return m, nil
}

// kvNode builds a mapping preserving row order. When typed is set, values such as
// "0.7" or "true" become numbers/booleans; otherwise they stay strings.
func kvNode(kvs []KV, typed bool) *yaml.Node {
	m := mapping()
	for _, kv := range kvs {
		if strings.TrimSpace(kv.Key) == "" {
			continue
		}
		var v *yaml.Node
		if typed {
			v = typedNode(kv.Value)
		} else {
			v = valueNode(kv.Value)
		}
		m.Content = append(m.Content, stringNode(kv.Key), v)
	}
	if len(m.Content) == 0 {
		return nil
	}
	return m
}

// valueNode keeps text as a string unless it is a JSON array or object, which lets
// users express e.g. contains-any values or array vars.
func valueNode(s string) *yaml.Node {
	t := strings.TrimSpace(s)
	if (strings.HasPrefix(t, "[") || strings.HasPrefix(t, "{")) && json.Valid([]byte(t)) {
		var n yaml.Node
		if err := yaml.Unmarshal([]byte(t), &n); err == nil && len(n.Content) == 1 {
			v := n.Content[0]
			clearStyle(v)
			if v.Kind == yaml.SequenceNode {
				v.Content = dropEmptyStrings(v.Content)
			}
			return v
		}
	}
	return stringNode(s)
}

func dropEmptyStrings(nodes []*yaml.Node) []*yaml.Node {
	out := nodes[:0]
	for _, n := range nodes {
		if n.Kind != yaml.ScalarNode || n.Tag != "!!str" || strings.TrimSpace(n.Value) != "" {
			out = append(out, n)
		}
	}
	return out
}

func typedNode(s string) *yaml.Node {
	var n yaml.Node
	if err := yaml.Unmarshal([]byte(s), &n); err == nil && len(n.Content) == 1 {
		clearStyle(n.Content[0])
		return n.Content[0]
	}
	return stringNode(s)
}

func parsePrompts(n *yaml.Node) ([]Prompt, bool) {
	if n.Kind != yaml.SequenceNode {
		return nil, false
	}
	out := []Prompt{}
	for _, item := range n.Content {
		if s, ok := scalar(item); ok {
			out = append(out, Prompt{Raw: s})
			continue
		}
		fields, ok := scalarFields(item, "label", "raw")
		if !ok {
			return nil, false
		}
		out = append(out, Prompt{Label: fields["label"], Raw: fields["raw"]})
	}
	return out, true
}

func parseProviders(n *yaml.Node) ([]Provider, bool, error) {
	if n.Kind != yaml.SequenceNode {
		return nil, false, nil
	}
	out := []Provider{}
	for _, item := range n.Content {
		if s, ok := scalar(item); ok {
			out = append(out, Provider{ID: s, Config: []KV{}})
			continue
		}
		if item.Kind != yaml.MappingNode {
			return nil, false, nil
		}
		p := Provider{Config: []KV{}}
		for i := 0; i+1 < len(item.Content); i += 2 {
			k, v := item.Content[i].Value, item.Content[i+1]
			switch k {
			case "id":
				p.ID = v.Value
			case "label":
				p.Label = v.Value
			case "config":
				kvs, err := parseKVs(v)
				if err != nil {
					return nil, false, err
				}
				p.Config = kvs
			default:
				// Unmodeled provider fields: leave the whole list to the advanced section.
				return nil, false, nil
			}
		}
		out = append(out, p)
	}
	return out, true, nil
}

func parseTests(n *yaml.Node) ([]TestCase, bool, error) {
	if n.Kind != yaml.SequenceNode {
		return nil, false, nil
	}
	out := []TestCase{}
	for _, item := range n.Content {
		if s, ok := scalar(item); ok {
			t := emptyTest()
			t.File = s
			out = append(out, t)
			continue
		}
		t, ok, err := parseTest(item)
		if err != nil || !ok {
			return nil, ok, err
		}
		out = append(out, t)
	}
	return out, true, nil
}

func emptyTest() TestCase {
	return TestCase{Vars: []KV{}, Options: []KV{}, Assert: []Assertion{}}
}

func parseTest(n *yaml.Node) (TestCase, bool, error) {
	t := emptyTest()
	if n.Kind != yaml.MappingNode {
		return t, false, nil
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		k, v := n.Content[i].Value, n.Content[i+1]
		switch k {
		case "description":
			t.Description = v.Value
		case "vars":
			if v.Kind != yaml.MappingNode {
				return t, false, nil
			}
			kvs, err := parseKVs(v)
			if err != nil {
				return t, false, err
			}
			t.Vars = kvs
		case "options":
			if v.Kind != yaml.MappingNode {
				return t, false, nil
			}
			kvs, err := parseKVs(v)
			if err != nil {
				return t, false, err
			}
			t.Options = kvs
		case "assert":
			if v.Kind != yaml.SequenceNode {
				return t, false, nil
			}
			for _, an := range v.Content {
				a, ok, err := parseAssertion(an)
				if err != nil || !ok {
					return t, ok, err
				}
				t.Assert = append(t.Assert, a)
			}
		default:
			return t, false, nil
		}
	}
	return t, true, nil
}

func parseAssertion(n *yaml.Node) (Assertion, bool, error) {
	a := Assertion{Config: []KV{}}
	if n.Kind != yaml.MappingNode {
		return a, false, nil
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		k, v := n.Content[i].Value, n.Content[i+1]
		var err error
		switch k {
		case "type":
			a.Type = v.Value
		case "value":
			a.Value, err = nodeText(v)
		case "threshold":
			a.Threshold = v.Value
		case "weight":
			a.Weight = v.Value
		case "metric":
			a.Metric = v.Value
		case "config":
			if v.Kind != yaml.MappingNode {
				return a, false, nil
			}
			a.Config, err = parseKVs(v)
		default:
			return a, false, nil
		}
		if err != nil {
			return a, false, err
		}
	}
	return a, true, nil
}

func parseKVs(n *yaml.Node) ([]KV, error) {
	out := []KV{}
	if n.Kind != yaml.MappingNode {
		return out, fmt.Errorf("expected a mapping")
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		v, err := nodeText(n.Content[i+1])
		if err != nil {
			return nil, err
		}
		out = append(out, KV{Key: n.Content[i].Value, Value: v})
	}
	return out, nil
}

// nodeText renders scalars as-is and collections as JSON.
func nodeText(n *yaml.Node) (string, error) {
	if n.Kind == yaml.ScalarNode {
		return n.Value, nil
	}
	var v any
	if err := n.Decode(&v); err != nil {
		return "", err
	}
	out, err := json.Marshal(v)
	return string(out), err
}

func scalar(n *yaml.Node) (string, bool) {
	if n.Kind != yaml.ScalarNode {
		return "", false
	}
	return n.Value, true
}

func scalarFields(n *yaml.Node, allowed ...string) (map[string]string, bool) {
	if n.Kind != yaml.MappingNode {
		return nil, false
	}
	out := map[string]string{}
	for i := 0; i+1 < len(n.Content); i += 2 {
		k := n.Content[i].Value
		v, ok := scalar(n.Content[i+1])
		if !ok || !contains(allowed, k) {
			return nil, false
		}
		out[k] = v
	}
	return out, true
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func clearStyle(n *yaml.Node) {
	n.Style = 0
	for _, c := range n.Content {
		clearStyle(c)
	}
}

func mapping() *yaml.Node  { return &yaml.Node{Kind: yaml.MappingNode} }
func sequence() *yaml.Node { return &yaml.Node{Kind: yaml.SequenceNode} }

func stringNode(s string) *yaml.Node {
	n := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: s}
	if strings.Contains(strings.TrimRight(s, "\n"), "\n") {
		n.Style = yaml.LiteralStyle
	}
	return n
}

func addString(m *yaml.Node, key, val string) {
	if val != "" {
		addNode(m, key, stringNode(val))
	}
}

func addNode(m *yaml.Node, key string, val *yaml.Node) {
	m.Content = append(m.Content, stringNode(key), val)
}

func hasKey(m *yaml.Node, key string) bool {
	for i := 0; i < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return true
		}
	}
	return false
}
