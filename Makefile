# Build, test and install the promptfoo Eval Builder (Wails desktop app).
# Prerequisites are listed in README.md. Run `make` or `make help` for targets.

APP        := promptfoo-eval-builder
# macOS bundle name comes from wails.json "name".
BUNDLE     := promptfoo Eval Builder.app
BUILD_DIR  := build/bin
WAILS      ?= wails
GO         ?= go
NPM        ?= npm
UNAME_S    := $(shell uname -s)

# Extra build tags, e.g. WAILS_TAGS=webkit2_41 on Linux distributions with webkit2gtk-4.1.
WAILS_TAGS ?=

ifeq ($(UNAME_S),Darwin)
INSTALL_DIR ?= /Applications
else
INSTALL_DIR ?= $(HOME)/.local/bin
endif

.DEFAULT_GOAL := help
.PHONY: help deps dev build install test test-live vet fmt check clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk -F ':.*## ' '{ printf "  %-12s %s\n", $$1, $$2 }'

deps: ## Download Go modules and install frontend packages
	$(GO) mod download
	cd frontend && $(NPM) install

dev: ## Run the app with hot reload
	$(WAILS) dev $(WAILS_TAGS)

build: ## Build the app into build/bin
	$(WAILS) build $(WAILS_TAGS)

install: build ## Build, then install the app (macOS: /Applications)
ifeq ($(UNAME_S),Darwin)
	rm -rf "$(INSTALL_DIR)/$(BUNDLE)"
	cp -R "$(BUILD_DIR)/$(BUNDLE)" "$(INSTALL_DIR)/"
	@echo "Installed $(INSTALL_DIR)/$(BUNDLE)"
else
	mkdir -p "$(INSTALL_DIR)"
	install -m 755 "$(BUILD_DIR)/$(APP)" "$(INSTALL_DIR)/$(APP)"
	@echo "Installed $(INSTALL_DIR)/$(APP)"
endif

test: ## Run unit tests
	$(GO) test ./internal/...

test-live: ## Run tests that download the EDD kit and Node.js from the network
	KIT_LIVE=1 $(GO) test -run TestInstallLive ./internal/kit
	TOOLCHAIN_LIVE=1 $(GO) test -run TestInstallNodeLive ./internal/toolchain

vet: ## Run go vet on the internal packages
	$(GO) vet ./internal/...

fmt: ## Format Go sources with gofmt
	gofmt -w .

check: ## Fail if gofmt, go vet or tests report problems
	@unformatted=$$(gofmt -l .); \
	if [ -n "$$unformatted" ]; then echo "Not gofmt-formatted:"; echo "$$unformatted"; exit 1; fi
	$(MAKE) vet
	$(MAKE) test

clean: ## Remove build output and the frontend bundle
	rm -rf $(BUILD_DIR) frontend/dist
