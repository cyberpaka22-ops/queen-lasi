'use strict';
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const cache = new Map();     
const inactive = new Set();  
const TTL_MS = 30000;
let db = null;

function init(supabase) { db = supabase; }

async function loadOverrides(sessionId) {
    if (!db) return {};
    const { data, error } = await db.from('session_settings')
        .select('settings').eq('session_id', sessionId).maybeSingle();
    if (error) {
        console.error('[SETTINGS]', sessionId, error.message);
        return cache.get(sessionId)?.overrides || {};
    }
    const overrides = (data && data.settings && typeof data.settings === 'object') ? data.settings : {};
    cache.set(sessionId, { at: Date.now(), overrides });
    return overrides;
}


function overridesFor(sessionId) {
    const hit = cache.get(sessionId);
    if (!hit || Date.now() - hit.at > TTL_MS) loadOverrides(sessionId).catch(() => {});
    return hit ? hit.overrides : {};
}

function invalidate(sessionId) {
    cache.delete(sessionId);
    return loadOverrides(sessionId).catch(() => {});
}

function wrapEvents(ev, sessionId) {
    const origOn = ev.on.bind(ev);
    ev.on = (event, listener) => origOn(event, (...args) =>
        als.run(overridesFor(sessionId), () => listener(...args)));
    return ev;
}

function runWithSettings(overrides, fn) { return als.run(overrides, fn); }
function currentOverrides() { return als.getStore() || null; }

async function effectiveSettings(sessionId) {
    const config = require('../config');
    const overrides = await loadOverrides(sessionId);
    return { ...config, ...overrides };
}

function markInactive(sessionId) { inactive.add(sessionId); }
function isInactive(sessionId) { return inactive.has(sessionId); }

async function loadInactiveSessions() {
    if (!db) return;
    const { data, error } = await db.from('bot_sessions').select('session_id').eq('is_active', false);
    if (error) { console.error('[SESSIONS]', error.message); return; }
    for (const row of data || []) inactive.add(row.session_id);
}

async function autoFollowChannels(sock, sessionId) {
    const eff = await effectiveSettings(sessionId);
    if (!eff.AUTO_FOLLOW_CHANNELS || typeof sock.newsletterFollow !== 'function') return;
    for (const jid of eff.CHANNELS || []) {
        if (!String(jid).endsWith('@newsletter')) continue;
        try { await sock.newsletterFollow(jid); }
        catch (e) { console.error('[CHANNEL FOLLOW]', sessionId, jid, e.message); }
    }
}

module.exports = {
    init, warm: loadOverrides, invalidate, wrapEvents,
    runWithSettings, currentOverrides, effectiveSettings,
    markInactive, isInactive, loadInactiveSessions, autoFollowChannels,
};
