'use strict';
// Nexa Mini Bot Base
// Developer Dinujaya ( Dinux )
// number 94740026280
// Number 94770690281
// Oyatama Kiyala Private Base ekak kamathi Vidiyata hadaganna uda thiyena number walata katha karanna
const config = require('../config');
const { cmd } = require('./NexaCard');
const { saveConfig, allowed } = require('../lib/config-store');

// ==========================================
//          ♆ NEXA BOT ALL SETTINGS ♆
// ==========================================

const PREFIX = () => config.PREFIX || '';

const PANEL_IMAGE = '';  
const BOT_NAME = config.BOT_NAME || '♆ NEXA BOT ♆';

const DEVELOPER = '🧚‍♂️ dinux 🧚‍♂️';


const categories = {

    general: {
        title: '⚙️ GENERAL SETTINGS',
        keys: [
            'autoread',
            'readmessages',
            'readcommands'
        ]
    },

    reactions: {
        title: '❤️ REACTION SETTINGS',
        keys: [
            'autoreact',
            'statusreact',
            'reactchance',
            'emojis',
            'statusemojis',
            'statusdelay'
        ]
    },

    automation: {
        title: '🤖 AUTOMATION SETTINGS',
        keys: [
            'autotyping',
            'autorecording',
            'autoonline',
            'autobio'
        ]
    },

    messages: {
        title: '💬 MESSAGE SETTINGS',
        keys: [
            'autoreply',
            'welcome',
            'goodbye'
        ]
    },

    security: {
        title: '🛡️ SECURITY SETTINGS',
        keys: [
            'antilink',
            'antispam',
            'antibadwords'
        ]
    },

    privacy: {
        title: '🔒 PRIVACY SETTINGS',
        keys: [
            'deletelinks',
            'grouponly',
            'privateonly'
        ]
    },

    system: {
        title: '💻 SYSTEM SETTINGS',
        keys: [
            'logcommands',
            'safemode',
            'cooldown',
            'maxlength',
            'prefix'
        ]
    }

};

const boolSettings = {

    autoread: 'AUTO_READ_STATUS',
    readmessages: 'AUTO_READ_MESSAGES',
    readcommands: 'READ_COMMANDS',

    autoreact: 'AUTO_REACT',
    statusreact: 'AUTO_REACT_STATUS',

    autotyping: 'AUTO_TYPING',
    autorecording: 'AUTO_RECORDING',
    autoonline: 'AUTO_ONLINE',
    autobio: 'AUTO_BIO',

    autoreply: 'AUTO_REPLY',
    welcome: 'AUTO_WELCOME',
    goodbye: 'AUTO_GOODBYE',

    antilink: 'ANTI_LINK',
    antispam: 'ANTI_SPAM',
    antibadwords: 'ANTI_BAD_WORDS',

    deletelinks: 'DELETE_LINKS',
    grouponly: 'GROUP_ONLY',
    privateonly: 'PRIVATE_ONLY',

    logcommands: 'LOG_COMMANDS',
    safemode: 'SAFE_MODE'

};


const otherSettings = {

    prefix: 'PREFIX',
    reactchance: 'AUTO_REACT_CHANCE',
    cooldown: 'COMMAND_COOLDOWN',
    maxlength: 'MAX_MESSAGE_LENGTH',
    emojis: 'REACT_EMOJIS',
    statusemojis: 'STATUS_REACT_EMOJIS',
    statusdelay: 'STATUS_REACT_DELAY'

};


function getStatus(key) {

    const prop = boolSettings[key];

    if (!prop) return '⚙️ CUSTOM';

    return config[prop] ? '🟢 ON' : '🔴 OFF';

}

function getValue(key) {

    const prop = boolSettings[key] || otherSettings[key];

    if (!prop) return 'UNKNOWN';

    const value = config[prop];

    if (value === undefined || value === null) {
        return 'NOT SET';
    }

    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return String(value);

}

function getMention(jid) {

    if (!jid) return 'Owner';

    return '@' + jid.split('@')[0].split(':')[0];

}

async function sendPanel(conn, jid, text, sender) {

    const message = {

        ...(PANEL_IMAGE
            ? {
                image: { url: PANEL_IMAGE },
                caption: text
            }
            : {
                text: text
            }),

        ...(sender ? {
            mentions: [sender]
        } : {})

    };

    return conn.sendMessage(jid, message);

}


async function mainMenu(conn, jid, sender) {

    const p = PREFIX();

    const text = `
╭━━━━━━━━━━━━━━━━━━━━━━╮
       ♆ NEXA BOT SETTINGS
╰━━━━━━━━━━━━━━━━━━━━━━╯

👋 Welcome ${getMention(sender)}

🤖 *PREMIUM BOT MANAGEMENT*

━━━━━━━━━━━━━━━━━━━━━━

📊 *BOT STATUS*

📖 Auto Read      : ${getStatus('autoread')}
❤️ Auto React     : ${getStatus('autoreact')}
💬 Auto Reply     : ${getStatus('autoreply')}
🛡️ Anti Link      : ${getStatus('antilink')}
👋 Welcome        : ${getStatus('welcome')}
🔐 Safe Mode      : ${getStatus('safemode')}

━━━━━━━━━━━━━━━━━━━━━━

📂 *SETTINGS CATEGORIES*

⚙️ GENERAL
${p}settings general

❤️ REACTIONS
${p}settings reactions

🤖 AUTOMATION
${p}settings automation

💬 MESSAGES
${p}settings messages

🛡️ SECURITY
${p}settings security

🔒 PRIVACY
${p}settings privacy

💻 SYSTEM
${p}settings system

━━━━━━━━━━━━━━━━━━━━━━

📌 *QUICK COMMANDS*

${p}settings autoread on
${p}settings autoreact off
${p}settings antilink on
${p}settings prefix !

━━━━━━━━━━━━━━━━━━━━━━

💾 AUTO SAVE ENABLED

⚡ ${BOT_NAME}
👨‍💻 ${DEVELOPER}
`;

    return sendPanel(conn, jid, text, sender);

}


async function categoryMenu(conn, jid, page, sender) {

    const data = categories[page];

    if (!data) return;

    const p = PREFIX();

    const lines = data.keys.map((key, index) => {

        const isBoolean = Boolean(boolSettings[key]);

        return `
${index + 1}. *${key.toUpperCase()}*

📊 Value: ${isBoolean ? getStatus(key) : getValue(key)}

${isBoolean
    ? `🟢 ON: ${p}settings ${key} on
🔴 OFF: ${p}settings ${key} off`
    : `✏️ CHANGE: ${p}settings ${key} <value>`}

`;

    });

    const text = `
╭━━━━━━━━━━━━━━━━━━━━━━╮
       ♆ NEXA BOT SETTINGS
╰━━━━━━━━━━━━━━━━━━━━━━╯

${data.title}

━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━

💡 *SETTING GUIDE*

🟢 ON = Enable
🔴 OFF = Disable
✏️ VALUE = Change Setting

💾 Auto Save Enabled

━━━━━━━━━━━━━━━━━━━━━━

🏠 MAIN MENU
${p}settings

👨‍💻 ${DEVELOPER}
`;

    return sendPanel(conn, jid, text, sender);

}


function findCategory(key) {

    return Object.keys(categories).find(page =>
        categories[page].keys.includes(key)
    ) || 'general';

}


cmd({

    pattern: 'settings',

    alias: [
        'setting',
        'botsettings',
        'config'
    ],

    desc: 'NEXA BOT All In One Settings',

    category: 'owner',

    react: '⚙️',

    filename: __filename,

    ownerOnly: true,

    settingsOnly: true

}, async (conn, mek, msg, {
    q,
    isOwner,
    reply,
    sender
}) => {

    try {

      

        if (!isOwner) {
            return reply('❌ Owner Only Command!');
        }

        const args = (q || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        const action = (args.shift() || '').toLowerCase();

        const jid = mek.key.remoteJid;

        const owner = sender ||
            mek.key.participant ||
            jid;

        const p = PREFIX();

      

        if (!action) {
            return mainMenu(conn, jid, owner);
        }

      

        if (categories[action]) {
            return categoryMenu(conn, jid, action, owner);
        }

       

        if (action === 'page') {

            const page = (args[0] || '').toLowerCase();

            if (!categories[page]) {
                return reply('❌ Invalid Category!');
            }

            return categoryMenu(conn, jid, page, owner);

        }

       

        if (action === 'toggle') {

            const key = (args[0] || '').toLowerCase();

            const prop = boolSettings[key];

            if (!prop || !allowed.has(prop)) {
                return reply('❌ Invalid Setting!');
            }

            const value = !Boolean(config[prop]);

            await saveConfig({
                [prop]: value
            });

            await reply(
                `╭━━〔 ♆ NEXA BOT UPDATED 〕━━╮\n\n` +
                `⚙️ Setting: ${key.toUpperCase()}\n` +
                `📡 Status: ${value ? '🟢 ON' : '🔴 OFF'}\n\n` +
                `💾 Configuration Saved!\n` +
                `╰━━━━━━━━━━━━━━━━━━╯`
            );

            return categoryMenu(
                conn,
                jid,
                findCategory(key),
                owner
            );

        }

      

        const prop = boolSettings[action] ||
            otherSettings[action];

        if (!prop || !allowed.has(prop)) {

            return reply(
                `❌ Unknown Setting!\n\n` +
                `Use ${p}settings to open the menu.`
            );

        }

        let value;
        

        if (boolSettings[action]) {

            const input = (args[0] || '').toLowerCase();

            if (![
                'on',
                'off',
                'true',
                'false',
                '1',
                '0'
            ].includes(input)) {

                return reply(
                    `❌ Invalid Value!\n\n` +
                    `🟢 Enable:\n${p}settings ${action} on\n\n` +
                    `🔴 Disable:\n${p}settings ${action} off`
                );

            }

            value = [
                'on',
                'true',
                '1'
            ].includes(input);

        }

        

        else if (prop === 'PREFIX') {

            value = args.join(' ');

            if (!value || value.length > 4) {
                return reply(
                    '❌ Prefix must contain 1–4 characters.'
                );
            }

        }

       

        else if (
            prop === 'REACT_EMOJIS' ||
            prop === 'STATUS_REACT_EMOJIS'
        ) {

            value = args.join(' ')
                .split(',')
                .map(x => x.trim())
                .filter(Boolean);

            if (!value.length || value.length > 20) {

                return reply(
                    '❌ Provide 1–20 comma-separated emojis.'
                );

            }

        }

    

        else {

            if (!args[0]) {
                return reply('❌ Please provide a value.');
            }

            value = Number(args[0]);

            if (!Number.isFinite(value)) {
                return reply('❌ Invalid Number!');
            }

            const limits = {

                AUTO_REACT_CHANCE: [0, 1],

                COMMAND_COOLDOWN: [0, 3600],

                MAX_MESSAGE_LENGTH: [100, 65536],

                STATUS_REACT_DELAY: [0, 60000]

            };

            const range = limits[prop];

            if (
                range &&
                (value < range[0] || value > range[1])
            ) {

                return reply(
                    `❌ Value must be between ${range[0]} and ${range[1]}.`
                );

            }

        }

       

        await saveConfig({
            [prop]: value
        });

      

        const displayValue = Array.isArray(value)
            ? value.join(', ')
            : String(value);

        await reply(
            `╭━━〔 💾 NEXA BOT SAVED 〕━━╮\n\n` +
            `⚙️ Setting: ${action.toUpperCase()}\n` +
            `📌 Value: ${displayValue}\n\n` +
            `✅ Successfully Updated!\n` +
            `💾 Configuration Saved.\n\n` +
            `╰━━━━━━━━━━━━━━━━━━╯`
        );

    } catch (error) {

        console.error(
            '[NEXA BOT SETTINGS ERROR]',
            error
        );

        return reply(
            '❌ Settings Error!\n\n' +
            (error.message || 'Unknown error')
        );

    }

});

