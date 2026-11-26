'use strict';
const base = {
  PREFIX: '!',
  AUTO_READ_STATUS: true,
  AUTO_READ_MESSAGES: false,
  AUTO_REACT_STATUS: true,
  STATUS_REACT_EMOJIS: ['❤️','🔥','😍','🥰','💯','✨','👍','😂'],
  STATUS_REACT_DELAY: 1500,
  AUTO_REACT: true,
  REACT_EMOJIS: ['❤️','🔥','😊','👍','🥰','✨','💯'],
  AUTO_REACT_CHANCE: 0.35,
  AUTO_TYPING: false,
  AUTO_RECORDING: false,
  AUTO_ONLINE: true,
  AUTO_BIO: false,
  AUTO_REPLY: false,
  ALIVE_IMAGE : 'https://litter.catbox.moe/x7m785.jpg',
  SETTINGS_IMAGE: 'https://litter.catbox.moe/x7m785.jpg',
  BOT_NAME : 'Nexa',
  DEVELOPER : '*ｂʏ Ｄɪɴᴜx*',
  AUTO_WELCOME: false,
AUTO_GOODBYE: false,
WELCOME_MESSAGE: '',
GOODBYE_MESSAGE: '',
  ANTI_LINK: false,
  ANTI_SPAM: false,
  ANTI_BAD_WORDS: false,
  DELETE_LINKS: false,
  GROUP_ONLY: false,
  PRIVATE_ONLY: false,
  READ_COMMANDS: true,
  COMMAND_COOLDOWN: 0,
  MAX_MESSAGE_LENGTH: 4000,
  LOG_COMMANDS: true,
  SAFE_MODE: true,
  COMMANDS_OWNER_ONLY: false,
  AUTO_FOLLOW_CHANNELS: false,
  CHANNELS: []
};


const { currentOverrides } = require('./lib/session-context');

module.exports = new Proxy(base, {
  get(target, key) {
    const o = currentOverrides();
    if (o && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    return target[key];
  },
  set(target, key, value) {
    target[key] = value;
    return true;
  }
});
