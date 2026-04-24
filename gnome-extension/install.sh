#!/usr/bin/env bash
set -e

UUID="claude-usage-tracker@primez-x.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Claude Usage Tracker - GNOME Shell Extension Installer"
echo "======================================================="

# Compile schema
echo "Compiling GSettings schema..."
glib-compile-schemas schemas/

# Create extension directory
echo "Installing to $EXTENSION_DIR..."
mkdir -p "$EXTENSION_DIR"

# Copy files
cp -r extension.js prefs.js metadata.json stylesheet.css lib schemas ui "$EXTENSION_DIR/"

# Set permissions
chmod -R 755 "$EXTENSION_DIR"

echo ""
echo "Installation complete!"
echo ""
echo "To enable the extension:"
echo "  1. Log out and log back in, OR"
echo "  2. Press Alt+F2, type 'r', and press Enter (X11 only), OR"
echo "  3. Run: gnome-extensions enable $UUID"
echo ""
echo "You can also manage it via Extension Manager."
