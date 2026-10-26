package ollama

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"runtime"
	"testing"

	"promptfoo-eval-builder/internal/evalconfig"
	"promptfoo-eval-builder/internal/examples"
)

func TestRequirements(t *testing.T) {
	t.Setenv("OLLAMA_BASE_URL", "")
	tests := []struct {
		name       string
		config     evalconfig.Config
		wantURL    string
		wantModels []string
	}{
		{
			name:   "no ollama",
			config: evalconfig.Config{Providers: []evalconfig.Provider{{ID: "openai:gpt-4.1-mini"}}},
		},
		{
			name: "native providers and grader",
			config: evalconfig.Config{
				Providers: []evalconfig.Provider{{ID: "ollama:chat:llama3.1"}, {ID: "ollama:qwen2.5:7b"}},
				DefaultTest: evalconfig.TestCase{
					Options: []evalconfig.KV{{Key: "provider", Value: "ollama:completion:llama3.1"}},
				},
				Tests: []evalconfig.TestCase{{Options: []evalconfig.KV{{Key: "provider", Value: "ollama:chat:mistral"}}}},
			},
			wantURL:    DefaultBaseURL,
			wantModels: []string{"llama3.1", "qwen2.5:7b", "mistral"},
		},
		{
			name: "kit script with its config",
			config: evalconfig.Config{Providers: []evalconfig.Provider{{
				ID:     "exec: node ./ollama.js",
				Config: []evalconfig.KV{{Key: "host", Value: "gpu-box"}, {Key: "port", Value: "8080"}, {Key: "model", Value: "phi3"}},
			}}},
			wantURL:    "http://gpu-box:8080",
			wantModels: []string{"phi3"},
		},
		{
			name:       "kit script defaults",
			config:     evalconfig.Config{Providers: []evalconfig.Provider{{ID: "exec: node ./ollama.js"}}},
			wantURL:    DefaultBaseURL,
			wantModels: []string{"llama2"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, models := Requirements(tt.config)
			if url != tt.wantURL || !reflect.DeepEqual(models, tt.wantModels) {
				t.Fatalf("got %q %v, want %q %v", url, models, tt.wantURL, tt.wantModels)
			}
		})
	}
}

func TestRequirementsFindsProvidersInAdvancedYAML(t *testing.T) {
	t.Setenv("OLLAMA_BASE_URL", "")
	// delay isn't modeled by the form, so the providers list lands in Extra.
	c, err := evalconfig.FromYAML(`providers:
  - id: 'exec: node ./ollama.js'
    label: Ollama Llama
    delay: 500
    config:
      port: 11434
      model: llama3.1
defaultTest:
  options:
    provider:
      id: ollama:chat:qwen2.5
`)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Providers) != 0 {
		t.Fatalf("expected the providers to be kept as advanced YAML, got %+v", c.Providers)
	}
	url, models := Requirements(c)
	if url != DefaultBaseURL || !reflect.DeepEqual(models, []string{"llama3.1", "qwen2.5"}) {
		t.Fatalf("got %q %v", url, models)
	}
}

func TestRequirementsUsesOllamaBaseURL(t *testing.T) {
	t.Setenv("OLLAMA_BASE_URL", "http://127.0.0.1:9999/")
	url, _ := Requirements(evalconfig.Config{Providers: []evalconfig.Provider{{ID: "ollama:chat:llama3.1"}}})
	if url != "http://127.0.0.1:9999" {
		t.Fatalf("got %q", url)
	}
}

func TestOllamaExampleIsDetected(t *testing.T) {
	c, err := examples.Load("improving-ollama")
	if err != nil {
		t.Fatal(err)
	}
	url, models := Requirements(c)
	if url != DefaultBaseURL || !reflect.DeepEqual(models, []string{"llama3.1"}) {
		t.Fatalf("got %q %v", url, models)
	}
}

func TestCheckRunning(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(`{"models":[{"name":"llama3.1:latest"},{"name":"qwen2.5:7b"}]}`))
	}))
	defer srv.Close()
	t.Setenv("OLLAMA_BASE_URL", srv.URL)

	c := evalconfig.Config{Providers: []evalconfig.Provider{
		{ID: "ollama:chat:llama3.1"}, {ID: "ollama:qwen2.5:7b"}, {ID: "ollama:chat:mistral"},
	}}
	got := Check(context.Background(), c)
	got.BinPath = ""
	want := Status{
		Used:      true,
		OS:        runtime.GOOS,
		BaseURL:   srv.URL,
		Installed: true,
		Running:   true,
		Models:    []string{"llama3.1", "qwen2.5:7b", "mistral"},
		Missing:   []string{"mistral"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
	if got.Ready() {
		t.Fatal("a missing model should not be ready")
	}
}

func TestCheckNotRunning(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	t.Setenv("OLLAMA_BASE_URL", url)

	got := Check(context.Background(), evalconfig.Config{Providers: []evalconfig.Provider{{ID: "ollama:chat:llama3.1"}}})
	if got.Running || got.Ready() || got.Error == "" || !reflect.DeepEqual(got.Missing, []string{"llama3.1"}) {
		t.Fatalf("got %+v", got)
	}
}

func TestCheckUnused(t *testing.T) {
	got := Check(context.Background(), evalconfig.Config{Providers: []evalconfig.Provider{{ID: "echo"}}})
	want := Status{OS: runtime.GOOS, Models: []string{}, Missing: []string{}}
	if !reflect.DeepEqual(got, want) || !got.Ready() {
		t.Fatalf("got %+v", got)
	}
}

func TestHasModel(t *testing.T) {
	available := []string{"llama3.1:latest", "qwen2.5:7b"}
	for model, want := range map[string]bool{
		"llama3.1":        true,
		"llama3.1:latest": true,
		"llama3.1:70b":    false,
		"qwen2.5:7b":      true,
		"qwen2.5":         false,
	} {
		if got := hasModel(available, model); got != want {
			t.Errorf("hasModel(%q) = %v, want %v", model, got, want)
		}
	}
}
