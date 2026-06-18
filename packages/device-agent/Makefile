BINARY   := grc-agent
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
DIST     := dist
CARGO    ?= cargo

# Auto-detect cross-compilation tool at make-time.
# Priority: cross > cargo-zigbuild.
# Each target uses the correct invocation for the selected tool.
ifeq ($(shell command -v cross 2>/dev/null),)
  ifeq ($(shell command -v cargo-zigbuild 2>/dev/null),)
    CROSS_TOOL := none
  else
    CROSS_TOOL := zigbuild
  endif
else
  CROSS_TOOL := cross
endif

.PHONY: all build release release-min cross clean test lint admin-ui \
        linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 \
        windows-amd64 windows-arm64 check-cross-tool \
        package checksums dry-run version

# ── Default ───────────────────────────────────────────────────────────────────
all: release

# ── Development build ─────────────────────────────────────────────────────────
build:
	$(CARGO) build

# ── Release build (stripped, LTO, panic=abort from Cargo.toml profile) ────────
release:
	@mkdir -p $(DIST)
	$(CARGO) build --release
	cp $(TARGET_DIR)/release/$(BINARY) $(DIST)/$(BINARY)
	@echo "✓ Release binary: $(DIST)/$(BINARY)"

# ── Minimum-size release (opt-level=z — smaller binary, slightly slower) ──────
# Use for constrained endpoints (IoT, edge) where binary footprint matters more
# than raw throughput.
release-min:
	@mkdir -p $(DIST)
	$(CARGO) build --profile release-min
	cp $(TARGET_DIR)/release-min/$(BINARY) $(DIST)/$(BINARY)-min
	@echo "✓ Min-size binary: $(DIST)/$(BINARY)-min"
	@ls -lh $(DIST)/$(BINARY) $(DIST)/$(BINARY)-min 2>/dev/null || true

# ── Lint ─────────────────────────────────────────────────────────────────────
lint:
	$(CARGO) clippy --all-targets --all-features -- -D warnings

# ── Tests ────────────────────────────────────────────────────────────────────
test:
	$(CARGO) test --all

# ── Cross-compilation ─────────────────────────────────────────────────────────
# Supports two tools:
#   cross        — Docker-based; great for Linux/musl, requires Docker daemon
#   cargo-zigbuild — Zig-based; great for macOS cross from Linux CI, no Docker
# Install cross:     cargo install cross --git https://github.com/cross-rs/cross
# Install zigbuild:  cargo install cargo-zigbuild && pip3 install ziglang
# Default cross-compile builds all targets. windows-arm64 requires
# aarch64-w64-mingw32-clang (llvm-mingw) and is skipped if not available.
cross: check-cross-tool linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64 $(shell command -v aarch64-w64-mingw32-clang >/dev/null 2>&1 && echo windows-arm64)
	@echo "✓ Cross-compilation complete. Binaries in $(DIST)/"
	@command -v aarch64-w64-mingw32-clang >/dev/null 2>&1 || echo "  (windows-arm64 skipped — install llvm-mingw: https://github.com/mstorsjo/llvm-mingw)"

check-cross-tool:
	@if [ "$(CROSS_TOOL)" = "none" ]; then \
		echo "ERROR: Neither 'cross' nor 'cargo-zigbuild' found."; \
		echo "  cross:      cargo install cross --git https://github.com/cross-rs/cross"; \
		echo "  cargo-zigbuild: cargo install cargo-zigbuild && pip3 install ziglang"; \
		exit 1; \
	fi
	@echo "Using cross tool: $(CROSS_TOOL)"

# ── Internal helper — resolves the cargo target directory ─────────────────────
# Respects .cargo/config.toml target-dir override (e.g. /tmp/cargo-target).
# Evaluated once at make startup to avoid repeated cargo metadata overhead.
TARGET_DIR := $(shell cd $(PWD) && cargo metadata --format-version 1 2>/dev/null | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p' || echo "target")
ifeq ($(TARGET_DIR),)
  TARGET_DIR := target
endif

# ── Internal helper — invokes the right tool for a given --target ─────────────
# Usage: $(call cross_build,x86_64-unknown-linux-musl)
define cross_build
	@mkdir -p $(DIST)
	@if [ "$(CROSS_TOOL)" = "cross" ]; then \
		cross build --release --target $(1); \
	else \
		$(CARGO) zigbuild --release --target $(1); \
	fi
endef

linux-amd64: check-cross-tool
	$(call cross_build,x86_64-unknown-linux-musl)
	cp $(TARGET_DIR)/x86_64-unknown-linux-musl/release/$(BINARY) $(DIST)/$(BINARY)-linux-amd64
	@echo "✓ $(DIST)/$(BINARY)-linux-amd64"

linux-arm64: check-cross-tool
	$(call cross_build,aarch64-unknown-linux-musl)
	cp $(TARGET_DIR)/aarch64-unknown-linux-musl/release/$(BINARY) $(DIST)/$(BINARY)-linux-arm64
	@echo "✓ $(DIST)/$(BINARY)-linux-arm64"

darwin-amd64: check-cross-tool
	$(call cross_build,x86_64-apple-darwin)
	cp $(TARGET_DIR)/x86_64-apple-darwin/release/$(BINARY) $(DIST)/$(BINARY)-darwin-amd64
	@echo "✓ $(DIST)/$(BINARY)-darwin-amd64"

darwin-arm64: check-cross-tool
	$(call cross_build,aarch64-apple-darwin)
	cp $(TARGET_DIR)/aarch64-apple-darwin/release/$(BINARY) $(DIST)/$(BINARY)-darwin-arm64
	@echo "✓ $(DIST)/$(BINARY)-darwin-arm64"

windows-amd64: check-cross-tool
	$(call cross_build,x86_64-pc-windows-gnu)
	cp $(TARGET_DIR)/x86_64-pc-windows-gnu/release/$(BINARY).exe $(DIST)/$(BINARY)-windows-amd64.exe
	@echo "✓ $(DIST)/$(BINARY)-windows-amd64.exe"

windows-arm64: check-cross-tool
	$(call cross_build,aarch64-pc-windows-gnullvm)
	cp $(TARGET_DIR)/aarch64-pc-windows-gnullvm/release/$(BINARY).exe $(DIST)/$(BINARY)-windows-arm64.exe
	@echo "✓ $(DIST)/$(BINARY)-windows-arm64.exe"

# ── Package — create distributable archives with SHA-256 checksums ────────────
# Requires binaries to already be built (run 'make cross' or individual targets).
# Output: dist/grc-agent-<version>-<target>.tar.gz + dist/SHA256SUMS
package: checksums
	@echo "✓ Package complete. Archives and checksums in $(DIST)/"

checksums:
	@mkdir -p $(DIST)
	@echo "Building release archives (version: $(VERSION))..."
	@cd $(DIST) && \
	for f in $(BINARY)-linux-amd64 $(BINARY)-linux-arm64 \
	          $(BINARY)-darwin-amd64 $(BINARY)-darwin-arm64; do \
		if [ -f "$$f" ]; then \
			archive="$(BINARY)-$(VERSION)-$$(echo $$f | sed 's/$(BINARY)-//')".tar.gz; \
			tar czf "$$archive" "$$f" 2>/dev/null && echo "  ✓ $$archive"; \
		fi; \
	done && \
	for f in $(BINARY)-windows-amd64.exe $(BINARY)-windows-arm64.exe; do \
		if [ -f "$$f" ]; then \
			archive="$(BINARY)-$(VERSION)-$$(echo $$f | sed 's/$(BINARY)-//' | sed 's/\.exe//')".zip; \
			zip -q "$$archive" "$$f" 2>/dev/null && echo "  ✓ $$archive"; \
		fi; \
	done
	@cd $(DIST) && \
	sha256sum $(BINARY)-$(VERSION)-*.tar.gz $(BINARY)-$(VERSION)-*.zip 2>/dev/null \
		> SHA256SUMS && echo "  ✓ SHA256SUMS" || true
	@echo "Checksums:"
	@cat $(DIST)/SHA256SUMS 2>/dev/null || echo "  (no archives found — run 'make cross' first)"

# ── Admin UI (React/Vite) ─────────────────────────────────────────────────────
admin-ui:
	cd admin-ui && npm install && npm run build
	@echo "✓ admin-ui built to admin-ui/dist/ (serve standalone or embed)"

# ── Clean ────────────────────────────────────────────────────────────────────
clean:
	$(CARGO) clean
	rm -f $(DIST)/$(BINARY) $(DIST)/$(BINARY)-* $(DIST)/*.exe $(DIST)/*.tar.gz $(DIST)/*.zip $(DIST)/SHA256SUMS

# ── Dry-run smoke test ────────────────────────────────────────────────────────
# Requires GRC_PANEL_URL and GRC_AGENT_TOKEN (or Vault config) to be set.
dry-run:
	$(CARGO) run -- start --dry-run

# ── Version ──────────────────────────────────────────────────────────────────
version:
	$(CARGO) run -- version
