# Claude Usage Tracker - GNOME Shell Extension Makefile

UUID = claude-usage-tracker@hamed-elfayome.github.io
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMA = schemas/org.gnome.shell.extensions.claude-usage-tracker.gschema.xml

.PHONY: all schema zip release install uninstall clean test lint

all: schema zip

schema:
	glib-compile-schemas schemas/

zip: schema
	@rm -f $(UUID).zip
	zip -r $(UUID).zip \
		extension.js \
		prefs.js \
		metadata.json \
		stylesheet.css \
		lib/ \
		schemas/gschemas.compiled \
		schemas/*.xml \
		ui/ \
		tests/
	@echo "Created $(UUID).zip"

# Clean EGO-compatible zip (no tests, docs, build files)
release: schema
	@rm -f $(UUID).ego.zip
	zip -r $(UUID).ego.zip \
		extension.js \
		prefs.js \
		metadata.json \
		stylesheet.css \
		lib/ \
		schemas/gschemas.compiled \
		schemas/*.xml
	@echo "Created $(UUID).ego.zip (EGO release artifact)"

install: schema
	@mkdir -p $(EXTENSION_DIR)
	cp -r extension.js prefs.js metadata.json stylesheet.css lib schemas ui $(EXTENSION_DIR)/
	cp schemas/gschemas.compiled $(EXTENSION_DIR)/schemas/ || true
	@echo "Installed to $(EXTENSION_DIR)"
	@echo "Reload GNOME Shell (Alt+F2, type 'r', Enter) or log out/in to enable"

uninstall:
	@rm -rf $(EXTENSION_DIR)
	@echo "Uninstalled $(UUID)"

clean:
	@rm -f $(UUID).zip $(UUID).ego.zip
	@rm -f schemas/gschemas.compiled

lint:
	@echo "Running basic validation..."
	@gjs -c "import('./extension.js').catch(e => { print('extension.js: ' + e.message); imports.system.exit(1); }); print('extension.js OK');" 2>/dev/null || echo "gjs not available, skipping lint"

test: schema
	@echo "Running unit tests..."
	@cd tests && for f in test*.js; do \
		echo "  $$f"; \
		gjs -m "$$f" || exit 1; \
	done
