package toolchain

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const distURL = "https://nodejs.org/dist/"

type release struct {
	Version string `json:"version"`
	// LTS is false, or the release line's codename.
	LTS any `json:"lts"`
}

// InstallNode downloads the current Node.js LTS from nodejs.org, checks it
// against the published SHA-256 sums, and unpacks it into dir/node, replacing
// any earlier app-installed copy. It returns the version installed.
func InstallNode(ctx context.Context, dir string, progress func(string)) (string, error) {
	client := &http.Client{Timeout: 10 * time.Minute}
	version, err := latestLTS(ctx, client)
	if err != nil {
		return "", err
	}
	name, err := archiveName(version)
	if err != nil {
		return "", err
	}
	progress(fmt.Sprintf("Downloading Node.js %s (%s)…", version, name))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	archive, err := os.CreateTemp(dir, "node-*.download")
	if err != nil {
		return "", err
	}
	defer os.Remove(archive.Name())
	defer archive.Close()

	hash := sha256.New()
	if err := download(ctx, client, distURL+version+"/"+name, io.MultiWriter(archive, hash)); err != nil {
		return "", err
	}
	want, err := publishedSum(ctx, client, version, name)
	if err != nil {
		return "", err
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != want {
		return "", fmt.Errorf("checksum mismatch for %s: got %s, want %s", name, got, want)
	}
	progress("Checksum verified. Unpacking…")

	staging, err := os.MkdirTemp(dir, "node-staging-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(staging)
	if _, err := archive.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	if strings.HasSuffix(name, ".zip") {
		err = unzip(archive, staging)
	} else {
		err = untar(archive, staging)
	}
	if err != nil {
		return "", fmt.Errorf("unpacking %s: %w", name, err)
	}
	// The archive holds a single node-vX-os-arch folder.
	unpacked := filepath.Join(staging, strings.TrimSuffix(strings.TrimSuffix(name, ".tar.gz"), ".zip"))
	dest := filepath.Join(dir, "node")
	if err := os.RemoveAll(dest); err != nil {
		return "", err
	}
	if err := os.Rename(unpacked, dest); err != nil {
		return "", err
	}
	return version, nil
}

func latestLTS(ctx context.Context, client *http.Client) (string, error) {
	var releases []release
	if err := getJSON(ctx, client, distURL+"index.json", &releases); err != nil {
		return "", fmt.Errorf("listing Node.js releases: %w", err)
	}
	for _, r := range releases {
		if lts, ok := r.LTS.(string); ok && lts != "" {
			if v, ok := ParseVersion(r.Version); ok && !v.Less(MinNode) {
				return r.Version, nil
			}
		}
	}
	return "", fmt.Errorf("no Node.js LTS release at least %s found", MinNode)
}

func archiveName(version string) (string, error) {
	arch := map[string]string{"amd64": "x64", "arm64": "arm64"}[runtime.GOARCH]
	if arch == "" {
		return "", fmt.Errorf("no Node.js download for %s/%s; install Node.js %s or later yourself", runtime.GOOS, runtime.GOARCH, MinNode)
	}
	switch runtime.GOOS {
	case "darwin", "linux":
		return fmt.Sprintf("node-%s-%s-%s.tar.gz", version, runtime.GOOS, arch), nil
	case "windows":
		return fmt.Sprintf("node-%s-win-%s.zip", version, arch), nil
	}
	return "", fmt.Errorf("no Node.js download for %s; install Node.js %s or later yourself", runtime.GOOS, MinNode)
}

func publishedSum(ctx context.Context, client *http.Client, version, name string) (string, error) {
	var sums strings.Builder
	if err := download(ctx, client, distURL+version+"/SHASUMS256.txt", &sums); err != nil {
		return "", err
	}
	scanner := bufio.NewScanner(strings.NewReader(sums.String()))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 2 && fields[1] == name {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("%s is not listed in SHASUMS256.txt", name)
}

func download(ctx context.Context, client *http.Client, url string, w io.Writer) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	_, err = io.Copy(w, resp.Body)
	return err
}

func getJSON(ctx context.Context, client *http.Client, url string, v any) error {
	var body strings.Builder
	if err := download(ctx, client, url, &body); err != nil {
		return err
	}
	return json.Unmarshal([]byte(body.String()), v)
}

// within resolves name inside dest, rejecting entries that escape it.
func within(dest, name string) (string, error) {
	path := filepath.Join(dest, filepath.FromSlash(name))
	if path != dest && !strings.HasPrefix(path, dest+string(os.PathSeparator)) {
		return "", fmt.Errorf("archive entry %q escapes the target folder", name)
	}
	return path, nil
}

func untar(r io.Reader, dest string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		path, err := within(dest, h.Name)
		if err != nil {
			return err
		}
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(path, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := writeFile(path, tr, h.FileInfo().Mode().Perm()); err != nil {
				return err
			}
		case tar.TypeSymlink:
			// npm and npx are relative symlinks into lib/node_modules.
			if filepath.IsAbs(h.Linkname) {
				return fmt.Errorf("archive symlink %q is absolute", h.Name)
			}
			if _, err := within(dest, filepath.Join(filepath.Dir(h.Name), h.Linkname)); err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				return err
			}
			if err := os.Symlink(h.Linkname, path); err != nil {
				return err
			}
		}
	}
}

func unzip(f *os.File, dest string) error {
	info, err := f.Stat()
	if err != nil {
		return err
	}
	zr, err := zip.NewReader(f, info.Size())
	if err != nil {
		return err
	}
	for _, zf := range zr.File {
		path, err := within(dest, zf.Name)
		if err != nil {
			return err
		}
		if zf.FileInfo().IsDir() {
			if err := os.MkdirAll(path, 0o755); err != nil {
				return err
			}
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			return err
		}
		err = writeFile(path, rc, 0o755)
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func writeFile(path string, r io.Reader, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, r); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
