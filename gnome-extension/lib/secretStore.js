// Credential storage using libsecret with file fallback

import Secret from 'gi://Secret';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SCHEMA = new Secret.Schema(
    'org.gnome.shell.extensions.claude-usage-tracker',
    Secret.SchemaFlags.NONE,
    {
        'profile-id': Secret.SchemaAttributeType.STRING,
        'key-type': Secret.SchemaAttributeType.STRING
    }
);

const FALLBACK_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'claude-usage-tracker']);
const FALLBACK_FILE = GLib.build_filenamev([FALLBACK_DIR, 'secrets.json']);

export class SecretStore {
    constructor() {
        this._useSecret = true;
        this._ensureFallbackDir();
    }

    _ensureFallbackDir() {
        const dir = Gio.File.new_for_path(FALLBACK_DIR);
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory_with_parents(null);
            } catch (e) {
                log(`ClaudeUsage: Failed to create fallback dir: ${e.message}`);
            }
        }
    }

    async store(profileId, keyType, value) {
        if (this._useSecret) {
            try {
                await this._secretStore(SCHEMA, { 'profile-id': profileId, 'key-type': keyType }, Secret.COLLECTION_DEFAULT, `Claude Usage Tracker - ${keyType} (${profileId})`, value);
                return;
            } catch (e) {
                log(`ClaudeUsage: libsecret store failed, falling back to file: ${e.message}`);
                this._useSecret = false;
            }
        }
        this._storeFallback(profileId, keyType, value);
    }

    async lookup(profileId, keyType) {
        if (this._useSecret) {
            try {
                const password = await this._secretLookup(SCHEMA, { 'profile-id': profileId, 'key-type': keyType });
                return password;
            } catch (e) {
                log(`ClaudeUsage: libsecret lookup failed, falling back to file: ${e.message}`);
                this._useSecret = false;
            }
        }
        return this._lookupFallback(profileId, keyType);
    }

    async clear(profileId, keyType) {
        if (this._useSecret) {
            try {
                await this._secretClear(SCHEMA, { 'profile-id': profileId, 'key-type': keyType });
                return;
            } catch (e) {
                this._useSecret = false;
            }
        }
        this._clearFallback(profileId, keyType);
    }

    async clearProfile(profileId) {
        for (const keyType of ['claudeSessionKey', 'apiSessionKey', 'cliCredentialsJSON']) {
            await this.clear(profileId, keyType);
        }
        this._clearFallback(profileId, 'all');
    }

    _secretStore(schema, attributes, collection, label, password) {
        return new Promise((resolve, reject) => {
            Secret.password_store(schema, attributes, collection, label, password, null, (source, result) => {
                try {
                    Secret.password_store_finish(result);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    _secretLookup(schema, attributes) {
        return new Promise((resolve, reject) => {
            Secret.password_lookup(schema, attributes, null, (source, result) => {
                try {
                    const password = Secret.password_lookup_finish(result);
                    resolve(password);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    _secretClear(schema, attributes) {
        return new Promise((resolve, reject) => {
            Secret.password_clear(schema, attributes, null, (source, result) => {
                try {
                    Secret.password_clear_finish(result);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    _storeFallback(profileId, keyType, value) {
        try {
            const data = this._readFallbackFile();
            if (!data[profileId]) data[profileId] = {};
            data[profileId][keyType] = value;
            this._writeFallbackFile(data);
            const file = Gio.File.new_for_path(FALLBACK_FILE);
            // Best effort chmod 0600
            try {
                GLib.spawn_command_line_sync(`chmod 600 "${FALLBACK_FILE}"`);
            } catch {}
        } catch (e) {
            log(`ClaudeUsage: Fallback store failed: ${e.message}`);
        }
    }

    _lookupFallback(profileId, keyType) {
        try {
            const data = this._readFallbackFile();
            return data[profileId]?.[keyType] ?? null;
        } catch (e) {
            return null;
        }
    }

    _clearFallback(profileId, keyType) {
        try {
            const data = this._readFallbackFile();
            if (keyType === 'all') {
                delete data[profileId];
            } else if (data[profileId]) {
                delete data[profileId][keyType];
            }
            this._writeFallbackFile(data);
        } catch (e) {
            log(`ClaudeUsage: Fallback clear failed: ${e.message}`);
        }
    }

    _readFallbackFile() {
        try {
            const file = Gio.File.new_for_path(FALLBACK_FILE);
            if (!file.query_exists(null)) return {};
            const [ok, contents] = file.load_contents(null);
            if (!ok) return {};
            const decoder = new TextDecoder('utf-8');
            return JSON.parse(decoder.decode(contents)) || {};
        } catch (e) {
            return {};
        }
    }

    _writeFallbackFile(data) {
        const file = Gio.File.new_for_path(FALLBACK_FILE);
        const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
        const outputStream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        outputStream.write_bytes(GLib.Bytes.new(bytes), null);
        outputStream.close(null);
    }
}
