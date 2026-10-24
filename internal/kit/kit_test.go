package kit

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestCheck(t *testing.T) {
	dir := t.TempDir()
	for _, f := range Files {
		if f == "trust-ai/simple.prompt.md" {
			continue
		}
		path := filepath.Join(dir, filepath.FromSlash(f))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, nil, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	s := Check(dir, "providers:\n  - 'exec: node ./claude.js'\n")
	if !s.Used || !s.HasPackageJSON || s.HasNodeModules {
		t.Fatalf("got %+v", s)
	}
	if !reflect.DeepEqual(s.Missing, []string{"trust-ai/simple.prompt.md"}) {
		t.Fatalf("missing: %v", s.Missing)
	}
	if Check(dir, "providers: [openai:gpt-4.1]").Used {
		t.Fatal("plain config should not use the kit")
	}
}

// Downloads from GitHub, so it only runs with KIT_LIVE=1.
func TestInstallLive(t *testing.T) {
	if os.Getenv("KIT_LIVE") == "" {
		t.Skip("set KIT_LIVE=1 to download the kit from GitHub")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	written, err := Install(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(written) != len(Files)-1 {
		t.Fatalf("wrote %v", written)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "package.json")); string(data) != "{}" {
		t.Fatal("existing package.json was overwritten")
	}
	if s := Check(dir, ""); len(s.Missing) != 0 {
		t.Fatalf("still missing %v", s.Missing)
	}
}
