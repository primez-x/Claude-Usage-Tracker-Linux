// Background refresh timer

import GLib from 'gi://GLib';

export class RefreshService {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.settings;
        this._profileManager = extension.profileManager;
        this._apiService = extension.apiService;
        this._timerId = null;
    }

    start() {
        this.stop();
        this._scheduleNext();
    }

    stop() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    _scheduleNext() {
        const interval = this._settings.refreshInterval;
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._extension.refreshUsage();
            return GLib.SOURCE_CONTINUE;
        });
    }

    restart() {
        this.start();
    }

    destroy() {
        this.stop();
    }
}
