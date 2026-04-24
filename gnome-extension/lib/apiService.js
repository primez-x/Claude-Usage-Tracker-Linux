// Claude API service using Soup3

import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { URLBuilder, SessionKeyValidator } from './utils.js';
import { ClaudeUsage } from './models.js';

const SESSION_WINDOW = 5 * 60 * 60; // seconds
const WEEKLY_LIMIT = 1000000;

export class ClaudeAPIService {
    constructor() {
        this._session = new Soup.Session({ timeout: 30 });
        this._validator = new SessionKeyValidator();
    }

    destroy() {
        this._session.abort();
    }

    _buildRequest(url, auth) {
        const message = Soup.Message.new('GET', url);
        if (!message) throw new Error(`Failed to create request for ${url}`);

        const headers = message.get_request_headers();
        headers.append('Accept', 'application/json');

        if (auth.type === 'session') {
            headers.append('Cookie', `sessionKey=${auth.value}`);
            headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36');
            headers.append('Referer', 'https://claude.ai');
            headers.append('Origin', 'https://claude.ai');
        } else if (auth.type === 'oauth') {
            headers.append('Authorization', `Bearer ${auth.value}`);
            headers.append('Content-Type', 'application/json');
            headers.append('User-Agent', 'claude-code/2.1.5');
            headers.append('anthropic-beta', 'oauth-2025-04-20');
        } else if (auth.type === 'console') {
            headers.append('Cookie', `sessionKey=${auth.value}`);
            headers.append('Accept', 'application/json');
        }

        return message;
    }

    async _sendRequest(message) {
        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const status = message.get_status();
                    const responseBody = bytes ? new TextDecoder('utf-8').decode(bytes.get_data()) : '';
                    resolve({ status, body: responseBody, headers: message.get_response_headers() });
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async _postRequest(url, auth, bodyObj) {
        const message = Soup.Message.new('POST', url);
        const headers = message.get_request_headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');

        if (auth.type === 'oauth') {
            headers.append('Authorization', `Bearer ${auth.value}`);
            headers.append('User-Agent', 'claude-code/2.1.5');
            headers.append('anthropic-beta', 'oauth-2025-04-20');
            headers.append('anthropic-version', '2023-06-01');
        }

        const bodyStr = JSON.stringify(bodyObj);
        message.set_request_body_from_bytes('application/json', GLib.Bytes.new(new TextEncoder().encode(bodyStr)));

        return this._sendRequest(message);
    }

    async fetchOrganizations(sessionKey) {
        const validated = this._validator.validate(sessionKey);
        const url = URLBuilder.claudeAPI('organizations').build();
        const message = this._buildRequest(url, { type: 'session', value: validated });
        const { status, body } = await this._sendRequest(message);

        if (status === 200) {
            const orgs = JSON.parse(body);
            if (!orgs.length) throw new Error('No organizations found');
            return orgs.map(o => ({ uuid: o.uuid, name: o.name, email: o.email }));
        }
        if (status === 401 || status === 403) throw new Error('Unauthorized');
        if (status === 429) throw new Error('Rate limited');
        throw new Error(`HTTP ${status}`);
    }

    async fetchUsageData(profile) {
        const auth = this._getAuthentication(profile);

        if (auth.type === 'session') {
            const orgId = profile.organizationId || await this._resolveOrgId(auth.value);
            if (!profile.organizationId) profile.organizationId = orgId;

            const usageUrl = URLBuilder.claudeAPI(`organizations/${orgId}/usage`).build();
            const usageMsg = this._buildRequest(usageUrl, auth);
            const usagePromise = this._sendRequest(usageMsg);

            let overagePromise = Promise.resolve(null);
            let creditPromise = Promise.resolve(null);

            if (profile.checkOverageLimitEnabled !== false) {
                try {
                    const overageUrl = URLBuilder.claudeAPI(`organizations/${orgId}/overage_spend_limit`).build();
                    const overageMsg = this._buildRequest(overageUrl, auth);
                    overagePromise = this._sendRequest(overageMsg);
                } catch {}

                try {
                    const creditUrl = URLBuilder.claudeAPI(`organizations/${orgId}/overage_credit_grant`).build();
                    const creditMsg = this._buildRequest(creditUrl, auth);
                    creditPromise = this._sendRequest(creditMsg);
                } catch {}
            }

            const [usageRes, overageRes, creditRes] = await Promise.all([usagePromise, overagePromise, creditPromise]);

            if (usageRes.status !== 200) {
                if (usageRes.status === 401 || usageRes.status === 403) throw new Error('Unauthorized');
                throw new Error(`Usage fetch failed: HTTP ${usageRes.status}`);
            }

            let usage = this._parseUsageResponse(usageRes.body);

            if (overageRes && overageRes.status === 200) {
                try {
                    const overage = JSON.parse(overageRes.body);
                    if (overage.is_enabled === true || overage.isEnabled === true) {
                        usage.costUsed = overage.used_credits ?? overage.usedCredits;
                        usage.costLimit = overage.monthly_credit_limit ?? overage.monthlyCreditLimit;
                        usage.costCurrency = overage.currency;
                    }
                } catch {}
            }

            if (creditRes && creditRes.status === 200) {
                try {
                    const grant = JSON.parse(creditRes.body);
                    usage.overageBalance = grant.remaining_balance ?? grant.remainingBalance;
                    usage.overageBalanceCurrency = grant.currency;
                } catch {}
            }

            return usage;
        }

        if (auth.type === 'oauth') {
            // Try dedicated endpoint first
            try {
                const url = 'https://api.anthropic.com/api/oauth/usage';
                const message = this._buildRequest(url, auth);
                message.set_method('GET');
                const { status, body } = await this._sendRequest(message);
                if (status === 200) {
                    return this._parseUsageResponse(body);
                }
            } catch {}

            // Fallback to Messages API rate-limit headers
            return this._fetchUsageFromRateLimitHeaders(auth.value);
        }

        throw new Error('No valid credentials for usage data');
    }

    async fetchConsoleUsage(profile) {
        if (!profile.apiSessionKey || !profile.apiOrganizationId) return null;

        const auth = { type: 'console', value: profile.apiSessionKey };
        const orgId = profile.apiOrganizationId;

        const endpoints = [
            { name: 'currentSpend', url: `https://console.anthropic.com/api/organizations/${orgId}/current_spend` },
            { name: 'prepaid', url: `https://console.anthropic.com/api/organizations/${orgId}/prepaid/credits` },
            { name: 'usageCost', url: `https://console.anthropic.com/api/organizations/${orgId}/workspaces/default/usage_cost` }
        ];

        let currentSpend = null;
        let prepaid = null;
        let usageCost = null;

        for (const ep of endpoints) {
            try {
                const message = this._buildRequest(ep.url, auth);
                const { status, body } = await this._sendRequest(message);
                if (status === 200) {
                    if (ep.name === 'currentSpend') currentSpend = JSON.parse(body);
                    if (ep.name === 'prepaid') prepaid = JSON.parse(body);
                    if (ep.name === 'usageCost') usageCost = JSON.parse(body);
                }
            } catch (e) {
                log(`ClaudeUsage: Console API ${ep.name} failed: ${e.message}`);
            }
        }

        if (!currentSpend && !prepaid) return null;

        return {
            currentSpendCents: currentSpend?.cents ?? 0,
            resetsAt: currentSpend?.resets_at ? new Date(currentSpend.resets_at) : nextMonday1259pm(),
            prepaidCreditsCents: prepaid?.cents ?? 0,
            currency: currentSpend?.currency ?? 'USD',
            apiTokenCostCents: usageCost?.total_cents ?? null,
            apiCostByModel: usageCost?.by_model ?? null,
            costBySource: usageCost?.by_source ?? null,
            dailyCostCents: usageCost?.daily_cents ?? null
        };
    }

    _getAuthentication(profile) {
        if (profile.claudeSessionKey) {
            try {
                const validated = this._validator.validate(profile.claudeSessionKey);
                return { type: 'session', value: validated };
            } catch (e) {
                log(`ClaudeUsage: Session key validation failed: ${e.message}`);
            }
        }

        if (profile.hasValidCLIOAuth) {
            try {
                const creds = JSON.parse(profile.cliCredentialsJSON);
                const token = creds.claudeAiOauth?.accessToken ?? creds.access_token;
                if (token) return { type: 'oauth', value: token };
            } catch {}
        }

        // Fallback to system CLI credentials
        try {
            const systemCreds = this._readSystemCLICredentials();
            if (systemCreds) {
                try {
                    const creds = JSON.parse(systemCreds);
                    const token = creds.claudeAiOauth?.accessToken ?? creds.access_token;
                    if (token) return { type: 'oauth', value: token };
                } catch {}
            }
        } catch (e) {
            log(`ClaudeUsage: System CLI creds read failed: ${e.message}`);
        }

        throw new Error('No valid credentials found');
    }

    _readSystemCLICredentials() {
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
                return new TextDecoder('utf-8').decode(contents.get_data ? contents.get_data() : contents);
            } catch {}
        }
        return null;
    }

    async _resolveOrgId(sessionKey) {
        const orgs = await this.fetchOrganizations(sessionKey);
        return orgs[0]?.uuid;
    }

    async _fetchUsageFromRateLimitHeaders(oauthToken) {
        const url = 'https://api.anthropic.com/v1/messages';
        const auth = { type: 'oauth', value: oauthToken };
        const body = {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }]
        };

        const { status, headers } = await this._postRequest(url, auth, body);
        if (status !== 200) throw new Error(`OAuth Messages API failed: HTTP ${status}`);

        const sessionUtil = parseFloat(headers.get_one('anthropic-ratelimit-unified-5h-utilization') || '0');
        const sessionResetTs = parseFloat(headers.get_one('anthropic-ratelimit-unified-5h-reset') || '0');
        const weeklyUtil = parseFloat(headers.get_one('anthropic-ratelimit-unified-7d-utilization') || '0');
        const weeklyResetTs = parseFloat(headers.get_one('anthropic-ratelimit-unified-7d-reset') || '0');

        let sessionPercentage = sessionUtil * 100;
        const sessionResetTime = sessionResetTs > 0 ? new Date(sessionResetTs * 1000) : new Date(Date.now() + SESSION_WINDOW * 1000);
        if (sessionResetTime < new Date()) sessionPercentage = 0;

        const weeklyPercentage = weeklyUtil * 100;
        const weeklyResetTime = weeklyResetTs > 0 ? new Date(weeklyResetTs * 1000) : nextMonday1259pm();
        const weeklyTokens = Math.round(WEEKLY_LIMIT * (weeklyPercentage / 100));

        return new ClaudeUsage({
            sessionTokensUsed: 0,
            sessionLimit: 0,
            sessionPercentage,
            sessionResetTime,
            weeklyTokensUsed: weeklyTokens,
            weeklyLimit: WEEKLY_LIMIT,
            weeklyPercentage,
            weeklyResetTime,
            opusWeeklyTokensUsed: 0,
            opusWeeklyPercentage: 0,
            sonnetWeeklyTokensUsed: 0,
            sonnetWeeklyPercentage: 0,
            sonnetWeeklyResetTime: null,
            lastUpdated: new Date()
        });
    }

    _parseUsageResponse(body) {
        const json = JSON.parse(body);

        let sessionPercentage = 0;
        let sessionResetTime = new Date(Date.now() + SESSION_WINDOW * 1000);
        if (json.five_hour) {
            if (json.five_hour.utilization !== undefined) sessionPercentage = this._parseUtilization(json.five_hour.utilization);
            if (json.five_hour.resets_at) sessionResetTime = new Date(json.five_hour.resets_at);
        }

        let weeklyPercentage = 0;
        let weeklyResetTime = nextMonday1259pm();
        if (json.seven_day) {
            if (json.seven_day.utilization !== undefined) weeklyPercentage = this._parseUtilization(json.seven_day.utilization);
            if (json.seven_day.resets_at) weeklyResetTime = new Date(json.seven_day.resets_at);
        }

        let opusPercentage = 0;
        if (json.seven_day_opus && json.seven_day_opus.utilization !== undefined) {
            opusPercentage = this._parseUtilization(json.seven_day_opus.utilization);
        }

        let sonnetPercentage = 0;
        let sonnetResetTime = null;
        if (json.seven_day_sonnet) {
            if (json.seven_day_sonnet.utilization !== undefined) sonnetPercentage = this._parseUtilization(json.seven_day_sonnet.utilization);
            if (json.seven_day_sonnet.resets_at) sonnetResetTime = new Date(json.seven_day_sonnet.resets_at);
        }

        const weeklyTokens = Math.round(WEEKLY_LIMIT * (weeklyPercentage / 100));
        const opusTokens = Math.round(WEEKLY_LIMIT * (opusPercentage / 100));
        const sonnetTokens = Math.round(WEEKLY_LIMIT * (sonnetPercentage / 100));

        return new ClaudeUsage({
            sessionTokensUsed: 0,
            sessionLimit: 0,
            sessionPercentage,
            sessionResetTime,
            weeklyTokensUsed: weeklyTokens,
            weeklyLimit: WEEKLY_LIMIT,
            weeklyPercentage,
            weeklyResetTime,
            opusWeeklyTokensUsed: opusTokens,
            opusWeeklyPercentage: opusPercentage,
            sonnetWeeklyTokensUsed: sonnetTokens,
            sonnetWeeklyPercentage: sonnetPercentage,
            sonnetWeeklyResetTime: sonnetResetTime,
            lastUpdated: new Date()
        });
    }

    _parseUtilization(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const cleaned = value.trim().replace(/%/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }
}

function nextMonday1259pm() {
    const now = new Date();
    const day = now.getDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysUntilMonday);
    monday.setHours(12, 59, 0, 0);
    return monday;
}
