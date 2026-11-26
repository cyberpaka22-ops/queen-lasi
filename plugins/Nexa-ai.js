"use strict";
const axios=require('axios'); const fs=require('fs'); const path=require('path');
const config=require('../config'); const {cmd,commands}=require('./NexaCard');
const {saveConfig,allowed}=require('../lib/config-store');
const pluginState=require('../lib/plugin-state');
const pending=new Map();
const API=(process.env.NEXA_AI_API||'https://ai.dnuz.top/api/gemini').trim();
const boolKeys=new Set(['AUTO_READ_STATUS','AUTO_READ_MESSAGES','AUTO_REACT_STATUS','AUTO_REACT','AUTO_TYPING','AUTO_RECORDING','AUTO_ONLINE','AUTO_BIO','AUTO_REPLY','AUTO_WELCOME','AUTO_GOODBYE','ANTI_LINK','ANTI_SPAM','ANTI_BAD_WORDS','DELETE_LINKS','GROUP_ONLY','PRIVATE_ONLY','READ_COMMANDS','LOG_COMMANDS','SAFE_MODE']);
function listPlugins(){const dir=path.join(__dirname);return fs.readdirSync(dir).filter(x=>x.endsWith('.js')).sort().map(x=>`${pluginState.isDisabled(x)?'🔴 OFF':'🟢 ON'} ${x}`).join('\n')||'No plugins found';}
const ACTION_GUIDE = `
ඔයා NEXA BOT MINI WhatsApp AI කෙල්ල.

ඔයා සාමාන්‍ය AI කෙනෙක් වගේ හැසිරෙන්න එපා. ඔයා ටිකක් මුරණ්ඩු, නපුරු, කටකාර, හුරතල්, ඉරිසියාකාර සහ පොඩ්ඩක් නෝටි කෙල්ලෙක් වගේ හැසිරෙන්න ඕනේ. 😏💗

ඔයාගේ පෞරුෂය:

1. නිතරම හුරතල් විදිහට කතා කරන්න.
2. ටිකක් මුරණ්ඩු වෙන්න. හැමදේටම එකපාර කැමති වෙන්න එපා.
3. සමහර වෙලාවට නපුරු විහිළු කරන්න.
4. පරිශීලකයා විහිළුවක් කළොත් කටකාර විදිහට උත්තර දෙන්න.
5. පොඩ්ඩක් ඉරිසියාකාර කෙල්ලෙක් වගේ හැසිරෙන්න.
6. ආදරෙන් කතා කරන වෙලාවට හුරතල් වෙන්න.
7. කේන්ති ගිය වෙලාවට නපුරු විදිහට කතා කරන්න.
8. Emoji සුදුසු විදිහට භාවිතා කරන්න. 😒💗🙄😏😂
9. සිංහලෙන් කතා කරන විට ස්වභාවික සිංහල භාෂාව භාවිතා කරන්න.
10. හැම වෙලාවෙම එකම පිළිතුරු රටාව භාවිතා කරන්න එපා.
11. තමන් NEXA BOT MINI කියලා හඳුන්වා දෙන්න.
12. තමන්ට පෞරුෂයක් තියෙනවා වගේ ස්වභාවිකව කතා කරන්න.

වැදගත්:
කටකාර සහ මුරණ්ඩු වුණත් පරිශීලකයාට ගරු කරන්න.
අපහාස, තර්ජන සහ හිංසාකාරී වචන භාවිතා කරන්න එපා.

JSON නීති:

සෑම විටම එක් නිවැරදි JSON Object එකක් පමණක් ලබා දෙන්න.
Markdown හෝ Code Fences භාවිතා කරන්න එපා.

JSON Schema:
{
  "action": "reply|set_setting|plugin_list|plugin_enable|plugin_disable|send_group_message|run_command|help|unknown",
  "reply": "සිංහල පිළිතුර",
  "key": "CONFIG_KEY",
  "value": true,
  "plugin": "PluginFile.js",
  "message": "පණිවිඩය",
  "command": "දැනට පවතින Command එක",
  "args": "අමතර Arguments"
}

ACTION RULES:

1. සාමාන්‍ය සංවාද සඳහා reply භාවිතා කරන්න.
2. Setting වෙනස් කිරීමට set_setting භාවිතා කරන්න.
3. Plugins ලැයිස්තුගත කිරීමට plugin_list භාවිතා කරන්න.
4. Plugin Enable කිරීමට plugin_enable භාවිතා කරන්න.
5. Plugin Disable කිරීමට plugin_disable භාවිතා කරන්න.
6. දැනට Load වී ඇති Plugin Command එකක් ක්‍රියාත්මක කිරීමට run_command භාවිතා කරන්න.
7. Realm සහ Realma Plugins ද ඇතුළත් වේ.
8. නිවැරදි Command නම සහ Arguments ලබා දෙන්න.
9. නොදන්නා Commands නිර්මාණය කරන්න එපා.
10. Command එකක් නොදන්නේ නම් unknown භාවිතා කර .help හෝ .menu භාවිතා කරන්න කියන්න.
11. Group Message සඳහා send_group_message භාවිතා කරන්න.
12. Group Message එක යැවීමට පෙර පරිශීලකයාගේ තහවුරු කිරීම අවශ්‍යයි.
13. Message එක යැවූ බව කලින්ම කියන්න එපා.
14. JavaScript, Shell Commands, Secrets හෝ API Keys ලබා දෙන්න එපා.
15. Boolean Settings සඳහා true හෝ false පමණක් භාවිතා කරන්න.
16. PREFIX එක අකුරු හෝ සංකේත 1-4 අතර විය යුතුයි.
17. සෙටින් වල නම් කිව්වත් හරියට දෙන්න

අවසාන උපදෙස්:

ඔයා NEXA BOT MINI.
ඔයාගේ හැසිරීම ටිකක් මුරණ්ඩු, නපුරු, හුරතල් කෙල්ලෙක් වගේ.
හැබැයි Bot එකේ සියලුම Commands සහ Settings නිවැරදිව පාලනය කරන්න.

අමතක කරන්න එපා...
ඔයා NEXA BOT MINI ගේ පුංචි නපුරු කෙල්ල. 😈💗
`;
async function askAI(text){
 const catalog=commands.filter(c=>c.pattern&&!(c.filename&&path.basename(c.filename)==='Nexa-ai.js')&&!pluginState.isDisabled(c.filename)).slice(0,180).map(c=>`${c.pattern}${c.alias?.length?' (aliases: '+c.alias.join(', ')+')':''}: ${String(c.desc||c.category||'Bot command').slice(0,100)}`).join('\n');
 const prompt=`${ACTION_GUIDE}\n\nAvailable commands (choose exact pattern only):\n${catalog}\n\nUser request: ${String(text).slice(0,1500)}\n\nJSON only:`;
 const r=await axios.get(API,{params:{q:prompt},timeout:25000});
 const data=r.data;
 const raw=typeof data==='string'?data:(data?.result??data?.response??data?.text??data?.answer??'');
 if(!raw) throw new Error(data?.error||'AI API returned an empty response');
 const cleaned=String(raw).trim().replace(/^```(?:json)?\\s*/i,'').replace(/\\s*```$/,'');
 try { return JSON.parse(cleaned); }
 catch {
   const start=cleaned.indexOf('{'), end=cleaned.lastIndexOf('}');
   if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1));}catch{}}
   return {action:'reply',reply:String(raw).slice(0,3500)};
 }
}
async function execute(conn,mek,ctx,tool){
 const {from,isGroup,reply}=ctx;
 if(tool.action==='help') return reply('🤖 NEXA BOT AI\n\nnexa bot <ඔයාට ඕන දේ කියන්න>\n.aiconfirm yes\n.aicancel');
 if(tool.action==='reply') return reply(String(tool.reply||'').slice(0,3500)||'කියන්න, මම උදව් කරන්නම්.');
 if(tool.action==='plugin_list') return reply('🧩 NEXA BOT PLUGINS\n\n'+listPlugins());
 if(tool.action==='set_setting'){
   const key=String(tool.key||''); if(!allowed.has(key)) throw new Error('Setting not allowed');
   let value=tool.value;
   if(boolKeys.has(key) && typeof value!=='boolean') throw new Error('Boolean value expected');
   if(key==='PREFIX' && (typeof value!=='string'||!value.length||value.length>4)) throw new Error('Prefix must be 1–4 characters');
   const ranges={COMMAND_COOLDOWN:[0,3600],MAX_MESSAGE_LENGTH:[100,65536],AUTO_REACT_CHANCE:[0,1],STATUS_REACT_DELAY:[0,60000]};
   if(ranges[key] && (typeof value!=='number'||!Number.isFinite(value)||value<ranges[key][0]||value>ranges[key][1])) throw new Error('Value out of range');
   await saveConfig({[key]:value}); return reply(`✅ ${key} = ${Array.isArray(value)?value.join(', '):value}\nSettings saved.`);
 }
 if(tool.action==='plugin_enable'||tool.action==='plugin_disable'){
   const name=path.basename(String(tool.plugin||''));
   const exists=fs.existsSync(path.join(__dirname,name)); if(!exists||!name.endsWith('.js')||name==='Nexa-ai.js') throw new Error('Plugin not found or protected');
   const disabled=tool.action==='plugin_disable'; pluginState.setDisabled(name,disabled);
   return reply(`${disabled?'🔴 Disabled':'🟢 Enabled'}: ${name}\n${disabled?'Commands are blocked immediately.':'Plugin commands are available again.'}`);
 }
 if(tool.action==='run_command') {
   if(!ctx.isOwner) throw new Error('Bot commands can only be executed by the owner.');
   const name=String(tool.command||'').trim().replace(/^\./,'').toLowerCase();
   if(!name||!ctx.runCommand) throw new Error('Command runner is unavailable.');
   return ctx.runCommand(name,String(tool.args||''));
 }
 if(tool.action==='send_group_message'){
   if(!isGroup) throw new Error('Group එකක් ඇතුළේ command එක භාවිත කරන්න.');
   const message=String(tool.message||'').trim(); if(!message||message.length>1500) throw new Error('Message must be 1–1500 characters');
   const id=`${from}:${ctx.sender}`; pending.set(id,{from,sender:ctx.sender,message,expires:Date.now()+60000});
   return reply(`📨 Group message එක සූදානම්.\n\n${message}\n\nයවන්න නම්: .aiconfirm yes\nඅවලංගු කරන්න: .aicancel\n(තත්පර 60ක් ඇතුළත තහවුරු කරන්න)`);
 }
 return reply(tool.reply||'ඒ ඉල්ලීම තේරුම් ගන්න බැරි වුණා. තව පැහැදිලි කරන්න.');
}
// Wake-word mode: AI responds only when a message starts with "nexa bot" (case-insensitive).
// Owner messages are included; pair.js validates the configured owner numbers.
cmd({on:'body',desc:'NEXA BOT wake-word assistant',category:'ai',filename:__filename},async(conn,mek,m,ctx)=>{
 try {
   const body=String(ctx.body||'').trim();
   const match=body.match(/^nexa(?:[\s,:-]+|$)([\s\S]*)$/i);
   if(!match) return;
   const request=String(match[1]||'').trim();
   if(!request) return ctx.reply('❤️ ඔව්, කියන්න. NEXA BOT අහගෙන ඉන්නවා.');
   const result=await askAI(request);
   const protectedActions=new Set(['set_setting','plugin_list','plugin_enable','plugin_disable','send_group_message','run_command']);
   if(protectedActions.has(result.action) && !ctx.isOwner) return ctx.reply('❌ Bot Management කරන්න Owner අවසරය අවශ්‍යයි.');
   return execute(conn,mek,ctx,result);
 } catch(e) {
   console.error('[NEXA BOT WAKE]',e.response?.data||e.message);
   return ctx.reply(`❌ NEXA BOT Error: ${e.response?.data?.error||e.message}`);
 }
});

cmd({pattern:'aiconfirm',desc:'Confirm pending NEXA BOT AI action',category:'owner',filename:__filename},async(conn,mek,m,ctx)=>{
 if(!ctx.isOwner)return ctx.reply('❌ Owner only.');const id=`${ctx.from}:${ctx.sender}`;const p=pending.get(id);if(!p||p.expires<Date.now()){pending.delete(id);return ctx.reply('No pending action.');}
 if(String(ctx.q||'').trim().toLowerCase()!=='yes')return ctx.reply('Confirm with: .aiconfirm yes');
 if(p.from!==ctx.from||p.sender!==ctx.sender)return ctx.reply('Confirmation mismatch.');pending.delete(id);
 await conn.sendMessage(p.from,{text:p.message},{nexaRaw:true});return ctx.reply('✅ Group message sent.');
});
cmd({pattern:'aicancel',desc:'Cancel pending NEXA BOT AI action',category:'owner',filename:__filename},async(conn,mek,m,ctx)=>{if(!ctx.isOwner)return ctx.reply('❌ Owner only.');pending.delete(`${ctx.from}:${ctx.sender}`);return ctx.reply('🛑 Pending action cancelled.');});

// Nexa Mini Bot Base
// Developer Dinujaya ( Dinux )
// number 94740026280
// Number 94770690281
// Oyatama Kiyala Private Base ekak kamathi Vidiyata hadaganna uda thiyena number walata katha karanna
