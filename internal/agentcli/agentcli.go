// Package agentcli checks that the coding-agent CLIs a config's kit scripts
// drive are installed, so a run can explain what to set up instead of failing
// every test with "CLI not found".
package agentcli

import (
	"context"
	"os/exec"
	"strings"
	"time"

	"promptfoo-eval-builder/internal/evalconfig"
)

const (
	ProblemNone          = ""
	ProblemNotFound      = "not-found"
	ProblemInstallerStub = "installer-stub"
)

type Status struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	// Path is where Command was found on PATH.
	Path string `json:"path"`
	// Problem is ProblemNotFound when Command isn't on PATH, or ProblemInstallerStub
	// when it is only a launcher that offers to install the real CLI.
	Problem string `json:"problem"`
}

type cli struct {
	name, command string
	scripts       []string
	// verify runs `command --version` to catch installer stubs.
	verify bool
}

// clis maps the EDD kit's provider scripts to the CLI each one runs.
var clis = []cli{
	{name: "Devin", command: "devin", scripts: []string{"devin.js", "devinProvider.js"}},
	{name: "Claude Code", command: "claude", scripts: []string{"claude.js"}},
	// VS Code puts a copilot launcher on PATH that only offers to install the CLI.
	{name: "GitHub Copilot CLI", command: "copilot", scripts: []string{"gh_copilot.js"}, verify: true},
	{name: "Google Antigravity", command: "agy", scripts: []string{"agy.js"}},
	{name: "Kiro", command: "kiro-cli", scripts: []string{"kiro.js"}},
}

// Check reports on each CLI the config's kit scripts use. It returns an empty
// list when the config uses none. It reads the whole generated YAML, so
// providers kept in the advanced section and graders count too.
func Check(ctx context.Context, c evalconfig.Config) []Status {
	text, err := evalconfig.ToYAML(c)
	if err != nil {
		return []Status{}
	}
	return check(ctx, text)
}

func check(ctx context.Context, configText string) []Status {
	out := []Status{}
	for _, k := range clis {
		if !usesAny(configText, k.scripts) {
			continue
		}
		s := Status{Name: k.name, Command: k.command}
		path, err := exec.LookPath(k.command)
		switch {
		case err != nil:
			s.Problem = ProblemNotFound
		default:
			s.Path = path
			if k.verify && isInstallerStub(ctx, path) {
				s.Problem = ProblemInstallerStub
			}
		}
		out = append(out, s)
	}
	return out
}

func usesAny(text string, scripts []string) bool {
	for _, s := range scripts {
		if strings.Contains(text, s) {
			return true
		}
	}
	return false
}

// isInstallerStub runs `path --version` with no input, which a launcher answers
// by offering to install the CLI.
func isInstallerStub(ctx context.Context, path string) bool {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, _ := exec.CommandContext(ctx, path, "--version").CombinedOutput()
	return looksLikeInstaller(string(out))
}

func looksLikeInstaller(output string) bool {
	return strings.Contains(output, "Install GitHub Copilot CLI?") ||
		strings.Contains(output, "Installation instructions")
}
