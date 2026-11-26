'use strict';
const express = require('express');
const config = require('./config');
const sessionContext = require('./lib/session-context');
const access = require('./lib/panel-access');
const { ALLOWED_SETTINGS } = require('./developer-api');

const isAllowed = (k) => Object.prototype.hasOwnProperty.call(ALLOWED_SETTINGS, k);

function validValue(k, type, v) {
    if (type === 'array') return Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === 'string' && x.length <= 200);
    if (type === 'number') return Number.isFinite(v) && v >= 0 && v <= 1;
    if (typeof v !== type) return false;
    if (typeof v === 'string' && v.length > 500) return false;
    if (k === 'PREFIX' && (v.length < 1 || v.length > 3)) return false;
    if (k === 'BOT_NAME' && (v.trim().length < 1 || v.length > 40)) return false;
    return true;
}

function createUserApi({ supabase, disconnectSession }) {
    const router = express.Router();
    router.use(express.json({ limit: '64kb' }));

    const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');


    router.post('/login', async (req, res, next) => {
        try {
            if (!access.allowAttempt(req.ip)) return res.status(429).json({ error: 'වැඩි උත්සාහ. විනාඩි 15කට පස්සේ නැවත බලන්න.' });
            const sessionId = await access.sessionForCode(supabase, req.body?.code);
            if (!sessionId) return res.status(401).json({ error: 'Code එක වැරදියි හෝ revoke වෙලා.' });
            const token = await access.issueToken(supabase, sessionId);
            res.json({ token, expires_in: 12 * 60 * 60 });
        } catch (e) { next(e); }
    });

    router.use(async (req, res, next) => {
        try {
            const sessionId = await access.sessionForToken(supabase, bearer(req));
            if (!sessionId) return res.status(401).json({ error: 'Login expired. Code එකෙන් නැවත login වෙන්න.' });
            const { data: s, error } = await supabase.from('bot_sessions')
                .select('session_id, phone_number, status, is_active, updated_at, last_connected_at')
                .eq('session_id', sessionId).maybeSingle();
            if (error) throw error;
            if (!s) return res.status(404).json({ error: 'Bot not found' });
            req.session = s;
            next();
        } catch (e) { next(e); }
    });

    router.post('/logout', async (req, res, next) => {
        try { await access.revokeToken(supabase, bearer(req)); res.json({ ok: true }); } catch (e) { next(e); }
    });

    router.get('/session', (req, res) => res.json({ session: req.session }));

    router.get('/settings', async (req, res, next) => {
        try {
            const { data, error } = await supabase.from('session_settings')
                .select('settings').eq('session_id', req.session.session_id).maybeSingle();
            if (error) throw error;
            const defaults = {};
            for (const k of Object.keys(ALLOWED_SETTINGS)) defaults[k] = config[k];
            res.json({ settings: (data && data.settings) || {}, defaults, allowed: ALLOWED_SETTINGS });
        } catch (e) { next(e); }
    });

    router.put('/settings', async (req, res, next) => {
        try {
            const patch = {};
            for (const [k, v] of Object.entries(req.body || {})) {
                if (!isAllowed(k)) return res.status(400).json({ error: 'Unsupported setting: ' + k });
                if (!validValue(k, ALLOWED_SETTINGS[k], v)) return res.status(400).json({ error: 'Invalid value for ' + k });
                patch[k] = v;
            }
            const sid = req.session.session_id;
            const { data: current } = await supabase.from('session_settings')
                .select('settings').eq('session_id', sid).maybeSingle();
            const settings = { ...((current && current.settings) || {}), ...patch };
            const { error } = await supabase.from('session_settings').upsert({
                session_id: sid, settings, updated_at: new Date().toISOString(),
            });
            if (error) throw error;
            await sessionContext.invalidate(sid);
            res.json({ ok: true, settings });
        } catch (e) { next(e); }
    });

    router.post('/regenerate-code', async (req, res, next) => {
        try {
            const code = await access.issueCode(supabase, req.session.session_id);
            res.json({ code });
        } catch (e) { next(e); }
    });

    router.delete('/session', async (req, res, next) => {
        try {
            const sid = req.session.session_id;
            if (req.body?.confirm !== sid) return res.status(400).json({ error: 'Session id එක හරියටම type කරන්න' });
            await disconnectSession(sid);
            await supabase.from('session_settings').delete().eq('session_id', sid);
            await supabase.from('session_contacts').delete().eq('session_id', sid);
            const { error } = await supabase.from('bot_sessions').delete().eq('session_id', sid);
            if (error) throw error;
            res.json({ ok: true });
        } catch (e) { next(e); }
    });

    router.use((err, req, res, next) => {
        console.error('[USER API]', err && err.message);
        res.status(500).json({ error: 'Something went wrong, please try again' });
    });

    return router;
}

module.exports = createUserApi;
