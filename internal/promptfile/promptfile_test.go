package promptfile

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRefs(t *testing.T) {
	cases := map[string][]File{
		"file://trust-ai/simple.prompt.md":  {{Ref: "file://trust-ai/simple.prompt.md", Templated: true, Path: "trust-ai/simple.prompt.md"}},
		"file://prompts.py:make_prompt":     {{Ref: "file://prompts.py:make_prompt", Templated: true, Path: "prompts.py"}},
		"@prompt-under-test.md {{request}}": {{Ref: "@prompt-under-test.md", Path: "prompt-under-test.md"}},
		"Use @./a.md and @b/c.txt, then @a.md again. Ping @team": {
			{Ref: "@./a.md", Path: "./a.md"},
			{Ref: "@b/c.txt", Path: "b/c.txt"},
			{Ref: "@a.md", Path: "a.md"},
		},
		"Answer: {{question}}": {},
	}
	for raw, want := range cases {
		if got := Refs(raw); !reflect.DeepEqual(got, want) {
			t.Errorf("Refs(%q) = %+v, want %+v", raw, got, want)
		}
	}
}

func TestRead(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "p.md"), []byte("Hello {{name}}"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := Read(dir, "@p.md and @missing.md")
	if got[0].Content != "Hello {{name}}" || got[0].Error != "" || got[0].Path != filepath.Join(dir, "p.md") {
		t.Errorf("p.md: %+v", got[0])
	}
	if !strings.HasPrefix(got[1].Error, "Not found") {
		t.Errorf("missing.md: %+v", got[1])
	}
	if f := Read("", "file://p.md")[0]; !strings.Contains(f.Error, "Save the config") {
		t.Errorf("unsaved: %+v", f)
	}
}
