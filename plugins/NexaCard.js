// ===== NexaCard =====
//   • Fake vCard quote
//   • PDF card (2026 pages • 100 TB) + image thumbnail + caption
// plugin එකක `const { cmd } = require('../command')` වෙනුවට
// `const { cmd } = require('./NexaCard')` දාන්න විතරයි (ඉතුරු දේවල් වෙනස් වෙන්නේ නැහැ).
// Nexa Mini Bot Base
// Developer Dinujaya ( Dinux )
// number 94740026280
// Number 94770690281
// Oyatama Kiyala Private Base ekak kamathi Vidiyata hadaganna uda thiyena number walata katha karanna
const { AsyncLocalStorage } = require('async_hooks')
const base = require('../command')



const IMAGE_URL = 'https://files.catbox.moe/h308kz.jpg'
const DOC_NAME = 'nexa bot • Bot.pdf'
const MAX_CAPTION = 3000          
const TEXT_KEYS = new Set(['text', 'mentions', 'contextInfo'])

const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch')

let _baileys
function bz() {
    if (_baileys) return _baileys
    try { _baileys = require('@whiskeysockets/baileys') } catch {
        try { _baileys = require('baileys') } catch { _baileys = require('@adiwajshing/baileys') }
    }
    return _baileys
}

const fakevCard = {
    key: {
        fromMe: false,
        participant: '0@s.whatsapp.net',
        remoteJid: 'status@broadcast'
    },
    message: {
        contactMessage: {
            displayName: '© nexa bot',
            vcard:
                'BEGIN:VCARD\n' +
                'VERSION:3.0\n' +
                'FN:nexa bot\n' +
                'ORG:nexa bot;\n' +
                'TEL;type=CELL;type=VOICE;waid=13135550002:+13135550002\n' +
                'END:VCARD'
        }
    }
}


const MIN_PDF = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF'
)

let thumbCache = null
let docCache = null
let docPending = null

async function resizeThumb(buf) {
  
    try {
        const sharp = require('sharp')
        return await sharp(buf).resize({ width: 640 }).jpeg({ quality: 70 }).toBuffer()
    } catch { /* next */ }

    try {
        const Jimp = require('jimp')
        if (Jimp.read) {
            const img = await Jimp.read(buf)
            return await img.resize(640, Jimp.AUTO).quality(70).getBufferAsync(Jimp.MIME_JPEG)
        }
    } catch { /* next */ }

    return buf
}

async function getThumb() {
    if (thumbCache) return thumbCache
    try {
        const res = await fetchFn(IMAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!res.ok) throw new Error('image http ' + res.status)
        const raw = Buffer.from(await res.arrayBuffer())
        const buf = await resizeThumb(raw)
        console.log(`[NEXA BOT CARD] thumbnail ready: ${Math.round(buf.length / 1024)} KB` +
            (buf.length > 150 * 1024 ? ' (ලොකුයි - `npm i jimp@0.22.12` කරන්න)' : ''))
        thumbCache = buf
    } catch (e) {
        console.log('[NEXA BOT CARD] thumbnail fetch failed:', e.message)
    }
    return thumbCache
}

function getDocMedia(conn) {
    if (docCache && Date.now() < docCache.until) return Promise.resolve(docCache.v)
    if (docPending) return docPending

    docPending = (async () => {
        const { prepareWAMessageMedia } = bz()
        const thumb = await getThumb()
        const media = await prepareWAMessageMedia(
            { document: MIN_PDF, mimetype: 'application/pdf', fileName: DOC_NAME },
            { upload: conn.waUploadToServer }
        )

        const d = media.documentMessage
        d.mimetype = 'application/pdf'
        d.fileName = DOC_NAME
        d.title = DOC_NAME
        d.pageCount = 2026
        d.fileLength = 109951162777600     // ~100 TB
        if (thumb) d.jpegThumbnail = thumb

     
        docCache = { until: Date.now() + (thumb ? 6 * 60 * 60 * 1000 : 60 * 1000), v: d }
        return d
    })().finally(() => { docPending = null })

    return docPending
}


function isPlainText(content) {
    if (!content || typeof content.text !== 'string' || !content.text.trim()) return false
    if (content.text.length > MAX_CAPTION) return false
    for (const k of Object.keys(content)) if (!TEXT_KEYS.has(k)) return false   
    const ci = content.contextInfo
    if (ci && (ci.externalAdReply || ci.quotedMessage || ci.stanzaId)) return false
    return true
}


const FOOTER_LINE = '_nexa bot • Developer: dinux_'
const CAT_ICONS = [
    ['owner', '🛡️'], ['group', '👥'], ['download', '📥'], ['search', '🔎'], ['ai', '🤖'],
    ['logo', '🎨'], ['stick', '🎭'], ['convert', '🔄'], ['img', '🖼️'], ['tool', '🧰'],
    ['fun', '🎉'], ['setting', '⚙️'], ['system', '🖥️'], ['main', '📂']
]

function iconFor(category) {
    const k = String(category || '').toLowerCase()
    for (const [w, icon] of CAT_ICONS) if (k.includes(w)) return icon
    return '🧚‍♂️'
}

function styleText(text, store) {
    let out = String(text)

    if (!/^\s*[╭┏╔]/.test(out)) {
        const title = store && store.title ? ` • ${String(store.title).toUpperCase()}` : ''
        const icon = iconFor(store && store.category)
        out =
            '╭━━━━━━━━━━━━━━╮\n' +
            `┃ *𝗡𝗘𝗫𝗔 𝗕𝗢𝗧${title}*\n` +
            '╰━━━━━━━━━━━━━━╯\n\n' +
            out.replace(/^\s+/, '')
    }

    if (!/nexa bot • |Developer: dinux|Powered by|NEXA BOT/i.test(out)) {
        out = out.replace(/\s+$/, '') + '\n\n' + FOOTER_LINE
    }
    return out
}


const MEDIA_KEYS = ['image', 'video', 'audio', 'sticker', 'document']
function isQuotable(content) {
    if (!content || content.edit || content.delete || content.react || content.forward) return false
    return MEDIA_KEYS.some(k => content[k]) || typeof content.text === 'string'
}

async function sendCard(conn, jid, content) {
    const { generateWAMessageFromContent } = bz()
    const d = await getDocMedia(conn)

    const doc = { ...d, caption: styleText(content.text, als.getStore()) }
    const ci = { ...(content.contextInfo || {}) }
    if (Array.isArray(content.mentions) && content.mentions.length) {
        ci.mentionedJid = [...new Set([...(ci.mentionedJid || []), ...content.mentions])]
    }
    if (Object.keys(ci).length) doc.contextInfo = ci

    const msg = generateWAMessageFromContent(
        jid,
        { documentMessage: doc },
        { quoted: fakevCard, userJid: conn.user?.id }
    )
    await conn.relayMessage(jid, msg.message, { messageId: msg.key.id })
    return msg      
}



const als = new AsyncLocalStorage()

function patchConn(conn) {
    if (!conn || conn.__nexaCardPatched || typeof conn.sendMessage !== 'function') return
    conn.__nexaCardPatched = true

    const orig = conn.sendMessage.bind(conn)
    conn.__nexaOrigSend = orig

    conn.sendMessage = async (jid, content, opts) => {
        try {
            if (
                !(opts && opts.nexaRaw) &&
                typeof jid === 'string' &&
                !jid.endsWith('@newsletter') &&
                jid !== 'status@broadcast' &&
                content && typeof content === 'object'
            ) {
                const store = als.getStore()
                const q = opts && opts.quoted
                const quotedHere = !!(q && q !== fakevCard && q.key && q.key.remoteJid === jid)
                const inCmd = !!(store && store.from === jid)

                if (quotedHere || inCmd) {
                    if (isPlainText(content)) return await sendCard(conn, jid, content)
                    if (quotedHere) opts = { ...opts, quoted: fakevCard }
                    else if (!(opts && opts.quoted) && isQuotable(content)) opts = { ...(opts || {}), quoted: fakevCard }
                }
            }
        } catch (e) {
            console.log('[NEXA BOT CARD] card failed, sending normally:', e.message)
        }
        return orig(jid, content, opts)
    }
}

function cmd(info, func) {
    if (typeof func !== 'function') return base.cmd(info, func)

    const wrapped = function (conn, mek, m, ctx, ...rest) {
        try { patchConn(conn) } catch (e) { console.log('[NEXA BOT CARD] patch failed:', e.message) }
        const from = (ctx && ctx.from) || (mek && mek.key && mek.key.remoteJid)
        const store = { from, title: info && info.pattern, category: info && info.category }
        return als.run(store, () => func.call(this, conn, mek, m, ctx, ...rest))
    }

    return base.cmd(info, wrapped)
}

module.exports = { ...base, cmd, fakevCard, patchConn, sendCard }
