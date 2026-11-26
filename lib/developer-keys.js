'use strict';
const crypto = require('crypto');

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

// raw key එක එක පාරයි පෙන්වන්නේ. DB එකේ තියෙන්නේ hash එක විතරයි.
function generateKey() {
    const key = 'nxd_' + crypto.randomBytes(32).toString('base64url');
    return { key, prefix: key.slice(0, 12), hash: hashKey(key) };
}

async function verifyKey(supabase, rawKey) {
    if (!rawKey || !rawKey.startsWith('nxd_')) return null;
    const { data } = await supabase.from('developer_keys')
        .select('id, expires_at, revoked_at, developers(id, name, is_active)')
        .eq('key_hash', hashKey(rawKey))
        .maybeSingle();
    if (!data || data.revoked_at) return null;
    if (new Date(data.expires_at) <= new Date()) return null;
    if (!data.developers || !data.developers.is_active) return null;

    supabase.from('developer_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id)
        .then(() => {}, () => {});

    return { keyId: data.id, developer: data.developers };
}

module.exports = { generateKey, verifyKey, hashKey };
