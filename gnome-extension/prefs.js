// Preferences window for Extension Manager

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { ExtensionSettings } from './lib/settings.js';
import { ProfileManager } from './lib/profileManager.js';
import { SessionKeyValidator } from './lib/utils.js';

export default class ClaudeUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = new ExtensionSettings();
        this._profileManager = new ProfileManager();
        this._window = window;
        this._window.set_default_size(this._settings.prefsWidth, this._settings.prefsHeight);

        this._buildProfilesPage();
        this._buildAppearancePage();
        this._buildGeneralPage();

        this._window.connect('close-request', () => {
            const [w, h] = this._window.get_default_size();
            this._settings.prefsWidth = w;
            this._settings.prefsHeight = h;
            return false;
        });
    }

    _buildProfilesPage() {
        const page = new Adw.PreferencesPage({ title: 'Profiles', icon_name: 'user-info-symbolic' });

        // Profile list group (dynamic)
        this._profileGroup = new Adw.PreferencesGroup({ title: 'Profiles' });
        this._profileRows = [];
        page.add(this._profileGroup);
        this._refreshProfileList();

        // Add profile button (static, separate group)
        const addGroup = new Adw.PreferencesGroup({ title: '' });
        const addRow = new Adw.ActionRow({ title: '' });
        const addBtn = new Gtk.Button({ label: 'Add Profile', valign: Gtk.Align.CENTER });
        addBtn.connect('clicked', () => this._onAddProfile());
        addRow.add_suffix(addBtn);
        addGroup.add(addRow);
        page.add(addGroup);

        // Credentials group for active profile (dynamic)
        this._credentialsGroup = new Adw.PreferencesGroup({ title: 'Credentials' });
        this._credentialRows = [];
        page.add(this._credentialsGroup);
        this._buildCredentialsSection();

        this._window.add(page);
    }

    _removeTrackedRows(group, rows) {
        for (const row of rows) {
            group.remove(row);
        }
        rows.length = 0;
    }

    _refreshProfileList() {
        this._removeTrackedRows(this._profileGroup, this._profileRows);

        for (const profile of this._profileManager.profiles) {
            const row = new Adw.ActionRow({ title: profile.name });

            if (profile === this._profileManager.activeProfile) {
                row.add_suffix(new Gtk.Label({ label: 'Active', css_classes: ['dim-label'] }));
            }

            const activateBtn = new Gtk.Button({ label: 'Activate', valign: Gtk.Align.CENTER });
            activateBtn.connect('clicked', () => {
                this._profileManager.activateProfile(profile);
                this._refreshProfileList();
                this._buildCredentialsSection();
            });

            const renameBtn = new Gtk.Button({ icon_name: 'document-edit-symbolic', valign: Gtk.Align.CENTER });
            renameBtn.connect('clicked', () => this._onRenameProfile(profile));

            const deleteBtn = new Gtk.Button({ icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER });
            deleteBtn.connect('clicked', () => this._onDeleteProfile(profile));

            if (profile !== this._profileManager.activeProfile) {
                row.add_suffix(activateBtn);
            }
            row.add_suffix(renameBtn);
            if (this._profileManager.profiles.length > 1) {
                row.add_suffix(deleteBtn);
            }

            this._profileGroup.add(row);
            this._profileRows.push(row);
        }
    }

    _buildCredentialsSection() {
        this._removeTrackedRows(this._credentialsGroup, this._credentialRows);

        const profile = this._profileManager.activeProfile;
        if (!profile) return;

        // Claude.ai session key
        const sessionRow = new Adw.PasswordEntryRow({ title: 'Claude.ai Session Key', show_apply_button: true });
        if (profile.claudeSessionKey) sessionRow.set_text(profile.claudeSessionKey);
        sessionRow.connect('apply', () => {
            const key = sessionRow.get_text();
            const validator = new SessionKeyValidator();
            try {
                validator.validate(key);
                this._profileManager.setClaudeSessionKey(profile, key);
                this._showToast('Session key saved');
            } catch (e) {
                this._showToast(e.message);
            }
        });
        this._credentialsGroup.add(sessionRow);
        this._credentialRows.push(sessionRow);

        // Organization ID (optional, auto-fetched)
        const orgRow = new Adw.EntryRow({ title: 'Organization ID (optional)', show_apply_button: true });
        if (profile.organizationId) orgRow.set_text(profile.organizationId);
        orgRow.connect('apply', () => {
            this._profileManager.updateOrganizationId(profile, orgRow.get_text() || null);
            this._showToast('Organization ID saved');
        });
        this._credentialsGroup.add(orgRow);
        this._credentialRows.push(orgRow);

        // API Console key
        const apiRow = new Adw.PasswordEntryRow({ title: 'API Console Session Key', show_apply_button: true });
        if (profile.apiSessionKey) apiRow.set_text(profile.apiSessionKey);
        apiRow.connect('apply', () => {
            this._profileManager.setAPISessionKey(profile, apiRow.get_text() || null);
            this._showToast('API key saved');
        });
        this._credentialsGroup.add(apiRow);
        this._credentialRows.push(apiRow);

        // API Org ID
        const apiOrgRow = new Adw.EntryRow({ title: 'API Console Organization ID', show_apply_button: true });
        if (profile.apiOrganizationId) apiOrgRow.set_text(profile.apiOrganizationId);
        apiOrgRow.connect('apply', () => {
            this._profileManager.updateAPIOrganizationId(profile, apiOrgRow.get_text() || null);
            this._showToast('API org ID saved');
        });
        this._credentialsGroup.add(apiOrgRow);
        this._credentialRows.push(apiOrgRow);

        // CLI Sync
        const cliRow = new Adw.ActionRow({ title: 'Claude Code CLI' });
        const cliSyncBtn = new Gtk.Button({ label: profile.hasCliAccount ? 'Re-sync' : 'Sync', valign: Gtk.Align.CENTER });
        cliSyncBtn.connect('clicked', async () => {
            const ok = await this._profileManager.syncCLIFromSystem(profile);
            this._showToast(ok ? 'CLI credentials synced' : 'No CLI credentials found');
            this._buildCredentialsSection();
        });
        const cliRemoveBtn = new Gtk.Button({ label: 'Remove', valign: Gtk.Align.CENTER, sensitive: profile.hasCliAccount });
        cliRemoveBtn.connect('clicked', () => {
            this._profileManager.removeCLICredentials(profile);
            this._showToast('CLI credentials removed');
            this._buildCredentialsSection();
        });
        cliRow.add_suffix(cliSyncBtn);
        cliRow.add_suffix(cliRemoveBtn);
        this._credentialsGroup.add(cliRow);
        this._credentialRows.push(cliRow);
    }

    _buildAppearancePage() {
        const page = new Adw.PreferencesPage({ title: 'Appearance', icon_name: 'applications-graphics-symbolic' });
        const group = new Adw.PreferencesGroup({ title: 'Panel Indicator' });

        // Icon style
        const styleRow = new Adw.ComboRow({ title: 'Icon Style' });
        const styleModel = Gtk.StringList.new(['Battery', 'Bar', 'Percentage', 'Compact']);
        styleRow.set_model(styleModel);
        const styles = ['battery', 'bar', 'percentage', 'compact'];
        styleRow.set_selected(styles.indexOf(this._settings.iconStyle) || 0);
        styleRow.connect('notify::selected', () => {
            this._settings.iconStyle = styles[styleRow.get_selected()];
        });
        group.add(styleRow);

        // Color mode
        const colorRow = new Adw.ComboRow({ title: 'Color Mode' });
        const colorModel = Gtk.StringList.new(['Multi-Color', 'Greyscale', 'Single Color']);
        colorRow.set_model(colorModel);
        const colors = ['multiColor', 'monochrome', 'singleColor'];
        colorRow.set_selected(colors.indexOf(this._settings.colorMode) || 0);
        colorRow.connect('notify::selected', () => {
            this._settings.colorMode = colors[colorRow.get_selected()];
        });
        group.add(colorRow);

        // Single color
        const hexRow = new Adw.EntryRow({ title: 'Single Color Hex', show_apply_button: true });
        hexRow.set_text(this._settings.singleColorHex);
        hexRow.connect('apply', () => {
            this._settings.singleColorHex = hexRow.get_text();
        });
        group.add(hexRow);

        // Show percentage
        const showPctRow = new Adw.SwitchRow({ title: 'Show Percentage in Panel' });
        showPctRow.set_active(this._settings.showPercentage);
        showPctRow.connect('notify::active', () => {
            this._settings.showPercentage = showPctRow.get_active();
        });
        group.add(showPctRow);

        // Show remaining
        const showRemRow = new Adw.SwitchRow({ title: 'Show Remaining (instead of Used)' });
        showRemRow.set_active(this._settings.showRemainingPercentage);
        showRemRow.connect('notify::active', () => {
            this._settings.showRemainingPercentage = showRemRow.get_active();
        });
        group.add(showRemRow);

        page.add(group);
        this._window.add(page);
    }

    _buildGeneralPage() {
        const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic' });
        const group = new Adw.PreferencesGroup({ title: 'Behavior' });

        // Refresh interval
        const refreshRow = new Adw.SpinRow({
            title: 'Refresh Interval (seconds)',
            adjustment: new Gtk.Adjustment({ lower: 15, upper: 3600, step_increment: 15, value: this._settings.refreshInterval })
        });
        refreshRow.connect('notify::value', () => {
            this._settings.refreshInterval = refreshRow.get_value();
        });
        group.add(refreshRow);

        // Notifications
        const notifRow = new Adw.SwitchRow({ title: 'Enable Notifications' });
        notifRow.set_active(this._settings.notificationsEnabled);
        notifRow.connect('notify::active', () => {
            this._settings.notificationsEnabled = notifRow.get_active();
        });
        group.add(notifRow);

        // Auto-switch
        const switchRow = new Adw.SwitchRow({ title: 'Auto-Switch Profile on Limit' });
        switchRow.set_active(this._settings.autoSwitchProfile);
        switchRow.connect('notify::active', () => {
            this._settings.autoSwitchProfile = switchRow.get_active();
        });
        group.add(switchRow);

        // Statusline
        const statuslineRow = new Adw.SwitchRow({ title: 'Write Terminal Statusline Cache' });
        statuslineRow.set_active(this._settings.statuslineEnabled);
        statuslineRow.connect('notify::active', () => {
            this._settings.statuslineEnabled = statuslineRow.get_active();
        });
        group.add(statuslineRow);

        // Overage
        const overageRow = new Adw.SwitchRow({ title: 'Check Overage Limit' });
        overageRow.set_active(this._settings.checkOverageLimit);
        overageRow.connect('notify::active', () => {
            this._settings.checkOverageLimit = overageRow.get_active();
        });
        group.add(overageRow);

        page.add(group);
        this._window.add(page);
    }

    _onAddProfile() {
        const dialog = new Adw.MessageDialog({
            heading: 'New Profile',
            body: 'Enter a name for the new profile:',
            transient_for: this._window
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('create');
        dialog.set_close_response('cancel');

        const entry = new Gtk.Entry({ margin_top: 12 });
        entry.set_text('New Profile');
        dialog.set_extra_child(entry);

        dialog.connect('response', (_d, response) => {
            if (response === 'create') {
                const name = entry.get_text().trim() || 'New Profile';
                this._profileManager.createProfile(name);
                this._refreshProfileList();
            }
        });
        dialog.present();
    }

    _onRenameProfile(profile) {
        const dialog = new Adw.MessageDialog({
            heading: 'Rename Profile',
            body: 'Enter a new name:',
            transient_for: this._window
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('save');

        const entry = new Gtk.Entry({ margin_top: 12 });
        entry.set_text(profile.name);
        dialog.set_extra_child(entry);

        dialog.connect('response', (_d, response) => {
            if (response === 'save') {
                this._profileManager.updateProfileName(profile, entry.get_text().trim() || profile.name);
                this._refreshProfileList();
            }
        });
        dialog.present();
    }

    _onDeleteProfile(profile) {
        const dialog = new Adw.MessageDialog({
            heading: 'Delete Profile?',
            body: `Are you sure you want to delete "${profile.name}"? All credentials for this profile will be removed.`,
            transient_for: this._window
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');

        dialog.connect('response', (_d, response) => {
            if (response === 'delete') {
                this._profileManager.deleteProfile(profile);
                this._refreshProfileList();
                this._buildCredentialsSection();
            }
        });
        dialog.present();
    }

    _showToast(message) {
        // Adw.Toast is available in libadwaita 1.2+
        try {
            const toast = new Adw.Toast({ title: message });
            this._window.add_toast(toast);
        } catch {
            // Fallback: just log
            log(`ClaudeUsage Prefs: ${message}`);
        }
    }
}
