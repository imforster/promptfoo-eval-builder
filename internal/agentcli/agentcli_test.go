package agentcli

import (
	"context"
	"testing"
)

func TestCheckReportsOnlyCLIsTheConfigUses(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	got := check(context.Background(), "providers:\n  - id: 'exec: node ./claude.js'\n  - id: 'exec: node ./devinProvider.js'\n")
	if len(got) != 2 || got[0].Command != "devin" || got[1].Command != "claude" {
		t.Fatalf("got %+v, want devin and claude", got)
	}
	for _, s := range got {
		if s.Problem != ProblemNotFound {
			t.Errorf("%s: problem = %q, want %q", s.Command, s.Problem, ProblemNotFound)
		}
	}
}

func TestCheckIgnoresConfigsWithoutKitScripts(t *testing.T) {
	got := check(context.Background(), "providers:\n  - openai:gpt-4.1\n")
	if got == nil || len(got) != 0 {
		t.Fatalf("got %+v, want an empty, non-nil list", got)
	}
}

func TestLooksLikeInstaller(t *testing.T) {
	cases := map[string]bool{
		"Installation instructions: https://docs.github.com/...\nInstall GitHub Copilot CLI? [y/N] ": true,
		"GitHub Copilot CLI 1.0.105.\nRun 'copilot update' to check for updates.":                    false,
		"": false,
	}
	for out, want := range cases {
		if got := looksLikeInstaller(out); got != want {
			t.Errorf("looksLikeInstaller(%q) = %v, want %v", out, got, want)
		}
	}
}
