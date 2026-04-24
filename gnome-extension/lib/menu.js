// Popup menu content

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { UsageStatusCalculator, PaceStatus, timeRemainingString } from './utils.js';
import { APIUsage } from './models.js';

export class ClaudeMenuBuilder {
    constructor(indicator, extension) {
        this._indicator = indicator;
        this._extension = extension;
        this._profileManager = extension.profileManager;
        this._apiService = extension.apiService;
        this._settings = extension.settings;
    }

    build() {
        const menu = this._indicator.menu;
        menu.removeAll();

        this._buildHeader(menu);
        this._buildUsageSection(menu);
        this._buildAPIConsoleSection(menu);
        this._buildActions(menu);
    }

    _buildHeader(menu) {
        // Profile switcher row
        const profile = this._profileManager.activeProfile;
        const headerBox = new St.BoxLayout({ style_class: 'claude-usage-header' });

        const profileLabel = new St.Label({ text: profile?.name ?? 'No Profile', y_align: Clutter.ActorAlign.CENTER });
        headerBox.add_child(profileLabel);

        headerBox.add_child(new St.Widget({ x_expand: true }));

        // Refresh button
        const refreshBtn = new St.Button({ style_class: 'claude-button' });
        refreshBtn.child = new St.Icon({ icon_name: 'view-refresh-symbolic', icon_size: 14 });
        refreshBtn.connect('clicked', () => this._extension.refreshUsage());
        headerBox.add_child(refreshBtn);

        // Settings button
        const settingsBtn = new St.Button({ style_class: 'claude-button' });
        settingsBtn.child = new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 14 });
        settingsBtn.connect('clicked', () => {
            this._indicator.menu.close();
            this._extension.openPreferences();
        });
        headerBox.add_child(settingsBtn);

        const headerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        headerItem.add_child(headerBox);
        menu.addMenuItem(headerItem);

        // Separator
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Error banner if needed
        if (this._extension.lastError) {
            const errorItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            const errorLabel = new St.Label({
                text: this._extension.lastError,
                style_class: 'claude-error-banner'
            });
            errorItem.add_child(errorLabel);
            menu.addMenuItem(errorItem);
        }

        // Stale data warning
        if (this._extension.isStale) {
            const staleItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            const staleLabel = new St.Label({
                text: 'Data may be stale — click refresh',
                style_class: 'claude-stale-banner'
            });
            staleItem.add_child(staleLabel);
            menu.addMenuItem(staleItem);
        }
    }

    _buildUsageSection(menu) {
        const profile = this._profileManager.activeProfile;
        if (!profile || !profile.claudeUsage) {
            const emptyItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            emptyItem.add_child(new St.Label({ text: 'No usage data. Configure credentials in Settings.' }));
            menu.addMenuItem(emptyItem);
            return;
        }

        const usage = profile.claudeUsage;
        const showRemaining = this._settings.showRemainingPercentage;

        // Session
        this._addUsageRow(menu, 'Session', usage.effectiveSessionPercentage, usage.sessionResetTime, showRemaining, '5h');

        // Weekly (All Models)
        this._addUsageRow(menu, 'All Models', usage.weeklyPercentage, usage.weeklyResetTime, showRemaining, '7d');

        // Opus
        if (usage.opusWeeklyPercentage > 0) {
            this._addUsageRow(menu, 'Opus', usage.opusWeeklyPercentage, usage.weeklyResetTime, showRemaining, '7d');
        }

        // Sonnet
        if (usage.sonnetWeeklyPercentage > 0) {
            this._addUsageRow(menu, 'Sonnet', usage.sonnetWeeklyPercentage, usage.sonnetWeeklyResetTime, showRemaining, '7d');
        }

        // Extra usage / Overage
        if (usage.costUsed !== null && usage.costLimit !== null) {
            this._addCostRow(menu, 'Extra Usage', usage.costUsed, usage.costLimit, usage.costCurrency);
        }

        // Overage balance
        if (usage.overageBalance !== null) {
            this._addSimpleRow(menu, `Overage Balance: ${this._formatCurrency(usage.overageBalance, usage.overageBalanceCurrency)}`);
        }

        // Last updated
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const updatedItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const updatedText = new St.Label({
            text: `Updated ${this._timeAgo(usage.lastUpdated)}`,
            style_class: 'claude-reset-time'
        });
        updatedItem.add_child(updatedText);
        menu.addMenuItem(updatedItem);
    }

    _addUsageRow(menu, label, percentage, resetTime, showRemaining, periodLabel) {
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const box = new St.BoxLayout({ vertical: true, x_expand: true });

        const row = new St.BoxLayout();
        const nameLabel = new St.Label({ text: label, style_class: 'claude-usage-label', y_align: Clutter.ActorAlign.CENTER });
        row.add_child(nameLabel);

        row.add_child(new St.Widget({ x_expand: true }));

        const displayPct = UsageStatusCalculator.getDisplayPercentage(percentage, showRemaining);
        const status = UsageStatusCalculator.calculateStatus(percentage, showRemaining);
        const pctLabel = new St.Label({
            text: `${Math.round(displayPct)}%`,
            style_class: `claude-usage-value claude-status-${status}`
        });
        row.add_child(pctLabel);
        box.add_child(row);

        // Progress bar
        const progressBox = new St.BoxLayout({ style_class: 'claude-progress-bar' });
        const fill = new St.Widget({
            style_class: `claude-progress-fill ${status}`,
            width: Math.max(2, Math.round((percentage / 100) * 160))
        });
        progressBox.add_child(fill);
        box.add_child(progressBox);

        // Reset time
        const resetStr = timeRemainingString(resetTime);
        if (resetStr) {
            const resetLabel = new St.Label({ text: `${resetStr}  (${periodLabel})`, style_class: 'claude-reset-time' });
            box.add_child(resetLabel);
        }

        item.add_child(box);
        menu.addMenuItem(item);
    }

    _addCostRow(menu, label, used, limit, currency) {
        const pct = limit > 0 ? (used / limit) * 100 : 0;
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const box = new St.BoxLayout({ vertical: true, x_expand: true });

        const row = new St.BoxLayout();
        row.add_child(new St.Label({ text: label, style_class: 'claude-usage-label' }));
        row.add_child(new St.Widget({ x_expand: true }));
        row.add_child(new St.Label({ text: `${Math.round(pct)}%`, style_class: 'claude-usage-value' }));
        box.add_child(row);

        const progressBox = new St.BoxLayout({ style_class: 'claude-progress-bar' });
        const fill = new St.Widget({
            style_class: 'claude-progress-fill moderate',
            width: Math.max(2, Math.round((pct / 100) * 160))
        });
        progressBox.add_child(fill);
        box.add_child(progressBox);

        const amountText = new St.Label({
            text: `${this._formatCurrency(used, currency)} / ${this._formatCurrency(limit, currency)}`,
            style_class: 'claude-reset-time'
        });
        box.add_child(amountText);

        item.add_child(box);
        menu.addMenuItem(item);
    }

    _addSimpleRow(menu, text) {
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        item.add_child(new St.Label({ text }));
        menu.addMenuItem(item);
    }

    _buildAPIConsoleSection(menu) {
        const profile = this._profileManager.activeProfile;
        if (!profile?.apiUsage) return;

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const sectionItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        sectionItem.add_child(new St.Label({ text: 'API Console', style_class: 'claude-section-header' }));
        menu.addMenuItem(sectionItem);

        const api = profile.apiUsage;
        this._addSimpleRow(menu, `Used: ${api.formattedUsed}`);
        this._addSimpleRow(menu, `Remaining: ${api.formattedRemaining}`);
        this._addSimpleRow(menu, `Total: ${api.formattedTotal}`);

        if (api.formattedAPICost) {
            this._addSimpleRow(menu, `Token Cost: ${api.formattedAPICost}`);
        }
    }

    _buildActions(menu) {
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Profile submenu
        if (this._profileManager.profiles.length > 1) {
            const profileSub = new PopupMenu.PopupSubMenuMenuItem('Profiles');
            for (const p of this._profileManager.profiles) {
                const item = new PopupMenu.PopupMenuItem(p.name);
                if (p === this._profileManager.activeProfile) {
                    item.setOrnament(PopupMenu.Ornament.CHECK);
                }
                item.connect('activate', () => {
                    this._profileManager.activateProfile(p);
                    this._extension.refreshUsage();
                });
                profileSub.menu.addMenuItem(item);
            }
            menu.addMenuItem(profileSub);
        }

        // Quick switch to next profile if auto-switch is on
        if (this._settings.autoSwitchProfile) {
            const next = this._profileManager.getNextAvailableProfile(this._profileManager.activeProfile);
            if (next) {
                const switchItem = new PopupMenu.PopupMenuItem(`Switch to ${next.name}`);
                switchItem.connect('activate', () => {
                    this._profileManager.activateProfile(next);
                    this._extension.refreshUsage();
                });
                menu.addMenuItem(switchItem);
            }
        }
    }

    _formatCurrency(amount, currency) {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency || 'USD',
                minimumFractionDigits: 2
            }).format(amount);
        } catch {
            return `${currency || 'USD'} ${amount.toFixed(2)}`;
        }
    }

    _timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }
}
