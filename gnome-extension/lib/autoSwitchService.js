// Auto-switch to next profile when session limit reached

export class AutoSwitchService {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.settings;
        this._profileManager = extension.profileManager;
        this._notificationManager = extension.notificationManager;
    }

    checkAndSwitch(profile) {
        if (!this._settings.autoSwitchProfile) return false;
        if (!profile?.claudeUsage) return false;

        const sessionPct = profile.claudeUsage.effectiveSessionPercentage;
        if (sessionPct < 99) return false;

        const next = this._profileManager.getNextAvailableProfile(profile);
        if (!next) return false;

        log(`ClaudeUsage: Auto-switching from ${profile.name} to ${next.name}`);
        this._profileManager.activateProfile(next);
        this._notificationManager?.notifyAutoSwitch(profile, next);
        return true;
    }

    destroy() {}
}
