// Claude Usage Tracker - GNOME Shell Extension

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ExtensionSettings } from './lib/settings.js';
import { ProfileManager } from './lib/profileManager.js';
import { ClaudeAPIService } from './lib/apiService.js';
import { ClaudeIndicator } from './lib/indicator.js';
import { ClaudeMenuBuilder } from './lib/menu.js';
import { NotificationManager } from './lib/notificationManager.js';
import { RefreshService } from './lib/refreshService.js';
import { StatuslineService } from './lib/statuslineService.js';
import { AutoSwitchService } from './lib/autoSwitchService.js';

export default class ClaudeUsageExtension extends Extension {
    enable() {
        log('ClaudeUsage: enable() start');
        this.settings = new ExtensionSettings();
        this.profileManager = new ProfileManager();
        this.apiService = new ClaudeAPIService();
        this.notificationManager = new NotificationManager(this);
        this.refreshService = new RefreshService(this);
        this.statuslineService = new StatuslineService(this);
        this.autoSwitchService = new AutoSwitchService(this);

        this.lastError = null;
        this.isStale = false;

        // Load secrets for active profile
        this._loadCredentials();

        // Create panel indicator
        this._indicator = new ClaudeIndicator(this);
        this._menuBuilder = new ClaudeMenuBuilder(this._indicator, this);

        log(`ClaudeUsage: indicator.menu=${this._indicator.menu ? 'exists' : 'null'}`);
        Main.panel.addToStatusArea('claude-usage-tracker', this._indicator);
        log('ClaudeUsage: indicator added to status area');

        // Settings change listeners
        this._settingsSignals = [];
        this._settingsSignals.push(this.settings.connectSignal('refresh-interval', () => this.refreshService.restart()));
        this._settingsSignals.push(this.settings.connectSignal('icon-style', () => this._indicator.update()));
        this._settingsSignals.push(this.settings.connectSignal('color-mode', () => this._indicator.update()));
        this._settingsSignals.push(this.settings.connectSignal('show-percentage', () => this._indicator.update()));
        this._settingsSignals.push(this.settings.connectSignal('show-remaining-percentage', () => this._indicator.update()));
        this._settingsSignals.push(this.settings.connectSignal('active-profile-id', () => this._onActiveProfileChanged()));

        // Menu open handler to rebuild
        if (this._indicator.menu) {
            this._menuOpenId = this._indicator.menu.connect('open-state-changed', (menu, isOpen) => {
                log(`ClaudeUsage: menu open-state-changed isOpen=${isOpen}`);
                if (isOpen) {
                    this._menuBuilder.build();
                }
            });
            log('ClaudeUsage: menu open handler connected');
        } else {
            log('ClaudeUsage: WARNING - indicator.menu is null, cannot connect open-state-changed');
        }

        // Initial refresh
        this._queueInitialRefresh();
        this.refreshService.start();
        log('ClaudeUsage: enable() complete');
    }

    disable() {
        this.refreshService.destroy();
        this.statuslineService.destroy();
        this.apiService.destroy();

        if (this._indicator) {
            if (this._menuOpenId) {
                this._indicator.menu.disconnect(this._menuOpenId);
                this._menuOpenId = null;
            }
            this._indicator.destroy();
            this._indicator = null;
        }

        for (const id of this._settingsSignals) {
            this.settings.disconnectSignal(id);
        }
        this._settingsSignals = [];

        this._indicator = null;
        this._menuBuilder = null;
    }

    async _loadCredentials() {
        const profile = this.profileManager.activeProfile;
        if (!profile) return;
        const creds = await this.profileManager.loadCredentials(profile);
        if (creds.claudeSessionKey) profile.claudeSessionKey = creds.claudeSessionKey;
        if (creds.apiSessionKey) profile.apiSessionKey = creds.apiSessionKey;
        if (creds.cliCredentialsJSON) profile.cliCredentialsJSON = creds.cliCredentialsJSON;
    }

    _queueInitialRefresh() {
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            log('ClaudeUsage: initial refresh timer fired');
            this.refreshUsage();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onActiveProfileChanged() {
        const newActiveId = this.settings.activeProfileId;
        const profile = this.profileManager.profiles.find(p => p.id === newActiveId);
        if (profile) {
            this.profileManager.activateProfile(profile);
            this._loadCredentials().then(() => this.refreshUsage());
        }
    }

    async refreshUsage() {
        const profile = this.profileManager.activeProfile;
        log(`ClaudeUsage: refreshUsage() start, profile=${profile?.name ?? 'null'}`);
        if (!profile) {
            log('ClaudeUsage: no active profile, aborting refresh');
            return;
        }

        // Ensure credentials are loaded
        if (!profile.claudeSessionKey && !profile.cliCredentialsJSON) {
            log('ClaudeUsage: loading credentials from store');
            await this._loadCredentials();
        }

        log(`ClaudeUsage: credentials check - claudeSessionKey=${profile.claudeSessionKey ? 'yes' : 'no'}, cliCredentialsJSON=${profile.cliCredentialsJSON ? 'yes' : 'no'}, hasUsageCredentials=${profile.hasUsageCredentials}`);

        if (!profile.hasUsageCredentials) {
            this.lastError = 'No credentials configured';
            log('ClaudeUsage: no usage credentials, aborting');
            this._indicator.update();
            return;
        }

        try {
            this.lastError = null;
            log('ClaudeUsage: calling fetchUsageData');
            const usage = await this.apiService.fetchUsageData(profile);
            log(`ClaudeUsage: fetchUsageData succeeded, sessionPct=${usage?.sessionPercentage ?? 'null'}`);
            this.profileManager.updateUsage(profile, usage);

            // Fetch console data if available
            if (profile.hasAPIConsole) {
                try {
                    const consoleData = await this.apiService.fetchConsoleUsage(profile);
                    if (consoleData) {
                        const { APIUsage } = await import('./lib/models.js');
                        this.profileManager.updateUsage(profile, usage, new APIUsage(consoleData));
                    }
                } catch (e) {
                    log(`ClaudeUsage: Console fetch failed: ${e.message}`);
                }
            }

            this.statuslineService.writeCache(profile);
            this.notificationManager.checkAndNotify(profile);

            // Check auto-switch
            if (this.autoSwitchService.checkAndSwitch(profile)) {
                // Refresh again after switch
                GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                    this.refreshUsage();
                    return GLib.SOURCE_REMOVE;
                });
            }

            this.isStale = false;
            this._indicator.update();
            log('ClaudeUsage: refreshUsage() complete');
        } catch (e) {
            log(`ClaudeUsage: Refresh failed: ${e.message}`);
            this.lastError = e.message;
            this.isStale = true;
            this._indicator.update();
        }
    }

}
