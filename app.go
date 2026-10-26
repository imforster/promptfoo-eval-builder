package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"promptfoo-eval-builder/internal/evalconfig"
	"promptfoo-eval-builder/internal/examples"
	"promptfoo-eval-builder/internal/kit"
	"promptfoo-eval-builder/internal/ollama"
	"promptfoo-eval-builder/internal/promptfile"
	"promptfoo-eval-builder/internal/toolchain"
)

var yamlFilters = []runtime.FileFilter{{DisplayName: "YAML (*.yaml, *.yml)", Pattern: "*.yaml;*.yml"}}

type App struct {
	ctx context.Context

	mu      sync.Mutex
	evalCmd *exec.Cmd
	viewCmd *exec.Cmd
	// pathReady is closed once PATH includes the login shell's, which can take
	// a few seconds, so startup doesn't wait for it; commands do.
	pathReady chan struct{}
}

type OpenResult struct {
	Path   string            `json:"path"`
	Config evalconfig.Config `json:"config"`
}

func NewApp() *App {
	return &App{pathReady: make(chan struct{})}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go func() {
		toolchain.SetupPath(ctx)
		close(a.pathReady)
	}()
}

func (a *App) ToolchainStatus() toolchain.Status {
	<-a.pathReady
	return toolchain.Check(a.ctx)
}

// InstallNode downloads Node.js LTS into the app's data folder and puts it first
// on PATH, reporting progress as "eval:output" events.
func (a *App) InstallNode() (string, error) {
	<-a.pathReady
	dir, err := toolchain.Dir()
	if err != nil {
		return "", err
	}
	version, err := toolchain.InstallNode(a.ctx, dir, func(line string) {
		runtime.EventsEmit(a.ctx, "eval:output", line)
	})
	if err != nil {
		return "", err
	}
	toolchain.PrependPath(toolchain.NodeBinDir(dir))
	runtime.EventsEmit(a.ctx, "eval:output", "Installed Node.js "+version+" in "+toolchain.NodeBinDir(dir))
	return version, nil
}

// InstallPromptfoo installs (or updates) promptfoo in the app's data folder, so
// runs don't depend on npx downloading it. Output streams like RunEval.
func (a *App) InstallPromptfoo() error {
	dir, err := toolchain.Dir()
	if err != nil {
		return err
	}
	tools := toolchain.ToolsDir(dir)
	if err := os.MkdirAll(tools, 0o755); err != nil {
		return err
	}
	return a.start(tools, "npm", "install", "--prefix", tools, "promptfoo@latest", "--no-fund", "--no-audit")
}

// shutdown stops anything the app started, so a viewer doesn't outlive the app
// and hold promptfoo's port.
func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	killTree(a.evalCmd)
	killTree(a.viewCmd)
}

func (a *App) NewConfig() evalconfig.Config {
	return evalconfig.New()
}

func (a *App) ToYAML(c evalconfig.Config) (string, error) {
	return evalconfig.ToYAML(c)
}

func (a *App) FromYAML(text string) (evalconfig.Config, error) {
	return evalconfig.FromYAML(text)
}

// OpenFile returns an empty path when the user cancels the dialog.
func (a *App) OpenFile() (OpenResult, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Open promptfoo config",
		Filters: yamlFilters,
	})
	if err != nil || path == "" {
		return OpenResult{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return OpenResult{}, err
	}
	c, err := evalconfig.FromYAML(string(data))
	if err != nil {
		return OpenResult{}, fmt.Errorf("%s: %w", filepath.Base(path), err)
	}
	return OpenResult{Path: path, Config: c}, nil
}

// Save writes to path, prompting for a location when path is empty. It returns the
// path written, or an empty path when the user cancels.
func (a *App) Save(c evalconfig.Config, path string) (string, error) {
	text, err := evalconfig.ToYAML(c)
	if err != nil {
		return "", err
	}
	if path == "" {
		path, err = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			Title:                "Save promptfoo config",
			DefaultFilename:      "promptfooconfig.yaml",
			Filters:              yamlFilters,
			CanCreateDirectories: true,
		})
		if err != nil || path == "" {
			return "", err
		}
		// macOS turns a "/" typed into the file name into ":" instead of making a folder.
		if goruntime.GOOS == "darwin" && strings.Contains(filepath.Base(path), ":") {
			return "", fmt.Errorf("%q has a \"/\" in its name, which macOS doesn't treat as a folder. "+
				"Use New Folder in the save dialog, then save promptfooconfig.yaml inside it", strings.ReplaceAll(filepath.Base(path), ":", "/"))
		}
	}
	return path, os.WriteFile(path, []byte(text), 0o644)
}

// Confirm shows a native question dialog. The webview can't be used for this:
// on macOS it ignores window.confirm and window.alert.
func (a *App) Confirm(title, message, ok string) (bool, error) {
	res, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       []string{ok, "Cancel"},
		DefaultButton: ok,
		CancelButton:  "Cancel",
	})
	// Windows ignores custom buttons and answers Yes/No.
	return res == ok || res == "Yes", err
}

func (a *App) Alert(title, message string) error {
	_, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.ErrorDialog,
		Title:   title,
		Message: message,
	})
	return err
}

func (a *App) CopyYAML(c evalconfig.Config) error {
	text, err := evalconfig.ToYAML(c)
	if err != nil {
		return err
	}
	return runtime.ClipboardSetText(a.ctx, text)
}

func (a *App) ListExamples() []examples.Example {
	return examples.All
}

func (a *App) LoadExample(id string) (evalconfig.Config, error) {
	return examples.Load(id)
}

// PromptFiles reads the files a prompt refers to, relative to the saved config at path.
func (a *App) PromptFiles(path, raw string) []promptfile.File {
	dir := ""
	if path != "" {
		dir = filepath.Dir(path)
	}
	return promptfile.Read(dir, raw)
}

// PickPromptFile asks for a prompt file and returns its path relative to the
// saved config's folder when it is inside it (promptfoo resolves file:// paths
// from there), or absolute otherwise. It returns "" when the user cancels.
func (a *App) PickPromptFile(configPath string) (string, error) {
	dir := ""
	if configPath != "" {
		dir = filepath.Dir(configPath)
	}
	picked, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Choose a prompt file",
		DefaultDirectory: dir,
		Filters: []runtime.FileFilter{
			{DisplayName: "Prompt files (*.md, *.txt, *.j2, *.json, *.yaml)", Pattern: "*.md;*.txt;*.j2;*.json;*.yaml;*.yml"},
			{DisplayName: "All files", Pattern: "*"},
		},
	})
	if err != nil || picked == "" {
		return "", err
	}
	return relativeTo(dir, picked), nil
}

func relativeTo(dir, path string) string {
	if dir != "" {
		if rel, err := filepath.Rel(dir, path); err == nil && !strings.HasPrefix(rel, "..") {
			return filepath.ToSlash(rel)
		}
	}
	return filepath.ToSlash(path)
}

// OpenInDefaultApp opens a local file with the app the system associates with it.
func (a *App) OpenInDefaultApp(path string) {
	runtime.BrowserOpenURL(a.ctx, (&url.URL{Scheme: "file", Path: filepath.ToSlash(path)}).String())
}

// KitStatus reports whether the config uses Improving's EDD kit and which kit
// files are missing next to the saved config at path.
func (a *App) KitStatus(path string, c evalconfig.Config) (kit.Status, error) {
	text, err := evalconfig.ToYAML(c)
	if err != nil {
		return kit.Status{}, err
	}
	dir := ""
	if path != "" {
		dir = filepath.Dir(path)
	}
	s := kit.Check(dir, text)
	if home, err := os.UserHomeDir(); err == nil && dir != "" && filepath.Clean(dir) == filepath.Clean(home) {
		s.InHomeDir = true
	}
	return s, nil
}

// InstallKit downloads missing kit files into the saved config's folder.
func (a *App) InstallKit(path string) ([]string, error) {
	if path == "" {
		return nil, fmt.Errorf("save the config first; the kit files go in its folder")
	}
	return kit.Install(a.ctx, filepath.Dir(path))
}

// OllamaStatus reports whether the config's Ollama server is installed, running
// and has the models the config needs.
func (a *App) OllamaStatus(c evalconfig.Config) ollama.Status {
	<-a.pathReady
	return ollama.Check(a.ctx, c)
}

// PullOllamaModel downloads a model with `ollama pull`, streaming output like RunEval.
func (a *App) PullOllamaModel(model string) error {
	<-a.pathReady
	bin := ollama.FindBinary()
	if bin == "" {
		return fmt.Errorf("the ollama program wasn't found; install Ollama first")
	}
	return a.start("", bin, "pull", model)
}

// RunEval runs `promptfoo eval` on a saved config, streaming output as "eval:output"
// events and finishing with an "eval:done" event carrying the exit error, if any.
// It uses the folder's own promptfoo when installed (e.g. pinned by the kit's
// package.json), and promptfoo@latest otherwise.
func (a *App) RunEval(path string, noCache bool) error {
	if path == "" {
		return fmt.Errorf("save the config before running it")
	}
	dir := filepath.Dir(path)
	name, args := promptfooCommand(dir)
	args = append(args, "eval", "-c", filepath.Base(path), "--no-progress-bar")
	if noCache {
		args = append(args, "--no-cache")
	}
	return a.start(dir, name, args...)
}

// InstallDeps runs `npm install` in the saved config's folder, streaming output
// like RunEval.
func (a *App) InstallDeps(path string) error {
	if path == "" {
		return fmt.Errorf("save the config first")
	}
	return a.start(filepath.Dir(path), "npm", "install")
}

func (a *App) start(dir, name string, args ...string) error {
	<-a.pathReady
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.evalCmd != nil {
		return fmt.Errorf("a command is already running")
	}
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	startGroup(cmd)
	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("could not start %s (is Node.js installed?): %w", name, err)
	}
	a.evalCmd = cmd
	runtime.EventsEmit(a.ctx, "eval:output", "$ "+name+" "+strings.Join(args, " ")+"\n")

	go func() {
		scanner := bufio.NewScanner(pr)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			runtime.EventsEmit(a.ctx, "eval:output", scanner.Text())
		}
	}()
	go func() {
		err := cmd.Wait()
		pw.Close()
		a.mu.Lock()
		a.evalCmd = nil
		a.mu.Unlock()
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		runtime.EventsEmit(a.ctx, "eval:done", msg)
	}()
	return nil
}

func (a *App) StopEval() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return killTree(a.evalCmd)
}

// promptfooCommand picks the promptfoo to run: the folder's own when installed
// (e.g. pinned by the kit's package.json), then the app-installed one, and
// otherwise npx, which downloads promptfoo@latest.
func promptfooCommand(dir string) (string, []string) {
	if dir != "" {
		if _, err := os.Stat(filepath.Join(dir, "node_modules", ".bin", "promptfoo")); err == nil {
			return "npx", []string{"--no-install", "promptfoo"}
		}
	}
	if data, err := toolchain.Dir(); err == nil {
		if bin := toolchain.PromptfooBin(data); fileExists(bin) {
			return bin, nil
		}
	}
	return "npx", []string{"-y", "promptfoo@latest"}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

const viewerPort = "15500"

func viewerRunning() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:"+viewerPort, 300*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// ViewResults opens promptfoo's web viewer. Every viewer reads the same results
// database (~/.promptfoo), so a viewer that is already running, even one from
// an earlier session, is reused. Otherwise it starts one and waits until it
// listens or fails, so failures can be reported.
func (a *App) ViewResults(path string) error {
	<-a.pathReady
	viewerURL := "http://localhost:" + viewerPort
	if viewerRunning() {
		runtime.BrowserOpenURL(a.ctx, viewerURL)
		return nil
	}
	dir := ""
	if path != "" {
		dir = filepath.Dir(path)
	}
	name, args := promptfooCommand(dir)
	cmd := exec.Command(name, append(args, "view", "--no", "--port", viewerPort)...)
	cmd.Dir = dir
	startGroup(cmd)
	var out tailBuffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("could not start promptfoo (is Node.js installed?): %w", err)
	}
	a.mu.Lock()
	killTree(a.viewCmd)
	a.viewCmd = cmd
	a.mu.Unlock()

	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	// npx may need to download promptfoo first.
	deadline := time.After(2 * time.Minute)
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case err := <-exited:
			return fmt.Errorf("promptfoo view stopped (%v):\n%s", err, out.String())
		case <-deadline:
			return fmt.Errorf("promptfoo view didn't start listening on port %s:\n%s", viewerPort, out.String())
		case <-tick.C:
			if viewerRunning() {
				runtime.BrowserOpenURL(a.ctx, viewerURL)
				return nil
			}
		}
	}
}

// tailBuffer keeps the last few KB of a command's output for error messages.
type tailBuffer struct {
	mu  sync.Mutex
	buf []byte
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	if len(t.buf) > 4096 {
		t.buf = t.buf[len(t.buf)-4096:]
	}
	return len(p), nil
}

func (t *tailBuffer) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return strings.TrimSpace(string(t.buf))
}
