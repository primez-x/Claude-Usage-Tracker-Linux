// Data models ported from Swift structs

export class ClaudeUsage {
    constructor(data = {}) {
        this.sessionTokensUsed = data.sessionTokensUsed ?? 0;
        this.sessionLimit = data.sessionLimit ?? 0;
        this.sessionPercentage = data.sessionPercentage ?? 0;
        this.sessionResetTime = data.sessionResetTime ? new Date(data.sessionResetTime) : new Date(Date.now() + 5 * 60 * 60 * 1000);

        this.weeklyTokensUsed = data.weeklyTokensUsed ?? 0;
        this.weeklyLimit = data.weeklyLimit ?? 1000000;
        this.weeklyPercentage = data.weeklyPercentage ?? 0;
        this.weeklyResetTime = data.weeklyResetTime ? new Date(data.weeklyResetTime) : nextMonday1259pm();

        this.opusWeeklyTokensUsed = data.opusWeeklyTokensUsed ?? 0;
        this.opusWeeklyPercentage = data.opusWeeklyPercentage ?? 0;

        this.sonnetWeeklyTokensUsed = data.sonnetWeeklyTokensUsed ?? 0;
        this.sonnetWeeklyPercentage = data.sonnetWeeklyPercentage ?? 0;
        this.sonnetWeeklyResetTime = data.sonnetWeeklyResetTime ? new Date(data.sonnetWeeklyResetTime) : null;

        this.costUsed = data.costUsed ?? null;
        this.costLimit = data.costLimit ?? null;
        this.costCurrency = data.costCurrency ?? null;

        this.overageBalance = data.overageBalance ?? null;
        this.overageBalanceCurrency = data.overageBalanceCurrency ?? null;

        this.lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : new Date();
    }

    get effectiveSessionPercentage() {
        return this.sessionResetTime < new Date() ? 0.0 : this.sessionPercentage;
    }

    get remainingPercentage() {
        return Math.max(0, 100 - this.effectiveSessionPercentage);
    }

    toJSON() {
        return {
            sessionTokensUsed: this.sessionTokensUsed,
            sessionLimit: this.sessionLimit,
            sessionPercentage: this.sessionPercentage,
            sessionResetTime: this.sessionResetTime.toISOString(),
            weeklyTokensUsed: this.weeklyTokensUsed,
            weeklyLimit: this.weeklyLimit,
            weeklyPercentage: this.weeklyPercentage,
            weeklyResetTime: this.weeklyResetTime.toISOString(),
            opusWeeklyTokensUsed: this.opusWeeklyTokensUsed,
            opusWeeklyPercentage: this.opusWeeklyPercentage,
            sonnetWeeklyTokensUsed: this.sonnetWeeklyTokensUsed,
            sonnetWeeklyPercentage: this.sonnetWeeklyPercentage,
            sonnetWeeklyResetTime: this.sonnetWeeklyResetTime?.toISOString() ?? null,
            costUsed: this.costUsed,
            costLimit: this.costLimit,
            costCurrency: this.costCurrency,
            overageBalance: this.overageBalance,
            overageBalanceCurrency: this.overageBalanceCurrency,
            lastUpdated: this.lastUpdated.toISOString()
        };
    }

    static empty() {
        return new ClaudeUsage({});
    }
}

export class APIUsage {
    constructor(data = {}) {
        this.currentSpendCents = data.currentSpendCents ?? 0;
        this.resetsAt = data.resetsAt ? new Date(data.resetsAt) : nextMonday1259pm();
        this.prepaidCreditsCents = data.prepaidCreditsCents ?? 0;
        this.currency = data.currency ?? 'USD';
        this.apiTokenCostCents = data.apiTokenCostCents ?? null;
        this.apiCostByModel = data.apiCostByModel ?? null;
        this.costBySource = data.costBySource ?? null;
        this.dailyCostCents = data.dailyCostCents ?? null;
    }

    get usedAmount() { return this.currentSpendCents / 100.0; }
    get remainingAmount() { return this.prepaidCreditsCents / 100.0; }
    get totalCredits() { return this.usedAmount + this.remainingAmount; }

    get usagePercentage() {
        return this.totalCredits > 0 ? (this.usedAmount / this.totalCredits) * 100.0 : 0;
    }

    formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: this.currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        } catch {
            return `${this.currency} ${amount.toFixed(2)}`;
        }
    }

    get formattedUsed() { return this.formatCurrency(this.usedAmount); }
    get formattedRemaining() { return this.formatCurrency(this.remainingAmount); }
    get formattedTotal() { return this.formatCurrency(this.totalCredits); }

    get formattedAPICost() {
        if (this.apiTokenCostCents && this.apiTokenCostCents > 0) {
            return this.formatCurrency(this.apiTokenCostCents / 100.0);
        }
        return null;
    }

    get sortedModelCosts() {
        if (!this.apiCostByModel) return [];
        return Object.entries(this.apiCostByModel)
            .sort((a, b) => b[1] - a[1])
            .map(([model, cost]) => ({ model, cost: this.formatCurrency(cost / 100.0) }));
    }

    get sortedDailyCosts() {
        if (!this.dailyCostCents) return [];
        return Object.entries(this.dailyCostCents)
            .map(([dateStr, cents]) => ({ date: new Date(dateStr + 'T00:00:00'), cents }))
            .sort((a, b) => a.date - b.date);
    }

    toJSON() {
        return {
            currentSpendCents: this.currentSpendCents,
            resetsAt: this.resetsAt.toISOString(),
            prepaidCreditsCents: this.prepaidCreditsCents,
            currency: this.currency,
            apiTokenCostCents: this.apiTokenCostCents,
            apiCostByModel: this.apiCostByModel,
            costBySource: this.costBySource,
            dailyCostCents: this.dailyCostCents
        };
    }
}

export class Profile {
    constructor(data = {}) {
        this.id = data.id ?? generateUUID();
        this.name = data.name ?? 'Default';

        this.claudeSessionKey = data.claudeSessionKey ?? null;
        this.organizationId = data.organizationId ?? null;
        this.apiSessionKey = data.apiSessionKey ?? null;
        this.apiOrganizationId = data.apiOrganizationId ?? null;
        this.apiSessionKeyExpiry = data.apiSessionKeyExpiry ? new Date(data.apiSessionKeyExpiry) : null;
        this.cliCredentialsJSON = data.cliCredentialsJSON ?? null;

        this.hasCliAccount = data.hasCliAccount ?? false;
        this.cliAccountSyncedAt = data.cliAccountSyncedAt ? new Date(data.cliAccountSyncedAt) : null;
        this.oauthAccountJSON = data.oauthAccountJSON ?? null;

        this.claudeUsage = data.claudeUsage ? new ClaudeUsage(data.claudeUsage) : null;
        this.apiUsage = data.apiUsage ? new APIUsage(data.apiUsage) : null;

        this.iconConfig = data.iconConfig ?? {
            colorMode: 'multiColor',
            singleColorHex: '#00BFFF',
            showIconNames: true,
            showRemainingPercentage: false,
            showTimeMarker: true,
            showPaceMarker: true,
            usePaceColoring: true,
            metrics: [
                { metricType: 'session', isEnabled: true, iconStyle: 'battery', order: 0, showNextSessionTime: false },
                { metricType: 'week', isEnabled: false, iconStyle: 'battery', order: 1, weekDisplayMode: 'percentage' },
                { metricType: 'api', isEnabled: false, iconStyle: 'battery', order: 2, apiDisplayMode: 'remaining' }
            ]
        };

        this.refreshInterval = data.refreshInterval ?? 60;
        this.autoStartSessionEnabled = data.autoStartSessionEnabled ?? false;
        this.checkOverageLimitEnabled = data.checkOverageLimitEnabled ?? true;

        this.notificationSettings = data.notificationSettings ?? {
            enabled: true,
            thresholds: [75, 90, 95],
            notifyOnAutoSwitch: true
        };

        this.isSelectedForDisplay = data.isSelectedForDisplay ?? true;
        this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
        this.lastUsedAt = data.lastUsedAt ? new Date(data.lastUsedAt) : new Date();
    }

    get hasClaudeAI() {
        return !!this.claudeSessionKey && !!this.organizationId;
    }

    get hasAPIConsole() {
        return !!this.apiSessionKey && !!this.apiOrganizationId;
    }

    get hasUsageCredentials() {
        return this.hasClaudeAI || this.hasAPIConsole || this.hasValidCLIOAuth;
    }

    get hasValidCLIOAuth() {
        if (!this.cliCredentialsJSON) return false;
        try {
            const creds = JSON.parse(this.cliCredentialsJSON);
            if (!creds.expires_at) return false;
            return new Date(creds.expires_at) > new Date();
        } catch {
            return false;
        }
    }

    get hasAnyCredentials() {
        return this.hasClaudeAI || this.hasAPIConsole || !!this.cliCredentialsJSON;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            organizationId: this.organizationId,
            apiOrganizationId: this.apiOrganizationId,
            apiSessionKeyExpiry: this.apiSessionKeyExpiry?.toISOString() ?? null,
            hasCliAccount: this.hasCliAccount,
            cliAccountSyncedAt: this.cliAccountSyncedAt?.toISOString() ?? null,
            oauthAccountJSON: this.oauthAccountJSON,
            claudeUsage: this.claudeUsage?.toJSON() ?? null,
            apiUsage: this.apiUsage?.toJSON() ?? null,
            iconConfig: this.iconConfig,
            refreshInterval: this.refreshInterval,
            autoStartSessionEnabled: this.autoStartSessionEnabled,
            checkOverageLimitEnabled: this.checkOverageLimitEnabled,
            notificationSettings: this.notificationSettings,
            isSelectedForDisplay: this.isSelectedForDisplay,
            createdAt: this.createdAt.toISOString(),
            lastUsedAt: this.lastUsedAt.toISOString()
        };
    }
}

export class AccountInfo {
    constructor(data) {
        this.uuid = data.uuid ?? '';
        this.name = data.name ?? '';
        this.email = data.email ?? '';
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
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
