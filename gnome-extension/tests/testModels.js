#!/usr/bin/env -S gjs -m

import { ClaudeUsage, APIUsage, Profile } from '../lib/models.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; } else { failed++; print(`FAIL: ${message}`); }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) { passed++; } else { failed++; print(`FAIL: ${message} - expected ${expected}, got ${actual}`); }
}

print('=== ClaudeUsage ===');
const usage = new ClaudeUsage({ sessionPercentage: 60, weeklyPercentage: 40 });
assertEqual(usage.effectiveSessionPercentage, 60, 'effective session percentage');
assertEqual(usage.remainingPercentage, 40, 'remaining percentage');
assertEqual(usage.weeklyLimit, 1000000, 'default weekly limit');

// Expired session
const expired = new ClaudeUsage({ sessionPercentage: 50, sessionResetTime: new Date(Date.now() - 1000) });
assertEqual(expired.effectiveSessionPercentage, 0, 'expired session resets to 0');

print('=== APIUsage ===');
const api = new APIUsage({ currentSpendCents: 5000, prepaidCreditsCents: 15000, currency: 'USD' });
assertEqual(api.usedAmount, 50.0, 'used amount');
assertEqual(api.remainingAmount, 150.0, 'remaining amount');
assertEqual(api.totalCredits, 200.0, 'total credits');
assertEqual(api.usagePercentage, 25.0, 'usage percentage');
assert(api.formattedUsed.includes('$50.00'), 'formatted used');

print('=== Profile ===');
const profile = new Profile({ name: 'Test' });
assert(profile.id, 'profile has id');
assertEqual(profile.name, 'Test', 'profile name');
assertEqual(profile.hasUsageCredentials, false, 'no credentials initially');
assertEqual(profile.isSelectedForDisplay, true, 'selected by default');

profile.claudeSessionKey = 'sk-ant-sid01-test-key-1234567890';
profile.organizationId = 'org-123';
assertEqual(profile.hasClaudeAI, true, 'has Claude.ai credentials');
assertEqual(profile.hasUsageCredentials, true, 'has usage credentials');

// Summary
print('');
print(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    imports.system.exit(1);
}
