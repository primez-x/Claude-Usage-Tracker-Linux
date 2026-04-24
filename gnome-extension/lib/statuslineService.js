// Write usage cache for terminal statusline integration

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const CACHE_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
const CACHE_FILE = GLib.build_filenamev([CACHE_DIR, 'usage-cache.json']);

export class StatuslineService {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.settings;
        this._ensureDir();
    }

    _ensureDir() {
        const dir = Gio.File.new_for_path(CACHE_DIR);
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory_with_parents(null);
            } catch (e) {
                log(`ClaudeUsage: Failed to create ~/.claude: ${e.message}`);
            }
        }
    }

    writeCache(profile) {
        if (!this._settings.statuslineEnabled) return;
        if (!profile?.claudeUsage) return;

        const usage = profile.claudeUsage;
        const cache = {
            profile: profile.name,
            session: {
                percentage: usage.effectiveSessionPercentage,
                resetTime: usage.sessionResetTime.toISOString()
            },
            weekly: {
                percentage: usage.weeklyPercentage,
                resetTime: usage.weeklyResetTime.toISOString()
            },
            opus: usage.opusWeeklyPercentage,
            sonnet: usage.sonnetWeeklyPercentage,
            lastUpdated: usage.lastUpdated.toISOString()
        };

        try {
            const file = Gio.File.new_for_path(CACHE_FILE);
            const bytes = new TextEncoder().encode(JSON.stringify(cache, null, 2));
            const outputStream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            outputStream.write_bytes(GLib.Bytes.new(bytes), null);
            outputStream.close(null);
        } catch (e) {
            log(`ClaudeUsage: Failed to write statusline cache: ${e.message}`);
        }
    }

    destroy() {
        // Optional: remove cache on destroy
    }
}
