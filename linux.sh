#!/usr/bin/env bash
#
# rpc4SoundCloud — linux.sh
#
# Automates the setup steps a Linux user would otherwise have to type by
# hand: installing relay dependencies, cloning Vencord (if not already
# present), dropping this plugin into src/userplugins, building, and
# injecting. Safe to re-run — it skips steps that are already done.
#
# Usage: ./linux.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENCORD_DIR="$HOME/Vencord"

echo "== rpc4SoundCloud Linux setup =="

# --- sanity checks -----------------------------------------------------
command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install it first (e.g. sudo pacman -S nodejs npm) and re-run this script."; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "git not found. Install it first (e.g. sudo pacman -S git) and re-run this script."; exit 1; }

if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found, installing it via npm..."
    npm install -g pnpm
fi

# --- relay server --------------------------------------------------------
echo "-- Installing relay server dependencies --"
(cd "$REPO_DIR/relay-server" && npm install)

# --- Vencord source -------------------------------------------------------
if [ -d "$VENCORD_DIR" ]; then
    echo "-- Found existing Vencord source at $VENCORD_DIR, skipping clone --"
else
    echo "-- Cloning Vencord source into $VENCORD_DIR --"
    git clone https://github.com/Vendicated/Vencord "$VENCORD_DIR"
    (cd "$VENCORD_DIR" && pnpm install)
fi

# --- drop in the plugin ---------------------------------------------------
PLUGIN_DIR="$VENCORD_DIR/src/userplugins/rpc4SoundCloud"
echo "-- Installing plugin to $PLUGIN_DIR --"
mkdir -p "$PLUGIN_DIR"
cp "$REPO_DIR/vencord-plugin/index.tsx" "$PLUGIN_DIR/index.tsx"

# --- build + inject --------------------------------------------------------
echo "-- Building Vencord (this can take a while the first time) --"
(cd "$VENCORD_DIR" && pnpm build)

echo
echo "== Build complete =="
echo "Next: run 'pnpm inject' inside $VENCORD_DIR and pick your Discord client"
echo "(Vesktop, Discord, etc.) when prompted. You'll need to fully quit that"
echo "client first if it's currently running."
echo
read -rp "Run 'pnpm inject' now? [y/N] " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then
    (cd "$VENCORD_DIR" && pnpm inject)
fi

echo
echo "== Optional: auto-start the relay server on login =="
read -rp "Set up a systemd user service to auto-start the relay? [y/N] " svc
if [[ "$svc" =~ ^[Yy]$ ]]; then
    SERVICE_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SERVICE_DIR"
    cat > "$SERVICE_DIR/rpc4soundcloud-relay.service" <<EOF
[Unit]
Description=rpc4SoundCloud relay server

[Service]
ExecStart=$(command -v node) $REPO_DIR/relay-server/server.js
Restart=on-failure

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now rpc4soundcloud-relay.service
    echo "Relay service enabled. Check status any time with:"
    echo "  systemctl --user status rpc4soundcloud-relay.service"
fi

echo
echo "Done. Load the browser extension from '$REPO_DIR/extension' as an unpacked extension, and you're set."