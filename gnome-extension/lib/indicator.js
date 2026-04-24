// Panel indicator with icon rendering

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { UsageStatusCalculator } from './utils.js';

export const ClaudeIndicator = GObject.registerClass(
    class ClaudeIndicator extends PanelMenu.Button {
        _init(extension) {
            super._init(0.5, 'Claude Usage Tracker');
            this._extension = extension;
            this._settings = extension.settings;
            this._profileManager = extension.profileManager;

            this._box = new St.BoxLayout({ style_class: 'claude-panel-label', y_align: Clutter.ActorAlign.CENTER });
            this.add_child(this._box);

            this._icon = new St.Icon({ style_class: 'system-status-icon', icon_name: 'user-available-symbolic' });
            this._label = new St.Label({ text: '—', y_align: Clutter.ActorAlign.CENTER });

            this._box.add_child(this._icon);
            this._box.add_child(this._label);

            this._updateIcon();
        }

        update() {
            this._updateIcon();
        }

        _updateIcon() {
            const profile = this._profileManager.activeProfile;
            if (!profile || !profile.claudeUsage) {
                this._label.text = '—';
                this._icon.icon_name = 'user-offline-symbolic';
                return;
            }

            const usage = profile.claudeUsage;
            const showRemaining = this._settings.showRemainingPercentage;
            const pct = UsageStatusCalculator.getDisplayPercentage(usage.effectiveSessionPercentage, showRemaining);
            const status = UsageStatusCalculator.calculateStatus(usage.effectiveSessionPercentage, showRemaining);

            const style = this._settings.iconStyle;
            const colorMode = this._settings.colorMode;
            const showPct = this._settings.showPercentage;

            // Color
            let color = null;
            if (colorMode === 'multiColor') {
                color = this._statusColor(status);
            } else if (colorMode === 'singleColor') {
                color = this._settings.singleColorHex;
            }

            // Icon style
            switch (style) {
                case 'percentage':
                    this._icon.visible = false;
                    this._label.visible = true;
                    this._label.text = `${Math.round(pct)}%`;
                    break;
                case 'compact':
                    this._icon.visible = true;
                    this._label.visible = showPct;
                    this._icon.icon_name = this._compactIcon(status);
                    if (showPct) this._label.text = `${Math.round(pct)}%`;
                    break;
                case 'bar':
                    this._icon.visible = true;
                    this._label.visible = showPct;
                    this._icon.icon_name = 'view-list-symbolic';
                    if (showPct) this._label.text = `${Math.round(pct)}%`;
                    break;
                case 'battery':
                default:
                    this._icon.visible = true;
                    this._label.visible = showPct;
                    this._icon.icon_name = this._batteryIcon(pct);
                    if (showPct) this._label.text = `${Math.round(pct)}%`;
                    break;
            }

            // Apply color
            if (color) {
                this._icon.style = `color: ${color};`;
                this._label.style = `color: ${color};`;
            } else {
                this._icon.style = '';
                this._label.style = '';
            }
        }

        _statusColor(status) {
            switch (status) {
                case 'safe': return '#2ec27e';
                case 'moderate': return '#ff7800';
                case 'critical': return '#e01b24';
                default: return null;
            }
        }

        _batteryIcon(pct) {
            if (pct <= 10) return 'battery-empty-symbolic';
            if (pct <= 30) return 'battery-caution-symbolic';
            if (pct <= 60) return 'battery-low-symbolic';
            if (pct <= 80) return 'battery-good-symbolic';
            return 'battery-full-symbolic';
        }

        _compactIcon(status) {
            switch (status) {
                case 'safe': return 'emoji-natural-symbolic';
                case 'moderate': return 'dialog-warning-symbolic';
                case 'critical': return 'dialog-error-symbolic';
                default: return 'user-available-symbolic';
            }
        }

        destroy() {
            super.destroy();
        }
    }
);
