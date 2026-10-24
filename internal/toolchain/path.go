package toolchain

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// SetupPath makes the app see the same tools as the user's terminal. Apps opened
// from Finder or the Dock get a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that
// misses Homebrew, nvm, Volta and the like, so it adds the login shell's PATH and
// common install folders, with the app-installed Node.js first.
func SetupPath(ctx context.Context) {
	var dirs []string
	if dir, err := Dir(); err == nil {
		dirs = append(dirs, NodeBinDir(dir))
	}
	if runtime.GOOS != "windows" {
		dirs = append(dirs, loginShellPath(ctx)...)
		home, _ := os.UserHomeDir()
		dirs = append(dirs,
			"/opt/homebrew/bin",
			"/usr/local/bin",
			filepath.Join(home, ".volta", "bin"),
			filepath.Join(home, ".local", "bin"),
		)
	}
	dirs = append(dirs, filepath.SplitList(os.Getenv("PATH"))...)
	os.Setenv("PATH", strings.Join(dedupe(dirs), string(os.PathListSeparator)))
}

// PrependPath puts dir first on PATH, e.g. after installing Node.js.
func PrependPath(dir string) {
	dirs := append([]string{dir}, filepath.SplitList(os.Getenv("PATH"))...)
	os.Setenv("PATH", strings.Join(dedupe(dirs), string(os.PathListSeparator)))
}

func loginShellPath(ctx context.Context) []string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	// Markers keep shell startup noise (banners, prompts) out of the result.
	out, err := exec.CommandContext(ctx, shell, "-ilc", `printf '__PATH__%s__END__' "$PATH"`).Output()
	if err != nil {
		return nil
	}
	s := string(out)
	start := strings.Index(s, "__PATH__")
	end := strings.LastIndex(s, "__END__")
	if start < 0 || end < start {
		return nil
	}
	return filepath.SplitList(s[start+len("__PATH__") : end])
}

func dedupe(dirs []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, d := range dirs {
		if d == "" || seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
	}
	return out
}
