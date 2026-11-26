'use strict';
const express = require('express');
const { verifyKey } = require('./lib/developer-keys');
const { enqueueBroadcast, HttpError } = require('./lib/broadcasts');
const sessionContext = require('./lib/session-context');
const config = require('./config');

const ALLOWED_SETTINGS = {
    BOT_NAME: 'string', PREFIX: 'string',
    AUTO_ONLINE: 'boolean', AUTO_READ_STATUS: 'boolean', AUTO_REACT: 'boolean',
    AUTO_REACT_CHANCE: 'number', AUTO_TYPING: 'boolean',
    AUTO_WELCOME: 'boolean', AUTO_GOODBYE: 'boolean',
    WELCOME_MESSAGE: 'string', GOODBYE_MESSAGE: 'string',
    COMMANDS_OWNER_ONLY: 'boolean',
    AUTO_FOLLOW_CHANNELS: 'boolean', CHANNELS: 'array',
};

const isAllowed = (k) => Object.prototype.hasOwnProperty.call(ALLOWED_SETTINGS, k);

function validValue(k, type, v) {
    if (type === 'array') return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length <= 200);
    if (type === 'number') return Number.isFinite(v);
    if (typeof v !== type) return false;
    if (typeof v === 'string' && v.length > 500) return false;
    if (k === 'PREFIX' && (v.length < 1 || v.length > 3)) return false;
    return true;
}

function createDeveloperApi({ supabase, disconnectSession }) {
    const router = express.Router();
    router.use(express.json({ limit: '256kb' }));

    router.use(async (req, res, next) => {
        try {
            const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            const auth = await verifyKey(supabase, raw);
            if (!auth) return res.status(401).json({ error: 'Key invalid, expired or revoked' });
            req.developer = auth.developer;
            req.keyId = auth.keyId;
            next();
        } catch (e) { next(e); }
    });

    
    async function developerOwnsSession(developerId, sessionId) {
        const { data, error } = await supabase.from('bot_sessions')
            .select('session_id, phone_number, status, is_active, updated_at')
            .eq('session_id', sessionId).eq('developer_id', developerId).maybeSingle();
        if (error) throw error;
        return data;
    }

    async function requireSession(req, res) {
        const s = await developerOwnsSession(req.developer.id, req.params.id);
        if (!s) { res.status(404).json({ error: 'Not found' }); return null; }
        return s;
    }

    router.get('/sessions', async (req, res, next) => {
        try {
            const { data, error } = await supabase.from('bot_sessions')
                .select('session_id, phone_number, status, is_active, updated_at')
                .eq('developer_id', req.developer.id)
                .order('updated_at', { ascending: false });
            if (error) throw error;
            res.json({ sessions: data });
        } catch (e) { next(e); }
    });

    router.get('/sessions/:id/contacts', async (req, res, next) => {
        try {
            if (!(await requireSession(req, res))) return;
            const { data, error } = await supabase.from('session_contacts')
                .select('whatsapp_jid, display_name, first_seen_at, last_seen_at')
                .eq('session_id', req.params.id)
                .order('last_seen_at', { ascending: false }).limit(500);
            if (error) throw error;
            res.json({ contacts: data });
        } catch (e) { next(e); }
    });

    router.get('/sessions/:id/settings', async (req, res, next) => {
        try {
            if (!(await requireSession(req, res))) return;
            const { data, error } = await supabase.from('session_settings')
                .select('settings').eq('session_id', req.params.id).maybeSingle();
            if (error) throw error;
            const defaults = {};
            for (const k of Object.keys(ALLOWED_SETTINGS)) defaults[k] = config[k];
            res.json({ settings: (data && data.settings) || {}, defaults, allowed: ALLOWED_SETTINGS });
        } catch (e) { next(e); }
    });

    router.put('/sessions/:id/settings', async (req, res, next) => {
        try {
            const s = await requireSession(req, res);
            if (!s) return;
            const patch = {};
            for (const [k, v] of Object.entries(req.body || {})) {
                if (!isAllowed(k)) return res.status(400).json({ error: 'Unsupported setting: ' + k });
                if (!validValue(k, ALLOWED_SETTINGS[k], v)) return res.status(400).json({ error: 'Invalid value for ' + k });
                patch[k] = v;
            }
            const { data: current } = await supabase.from('session_settings')
                .select('settings').eq('session_id', s.session_id).maybeSingle();
            const settings = { ...((current && current.settings) || {}), ...patch };
            const { error } = await supabase.from('session_settings').upsert({
                session_id: s.session_id, settings, updated_at: new Date().toISOString(),
            });
            if (error) throw error;
            await sessionContext.invalidate(s.session_id);
            res.json({ ok: true, settings });
        } catch (e) { next(e); }
    });

    router.get('/sessions/:id/broadcasts', async (req, res, next) => {
        try {
            if (!(await requireSession(req, res))) return;
            const { data, error } = await supabase.from('broadcasts')
                .select('id, message, status, total, sent, failed, created_at, finished_at')
                .eq('session_id', req.params.id).order('created_at', { ascending: false }).limit(20);
            if (error) throw error;
            res.json({ broadcasts: data });
        } catch (e) { next(e); }
    });

    router.post('/sessions/:id/broadcasts', async (req, res, next) => {
        try {
            if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirmation required' });
            const s = await requireSession(req, res);
            if (!s) return;
            const job = await enqueueBroadcast({
                supabase, sessionId: s.session_id, message: req.body.message,
                createdBy: null, metadata: { developer_id: req.developer.id },
            });
            res.status(201).json({ broadcast: job });
        } catch (e) { next(e); }
    });

    router.post('/broadcasts/:jobId/cancel', async (req, res, next) => {
        try {
            const { data: job, error: jErr } = await supabase.from('broadcasts')
                .select('id, session_id').eq('id', req.params.jobId).maybeSingle();
            if (jErr) throw jErr;
            if (!job || !(await developerOwnsSession(req.developer.id, job.session_id))) {
                return res.status(404).json({ error: 'Not found' });
            }
            const { data, error } = await supabase.from('broadcasts')
                .update({ status: 'cancelled', finished_at: new Date().toISOString() })
                .eq('id', job.id).in('status', ['queued', 'running']).select('id, status').maybeSingle();
            if (error) throw error;
            if (!data) return res.status(409).json({ error: 'Already finished' });
            res.json({ broadcast: data });
        } catch (e) { next(e); }
    });

    router.post('/sessions/:id/deactivate', async (req, res, next) => {
        try {
            const s = await requireSession(req, res);
            if (!s) return;
            const { error } = await supabase.from('bot_sessions')
                .update({ is_active: false, status: 'disconnected', updated_at: new Date().toISOString() })
                .eq('session_id', s.session_id);
            if (error) throw error;
            await disconnectSession(s.session_id);
            res.json({ ok: true });
        } catch (e) { next(e); }
    });

    router.post('/keys/revoke-current', async (req, res, next) => {
        try {
            const { error } = await supabase.from('developer_keys')
                .update({ revoked_at: new Date().toISOString() }).eq('id', req.keyId);
            if (error) throw error;
            res.json({ ok: true });
        } catch (e) { next(e); }
    });

    router.use((err, req, res, next) => {
        if (err && err.status) return res.status(err.status).json({ error: err.message });
        console.error('[DEV API]', err && err.message);
        res.status(500).json({ error: 'Internal server error' });
    });

    return router;
}

module.exports = createDeveloperApi;
module.exports.ALLOWED_SETTINGS = ALLOWED_SETTINGS;
