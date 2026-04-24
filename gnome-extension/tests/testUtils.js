#!/usr/bin/env -S gjs -m

import { UsageStatusCalculator, PaceStatus, SessionKeyValidator, URLBuilder } from '../lib/utils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        print(`FAIL: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        print(`FAIL: ${message} - expected ${expected}, got ${actual}`);
    }
}

// UsageStatusCalculator tests
print('=== UsageStatusCalculator ===');

// Used mode (default)
assertEqual(UsageStatusCalculator.calculateStatus(30, false), 'safe', '30% used = safe');
assertEqual(UsageStatusCalculator.calculateStatus(50, false), 'moderate', '50% used = moderate');
assertEqual(UsageStatusCalculator.calculateStatus(79, false), 'moderate', '79% used = moderate');
assertEqual(UsageStatusCalculator.calculateStatus(80, false), 'critical', '80% used = critical');
assertEqual(UsageStatusCalculator.calculateStatus(100, false), 'critical', '100% used = critical');

// Remaining mode
assertEqual(UsageStatusCalculator.calculateStatus(70, true), 'safe', '30% remaining = safe');
assertEqual(UsageStatusCalculator.calculateStatus(85, true), 'moderate', '15% remaining = moderate');
assertEqual(UsageStatusCalculator.calculateStatus(95, true), 'critical', '5% remaining = critical');

// Display percentage
assertEqual(UsageStatusCalculator.getDisplayPercentage(60, false), 60, 'display 60 used');
assertEqual(UsageStatusCalculator.getDisplayPercentage(60, true), 40, 'display 40 remaining');

// PaceStatus tests
print('=== PaceStatus ===');
assertEqual(PaceStatus.calculate(20, 0.5), PaceStatus.COMFORTABLE, '20% at 50% time = comfortable');
assertEqual(PaceStatus.calculate(35, 0.5), PaceStatus.ON_TRACK, '35% at 50% time = onTrack');
assertEqual(PaceStatus.calculate(40, 0.5), PaceStatus.WARMING, '40% at 50% time = warming');
assertEqual(PaceStatus.calculate(47, 0.5), PaceStatus.PRESSING, '47% at 50% time = pressing');
assertEqual(PaceStatus.calculate(55, 0.5), PaceStatus.CRITICAL, '55% at 50% time = critical');
assertEqual(PaceStatus.calculate(65, 0.5), PaceStatus.RUNAWAY, '65% at 50% time = runaway');
assertEqual(PaceStatus.calculate(50, 0.01), null, 'insufficient elapsed = null');

// SessionKeyValidator tests
print('=== SessionKeyValidator ===');
const validator = new SessionKeyValidator();

assert(validator.isValid('sk-ant-sid01-abcdefghijklmnopqrstuvwxyz-1234567890'), 'valid key');
assert(!validator.isValid(''), 'empty key');
assert(!validator.isValid('sk-ant-'), 'too short');
assert(!validator.isValid('invalid-prefix-abcdefghijklmnopqrstuvwxyz-1234567890'), 'wrong prefix');
assert(!validator.isValid('sk-ant-sid01-abc def'), 'contains whitespace');
assert(!validator.isValid('sk-ant-sid01-abc..def'), 'contains traversal');
assert(!validator.isValid('sk-ant-sid01-abc<script'), 'script injection');
assert(!validator.isValid('sk-ant-sid01-abc!@#'), 'invalid chars');

// URLBuilder tests
print('=== URLBuilder ===');
const url1 = new URLBuilder('https://claude.ai/api').appendingPath('organizations').build();
assertEqual(url1, 'https://claude.ai/api/organizations', 'basic path append');

const url2 = URLBuilder.claudeAPI('organizations').build();
assertEqual(url2, 'https://claude.ai/api/organizations', 'convenience builder');

let threw = false;
try {
    new URLBuilder('https://claude.ai/api').appendingPath('foo/../bar');
} catch {
    threw = true;
}
assert(threw, 'path traversal rejected');

// Summary
print('');
print(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    imports.system.exit(1);
}
