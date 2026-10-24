// Package kit fetches the support files from Improving's promptfoo EDD kit
// (https://github.com/improving/promptfoo): CLI-agent provider scripts, custom
// assertion scripts, and the prompts and test suites its examples reference.
package kit

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	Repo    = "https://github.com/improving/promptfoo"
	baseURL = "https://raw.githubusercontent.com/improving/promptfoo/main/"
)

// Files are paths relative to the config's folder, mirroring the kit repository.
var Files = []string{
	"devin.js",
	"devinProvider.js",
	"claude.js",
	"gh_copilot.js",
	"agy.js",
	"kiro.js",
	"ollama.js",
	"eval-script.js",
	"matchSchema-script.js",
	"example.schema.json",
	"prompt-under-test.md",
	"fileBased.testSuite.yaml",
	"matchSchema.testSuite.yaml",
	"trust-ai/simple.prompt.md",
	"trust-ai/advanced.prompt.md",
	// Pins promptfoo and adds ajv, which matchSchema-script.js needs.
	"package.json",
}

type Status struct {
	// Dir is the folder the kit files belong in: the saved config's folder.
	Dir string `json:"dir"`
	// InHomeDir is set by the caller when Dir is the user's home folder, where
	// the kit's files would be scattered among the user's own.
	InHomeDir bool `json:"inHomeDir"`
	// Used reports whether the config references any kit file.
	Used    bool     `json:"used"`
	Missing []string `json:"missing"`
	// HasPackageJSON and HasNodeModules tell the UI whether `npm install` is needed.
	HasPackageJSON bool `json:"hasPackageJSON"`
	HasNodeModules bool `json:"hasNodeModules"`
}

// Check reports kit usage for config text, and which kit files are missing from
// dir. An empty dir (unsaved config) reports every file as missing.
func Check(dir, configText string) Status {
	s := Status{Dir: dir, Missing: []string{}}
	for _, f := range Files {
		if f != "package.json" && strings.Contains(configText, f) {
			s.Used = true
		}
		if dir == "" || !exists(filepath.Join(dir, filepath.FromSlash(f))) {
			s.Missing = append(s.Missing, f)
		}
	}
	if dir != "" {
		s.HasPackageJSON = exists(filepath.Join(dir, "package.json"))
		s.HasNodeModules = exists(filepath.Join(dir, "node_modules"))
	}
	return s
}

// Install downloads the kit files missing from dir. Existing files are never
// overwritten. It returns the files written.
func Install(ctx context.Context, dir string) ([]string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	written := []string{}
	for _, f := range Files {
		dest := filepath.Join(dir, filepath.FromSlash(f))
		if exists(dest) {
			continue
		}
		data, err := fetch(ctx, client, baseURL+f)
		if err != nil {
			return written, fmt.Errorf("%s: %w", f, err)
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return written, err
		}
		if err := os.WriteFile(dest, data, 0o644); err != nil {
			return written, err
		}
		written = append(written, f)
	}
	return written, nil
}

func fetch(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 5<<20))
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
