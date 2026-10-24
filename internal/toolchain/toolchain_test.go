package toolchain

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseVersion(t *testing.T) {
	v, ok := ParseVersion("v22.21.9\n")
	if !ok || v != (Version{22, 21, 9}) {
		t.Fatalf("got %v %v", v, ok)
	}
	if !v.Less(MinNode) || (Version{24, 0, 0}).Less(MinNode) || MinNode.Less(MinNode) {
		t.Fatal("Less is wrong")
	}
}

func TestWithinRejectsEscapes(t *testing.T) {
	dest := t.TempDir()
	for _, bad := range []string{"../x", "a/../../x"} {
		if _, err := within(dest, bad); err == nil {
			t.Errorf("%q should be rejected", bad)
		}
	}
	if _, err := within(dest, "node-v1/bin/node"); err != nil {
		t.Error(err)
	}
}

func TestDedupe(t *testing.T) {
	got := strings.Join(dedupe([]string{"/a", "", "/b", "/a"}), ":")
	if got != "/a:/b" {
		t.Fatalf("got %s", got)
	}
}

// Downloads Node.js from nodejs.org, so it only runs with TOOLCHAIN_LIVE=1.
func TestInstallNodeLive(t *testing.T) {
	if os.Getenv("TOOLCHAIN_LIVE") == "" {
		t.Skip("set TOOLCHAIN_LIVE=1 to download Node.js")
	}
	dir := t.TempDir()
	version, err := InstallNode(context.Background(), dir, func(s string) { t.Log(s) })
	if err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command(filepath.Join(NodeBinDir(dir), "node"), "--version").Output()
	if err != nil || strings.TrimSpace(string(out)) != version {
		t.Fatalf("node --version = %q, %v; want %s", out, err, version)
	}
	if _, err := os.Lstat(filepath.Join(NodeBinDir(dir), "npm")); err != nil {
		t.Fatal("npm missing:", err)
	}
}
