// Profile manager - CRUD, activate/switch, persistence

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ExtensionSettings } from './settings.js';
import { SecretStore } from './secretStore.js';
import { Profile } from './models.js';

export class ProfileManager {
    constructor() {
        this._settings = new ExtensionSettings();
        this._secrets = new SecretStore();
        this._profiles = [];
        this._activeProfile = null;
        this._loadProfiles();
    }

    get profiles() { return this._profiles; }
    get activeProfile() { return this._activeProfile; }

    _loadProfiles() {
        try {
            const json = this._settings.profilesJSON;
            const arr = JSON.parse(json || '[]');
            this._profiles = arr.map(p => new Profile(p));

            if (this._profiles.length === 0) {
                const defaultProfile = new Profile({ name: 'Default', isSelectedForDisplay: true });
                this._profiles.push(defaultProfile);
                this._saveProfiles();
            }

            const activeId = this._settings.activeProfileId;
            this._activeProfile = this._profiles.find(p => p.id === activeId) || this._profiles[0];
        } catch (e) {
            log(`ClaudeUsage: Failed to load profiles: ${e.message}`);
            const defaultProfile = new Profile({ name: 'Default' });
            this._profiles = [defaultProfile];
            this._activeProfile = defaultProfile;
        }
    }

    _saveProfiles() {
        try {
            this._settings.profilesJSON = JSON.stringify(this._profiles.map(p => p.toJSON()));
        } catch (e) {
            log(`ClaudeUsage: Failed to save profiles: ${e.message}`);
        }
    }

    async loadCredentials(profile) {
        const creds = {};
        try {
            creds.claudeSessionKey = await this._secrets.lookup(profile.id, 'claudeSessionKey');
        } catch {}
        try {
            creds.apiSessionKey = await this._secrets.lookup(profile.id, 'apiSessionKey');
        } catch {}
        try {
            creds.cliCredentialsJSON = await this._secrets.lookup(profile.id, 'cliCredentialsJSON');
        } catch {}
        return creds;
    }

    async saveCredentials(profile, creds) {
        if (creds.claudeSessionKey !== undefined) {
            if (creds.claudeSessionKey) {
                await this._secrets.store(profile.id, 'claudeSessionKey', creds.claudeSessionKey);
            } else {
                await this._secrets.clear(profile.id, 'claudeSessionKey');
            }
        }
        if (creds.apiSessionKey !== undefined) {
            if (creds.apiSessionKey) {
                await this._secrets.store(profile.id, 'apiSessionKey', creds.apiSessionKey);
            } else {
                await this._secrets.clear(profile.id, 'apiSessionKey');
            }
        }
        if (creds.cliCredentialsJSON !== undefined) {
            if (creds.cliCredentialsJSON) {
                await this._secrets.store(profile.id, 'cliCredentialsJSON', creds.cliCredentialsJSON);
            } else {
                await this._secrets.clear(profile.id, 'cliCredentialsJSON');
            }
        }
    }

    async setClaudeSessionKey(profile, key) {
        profile.claudeSessionKey = key;
        await this.saveCredentials(profile, { claudeSessionKey: key });
        if (profile === this._activeProfile) {
            profile.organizationId = null; // Clear org ID so it refetches
        }
        this._saveProfiles();
    }

    async setAPISessionKey(profile, key) {
        profile.apiSessionKey = key;
        await this.saveCredentials(profile, { apiSessionKey: key });
        this._saveProfiles();
    }

    async setCLICredentials(profile, json) {
        profile.cliCredentialsJSON = json;
        profile.hasCliAccount = !!json;
        profile.cliAccountSyncedAt = json ? new Date() : null;
        await this.saveCredentials(profile, { cliCredentialsJSON: json });
        this._saveProfiles();
    }

    createProfile(name) {
        const profile = new Profile({ name });
        this._profiles.push(profile);
        this._saveProfiles();
        return profile;
    }

    deleteProfile(profile) {
        const idx = this._profiles.indexOf(profile);
        if (idx === -1) return;
        this._profiles.splice(idx, 1);
        this._secrets.clearProfile(profile.id);

        if (this._activeProfile === profile) {
            this._activeProfile = this._profiles[0] || null;
            this._settings.activeProfileId = this._activeProfile?.id ?? '';
        }
        this._saveProfiles();
    }

    activateProfile(profile) {
        if (!this._profiles.includes(profile)) return;
        this._activeProfile = profile;
        profile.lastUsedAt = new Date();
        this._settings.activeProfileId = profile.id;
        this._saveProfiles();
    }

    updateProfileName(profile, name) {
        profile.name = name;
        this._saveProfiles();
    }

    updateOrganizationId(profile, orgId) {
        profile.organizationId = orgId;
        this._saveProfiles();
    }

    updateAPIOrganizationId(profile, orgId) {
        profile.apiOrganizationId = orgId;
        this._saveProfiles();
    }

    updateUsage(profile, claudeUsage, apiUsage = null) {
        profile.claudeUsage = claudeUsage;
        if (apiUsage) profile.apiUsage = apiUsage;
        this._saveProfiles();
    }

    updateIconConfig(profile, config) {
        profile.iconConfig = { ...profile.iconConfig, ...config };
        this._saveProfiles();
    }

    updateNotificationSettings(profile, settings) {
        profile.notificationSettings = { ...profile.notificationSettings, ...settings };
        this._saveProfiles();
    }

    updateDisplayFlags(profile, flags) {
        if (flags.isSelectedForDisplay !== undefined) profile.isSelectedForDisplay = flags.isSelectedForDisplay;
        this._saveProfiles();
    }

    getSelectedProfiles() {
        return this._profiles.filter(p => p.isSelectedForDisplay);
    }

    getNextAvailableProfile(currentProfile) {
        const idx = this._profiles.indexOf(currentProfile);
        for (let i = 1; i < this._profiles.length; i++) {
            const candidate = this._profiles[(idx + i) % this._profiles.length];
            if (candidate.hasUsageCredentials) return candidate;
        }
        return null;
    }

    async syncCLIFromSystem(profile) {
        const paths = [
            GLib.build_filenamev([GLib.get_home_dir(), '.claude', '.credentials.json']),
            GLib.build_filenamev([GLib.get_home_dir(), '.claude.json'])
        ];
        if (GLib.getenv('CLAUDE_CONFIG_DIR')) {
            paths.unshift(GLib.build_filenamev([GLib.getenv('CLAUDE_CONFIG_DIR'), '.credentials.json']));
            paths.unshift(GLib.build_filenamev([GLib.getenv('CLAUDE_CONFIG_DIR'), '.claude.json']));
        }

        for (const p of paths) {
            try {
                const file = Gio.File.new_for_path(p);
                if (!file.query_exists(null)) continue;
                const [ok, contents] = file.load_contents(null);
                if (!ok) continue;
                const text = new TextDecoder('utf-8').decode(contents.get_data ? contents.get_data() : contents);
                const json = JSON.parse(text);
                if (json.access_token || json.credentials || json.claudeAiOauth?.accessToken) {
                    await this.setCLICredentials(profile, text);
                    // Try to capture oauthAccount from .claude.json
                    if (json.oauthAccount) {
                        profile.oauthAccountJSON = JSON.stringify(json.oauthAccount);
                    }
                    this._saveProfiles();
                    return true;
                }
            } catch {}
        }
        return false;
    }

    removeCLICredentials(profile) {
        profile.cliCredentialsJSON = null;
        profile.hasCliAccount = false;
        profile.cliAccountSyncedAt = null;
        profile.oauthAccountJSON = null;
        this.saveCredentials(profile, { cliCredentialsJSON: null });
        this._saveProfiles();
    }
}
