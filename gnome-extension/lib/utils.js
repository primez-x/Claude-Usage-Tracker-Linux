// Utilities ported from Swift

export const UsageStatusLevel = {
    SAFE: 'safe',
    MODERATE: 'moderate',
    CRITICAL: 'critical'
};

export class UsageStatusCalculator {
    static calculateStatus(usedPercentage, showRemaining, elapsedFraction = null) {
        const u = usedPercentage / 100.0;
        if (elapsedFraction !== null && elapsedFraction >= 0.15 && elapsedFraction < 1.0 && u > 0) {
            const projected = u / elapsedFraction;
            if (projected < 0.75) return UsageStatusLevel.SAFE;
            if (projected < 0.95) return UsageStatusLevel.MODERATE;
            return UsageStatusLevel.CRITICAL;
        }

        if (showRemaining) {
            const remaining = Math.max(0, 100 - usedPercentage);
            if (remaining >= 20) return UsageStatusLevel.SAFE;
            if (remaining >= 10) return UsageStatusLevel.MODERATE;
            return UsageStatusLevel.CRITICAL;
        } else {
            if (usedPercentage < 50) return UsageStatusLevel.SAFE;
            if (usedPercentage < 80) return UsageStatusLevel.MODERATE;
            return UsageStatusLevel.CRITICAL;
        }
    }

    static elapsedFraction(resetTime, duration, showRemaining) {
        if (!resetTime || duration <= 0) return null;
        const now = new Date();
        if (resetTime <= now) return showRemaining ? 0.0 : 1.0;
        const remaining = (resetTime - now) / 1000;
        const elapsed = duration - remaining;
        const fraction = Math.min(Math.max(elapsed / duration, 0), 1);
        return showRemaining ? 1.0 - fraction : fraction;
    }

    static getDisplayPercentage(usedPercentage, showRemaining) {
        return showRemaining ? Math.max(0, 100 - usedPercentage) : usedPercentage;
    }
}

export const PaceStatus = {
    COMFORTABLE: 0,
    ON_TRACK: 1,
    WARMING: 2,
    PRESSING: 3,
    CRITICAL: 4,
    RUNAWAY: 5,

    calculate(usedPercentage, elapsedFraction) {
        if (elapsedFraction < 0.03 || elapsedFraction >= 1.0) return null;
        if (usedPercentage <= 0) return PaceStatus.COMFORTABLE;
        const projected = (usedPercentage / 100.0) / elapsedFraction;
        if (projected < 0.50) return PaceStatus.COMFORTABLE;
        if (projected < 0.75) return PaceStatus.ON_TRACK;
        if (projected < 0.90) return PaceStatus.WARMING;
        if (projected < 1.00) return PaceStatus.PRESSING;
        if (projected < 1.20) return PaceStatus.CRITICAL;
        return PaceStatus.RUNAWAY;
    },

    label(status) {
        switch (status) {
            case PaceStatus.COMFORTABLE: return 'Comfortable';
            case PaceStatus.ON_TRACK: return 'On Track';
            case PaceStatus.WARMING: return 'Warming';
            case PaceStatus.PRESSING: return 'Pressing';
            case PaceStatus.CRITICAL: return 'Critical';
            case PaceStatus.RUNAWAY: return 'Runaway';
            default: return '';
        }
    },

    cssClass(status) {
        switch (status) {
            case PaceStatus.COMFORTABLE: return 'claude-pace-comfortable';
            case PaceStatus.ON_TRACK: return 'claude-pace-ontrack';
            case PaceStatus.WARMING: return 'claude-pace-warming';
            case PaceStatus.PRESSING: return 'claude-pace-pressing';
            case PaceStatus.CRITICAL: return 'claude-pace-critical';
            case PaceStatus.RUNAWAY: return 'claude-pace-runaway';
            default: return '';
        }
    }
};

export class URLBuilder {
    constructor(baseURL) {
        const match = baseURL.match(/^(https?):\/\/([^\/]+)(\/.*)?$/);
        if (!match) throw new Error('Invalid base URL');
        this._scheme = match[1];
        this._host = match[2];
        this._path = (match[3] || '').replace(/\/+$/, '');
        this._query = {};
    }

    appendingPath(path) {
        const cleanPath = path.trim();
        if (cleanPath.includes('..')) {
            throw new Error(`Invalid path: contains '..'`);
        }
        const trimmed = cleanPath.replace(/^\/+|\/+$/g, '');
        this._path = this._path + '/' + trimmed;
        return this;
    }

    appendingPathComponents(paths) {
        for (const p of paths) {
            this.appendingPath(p);
        }
        return this;
    }

    addingQueryParameter(name, value) {
        if (!name) throw new Error('Empty parameter name');
        this._query[name] = value;
        return this;
    }

    addingQueryParameters(params) {
        for (const [k, v] of Object.entries(params)) {
            this.addingQueryParameter(k, v);
        }
        return this;
    }

    build() {
        if (!['http', 'https'].includes(this._scheme)) {
            throw new Error('Invalid URL scheme');
        }
        let url = `${this._scheme}://${this._host}${this._path}`;
        const params = Object.entries(this._query);
        if (params.length > 0) {
            url += '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        }
        return url;
    }

    static claudeAPI(endpoint = '') {
        const b = new URLBuilder('https://claude.ai/api');
        return endpoint ? b.appendingPath(endpoint) : b;
    }

    static consoleAPI(endpoint = '') {
        const b = new URLBuilder('https://console.anthropic.com/api');
        return endpoint ? b.appendingPath(endpoint) : b;
    }
}

export class SessionKeyValidator {
    constructor(config = {}) {
        this.config = {
            requiredPrefix: config.requiredPrefix ?? 'sk-ant-',
            minLength: config.minLength ?? 20,
            maxLength: config.maxLength ?? 500,
            allowedChars: config.allowedChars ?? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_',
            strictMode: config.strictMode ?? true
        };
    }

    validate(sessionKey) {
        const trimmed = sessionKey.trim();
        if (!trimmed) throw new Error('Session key cannot be empty');
        if (this.config.strictMode && /\s/.test(trimmed)) {
            throw new Error('Session key cannot contain whitespace');
        }
        if (trimmed.length < this.config.minLength) {
            throw new Error(`Session key too short (minimum: ${this.config.minLength}, actual: ${trimmed.length})`);
        }
        if (trimmed.length > this.config.maxLength) {
            throw new Error(`Session key too long (maximum: ${this.config.maxLength}, actual: ${trimmed.length})`);
        }
        if (!trimmed.startsWith(this.config.requiredPrefix)) {
            throw new Error(`Session key must start with '${this.config.requiredPrefix}'`);
        }

        if (this.config.strictMode) {
            if (trimmed.includes('\0')) throw new Error('Contains null bytes');
            if (/[\x00-\x1F\x7F]/.test(trimmed)) throw new Error('Contains control characters');
            if (trimmed.includes('..') || trimmed.includes('//')) throw new Error('Contains suspicious patterns');
            const suspicious = ['<script', 'javascript:', 'data:', 'vbscript:', 'file:'];
            for (const p of suspicious) {
                if (trimmed.toLowerCase().includes(p)) throw new Error('Contains script injection pattern');
            }
        }

        const invalid = [];
        for (const ch of trimmed) {
            if (!this.config.allowedChars.includes(ch)) invalid.push(ch);
        }
        if (invalid.length > 0) {
            throw new Error(`Found disallowed characters: '${invalid.join('')}'`);
        }

        const afterPrefix = trimmed.slice(this.config.requiredPrefix.length);
        if (!afterPrefix) throw new Error('No content after prefix');
        if (!afterPrefix.includes('-') && !afterPrefix.includes('_')) {
            throw new Error('Missing expected separators');
        }

        return trimmed;
    }

    isValid(sessionKey) {
        try { this.validate(sessionKey); return true; } catch { return false; }
    }

    sanitizeForStorage(sessionKey) {
        return sessionKey.trim().replace(/\r\n/g, '').replace(/\n/g, '').replace(/\r/g, '');
    }
}

export function timeRemainingString(resetTime) {
    if (!resetTime) return '';
    const now = new Date();
    const diff = resetTime - now;
    if (diff <= 0) return 'Resets now';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h remaining`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
}

export function nextMonday1259pm() {
    const now = new Date();
    const day = now.getDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysUntilMonday);
    monday.setHours(12, 59, 0, 0);
    return monday;
}
