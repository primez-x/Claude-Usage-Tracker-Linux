// Threshold notifications using GNOME Shell notifications

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { UsageStatusCalculator } from './utils.js';

export class NotificationManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.settings;
        this._profileManager = extension.profileManager;
        this._lastNotifiedLevel = new Map(); // profileId -> highest percentage notified
    }

    checkAndNotify(profile) {
        if (!this._settings.notificationsEnabled) return;
        if (!profile?.claudeUsage) return;

        const usage = profile.claudeUsage;
        const thresholds = this._settings.notificationThresholds;
        const sessionPct = usage.effectiveSessionPercentage;
        const weeklyPct = usage.weeklyPercentage;

        const maxPct = Math.max(sessionPct, weeklyPct);
        const lastNotified = this._lastNotifiedLevel.get(profile.id) || 0;

        for (const threshold of thresholds.sort((a, b) => a - b)) {
            if (maxPct >= threshold && lastNotified < threshold) {
                this._sendNotification(profile, threshold, maxPct, sessionPct, weeklyPct);
                this._lastNotifiedLevel.set(profile.id, threshold);
                return;
            }
        }

        // Reset if usage dropped significantly (e.g., after reset)
        if (maxPct < 10 && lastNotified > 0) {
            this._lastNotifiedLevel.set(profile.id, 0);
        }
    }

    _sendNotification(profile, threshold, maxPct, sessionPct, weeklyPct) {
        const status = UsageStatusCalculator.calculateStatus(maxPct, false);
        let urgency = 'normal';
        let icon = 'dialog-information-symbolic';

        if (status === 'critical') {
            urgency = 'critical';
            icon = 'dialog-warning-symbolic';
        } else if (status === 'moderate') {
            urgency = 'normal';
            icon = 'dialog-warning-symbolic';
        }

        const title = `Claude Usage: ${Math.round(maxPct)}%`;
        let body = `Profile: ${profile.name}\n`;
        body += `Session: ${Math.round(sessionPct)}%\n`;
        body += `Weekly: ${Math.round(weeklyPct)}%`;

        if (threshold >= 95) {
            body += '\n\nYou are approaching your usage limit!';
        }

        // Use GNOME Shell's built-in notification
        try {
            Main.notify(title, body);
        } catch (e) {
            log(`ClaudeUsage: Notification failed: ${e.message}`);
        }
    }

    notifyAutoSwitch(fromProfile, toProfile) {
        if (!this._settings.notificationsEnabled) return;
        if (!fromProfile?.notificationSettings?.notifyOnAutoSwitch) return;

        try {
            Main.notify(
                'Claude Usage: Auto-Switched Profile',
                `Switched from ${fromProfile.name} to ${toProfile.name} because session limit was reached.`
            );
        } catch (e) {
            log(`ClaudeUsage: Auto-switch notification failed: ${e.message}`);
        }
    }

    resetProfile(profileId) {
        this._lastNotifiedLevel.set(profileId, 0);
    }
}
