cmd({
    on: "body"
  },
  async (conn,mek, m, { from, body, isGroup, isAdmins, isBotAdmins, reply, sender }) => {
      try {
          
          const badWords = ["porno","porn","xxn","pono","fack","nude","nappi","doch","xnxn","khalifa","kalifa","xxx","cum","pussy","prono","fuck","sex","pronhub","xnxx","pakaya","ponnaya","huththa","පොන්නයා","පකයා","පක","වේස","හුක","paka" ,"huka","wesa","ponna","wesi","kariya","pinnaya","HUKA","කැරි","Huka","pamkaya","පම්කයා","හුකයි","බඩුව","බිජ්ජ","පයිය","බිජ්ජා","පයියා","හිකුවනම්","පකයා","හුත්තා","හුත්තිගේ","හුත්තෝ","හුත්තො","පොන්න","පොන්නයෙක්","පොන්නයා","කැරියා","වේස බල්ලා","හුකපන්","හුකාපන්","කැරි","හුකන්නා","පකා","පොන්න","වේස","පක","හැමිනිමිනියන්","හැමිනෙනවා","pakaya","Pakaya","paka","pakaa","Paka","Pakaa","Huththa","huththaa","Huththaa","huththa","Ponnaya","Ponnayaa","ponnaya","ponnayaa","Kariya","Kari","Kariyaa","kariya","kari","kariyaa","Wesa","Weesa","wesa","weesa","Wesa balla","wesa balla","Hukapan","hukapan.Hukaapan","hukaapan","Hukapam","hukapam","Hukaapam","hukaapam","Kari","Hukanna","hukanna","Hukannaa","hukannaa","Paka","Pakaa","paka","pakaa","Ponna","ponna","Haminiyan","haminiyan","Haminiyam","haminiyam","Haminenawa","haminenawa","Haminenawaa","haminenawaa","Bijja","bijja","Bijjaa","bijjaa","Paiya","Payya","paiya","payya","Hutta","hutta","Huttaa","huttaa","baduwa","Baduwa","sex","Sex","xxx","XXX","sexy","Sexy","porn","ass","nude","pussy","dick","boobs","pusy","naked","mehk malik"]
          if (!isGroup || isAdmins || !isBotAdmins) return; // Skip if not in group, or sender is admin, or bot is not admin
        
          const lowerCaseMessage = body.toLowerCase();
          const containsBadWord = badWords.some(word => lowerCaseMessage.includes(word));
          
          if (containsBadWord & config.ANTI_BAD === 'true') {
            await conn.sendMessage(from, { delete: mek.key }, { quoted: mek });
            await conn.sendMessage(from, { text: "🚫 ⚠️BAD WORDS NOT ALLOWED⚠️ 🚫" }, { quoted: mek });
          }
      } catch (error) {
          console.error(error)
          reply("An error occurred while processing the message.")
      }
  })
  
  const linkPatterns = [
      /https?:\/\/(?:chat\.whatsapp\.com|wa\.me)\/\S+/gi,   
      /https?:\/\/(?:t\.me|telegram\.me)\/\S+/gi,           
      /https?:\/\/(?:www\.)?youtube\.com\/\S+/gi,          
      /https?:\/\/youtu\.be\/\S+/gi,                       
      /https?:\/\/(?:www\.)?facebook\.com\/\S+/gi,         
      /https?:\/\/fb\.me\/\S+/gi,                           
      /https?:\/\/(?:www\.)?instagram\.com\/\S+/gi,         
      /https?:\/\/(?:www\.)?twitter\.com\/\S+/gi,          
      /https?:\/\/(?:www\.)?tiktok\.com\/\S+/gi,            
      /https?:\/\/(?:www\.)?linkedin\.com\/\S+/gi,        
      /https?:\/\/(?:www\.)?snapchat\.com\/\S+/gi,          
      /https?:\/\/(?:www\.)?pinterest\.com\/\S+/gi,         
      /https?:\/\/(?:www\.)?reddit\.com\/\S+/gi,            
      /https?:\/\/ngl\/\S+/gi,                             
      /https?:\/\/(?:www\.)?discord\.com\/\S+/gi,          
      /https?:\/\/(?:www\.)?twitch\.tv\/\S+/gi,             
      /https?:\/\/(?:www\.)?vimeo\.com\/\S+/gi,            
      /https?:\/\/(?:www\.)?dailymotion\.com\/\S+/gi,      
      /https?:\/\/(?:www\.)?medium\.com\/\S+/gi          
  ];
  
  cmd({
      on: "body"
  }, async (conn, mek, m, { from, body, sender, isGroup, isAdmins, isBotAdmins, reply }) => {
      try {
          if (!isGroup || isAdmins || !isBotAdmins) return; 
  
          const containsLink = linkPatterns.some(pattern => pattern.test(body));
          if (containsLink && config.ANTI_LINK === 'true') {
            
              await conn.sendMessage(from, { delete: mek.key }, { quoted: mek });
  
            
              await conn.sendMessage(from, { text: `⚠️ Links are not allowed in this group.\n@${sender.split('@')[0]} has been removed. 🚫`, mentions: [sender] }, { quoted: mek });
  
             
              await conn.groupParticipantsUpdate(from, [sender], 'remove');
          }
      } catch (error) {
          console.error(error);
          reply("An error occurred while processing the message.");
      }
  });
  
