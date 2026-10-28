#!/bin/sh
# Install or update frame-keyboard as a user service on a Steam Frame (or any SteamOS / Linux
# machine running Steam). Run it as the normal user, no sudo needed:
#   ./install.sh               build (if needed), install, then (re)start
#   ./install.sh --uninstall   stop and remove (restart Steam afterwards to fully unload)
#
# The release archive contains a ready-made bundle.js, which is used as is. From a repository
# checkout there is none, so it is built from src/ with `npm run build` (needs Node.js and npm).
set -eu

# A Konsole opened from the desktop (itself started from the VR dashboard) has no usable session bus
# variables, so `systemctl --user` cannot connect. Always point it at the user's own bus.
uid=$(id -u)
export XDG_RUNTIME_DIR="/run/user/$uid"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"

here=$(cd "$(dirname "$0")" && pwd)
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
share_dir="$HOME/.local/share/frame-keyboard" # the unit refers to this path via %h
unit_dir="$config_home/systemd/user"
unit="frame-keyboard.service"

# Remove what an older, differently named install of this keyboard left behind.
remove_legacy() {
    systemctl --user disable --now frame-jp-keyboard.service 2>/dev/null || true
    rm -f "$unit_dir/frame-jp-keyboard.service"
    rm -rf "$HOME/.local/share/frame-jp-keyboard" "$config_home/frame-jp-keyboard"
}

if [ "${1:-}" = "--uninstall" ]; then
    systemctl --user disable --now "$unit" 2>/dev/null || true
    rm -f "$unit_dir/$unit"
    rm -rf "$share_dir"
    remove_legacy
    systemctl --user daemon-reload
    cat <<EOF
Removed frame-keyboard.
The keyboard code is still loaded in the running Steam client. Restart Steam (or reboot) to fully
unload it and get the stock keyboard back.
EOF
    exit 0
fi

if ! python3 -c 'import aiohttp' 2>/dev/null; then
    echo "python3 with aiohttp is required but 'import aiohttp' failed." >&2
    exit 1
fi

bundle=""
for candidate in "$here/dist/bundle.js" "$here/bundle.js"; do
    if [ -f "$candidate" ]; then
        bundle=$candidate
        break
    fi
done
if [ -z "$bundle" ]; then
    if ! command -v npm >/dev/null 2>&1; then
        echo "No dist/bundle.js found and npm is not installed, so the bundle cannot be built." >&2
        echo "Build it on a machine with Node.js (npm install && npm run build) and copy dist/bundle.js here." >&2
        exit 1
    fi
    echo "Building the bundle..."
    (cd "$here" && npm install --no-audit --no-fund && npm run build)
    bundle="$here/dist/bundle.js"
fi

# Repository layout (injector/, contrib/) or all files side by side (the release archive).
injector=""
service=""
for candidate in "$here/injector/frame_keyboard_injector.py" "$here/frame_keyboard_injector.py"; do
    [ -f "$candidate" ] && injector=$candidate && break
done
for candidate in "$here/contrib/$unit" "$here/$unit"; do
    [ -f "$candidate" ] && service=$candidate && break
done
if [ -z "$injector" ] || [ -z "$service" ]; then
    echo "Missing frame_keyboard_injector.py or $unit next to install.sh." >&2
    exit 1
fi

remove_legacy
mkdir -p "$share_dir" "$unit_dir"
cp "$bundle" "$share_dir/bundle.js"
cp "$injector" "$share_dir/frame_keyboard_injector.py"
cp "$service" "$unit_dir/$unit"
chmod 644 "$share_dir/bundle.js" "$unit_dir/$unit"
chmod 755 "$share_dir/frame_keyboard_injector.py"

systemctl --user daemon-reload
systemctl --user enable "$unit"
systemctl --user restart "$unit"
sleep 2
systemctl --user --no-pager status "$unit" | head -n 5 || true

# The service only injects when no instance is loaded, so replace a running (older) one now.
if python3 "$share_dir/frame_keyboard_injector.py" --once --bundle "$share_dir/bundle.js"; then
    :
else
    echo "(Steam's CDP is not reachable right now; the service injects once Steam is running.)"
fi

cat <<EOF

frame-keyboard is installed and injects itself whenever Steam runs.
  Logs:       journalctl --user -u frame-keyboard -f
  Re-inject:  python3 $share_dir/frame_keyboard_injector.py --once
  Uninstall:  $0 --uninstall
EOF
