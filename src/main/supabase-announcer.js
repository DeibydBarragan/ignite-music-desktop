'use strict';

/**
 * Supabase Announcer
 * Publishes the bot's public API URL (trycloudflare.com or custom)
 * to Supabase bot_status table so web dashboards discover it dynamically.
 */
class SupabaseAnnouncer {
    constructor() {
        this.timer = null;
        this.lastUrl = null;
        this.config = null;
    }

    setConfig(config) {
        this.config = config;
    }

    async announce(url, customConfig) {
        const cfg = customConfig || this.config;
        if (!cfg?.supabaseUrl || !cfg?.supabaseKey) return false;

        const targetUrl = url !== undefined ? url : this.lastUrl;
        this.lastUrl = targetUrl;

        try {
            const endpoint = `${cfg.supabaseUrl.replace(/\/+$/, '')}/rest/v1/bot_status`;
            const payload = {
                id: 'music',
                api_url: targetUrl || '',
                updated_at: targetUrl ? new Date().toISOString() : new Date(0).toISOString(),
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    apikey: cfg.supabaseKey,
                    Authorization: `Bearer ${cfg.supabaseKey}`,
                    'Content-Type': 'application/json',
                    Prefer: 'resolution=merge-duplicates',
                },
                body: JSON.stringify(payload),
            });

            return res.ok;
        } catch {
            return false;
        }
    }

    startHeartbeat(getUrlFn, intervalMs = 45_000) {
        this.stopHeartbeat();
        const tick = async () => {
            const url = typeof getUrlFn === 'function' ? getUrlFn() : this.lastUrl;
            if (url) {
                await this.announce(url);
            }
        };
        this.timer = setInterval(tick, intervalMs);
        this.timer.unref?.();
    }

    stopHeartbeat() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async clear() {
        this.stopHeartbeat();
        await this.announce('');
        this.lastUrl = null;
    }
}

module.exports = { SupabaseAnnouncer };
