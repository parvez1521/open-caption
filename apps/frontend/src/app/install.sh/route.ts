// macOS / Linux one-command installer for the CapsEasy Companion:  curl -fsSL <app>/install.sh | bash
// Uses an existing Node >= 20, else installs one with nvm (per-user, no sudo). Contains NO secrets.

export async function GET(request: Request) {
  const app = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const script = `#!/usr/bin/env bash
# CapsEasy Companion installer (macOS / Linux):  curl -fsSL ${app}/install.sh | bash
set -euo pipefail
APP="${app}"

echo ""
echo "  Open Caption Companion: makes captions privately on this computer."
echo ""

node_major() { node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\\1/' || echo 0; }

if [ "$(node_major)" -lt 20 ] 2>/dev/null || ! command -v node >/dev/null 2>&1; then
  echo "> Node.js 20+ not found, installing it with nvm (per-user, no sudo)..."
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 20 >/dev/null
  nvm use 20 >/dev/null
fi

# local speech recognition is compiled once on macOS/Linux: it needs git, make and a C compiler
if ! command -v git >/dev/null 2>&1 || ! command -v make >/dev/null 2>&1; then
  echo "! git and make are needed to build the speech engine the first time."
  if [ "$(uname)" = "Darwin" ]; then echo "  Run: xcode-select --install   then run this installer again."; else echo "  Run: sudo apt install -y git build-essential   (or your distro's equivalent), then run this again."; fi
  exit 1
fi

LATEST="$(curl -fsSL "$APP/companion/latest.json" 2>/dev/null | sed -nE 's/.*"version": *"([^"]+)".*/\\1/p' || true)"
HAVE=""
if command -v capseasy >/dev/null 2>&1; then HAVE="$(capseasy --version 2>/dev/null || true)"; fi
if [ -n "$HAVE" ] && [ "$HAVE" = "$LATEST" ]; then
  echo "> Companion $HAVE is already installed and up to date."
else
  if [ -n "$HAVE" ]; then echo "> Updating the Companion ($HAVE -> $LATEST)..."; else echo "> Installing the Companion..."; fi
  npm install -g --no-fund --no-audit "$APP/companion/capseasy-companion-latest.tgz"
fi

if [ -n "\${CAPSEASY_PAIR:-}" ]; then
  # one-click setup: the code was approved on the website already, no browser step
  echo "> Connecting this computer to your account..."
  capseasy login --api "$APP" --pair-code "$CAPSEASY_PAIR"
elif NAME="$(capseasy check-pairing --api "$APP" 2>/dev/null)" && [ -n "$NAME" ]; then
  echo ""
  echo "  Welcome back! '$NAME' is already connected to your account."
else
  echo "> Pairing with your account..."
  capseasy login --api "$APP"
fi

# start by itself whenever you log in, so you never need a terminal again
capseasy autostart enable >/dev/null 2>&1 || true

echo ""
echo "  All set. The Companion now starts automatically when you log in."
echo "  (The first job downloads the speech model and renderer once, a few hundred MB.)"
echo ""
exec capseasy start </dev/tty
`;
  return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
