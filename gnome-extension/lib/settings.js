// GSettings wrapper that loads schema from the extension directory

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class ExtensionSettings {
    constructor() {
        this._settings = this._loadSettings();
    }

    _loadSettings() {
        // Derive the extension root directory from this file's location
        // settings.js is at: <extension-root>/lib/settings.js
        const currentFile = import.meta.url.replace('file://', '');
        const libDir = GLib.path_get_dirname(currentFile);
        const extensionDir = GLib.path_get_dirname(libDir);
        const schemasDir = GLib.build_filenamev([extensionDir, 'schemas']);

        // Try loading from the extension's schemas directory first
        if (GLib.file_test(schemasDir, GLib.FileTest.IS_DIR)) {
            try {
                const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                    schemasDir,
                    Gio.SettingsSchemaSource.get_default(),
                    false
                );
                const schema = schemaSource.lookup('org.gnome.shell.extensions.claude-usage-tracker', true);
                if (schema) {
                    return new Gio.Settings({ settings_schema: schema });
                }
            } catch (e) {
                log(`ClaudeUsage: Failed to load schema from ${schemasDir}: ${e.message}`);
            }
        }

        // Fallback to global schema registry (for system installs)
        try {
            return new Gio.Settings({ schema_id: 'org.gnome.shell.extensions.claude-usage-tracker' });
        } catch (e) {
            throw new Error(
                `GSettings schema org.gnome.shell.extensions.claude-usage-tracker not found. ` +
                `Ensure schemas/gschemas.compiled exists in the extension directory. ` +
                `Run: glib-compile-schemas schemas/`
            );
        }
    }

    get refreshInterval() { return this._settings.get_int('refresh-interval'); }
    set refreshInterval(v) { this._settings.set_int('refresh-interval', v); }

    get activeProfileId() { return this._settings.get_string('active-profile-id'); }
    set activeProfileId(v) { this._settings.set_string('active-profile-id', v); }

    get profilesJSON() { return this._settings.get_string('profiles-json'); }
    set profilesJSON(v) { this._settings.set_string('profiles-json', v); }

    get iconStyle() { return this._settings.get_string('icon-style'); }
    set iconStyle(v) { this._settings.set_string('icon-style', v); }

    get colorMode() { return this._settings.get_string('color-mode'); }
    set colorMode(v) { this._settings.set_string('color-mode', v); }

    get singleColorHex() { return this._settings.get_string('single-color-hex'); }
    set singleColorHex(v) { this._settings.set_string('single-color-hex', v); }

    get showPercentage() { return this._settings.get_boolean('show-percentage'); }
    set showPercentage(v) { this._settings.set_boolean('show-percentage', v); }

    get showRemainingPercentage() { return this._settings.get_boolean('show-remaining-percentage'); }
    set showRemainingPercentage(v) { this._settings.set_boolean('show-remaining-percentage', v); }

    get multiProfileMode() { return this._settings.get_boolean('multi-profile-mode'); }
    set multiProfileMode(v) { this._settings.set_boolean('multi-profile-mode', v); }

    get notificationThresholds() {
        try { return JSON.parse(this._settings.get_string('notification-thresholds')); }
        catch { return [75, 90, 95]; }
    }
    set notificationThresholds(v) { this._settings.set_string('notification-thresholds', JSON.stringify(v)); }

    get notificationsEnabled() { return this._settings.get_boolean('notifications-enabled'); }
    set notificationsEnabled(v) { this._settings.set_boolean('notifications-enabled', v); }

    get autoSwitchProfile() { return this._settings.get_boolean('auto-switch-profile'); }
    set autoSwitchProfile(v) { this._settings.set_boolean('auto-switch-profile', v); }

    get statuslineEnabled() { return this._settings.get_boolean('statusline-enabled'); }
    set statuslineEnabled(v) { this._settings.set_boolean('statusline-enabled', v); }

    get checkOverageLimit() { return this._settings.get_boolean('check-overage-limit'); }
    set checkOverageLimit(v) { this._settings.set_boolean('check-overage-limit', v); }

    get prefsWidth() { return this._settings.get_int('prefs-width'); }
    set prefsWidth(v) { this._settings.set_int('prefs-width', v); }

    get prefsHeight() { return this._settings.get_int('prefs-height'); }
    set prefsHeight(v) { this._settings.set_int('prefs-height', v); }

    connectSignal(key, callback) {
        return this._settings.connect(`changed::${key}`, callback);
    }

    disconnectSignal(id) {
        this._settings.disconnect(id);
    }
}
