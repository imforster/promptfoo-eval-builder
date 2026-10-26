// Package ollama checks that the Ollama server a config needs is installed,
// running, and has the config's models, so a run can explain what to set up
// instead of failing with a connection error or a 404.
package ollama

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"promptfoo-eval-builder/internal/evalconfig"
)

const (
	DefaultBaseURL = "http://localhost:11434"
	// kitScript is the EDD kit's exec: provider for Ollama; its default model is llama2.
	kitScript       = "ollama.js"
	kitDefaultModel = "llama2"
)

type Status struct {
	// Used reports whether any provider or grader in the config runs on Ollama.
	Used bool   `json:"used"`
	OS   string `json:"os"`
	// BaseURL is the server the config talks to. Remote is set when it isn't this
	// computer, so installing Ollama here wouldn't help.
	BaseURL string `json:"baseURL"`
	Remote  bool   `json:"remote"`
	// Installed is true when the ollama program was found or the server answers.
	Installed bool   `json:"installed"`
	BinPath   string `json:"binPath"`
	Running   bool   `json:"running"`
	// Models are the models the config needs; Missing are those the server doesn't have.
	Models  []string `json:"models"`
	Missing []string `json:"missing"`
	Error   string   `json:"error"`
}

// Ready reports whether a run can reach Ollama with every model it needs.
func (s Status) Ready() bool { return !s.Used || (s.Running && len(s.Missing) == 0) }

// Requirements finds the Ollama server and models a config uses, from native
// ollama: providers and graders, and from the kit's ollama.js script. It reads
// the whole generated YAML, so providers kept in the advanced section count too.
func Requirements(c evalconfig.Config) (baseURL string, models []string) {
	text, err := evalconfig.ToYAML(c)
	if err != nil {
		return "", nil
	}
	var doc struct {
		Providers   any `yaml:"providers"`
		DefaultTest any `yaml:"defaultTest"`
		Tests       any `yaml:"tests"`
	}
	if err := yaml.Unmarshal([]byte(text), &doc); err != nil {
		return "", nil
	}
	add := func(m string) {
		if m != "" && !contains(models, m) {
			models = append(models, m)
		}
	}
	visit := func(provider any) {
		id, cfg := providerParts(provider)
		if m, ok := nativeModel(id); ok {
			if baseURL == "" {
				baseURL = nativeBaseURL()
			}
			add(m)
		} else if strings.Contains(id, kitScript) {
			if baseURL == "" {
				baseURL = kitBaseURL(cfg["host"], cfg["port"])
			}
			add(orDefault(cfg["model"], kitDefaultModel))
		}
	}
	for _, p := range asList(doc.Providers) {
		visit(p)
	}
	for _, t := range append([]any{doc.DefaultTest}, asList(doc.Tests)...) {
		if opts, ok := asMap(t)["options"]; ok {
			if grader, ok := asMap(opts)["provider"]; ok {
				visit(grader)
			}
		}
	}
	return baseURL, models
}

// providerParts reads a provider written as an ID string or as a mapping with
// id and config.
func providerParts(p any) (string, map[string]string) {
	if s, ok := p.(string); ok {
		return strings.TrimSpace(s), nil
	}
	m := asMap(p)
	id, _ := m["id"].(string)
	cfg := map[string]string{}
	for k, v := range asMap(m["config"]) {
		cfg[k] = strings.TrimSpace(fmt.Sprint(v))
	}
	return strings.TrimSpace(id), cfg
}

func asList(v any) []any {
	switch x := v.(type) {
	case []any:
		return x
	case nil:
		return nil
	default:
		return []any{x}
	}
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

// Check reports whether the config's Ollama server is installed, running and
// has its models. A config that doesn't use Ollama reports Used false.
func Check(ctx context.Context, c evalconfig.Config) Status {
	s := Status{OS: runtime.GOOS, Models: []string{}, Missing: []string{}}
	baseURL, models := Requirements(c)
	if baseURL == "" {
		return s
	}
	s.Used = true
	s.BaseURL = baseURL
	s.Models = models
	s.Remote = !isLocal(baseURL)
	s.BinPath = FindBinary()

	available, err := listModels(ctx, baseURL)
	if err != nil {
		s.Error = err.Error()
		s.Installed = s.BinPath != ""
		s.Missing = models
		return s
	}
	s.Running = true
	s.Installed = true
	for _, m := range models {
		if !hasModel(available, m) {
			s.Missing = append(s.Missing, m)
		}
	}
	return s
}

// FindBinary returns the ollama program's path, or "" when it isn't installed.
// It also looks where the installers put it, since an app started before Ollama
// was installed doesn't see PATH changes.
func FindBinary() string {
	if path, err := exec.LookPath("ollama"); err == nil {
		return path
	}
	for _, path := range installLocations() {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

func installLocations() []string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return []string{
			"/Applications/Ollama.app/Contents/Resources/ollama",
			filepath.Join(home, "Applications", "Ollama.app", "Contents", "Resources", "ollama"),
			"/opt/homebrew/bin/ollama",
			"/usr/local/bin/ollama",
		}
	case "windows":
		return []string{filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe")}
	default:
		return []string{"/usr/local/bin/ollama", "/usr/bin/ollama"}
	}
}

func listModels(ctx context.Context, baseURL string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/api/tags", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("no Ollama server is answering at %s", baseURL)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s/api/tags answered %s; is that an Ollama server?", baseURL, resp.Status)
	}
	var body struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("%s/api/tags: %w", baseURL, err)
	}
	names := make([]string, 0, len(body.Models))
	for _, m := range body.Models {
		names = append(names, m.Name)
	}
	return names, nil
}

// hasModel matches Ollama's naming, where "llama3.1" means "llama3.1:latest".
func hasModel(available []string, model string) bool {
	if !strings.Contains(model, ":") {
		model += ":latest"
	}
	for _, a := range available {
		if !strings.Contains(a, ":") {
			a += ":latest"
		}
		if a == model {
			return true
		}
	}
	return false
}

// nativeModel parses promptfoo's ollama:<model>, ollama:chat:<model>,
// ollama:completion:<model> and ollama:embeddings:<model> provider IDs.
func nativeModel(id string) (string, bool) {
	rest, ok := strings.CutPrefix(strings.TrimSpace(id), "ollama:")
	if !ok {
		return "", false
	}
	for _, kind := range []string{"chat:", "completion:", "embeddings:", "embedding:"} {
		if m, ok := strings.CutPrefix(rest, kind); ok {
			return m, m != ""
		}
	}
	return rest, rest != ""
}

// nativeBaseURL is where promptfoo's ollama: providers connect.
func nativeBaseURL() string {
	return orDefault(strings.TrimRight(os.Getenv("OLLAMA_BASE_URL"), "/"), DefaultBaseURL)
}

func kitBaseURL(host, port string) string {
	return "http://" + net.JoinHostPort(orDefault(host, "localhost"), orDefault(port, "11434"))
}

func isLocal(baseURL string) bool {
	u, err := url.Parse(baseURL)
	if err != nil {
		return true
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1", "0.0.0.0", "":
		return true
	}
	return false
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
