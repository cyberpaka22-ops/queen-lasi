// Nexa Mini Bot Base
// Developer Dinujaya ( Dinux )
// number 94740026280
// Number 94770690281
// Oyatama Kiyala Private Base ekak kamathi Vidiyata hadaganna uda thiyena number walata katha karanna 



require('dotenv').config();

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const axios = require('axios');
const config = require('./config');
const { loadConfig } = require('./lib/config-store');
const sessionContext = require('./lib/session-context');
const { createBroadcastWorker } = require('./lib/broadcasts');
const createDeveloperApi = require('./developer-api');
const { createClient } = require('@supabase/supabase-js');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    getContentType,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    generateWAMessageFromContent,
    generateForwardMessageContent
} = require('@whiskeysockets/baileys');

const {
    getBuffer,
    getGroupAdmins
} = require('./lib/functions');

const { sms } = require('./lib/msg');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_BASE_PATH = path.join(__dirname, 'sessions');
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
const LOCAL_SESSIONS_FILE = path.join(LOCAL_DATA_DIR, 'sessions.json');
const msgRetryCounterCache = new NodeCache();

require('events').EventEmitter.defaultMaxListeners = 500;


const OWNER_NUMBERS = [
    '94740026280',
    ...(process.env.OWNER_NUMBERS || process.env.NEXA_OWNER_NUMBERS || '')
        .split(',')
        .map(number => number.replace(/\D/g, ''))
        .filter(Boolean)
];

function normalizeNumber(number = '') {
    return String(number).replace(/\D/g, '');
}

function isOwnerNumber(number = '') {
    return OWNER_NUMBERS.includes(normalizeNumber(number));
}


const SUPABASE_URL = process.env.SUPABASE_URL || 'Oyage SupabaseUrl';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'Oyge Supabase Publish url';

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        },
        global: {
            headers: { 'X-Client-Info': 'nexa-mini-session-store' }
        }
    })
    : null;

async function readLocalSessions() {
    await fs.ensureDir(LOCAL_DATA_DIR);

    try {
        return await fs.readJson(LOCAL_SESSIONS_FILE);
    } catch (error) {
        if (error.code === 'ENOENT' || error.name === 'SyntaxError') return {};
        throw error;
    }
}

async function writeLocalSessions(sessions) {
    await fs.ensureDir(LOCAL_DATA_DIR);

    const tempFile = LOCAL_SESSIONS_FILE + '.tmp';
    await fs.writeJson(tempFile, sessions, { spaces: 2 });
    await fs.move(tempFile, LOCAL_SESSIONS_FILE, { overwrite: true });
}

async function getSession(sessionId) {
    if (!supabase) {
        const allSessions = await readLocalSessions();
        return allSessions[sessionId]
            ? { session_id: sessionId, data: allSessions[sessionId] }
            : null;
    }

    const { data, error } = await supabase
        .from('bot_sessions')
        .select('session_id, data')
        .eq('session_id', sessionId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function getAllSessions() {
    if (!supabase) {
        const allSessions = await readLocalSessions();
        return Object.keys(allSessions).map(session_id => ({
            session_id,
            status: 'unknown'
        }));
    }

    const { data, error } = await supabase
        .from('bot_sessions')
        .select('session_id,status,updated_at')
        .order('updated_at', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function updateSessionStatus(sessionId, status, extra = {}) {
    if (!supabase) return;

    const payload = {
        status,
        last_seen_at: new Date().toISOString(),
        ...extra
    };

    const { error } = await supabase
        .from('bot_sessions')
        .update(payload)
        .eq('session_id', sessionId);

    if (error) throw error;
}

async function pruneDeadSessions() {
    if (!supabase) return;

    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

    const { error } = await supabase
        .from('bot_sessions')
        .delete()
        .in('status', ['logged_out', 'error'])
        .lt('updated_at', cutoff);

    if (error) throw error;
}

async function upsertSession(sessionId, data) {
    if (!supabase) {
        const allSessions = await readLocalSessions();
        allSessions[sessionId] = data;
        return writeLocalSessions(allSessions);
    }

    const { error } = await supabase
        .from('bot_sessions')
        .upsert({
            session_id: sessionId,
            data,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'session_id'
        });

    if (error) throw error;
}

async function deleteSession(sessionId) {
    if (!supabase) {
        const allSessions = await readLocalSessions();
        delete allSessions[sessionId];
        return writeLocalSessions(allSessions);
    }

    const { error } = await supabase
        .from('bot_sessions')
        .delete()
        .eq('session_id', sessionId);

    if (error) throw error;
}

if (supabase) {
    supabase.from('bot_sessions').select('session_id').limit(1)
        .then(({ error }) => {
            if (error) console.error('Supabase check:', error.message);
            else console.log('Supabase connected');
        })
        .catch(error => console.error('Supabase check:', error.message));
} else {
    console.log('ℹ️ Supabase not configured; using local session storage.');
}


function loadPlugins(directory = path.join(__dirname, 'plugins')) {
    if (!fs.existsSync(directory)) return;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            loadPlugins(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                require(fullPath);
                console.log(`✅ Nexa plugin loaded: ${path.relative(__dirname, fullPath)}`);
            } catch (error) {
                console.error(
                    `⚠️ Nexa plugin skipped: ${path.relative(__dirname, fullPath)} — ${error.message}`
                );
            }
        }
    }
}

loadPlugins();
console.log('𝐀ʟʟ 𝐏ʟᴜɢɪɴꜱ 𝐈ɴꜱᴛᴀʟʟᴇᴅ ⚡');

const events = require('./command');
const commandMap = new Map();

for (const cmd of (events.commands || [])) {
    if (cmd.pattern) commandMap.set(String(cmd.pattern).toLowerCase(), cmd);

    if (Array.isArray(cmd.alias)) {
        for (const alias of cmd.alias) {
            if (alias && !commandMap.has(String(alias).toLowerCase())) {
                commandMap.set(String(alias).toLowerCase(), cmd);
            }
        }
    } else if (typeof cmd.alias === 'string' && cmd.alias.trim()) {
        for (const alias of cmd.alias.split('|').map(item => item.trim()).filter(Boolean)) {
            if (!commandMap.has(alias.toLowerCase())) commandMap.set(alias.toLowerCase(), cmd);
        }
    }
}


const bodyTextPlugins = (events.commands || []).filter(item =>
    item.on === 'body' || item.on === 'text'
);
const imagePlugins = (events.commands || []).filter(item =>
    item.on === 'image' || item.on === 'photo'
);
const stickerPlugins = (events.commands || []).filter(item =>
    item.on === 'sticker'
);

const groupMetadataCache = new Map();
const GROUP_METADATA_TTL_MS = 3000;
const MAX_GROUP_METADATA_CACHE = 400;

async function getCachedGroupMetadata(sock, sessionId, jid) {
    const key = `${sessionId}:${jid}`;
    const now = Date.now();
    const cached = groupMetadataCache.get(key);

    if (cached?.data && cached.expiresAt > now) return cached.data;
    if (cached?.pending) return cached.pending;

    const pending = sock.groupMetadata(jid);
    groupMetadataCache.set(key, { pending, expiresAt: 0 });

    try {
        const data = await pending;
        groupMetadataCache.set(key, {
            data,
            expiresAt: Date.now() + GROUP_METADATA_TTL_MS
        });

        if (groupMetadataCache.size > MAX_GROUP_METADATA_CACHE) {
            const firstKey = groupMetadataCache.keys().next().value;
            groupMetadataCache.delete(firstKey);
        }
        return data;
    } catch (error) {
        groupMetadataCache.delete(key);
        throw error;
    }
}

function clearSessionGroupMetadata(sessionId) {
    const prefix = `${sessionId}:`;
    for (const key of groupMetadataCache.keys()) {
        if (key.startsWith(prefix)) groupMetadataCache.delete(key);
    }
}

let autoReplyCache = {};
let autoReplyCacheAt = 0;
let autoReplyLoadPromise = null;

async function getCachedAutoReplies() {
    if (Date.now() - autoReplyCacheAt < 5000) return autoReplyCache;
    if (autoReplyLoadPromise) return autoReplyLoadPromise;

    autoReplyLoadPromise = (async () => {
        const file = path.join(__dirname, 'data', 'custom-auto-replies.json');
        try {
            autoReplyCache = await fs.pathExists(file) ? await fs.readJson(file) : {};
            if (!autoReplyCache || typeof autoReplyCache !== 'object' || Array.isArray(autoReplyCache)) {
                autoReplyCache = {};
            }
            autoReplyCacheAt = Date.now();
        } catch (error) {
            console.error('[AUTO REPLY CACHE]', error.message);
          
            autoReplyCacheAt = 0;
        } finally {
            autoReplyLoadPromise = null;
        }
        return autoReplyCache;
    })();

    return autoReplyLoadPromise;
}

let latestBaileysVersionPromise = null;
async function getLatestBaileysVersionCached() {
    if (!latestBaileysVersionPromise) {
        latestBaileysVersionPromise = fetchLatestBaileysVersion().catch(error => {
            latestBaileysVersionPromise = null;
            throw error;
        });
    }
    return latestBaileysVersionPromise;
}

const incomingMessageQueues = new Map();
const performanceCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, timestamp] of commandCooldowns) {
        if (timestamp < cutoff) commandCooldowns.delete(key);
    }
}, 60 * 60 * 1000);
performanceCleanupTimer.unref?.();

function enqueueIncomingMessage(sessionId, jid, task) {
    const key = `${sessionId}:${jid}`;
    const previous = incomingMessageQueues.get(key) || Promise.resolve();
    const current = previous
        .catch(() => {})
        .then(task)
        .catch(error => {
            console.error('[MESSAGE ERROR]', error.stack || error.message || error);
        })
        .finally(() => {
            if (incomingMessageQueues.get(key) === current) {
                incomingMessageQueues.delete(key);
            }
        });
    incomingMessageQueues.set(key, current);
    return current;
}


app.use(express.static(path.join(__dirname, 'public')));

const disconnectSession = async (sessionId) => {
    sessionContext.markInactive(sessionId);
    if (reconnectTimers[sessionId]) { clearTimeout(reconnectTimers[sessionId]); delete reconnectTimers[sessionId]; }
    const sock = activeSockets[sessionId];
    if (sock) { try { sock.end(undefined); } catch (_) {} }
    delete activeSockets[sessionId];
};

app.use('/api/dev', createDeveloperApi({
    supabase,
    disconnectSession,
}));

const createUserApi = require('./user-api');
app.use('/api/user', createUserApi({ supabase, disconnectSession }));

app.get('/admin-config.js', (_req, res) => {
    res.type('application/javascript').send(
        `window.ADMIN_SUPABASE_URL=${JSON.stringify(SUPABASE_URL)};window.ADMIN_SUPABASE_ANON_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')};`
    );
});

const activeSockets = Object.create(null);
const keepAliveTimers = Object.create(null);
const reconnectTimers = Object.create(null);
const saveDebounceTimers = Object.create(null);
const saveQueues = Object.create(null);
const fileCache = Object.create(null);
const pairingLocks = Object.create(null);
const commandCooldowns = new Map();

function clearFileCache(sessionId) {
    for (const key of Object.keys(fileCache)) {
        if (key.startsWith(sessionId + ':')) delete fileCache[key];
    }
}

function cleanupSession(sessionId, expectedSocket = null) {
    
    if (expectedSocket && activeSockets[sessionId] !== expectedSocket) {
        return false;
    }

    if (keepAliveTimers[sessionId]) {
        clearInterval(keepAliveTimers[sessionId]);
        delete keepAliveTimers[sessionId];
    }

    if (reconnectTimers[sessionId]) {
        clearTimeout(reconnectTimers[sessionId]);
        delete reconnectTimers[sessionId];
    }

    if (saveDebounceTimers[sessionId]) {
        clearTimeout(saveDebounceTimers[sessionId]);
        delete saveDebounceTimers[sessionId];
    }

    clearFileCache(sessionId);
    clearSessionGroupMetadata(sessionId);

    const sock = activeSockets[sessionId];

    if (sock && (!expectedSocket || sock === expectedSocket)) {
        try {
            sock.ev.removeAllListeners();
            sock.ws?.terminate?.();
        } catch (_) {
            
        }

        delete activeSockets[sessionId];
    }

    delete pairingLocks[sessionId];
    return true;
}

async function restoreSession(sessionId, sessionPath) {
    try {
        const session = await getSession(sessionId);
        if (!session || !session.data) return false;

        await fs.emptyDir(sessionPath);
        await fs.ensureDir(sessionPath);

        for (const [file, content] of Object.entries(session.data)) {
            // Only restore ordinary files into this session directory.
            if (path.basename(file) !== file) continue;
            await fs.writeFile(path.join(sessionPath, file), content);
        }

        console.log('✅ 𝐑ᴇꜱᴛᴏʀᴇ:', sessionId);
        return true;
    } catch (error) {
        console.error('𝐑ᴇꜱᴛᴏʀᴇ error:', error.message);
        if (supabase) throw error;
        return false;
    }
}

async function saveSession(sessionId, sessionPath, force = false) {
    const previous = saveQueues[sessionId] || Promise.resolve();

    const current = previous.catch(() => {}).then(async () => {
        try {
            if (!(await fs.pathExists(sessionPath))) return;

            const files = await fs.readdir(sessionPath);
            const data = {};
            let hasChanges = false;

            for (const file of files) {
                const fullPath = path.join(sessionPath, file);

                try {
                    const stat = await fs.stat(fullPath);
                    if (!stat.isFile()) continue;

                    const content = await fs.readFile(fullPath, 'utf8');
                    const cacheKey = `${sessionId}:${file}`;

                    if (force || fileCache[cacheKey] !== content) {
                        fileCache[cacheKey] = content;
                        hasChanges = true;
                    }

                    data[file] = content;
                } catch (_) {
                }
            }

            if (!hasChanges && !force) return;

            await upsertSession(sessionId, data);
            console.log('💾 𝐒aved:', sessionId, force ? '(forced)' : '');
        } catch (error) {
            console.error('𝐒ave𝐒ession error:', error.message);
            throw error;
        }
    });

    saveQueues[sessionId] = current;

    try {
        await current;
    } finally {
        if (saveQueues[sessionId] === current) delete saveQueues[sessionId];
    }
}

function debouncedSaveSession(sessionId, sessionPath) {
    if (saveDebounceTimers[sessionId]) {
        clearTimeout(saveDebounceTimers[sessionId]);
    }

    saveDebounceTimers[sessionId] = setTimeout(async () => {
        delete saveDebounceTimers[sessionId];

        await saveSession(sessionId, sessionPath).catch(error => {
            console.error(`[${sessionId}] Debounced session backup failed:`, error.message);
        });
    }, 900);
}

const pluginState = require('./lib/plugin-state');


async function Pair(number, res = null) {
    const xnumber = normalizeNumber(number);

    if (!xnumber || xnumber.length < 8 || xnumber.length > 15) {
        if (res && !res.headersSent) {
            res.status(400).json({ error: 'Invalid phone number. Use country code, e.g. 947XXXXXXXX.' });
        }
        return;
    }

    const sessionId = `Nexa_${xnumber}`;
    const sessionPath = path.join(SESSION_BASE_PATH, sessionId);

    if (pairingLocks[sessionId] || activeSockets[sessionId]) {
        console.log('𝐒ocket already active / pairing in progress:', sessionId);

        if (res && !res.headersSent) {
            res.status(409).json({ error: 'Session already active. Please wait.' });
        }
        return;
    }

    pairingLocks[sessionId] = true;

    let sock = null;

    try {
        await fs.ensureDir(SESSION_BASE_PATH);
        await restoreSession(sessionId, sessionPath);
        await fs.ensureDir(sessionPath);

        if (supabase) {
            try {
                await updateSessionStatus(sessionId, 'pairing', { phone_number: xnumber });
            } catch (statusError) {
                console.error('Session status update failed:', statusError.message);
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await getLatestBaileysVersionCached();
        const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

        sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 25000,
            msgRetryCounterCache,
            markOnlineOnConnect: true,
            getMessage: async () => undefined
        });

        activeSockets[sessionId] = sock;
        sessionContext.wrapEvents(sock.ev, sessionId);
        sessionContext.warm(sessionId).catch(() => {});

        sock.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
            const response = await axios.head(url, { timeout: 20000 });
            const mime = String(response.headers['content-type'] || '')
                .split(';')[0]
                .trim()
                .toLowerCase();

            if (!mime) throw new Error('Could not detect file content type.');

            if (mime === 'image/gif' || mime === 'video/gif') {
                return sock.sendMessage(jid, {
                    video: await getBuffer(url),
                    caption,
                    gifPlayback: true,
                    ...options
                }, { quoted });
            }

            if (mime === 'application/pdf') {
                return sock.sendMessage(jid, {
                    document: await getBuffer(url),
                    mimetype: 'application/pdf',
                    caption,
                    ...options
                }, { quoted });
            }

            if (mime.startsWith('image/')) {
                return sock.sendMessage(jid, {
                    image: await getBuffer(url),
                    caption,
                    ...options
                }, { quoted });
            }

            if (mime.startsWith('video/')) {
                return sock.sendMessage(jid, {
                    video: await getBuffer(url),
                    caption,
                    mimetype: mime,
                    ...options
                }, { quoted });
            }

            if (mime.startsWith('audio/')) {
                return sock.sendMessage(jid, {
                    audio: await getBuffer(url),
                    caption,
                    mimetype: mime,
                    ...options
                }, { quoted });
            }

            return sock.sendMessage(jid, {
                document: await getBuffer(url),
                mimetype: mime,
                fileName: options.fileName || 'file',
                caption,
                ...options
            }, { quoted });
        };

        sock.edite = async (message, newText, chatJid) => {
            return sock.relayMessage(chatJid, {
                protocolMessage: {
                    key: message.key,
                    type: 14,
                    editedMessage: { conversation: newText }
                }
            }, {});
        };

        sock.forwardMessage = async (jid, message, forceForward = false, options = {}) => {
            if (!message?.message) throw new Error('Message content is missing.');

            const originalType = Object.keys(message.message)[0];
            const content = await generateForwardMessageContent(message, forceForward);
            const contentType = Object.keys(content)[0];

            const context = originalType !== 'conversation'
                ? (message.message[originalType]?.contextInfo || {})
                : {};

            content[contentType].contextInfo = {
                ...context,
                ...content[contentType].contextInfo
            };

            const waMessage = await generateWAMessageFromContent(jid, content, {
                ...content[contentType],
                ...options,
                ...(options.contextInfo
                    ? {
                        contextInfo: {
                            ...content[contentType].contextInfo,
                            ...options.contextInfo
                        }
                    }
                    : {})
            });

            await sock.relayMessage(jid, waMessage.message, {
                messageId: waMessage.key.id
            });

            return waMessage;
        };

       
        let responded = false;

       
        if (!state.creds.registered) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2500));

                const pairingCode = await sock.requestPairingCode(xnumber);
                console.log(`[${sessionId}] Pairing Code: ${pairingCode}`);

                if (res && !res.headersSent) {
                   
                    let panelCode = null;
                    try { panelCode = await require('./lib/panel-access').issueCode(supabase, sessionId); }
                    catch (e) { console.error('[PANEL] code issue failed:', e.message); }
                    res.json({ code: pairingCode, panel_code: panelCode });
                    responded = true;
                }
            } catch (pairError) {
                console.error(`[${sessionId}] Pairing code request failed:`, pairError);

                if (res && !res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to generate pairing code.',
                        details: pairError.message
                    });
                    responded = true;
                }

                cleanupSession(sessionId, sock);
                return;
            }
        } else {
            console.log('Already registered:', sessionId);

            if (res && !res.headersSent) {
                res.json({ error: 'This number is already paired.' });
                responded = true;
            }
        }

        if (res && !responded) {
            setTimeout(() => {
                if (!res.headersSent) {
                    res.status(504).json({ error: 'Pairing timed out. Try again.' });
                }
            }, 18000);
        }

        sock.ev.on('creds.update', async () => {
            if (activeSockets[sessionId] !== sock) return;

            try {
                await saveCreds();
                debouncedSaveSession(sessionId, sessionPath);
            } catch (saveError) {
                console.error(`[${sessionId}] Credential persistence failed:`, saveError.message);
            }
        });

        sock.ev.on('keys.update', () => {
            if (activeSockets[sessionId] === sock) {
                debouncedSaveSession(sessionId, sessionPath);
            }
        });

     
        sock.ev.on('connection.update', async update => {
            if (activeSockets[sessionId] !== sock) return;

            const { connection, lastDisconnect } = update;

            if (connection === 'close') {

                if (activeSockets[sessionId] !== sock) return;

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                console.log(`Disconnected: ${sessionId} | Code: ${statusCode}`);

                try {
                    await saveSession(sessionId, sessionPath, true);
                } catch (_) {
                    
                }

                if (!isLoggedOut) {
                    try {
                        await updateSessionStatus(sessionId, 'disconnected');
                    } catch (statusError) {
                        console.error('Session status update failed:', statusError.message);
                    }
                }

                cleanupSession(sessionId, sock);

                if (isLoggedOut) {
                    console.log('Logged out permanently:', sessionId);

                    try {
                        await updateSessionStatus(sessionId, 'logged_out');
                    } catch (_) {}

                    try {
                        await deleteSession(sessionId);
                    } catch (error) {
                        console.error('Could not delete logged-out session:', error.message);
                    }

                    await fs.remove(sessionPath).catch(() => {});
                    return;
                }

                let delay = 10000;

                if (statusCode === 428) {
                    delay = 25000 + Math.floor(Math.random() * 15000);
                } else if (statusCode === 440 || statusCode === 408) {
                    delay = 12000 + Math.floor(Math.random() * 8000);
                } else if (statusCode === 403) {
                    console.log(`[${sessionId}] 403 - possible restriction. Waiting 70s`);
                    delay = 70000;
                } else if (statusCode === 515) {
                    delay = 8000;
                }

                console.log(`[${sessionId}] Will reconnect in ${Math.round(delay / 1000)}s`);

                if (reconnectTimers[sessionId]) clearTimeout(reconnectTimers[sessionId]);

                reconnectTimers[sessionId] = setTimeout(() => {
                    delete reconnectTimers[sessionId];
                    if (sessionContext.isInactive(sessionId)) return;
                    console.log(`Reconnecting: ${sessionId}`);
                    Pair(xnumber);
                }, delay);

            } else if (connection === 'open') {
                console.log('✅ Connected:', sessionId);
                sessionContext.autoFollowChannels(sock, sessionId).catch(() => {});

                try {
                    await saveSession(sessionId, sessionPath, true);
                } catch (saveError) {
                    console.error('Initial session backup failed:', saveError.message);
                }

                try {
                    await updateSessionStatus(sessionId, 'connected', {
                        phone_number: xnumber,
                        last_connected_at: new Date().toISOString()
                    });
                } catch (statusError) {
                    console.error('Session status update failed:', statusError.message);
                }

                if (keepAliveTimers[sessionId]) {
                    clearInterval(keepAliveTimers[sessionId]);
                }

                keepAliveTimers[sessionId] = setInterval(async () => {
                    if (activeSockets[sessionId] !== sock || !sock.user) {
                        clearInterval(keepAliveTimers[sessionId]);
                        delete keepAliveTimers[sessionId];
                        return;
                    }

                    try {
                        if (config.AUTO_ONLINE) {
                            await sock.sendPresenceUpdate('available');
                        }
                    } catch (error) {
                       
                        console.log(`[${sessionId}] Keep-alive presence failed:`, error.message);
                    }
                }, 45000);

                try {
                    await sock.sendMessage(`${xnumber}@s.whatsapp.net`, {
                        text: '*NEXA MINI Active!*\n\nYour bot is now connected successfully.'
                    });
                } catch (error) {
                    console.error('Welcome message failed:', error.message);
                }
            }
        });




sock.ev.on('group-participants.update', async (update) => {

    try {

        if (activeSockets[sessionId] !== sock) return;

        const groupJid = update.id;
        const participants = update.participants || [];
        const action = update.action;

        if (!groupJid || !groupJid.endsWith('@g.us')) return;

        if (!['add', 'remove'].includes(action)) return;

        

        if (action === 'add' && !config.AUTO_WELCOME) return;

        if (action === 'remove' && !config.AUTO_GOODBYE) return;

        

        const metadata = await getCachedGroupMetadata(
            sock,
            sessionId,
            groupJid
        );

        const groupName = metadata?.subject || 'Our Group';

       

        const isWelcome = action === 'add';

        const template = isWelcome
            ? (
                config.WELCOME_MESSAGE ||
                `👋 Welcome @user to @group! ❤️`
            )
            : (
                config.GOODBYE_MESSAGE ||
                `🥺 Goodbye @user!`
            );

        for (const participant of participants) {

            if (activeSockets[sessionId] !== sock) return;

            const userJid = typeof participant === 'string'
                ? participant
                : participant.id;

            if (!userJid) continue;

           

            const message = String(template)
                .replace(/@user/g, '@' + userJid.split('@')[0])
                .replace(/@group/g, groupName);

            await sock.sendMessage(groupJid, {

                text: message,

                mentions: [userJid]

            });

            console.log(
                `[NEXA ${isWelcome ? 'WELCOME' : 'GOODBYE'}]`,
                userJid,
                groupName
            );

        }

    } catch (error) {

        console.error(
            '[NEXA WELCOME/GOODBYE ERROR]',
            error.message
        );

    }

});
        
        async function processIncomingMessage(mek) {
            if (!mek?.message) return;

         
            while (
                mek.message &&
                getContentType(mek.message) === 'ephemeralMessage' &&
                mek.message.ephemeralMessage?.message
            ) {
                mek.message = mek.message.ephemeralMessage.message;
            }


            if (mek.key?.remoteJid === 'status@broadcast') {
                if (config.AUTO_READ_STATUS) {
                    await sock.readMessages([mek.key]).catch(() => {});
                }

                if (config.AUTO_REACT_STATUS) {
                    const emojis = Array.isArray(config.STATUS_REACT_EMOJIS) && config.STATUS_REACT_EMOJIS.length
                        ? config.STATUS_REACT_EMOJIS
                        : ['❤️', '🔥', '😍'];

                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    const delay = Number(config.STATUS_REACT_DELAY) || 1200;

                    setTimeout(async () => {
                        if (activeSockets[sessionId] !== sock) return;

                        try {
                            await sock.sendMessage('status@broadcast', {
                                react: {
                                    text: randomEmoji,
                                    key: mek.key
                                }
                            });
                        } catch (_) {}
                    }, delay);
                }

                return;
            }

            if (activeSockets[sessionId] !== sock) return;

            const m = sms(sock, mek);
            const type = getContentType(mek.message);
            const from = mek.key.remoteJid;

            let body =
                type === 'conversation' ? mek.message.conversation :
                type === 'extendedTextMessage' ? mek.message.extendedTextMessage?.text :
                type === 'imageMessage' ? mek.message.imageMessage?.caption :
                type === 'videoMessage' ? mek.message.videoMessage?.caption :
                type === 'interactiveResponseMessage' ? (() => {
                    try {
                        return JSON.parse(
                            mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}'
                        ).id || '';
                    } catch (_) {
                        return '';
                    }
                })() :
                type === 'templateButtonReplyMessage'
                    ? mek.message.templateButtonReplyMessage?.selectedId
                    : m.msg?.text || m.msg?.conversation || m.msg?.caption || '';

            body = String(body || '');

            const prefix = config.PREFIX || '.';
            const isCmd = body.startsWith(prefix);
            const command = isCmd
                ? body.slice(prefix.length).trim().split(/\s+/).shift().toLowerCase()
                : '';

            const args = body.trim().split(/ +/).slice(1);
            const q = args.join(' ');
            const isGroup = String(from || '').endsWith('@g.us');

            const sender = mek.key.fromMe
                ? `${sock.user?.id?.split(':')[0] || xnumber}@s.whatsapp.net`
                : (mek.key.participant || mek.key.remoteJid);

            const senderNumber = normalizeNumber(String(sender || '').split('@')[0]);
            const botNumber = normalizeNumber(sock.user?.id?.split(':')[0] || '');
            const botNumber2 = sock.user?.id ? await jidNormalizedUser(sock.user.id) : '';
            const pushname = mek.pushName || 'User';

            const isMe = mek.key.fromMe === true || (!!botNumber && senderNumber === botNumber);
            const isOwner = isMe || senderNumber === xnumber || isOwnerNumber(senderNumber);
            if (config.COMMANDS_OWNER_ONLY && !isOwner && body.trim().startsWith(config.PREFIX)) return;
            const isReact = Boolean(m.message?.reactionMessage);

            const quoted = type === 'extendedTextMessage' &&
                mek.message.extendedTextMessage?.contextInfo
                ? mek.message.extendedTextMessage.contextInfo.quotedMessage || []
                : [];

            const groupMetadata = isGroup
                ? await getCachedGroupMetadata(sock, sessionId, from).catch(() => null)
                : null;

            const groupName = groupMetadata?.subject || '';
const participants = groupMetadata?.participants || [];


const groupAdmins = isGroup
    ? participants.filter(p =>
        p.admin === 'admin' ||
        p.admin === 'superadmin'
    )
    : [];

const botIdentities = new Set([
    sock.user?.id,
    sock.user?.lid,
    sock.user?.phoneNumber
].filter(Boolean).map(jid => {
    const value = String(jid).split(':')[0];
    return normalizeNumber(value.split('@')[0]);
}).filter(Boolean));


const isBotAdmins = isGroup && participants.some(p => {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') {
        return false;
    }

    const identities = [
        p.id,
        p.jid,
        p.phoneNumber
    ].filter(Boolean);

    return identities.some(jid => {
        const value = String(jid).split(':')[0];
        const normalized = normalizeNumber(value.split('@')[0]);

        return normalized && botIdentities.has(normalized);
    });
});


const isAdmins = isGroup && participants.some(p => {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') {
        return false;
    }

    const identities = [p.id, p.jid, p.phoneNumber]
        .filter(Boolean);

    return identities.some(jid => {
        const value = String(jid).split(':')[0];
        return normalizeNumber(value.split('@')[0]) === senderNumber;
    });
});

            const isSudo = false;
            const isPre = false;

            const reply = async text => {
                return sock.sendMessage(from, {
                    text: String(text ?? '')
                }, {
                    quoted: mek
                });
            };

            if (isCmd && config.READ_COMMANDS) {
                await sock.readMessages([mek.key]).catch(() => {});
            } else if (config.AUTO_READ_MESSAGES && !isMe) {
                await sock.readMessages([mek.key]).catch(() => {});
            }

            if (config.GROUP_ONLY && !isGroup && isCmd) return;
            if (config.PRIVATE_ONLY && isGroup && isCmd) return;
            
            if (config.AUTO_REPLY && !isMe && !isCmd && !isGroup) {
                const customReplies = await getCachedAutoReplies();
                const messageText = body.toLowerCase();
                const matched = Object.entries(customReplies).find(([trigger]) =>
                    messageText.includes(String(trigger).toLowerCase())
                );

                if (matched) {
                    await reply(matched[1]);
                } else {
                    await reply(config.AUTO_REPLY_TEXT || 'Thanks for your message! I will reply soon.');
                }
            }

            if (
                config.ANTI_LINK &&
                isGroup &&
                !isAdmins &&
                !isOwner &&
                isBotAdmins &&
                /https?:\/\/|www\./i.test(body) &&
                !isCmd
            ) {
                await sock.sendMessage(from, { delete: mek.key }).catch(() => {});
                return;
            }

            if (config.AUTO_REACT && !isMe && !isReact) {
                const chance = Number.isFinite(Number(config.AUTO_REACT_CHANCE))
                    ? Number(config.AUTO_REACT_CHANCE)
                    : 0.3;

                if (Math.random() < chance) {
                    const emojis = Array.isArray(config.REACT_EMOJIS) && config.REACT_EMOJIS.length
                        ? config.REACT_EMOJIS
                        : ['❤️', '🔥', '😊'];

                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                    sock.sendMessage(from, {
                        react: {
                            text: randomEmoji,
                            key: mek.key
                        }
                    }).catch(() => {});
                }
            }

            if (config.AUTO_TYPING) {
                sock.sendPresenceUpdate('composing', from).catch(() => {});
                setTimeout(() => {
                    if (activeSockets[sessionId] === sock) {
                        sock.sendPresenceUpdate('paused', from).catch(() => {});
                    }
                }, 3000);
            }

            const cmdName = isCmd
                ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
                : '';

            
            if (isCmd) {
                const cmd = commandMap.get(cmdName);

                if (cmd && !pluginState.isDisabled(cmd.filename)) {
                    if (cmd.ownerOnly && !isOwner) return reply('❌ Owner only.');
                    if (cmd.adminOnly && !isOwner && !isAdmins) return reply('❌ Admin only.');

                    const cooldown = Math.max(
                        Number(config.COMMAND_COOLDOWN) || 0,
                        Number(cmd.cooldown) || 0
                    );

                    const cooldownKey = `${sessionId}:${sender}:${cmd.pattern}`;
                    const lastRun = commandCooldowns.get(cooldownKey) || 0;

                    if (cooldown > 0 && Date.now() - lastRun < cooldown * 1000) {
                        const remaining = Math.ceil(
                            cooldown - (Date.now() - lastRun) / 1000
                        );

                        return reply(`⏳ Please wait ${remaining}s before using this command again.`);
                    }

                    commandCooldowns.set(cooldownKey, Date.now());

                    if (cmd.react) {
                        sock.sendMessage(from, {
                            react: {
                                text: cmd.react,
                                key: mek.key
                            }
                        }).catch(() => {});
                    }

                    try {
                        const runCommand = async (requestedName, commandText = '') => {
                            if (!isOwner) throw new Error('Owner permission required.');

                            const requested = String(requestedName || '')
                                .replace(/^\./, '')
                                .toLowerCase();

                            const target = commandMap.get(requested);
                            if (!target) throw new Error(`Command not found: ${requested}`);

                            if (target.filename && path.basename(target.filename).toLowerCase() === 'nexa-ai.js') {
                                throw new Error('AI management commands cannot call themselves.');
                            }

                            if (pluginState.isDisabled(target.filename)) {
                                throw new Error('This command plugin is disabled.');
                            }

                            if (target.ownerOnly && !isOwner) throw new Error('Owner only command.');
                            if (target.adminOnly && !isOwner && !isAdmins) throw new Error('Admin only command.');

                            const commandArgs = String(commandText || '')
                                .trim()
                                .split(/ +/)
                                .filter(Boolean);

                            const commandQ = commandArgs.join(' ');
                            const commandBody = `${prefix}${target.pattern}${commandQ ? ' ' + commandQ : ''}`;

                            return target.function(sock, mek, m, {
                                from, prefix, isSudo, quoted, body: commandBody,
                                isCmd: true, isPre, command: target.pattern,
                                args: commandArgs, q: commandQ, isGroup, sender,
                                senderNumber, botNumber2, botNumber, pushname,
                                isMe, isOwner, groupMetadata, groupName,
                                participants, groupAdmins, isBotAdmins, isAdmins, reply
                            });
                        };

                        await cmd.function(sock, mek, m, {
                            from, prefix, isSudo, quoted, body, isCmd, isPre,
                            command, args, q, isGroup, sender, senderNumber,
                            botNumber2, botNumber, pushname, isMe, isOwner,
                            groupMetadata, groupName, participants,
                            groupAdmins, isBotAdmins, isAdmins, reply, runCommand
                        });
                    } catch (error) {
                        console.error('[PLUGIN ERROR]', error.stack || error);
                        await reply(`❌ Plugin error: ${error.message}`).catch(() => {});
                    }
                }
            }

            
            const runCommandForAI = async (requestedName, commandText = '') => {
              
                const requested = String(requestedName || '')
                    .replace(/^\./, '')
                    .toLowerCase();

                const target = commandMap.get(requested);
                if (!target) throw new Error(`Command not found: ${requested}`);

                if (target.filename && path.basename(target.filename).toLowerCase() === 'nexa-ai.js') {
                    throw new Error('AI management commands cannot call themselves.');
                }

                if (pluginState.isDisabled(target.filename)) {
                    throw new Error('This command plugin is disabled.');
                }

                if ((target.ownerOnly || target.settingsOnly) && !isOwner) {
                    throw new Error('❌ This settings command is available to the bot owner only.');
                }
                if (target.adminOnly && !isOwner && !isAdmins) {
                    throw new Error('❌ Admin only command.');
                }

                const commandArgs = String(commandText || '')
                    .trim()
                    .split(/ +/)
                    .filter(Boolean);

                const commandQ = commandArgs.join(' ');
                const commandBody = `${prefix}${target.pattern}${commandQ ? ' ' + commandQ : ''}`;

                return target.function(sock, mek, m, {
                    from, prefix, isSudo, quoted, body: commandBody,
                    isCmd: true, isPre, command: target.pattern,
                    args: commandArgs, q: commandQ, isGroup, sender,
                    senderNumber, botNumber2, botNumber, pushname,
                    isMe, isOwner, groupMetadata, groupName,
                    participants, groupAdmins, isBotAdmins, isAdmins, reply
                });
            };

            
            const eligiblePlugins = type === 'imageMessage'
                ? (body ? [...bodyTextPlugins, ...imagePlugins] : imagePlugins)
                : type === 'stickerMessage'
                    ? (body ? [...bodyTextPlugins, ...stickerPlugins] : stickerPlugins)
                    : (body ? bodyTextPlugins : []);

            for (const pluginCommand of eligiblePlugins) {
                if (pluginState.isDisabled(pluginCommand.filename)) continue;

                try {
                    const common = {
                        from, prefix, quoted, body, isSudo, isCmd, isPre,
                        command, args, q, isGroup, sender, senderNumber,
                        botNumber2, botNumber, pushname, isMe, isOwner,
                        groupMetadata, groupName, participants,
                        groupAdmins, isBotAdmins, isAdmins, reply,
                        runCommand: runCommandForAI
                    };

                    if (body && pluginCommand.on === 'body') {
                        await pluginCommand.function(sock, mek, m, common);
                    } else if (body && pluginCommand.on === 'text') {
                        await pluginCommand.function(sock, mek, m, common);
                    } else if (
                        (pluginCommand.on === 'image' || pluginCommand.on === 'photo') &&
                        type === 'imageMessage'
                    ) {
                        await pluginCommand.function(sock, mek, m, common);
                    } else if (
                        pluginCommand.on === 'sticker' &&
                        type === 'stickerMessage'
                    ) {
                        await pluginCommand.function(sock, mek, m, common);
                    }
                } catch (error) {
                    console.error('[CMD MAP ERROR]', error.stack || error);
                }
            }


            if (command === 'jid') {
                await reply(from);
            } else if (command === 'ev' && isOwner) {
                await reply('⚠️ Runtime eval is disabled for security. Use installed bot commands instead.');
            }
        }

        sock.ev.on('messages.upsert', update => {
            for (const incomingMessage of (update?.messages || [])) {
                if (!incomingMessage?.message) continue;
                const jid = incomingMessage.key?.remoteJid;
                if (!jid) continue;
                enqueueIncomingMessage(
                    sessionId,
                    jid,
                    () => processIncomingMessage(incomingMessage)
                );
            }
        });

    } catch (error) {
        console.error('Pair Error:', error.stack || error);

        try {
            await updateSessionStatus(sessionId, 'error');
        } catch (_) {}

        if (sock) cleanupSession(sessionId, sock);
        else cleanupSession(sessionId);

        if (res && !res.headersSent) {
            res.status(500).json({
                error: 'Pair failed.',
                details: error.message
            });
        }
    } finally {
        
        setTimeout(() => {
            if (pairingLocks[sessionId]) delete pairingLocks[sessionId];
        }, 4000);
    }
}
async function restoreAllSessions() {
    try {
        await pruneDeadSessions();

        const sessions = await getAllSessions();
        await sessionContext.loadInactiveSessions();
        console.log(`Restoring ${sessions.length} session(s)...`);

        for (let index = 0; index < sessions.length; index++) {
            const session = sessions[index];

            if (!session.session_id) {
                console.warn('Skipping session without session_id:', session);
                continue;
            }

            if (sessionContext.isInactive(session.session_id)) continue;
            if (session.status === 'logged_out') {
                await deleteSession(session.session_id).catch(() => {});
                continue;
            }

            const number = session.session_id.replace(/^dina_/, '');

            if (!/^\d{8,15}$/.test(number)) {
                console.warn('Skipping invalid session ID:', session.session_id);
                continue;
            }

            try {
                
                await new Promise(resolve => setTimeout(resolve, index * 800));
                await Pair(number);
            } catch (error) {
                console.error(
                    'Failed to restore session',
                    session.session_id,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error('restoreAllSessions error:', error.stack || error);
    }
}


app.get('/pair', async (req, res) => {
    const number = req.query.number;

    if (!number) {
        return res.status(400).json({ error: 'Number required' });
    }

    res.setTimeout(35000, () => {
        if (!res.headersSent) {
            res.status(504).json({ error: 'Request timed out. Try again.' });
        }
    });

    await Pair(String(number), res);
});

app.get('/', (_req, res) => {
    res.send('NEXA MINI Bot Server Running!');
});


if (supabase) {
    try {
        const createAdminApi = require('./admin-api');

        const getRuntimeSettings = () => ({ ...config });

        const setRuntimeSettings = async patch => {
            const { saveConfig } = require('./lib/config-store');
            await saveConfig(patch);
        };

        app.use('/api/admin', createAdminApi({
            supabase,
            commands: events.commands,
            getRuntimeSettings,
            setRuntimeSettings,
            disconnectSession,
            getSocketStatus: () => Object.fromEntries(
                Object.entries(activeSockets).map(([id, socket]) => [
                    id,
                    Boolean(socket?.user)
                ])
            )
        }));
    } catch (error) {
        console.error('Admin API failed to load:', error.message);
    }
}


app.listen(PORT, async () => {
    console.log(`NEXA MINI server running on port ${PORT}`);

    await fs.ensureDir(SESSION_BASE_PATH);
    await fs.ensureDir(LOCAL_DATA_DIR);

    await loadConfig().catch(error => {
        console.error('Config load failed:', error.message);
    });

    await restoreAllSessions();
    createBroadcastWorker({ supabase, getSocket: (id) => activeSockets[id] }).start();
});


process.on('uncaughtException', error => {
    const message = String(error);

    const ignoredErrors = [
        'Socket connection timeout',
        'rate-overlimit',
        'Connection Closed',
        'Value not found',
        'Bad MAC'
    ];

    if (ignoredErrors.some(item => message.includes(item))) return;

    console.error('Caught exception:', error.stack || error);
});

process.on('unhandledRejection', reason => {
    console.error('Unhandled promise rejection:', reason?.stack || reason);
});
