'use strict';

const config = require('../config');
const { cmd } = require('./NexaCard');
const { saveConfig, allowed } = require('../lib/config-store');

// Nexa Mini Bot Base
// Developer Dinujaya ( Dinux )
// number 94740026280
// Number 94770690281
// Oyatama Kiyala Private Base ekak kamathi Vidiyata hadaganna uda thiyena number walata katha karanna
const BOT_NAME = config.BOT_NAME || '♆ NEXA BOT ♆';

const DEVELOPER = '🧚‍♂️ dinux 🧚‍♂️';

const DEFAULT_WELCOME =
`╭━━〔 👋 WELCOME 〕━━╮

Hey @user ❤️

Welcome to @group!

We're happy to have you here.

📌 Please follow group rules.
💬 Enjoy your stay!

╰━━━━━━━━━━━━━━━━━━╯

⚡ ${BOT_NAME}
`;

const DEFAULT_GOODBYE =
`╭━━〔 🥺 GOODBYE 〕━━╮

@user has left the group.

We will miss you! ❤️

Take care and come back soon.

╰━━━━━━━━━━━━━━━━━━╯

⚡ ${BOT_NAME}
`;



async function setMessage(type, text) {

    const prop = type === 'welcome'
        ? 'WELCOME_MESSAGE'
        : 'GOODBYE_MESSAGE';

    if (!allowed.has(prop)) {
        throw new Error(`${prop} is not allowed in config-store.`);
    }

    await saveConfig({
        [prop]: text
    });

    return true;
}


cmd({
    pattern: 'welcomemsg',
    alias: ['setwelcome'],
    desc: 'Set Welcome Message',
    category: 'owner',
    filename: __filename,
    ownerOnly: true,
    settingsOnly: true
}, async (conn, mek, msg, { q, isOwner, reply }) => {

    if (!isOwner) return reply('❌ Owner Only!');

    if (!q) {
        return reply(
            `👋 WELCOME MESSAGE SETTINGS\n\n` +
            `Usage:\n.welcomemsg Your message here\n\n` +
            `Available tags:\n` +
            `@user = Member Mention\n` +
            `@group = Group Name`
        );
    }

    try {

        await setMessage('welcome', q);

        return reply(
            '✅ Welcome Message Updated!\n\n' +
            '💾 Configuration Saved.'
        );

    } catch (error) {

        return reply('❌ ' + error.message);

    }

});



cmd({
    pattern: 'goodbyemsg',
    alias: ['setgoodbye'],
    desc: 'Set Goodbye Message',
    category: 'owner',
    filename: __filename,
    ownerOnly: true,
    settingsOnly: true
}, async (conn, mek, msg, { q, isOwner, reply }) => {

    if (!isOwner) return reply('❌ Owner Only!');

    if (!q) {
        return reply(
            `🥺 GOODBYE MESSAGE SETTINGS\n\n` +
            `Usage:\n.goodbyemsg Your message here\n\n` +
            `Available tags:\n` +
            `@user = Member Mention\n` +
            `@group = Group Name`
        );
    }

    try {

        await setMessage('goodbye', q);

        return reply(
            '✅ Goodbye Message Updated!\n\n' +
            '💾 Configuration Saved.'
        );

    } catch (error) {

        return reply('❌ ' + error.message);

    }

});



cmd({
    pattern: 'resetwelcome',
    desc: 'Reset Welcome Message',
    category: 'owner',
    filename: __filename,
    ownerOnly: true,
    settingsOnly: true
}, async (conn, mek, msg, { isOwner, reply }) => {

    if (!isOwner) return reply('❌ Owner Only!');

    try {

        const prop = 'WELCOME_MESSAGE';

        if (!allowed.has(prop)) {
            return reply('❌ WELCOME_MESSAGE not allowed.');
        }

        await saveConfig({
            [prop]: DEFAULT_WELCOME
        });

        return reply('✅ Welcome Message Reset Successfully!');

    } catch (error) {

        return reply('❌ ' + error.message);

    }

});

cmd({
    pattern: 'resetgoodbye',
    desc: 'Reset Goodbye Message',
    category: 'owner',
    filename: __filename,
    ownerOnly: true,
    settingsOnly: true
}, async (conn, mek, msg, { isOwner, reply }) => {

    if (!isOwner) return reply('❌ Owner Only!');

    try {

        const prop = 'GOODBYE_MESSAGE';

        if (!allowed.has(prop)) {
            return reply('❌ GOODBYE_MESSAGE not allowed.');
        }

        await saveConfig({
            [prop]: DEFAULT_GOODBYE
        });

        return reply('✅ Goodbye Message Reset Successfully!');

    } catch (error) {

        return reply('❌ ' + error.message);

    }

});

