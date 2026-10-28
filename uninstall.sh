#!/bin/sh
# Remove frame-keyboard (the service and its files). Restart Steam afterwards to fully unload it.
exec "$(cd "$(dirname "$0")" && pwd)/install.sh" --uninstall
