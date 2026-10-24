// Package toolchain finds, and if needed installs, the Node.js and promptfoo the
// app runs. A copy the app installs itself lives in its data folder (Dir), so no
// admin rights or package manager are needed.
package toolchain

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// MinNode is the oldest Node.js promptfoo supports (its package.json engines field).
var MinNode = Version{22, 22, 0}

type Version [3]int

func (v Version) String() string { return fmt.Sprintf("%d.%d.%d", v[0], v[1], v[2]) }

func (v Version) Less(o Version) bool {
	for i := range v {
		if v[i] != o[i] {
			return v[i] < o[i]
		}
	}
	return false
}

var versionPattern = regexp.MustCompile(`(\d+)\.(\d+)\.(\d+)`)

func ParseVersion(s string) (Version, bool) {
	m := versionPattern.FindStringSubmatch(s)
	if m == nil {
		return Version{}, false
	}
	var v Version
	for i := range v {
		v[i], _ = strconv.Atoi(m[i+1])
	}
	return v, true
}

// Dir is the app's data folder, e.g. ~/Library/Application Support/promptfoo-eval-builder.
func Dir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "promptfoo-eval-builder"), nil
}

// NodeBinDir is where the app-installed Node.js keeps node and npm.
func NodeBinDir(dir string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(dir, "node")
	}
	return filepath.Join(dir, "node", "bin")
}

// ToolsDir is the npm prefix the app installs promptfoo into.
func ToolsDir(dir string) string { return filepath.Join(dir, "tools") }

// PromptfooBin is the app-installed promptfoo executable.
func PromptfooBin(dir string) string {
	name := "promptfoo"
	if runtime.GOOS == "windows" {
		name += ".cmd"
	}
	return filepath.Join(ToolsDir(dir), "node_modules", ".bin", name)
}

type Status struct {
	NodePath    string `json:"nodePath"`
	NodeVersion string `json:"nodeVersion"`
	// NodeOK means Node.js was found and is new enough for promptfoo.
	NodeOK      bool   `json:"nodeOK"`
	NodeManaged bool   `json:"nodeManaged"`
	MinNode     string `json:"minNode"`
	// PromptfooVersion is the app-installed promptfoo; empty means runs fall back to npx.
	PromptfooVersion string `json:"promptfooVersion"`
	PromptfooPath    string `json:"promptfooPath"`
	DataDir          string `json:"dataDir"`
}

func Check(ctx context.Context) Status {
	s := Status{MinNode: MinNode.String()}
	dir, err := Dir()
	if err == nil {
		s.DataDir = dir
	}
	if path, err := exec.LookPath("node"); err == nil {
		s.NodePath = path
		if out, err := output(ctx, path, "--version"); err == nil {
			s.NodeVersion = strings.TrimPrefix(out, "v")
			v, ok := ParseVersion(out)
			s.NodeOK = ok && !v.Less(MinNode)
		}
		s.NodeManaged = dir != "" && strings.HasPrefix(path, NodeBinDir(dir))
	}
	if dir != "" {
		bin := PromptfooBin(dir)
		if _, err := os.Stat(bin); err == nil && s.NodeOK {
			s.PromptfooPath = bin
			if out, err := output(ctx, bin, "--version"); err == nil {
				s.PromptfooVersion = out
			}
		}
	}
	return s
}

func output(ctx context.Context, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).Output()
	return strings.TrimSpace(string(out)), err
}
