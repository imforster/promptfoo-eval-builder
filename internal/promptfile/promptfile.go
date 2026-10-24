// Package promptfile finds and reads the files a prompt refers to: a whole
// prompt of file://path, or @path references, the convention Improving's kit
// uses to point CLI agents at a file.
package promptfile

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const maxSize = 512 << 10

type File struct {
	// Ref is the reference as written, e.g. file://prompt.md or @prompt.md.
	Ref string `json:"ref"`
	// Templated is set for file:// prompts, whose {{vars}} promptfoo renders. The
	// contents of @path files go to the provider as-is.
	Templated bool   `json:"templated"`
	Path      string `json:"path"`
	Content   string `json:"content"`
	Error     string `json:"error"`
}

var atRef = regexp.MustCompile(`(?:^|\s)@(\S+)`)

// Refs returns the files referenced by a prompt, without reading them.
func Refs(raw string) []File {
	t := strings.TrimSpace(raw)
	if rest, ok := strings.CutPrefix(t, "file://"); ok && !strings.ContainsAny(t, "\n") {
		path := rest
		// file://prompts.py:make_prompt names a function in a script.
		if i := strings.LastIndex(path, ":"); i > 0 && isScript(path[:i]) {
			path = path[:i]
		}
		return []File{{Ref: t, Templated: true, Path: path}}
	}
	out := []File{}
	seen := map[string]bool{}
	for _, m := range atRef.FindAllStringSubmatch(raw, -1) {
		path := strings.TrimRight(m[1], ".,;:!?)]'\"")
		// Skip handles and emails-like tokens; a file reference has an extension or a slash.
		if !strings.ContainsAny(path, "./") || seen[path] {
			continue
		}
		seen[path] = true
		out = append(out, File{Ref: "@" + path, Path: path})
	}
	return out
}

// Read resolves each reference against dir (the config's folder) and reads it.
func Read(dir, raw string) []File {
	files := Refs(raw)
	for i := range files {
		f := &files[i]
		if strings.ContainsAny(f.Path, "*?[") {
			f.Error = "Glob patterns aren't previewed."
			continue
		}
		path := f.Path
		if !filepath.IsAbs(path) {
			if dir == "" {
				f.Error = "Save the config to view files relative to it."
				continue
			}
			path = filepath.Join(dir, filepath.FromSlash(path))
		}
		f.Path = path
		content, err := readLimited(path)
		if err != nil {
			f.Error = err.Error()
			continue
		}
		f.Content = content
	}
	return files
}

func readLimited(path string) (string, error) {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return "", fmt.Errorf("Not found: %s", path)
	}
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxSize+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxSize {
		return string(data[:maxSize]) + "\n… (truncated)", nil
	}
	return string(data), nil
}

func isScript(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".js", ".cjs", ".mjs", ".ts", ".py":
		return true
	}
	return false
}
