'use strict';

const crypto = require('crypto');

const SECRET = process.env.PANEL_SECRET;
if (!SECRET || SECRET.length < 32) {
    console.warn('[PANEL] PANEL_SECRET (32+ chars) is not set. Panel login is disabled until it is.');
}

// 0/O/1/I වගේ confusing අකුරු නැති alphabet එක. 16 අකුරු = ~80 bits. Guess කරන්න බැහැ.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const hmac = (value) => crypto.createHmac('sha256', SECRET || 'unset').update(value).digest('hex');

function generateCode() {
    const bytes = crypto.randomBytes(16);
    let raw = '';
    for (const b of bytes) raw += ALPHABET[b % ALPHABET.length];
    return 'NEXA-' + raw.match(/.{4}/g).join('-');
}

const normalize = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function issueCode(supabase, sessionId) {
    if (!SECRET) throw new Error('PANEL_SECRET not configured');
    await supabase.from('panel_access_codes')
        .update({ revoked_at: new Date().toISOString() })
        .eq('session_id', sessionId).is('revoked_at', null);
    const code = generateCode();
    const { error } = await supabase.from('panel_access_codes').insert({
        session_id: sessionId, code_hash: hmac(normalize(code)),
    });
    if (error) throw error;
    return code; 
}


async function sessionForCode(supabase, rawCode) {
    const norm = normalize(rawCode);
    if (norm.length !== 16) return null;
    const { data, error } = await supabase.from('panel_access_codes')
        .select('id, session_id').eq('code_hash', hmac(norm)).is('revoked_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    supabase.from('panel_access_codes').update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id).then(() => {}, () => {});
    return data.session_id;
}

async function issueToken(supabase, sessionId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const { error } = await supabase.from('panel_tokens').insert({
        session_id: sessionId,
        token_hash: hmac(token),
        expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    });
    if (error) throw error;
    return token;
}

async function sessionForToken(supabase, token) {
    if (!token || !SECRET) return null;
    const { data, error } = await supabase.from('panel_tokens')
        .select('session_id, expires_at').eq('token_hash', hmac(token)).maybeSingle();
    if (error) throw error;
    if (!data || new Date(data.expires_at) <= new Date()) return null;
    return data.session_id;
}

async function revokeToken(supabase, token) {
    if (!token) return;
    await supabase.from('panel_tokens').delete().eq('token_hash', hmac(token));
}


const attempts = new Map();
function allowAttempt(ip) {
    const now = Date.now();
    const rec = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 15 * 60 * 1000; }
    rec.count += 1;
    attempts.set(ip, rec);
    return rec.count <= 8;
}

module.exports = { issueCode, sessionForCode, issueToken, sessionForToken, revokeToken, allowAttempt, generateCode };
