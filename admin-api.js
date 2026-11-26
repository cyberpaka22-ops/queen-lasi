'use strict';
const express = require('express');
const router = express.Router();
const { generateKey } = require('./lib/developer-keys');
const { enqueueBroadcast } = require('./lib/broadcasts');

function createAdminApi({ supabase, commands, getRuntimeSettings, setRuntimeSettings, getSocketStatus, disconnectSession }) {
  router.use(express.json({ limit: '2mb' }));
  router.use(async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) return res.status(401).json({ error: 'Authentication required' });
      const { data: auth, error: authError } = await supabase.auth.getUser(token);
      if (authError || !auth?.user) return res.status(401).json({ error: 'Invalid or expired login' });
      const { data: profile, error } = await supabase.from('profiles').select('id,display_name,role,is_active').eq('id', auth.user.id).maybeSingle();
      if (error) throw error;
      if (!profile || !profile.is_active || !['admin','owner'].includes(profile.role)) return res.status(403).json({ error: 'Admin access required' });
      req.admin = { ...profile, email: auth.user.email };
      next();
    } catch (e) { next(e); }
  });
  router.use((err, req, res, next) => { console.error('[ADMIN API]', err.message); res.status(500).json({ error: 'Internal server error' }); });
  router.get('/me', (req,res) => res.json({ user: req.admin }));
  router.get('/overview', async (req,res,next) => {
    try {
      const [users,sessions,commandsResult,logs] = await Promise.all([
        supabase.from('profiles').select('id,display_name,role,is_active,created_at').order('created_at',{ascending:false}).limit(200),
        supabase.from('bot_sessions').select('session_id,phone_number,status,updated_at,last_connected_at').order('updated_at',{ascending:false}).limit(200),
        supabase.from('bot_commands').select('*').order('category').order('command_name'),
        supabase.from('command_logs').select('id,command_name,succeeded,executed_at,chat_jid,error_message').order('executed_at',{ascending:false}).limit(50)
      ]);
      for (const r of [users,sessions,commandsResult,logs]) if (r.error) throw r.error;
      res.json({users:users.data,sessions:sessions.data,commands:commandsResult.data,logs:logs.data,runtime:getSocketStatus()});
    } catch(e){next(e);}
  });
  router.get('/settings', async(req,res,next)=>{try{
    const {data,error}=await supabase.from('bot_settings').select('*').is('instance_id',null).order('setting_key'); if(error)throw error;
    res.json({settings:data,runtime:getRuntimeSettings()});
  }catch(e){next(e);}});
  router.put('/settings', async(req,res,next)=>{try{
    const allowed = ['PREFIX','AUTO_READ_STATUS','AUTO_REACT','AUTO_TYPING','REACT_EMOJIS'];
    const entries = Object.entries(req.body || {});
    if (!entries.length || entries.some(([k])=>!allowed.includes(k))) return res.status(400).json({error:'Unsupported setting'});
    for (const [setting_key,setting_value] of entries) {
      const existing=await supabase.from('bot_settings').select('id').is('instance_id',null).eq('setting_key',setting_key).maybeSingle(); if(existing.error)throw existing.error;
      const payload={setting_value,updated_by:req.admin.id,description:'Managed from admin dashboard'};
      const result=existing.data ? await supabase.from('bot_settings').update(payload).eq('id',existing.data.id) : await supabase.from('bot_settings').insert({...payload,instance_id:null,setting_key}); if(result.error)throw result.error;
    }
    await setRuntimeSettings(Object.fromEntries(entries)); res.json({ok:true,runtime:getRuntimeSettings()});
  }catch(e){next(e);}});
  router.put('/commands/:id', async(req,res,next)=>{try{
    const allowed=['is_enabled','admin_only','owner_only','cooldown_seconds','description','category'];
    const patch={}; for(const k of allowed) if(Object.hasOwn(req.body||{},k)) patch[k]=req.body[k];
    if(!Object.keys(patch).length) return res.status(400).json({error:'No supported fields'});
    const {data,error}=await supabase.from('bot_commands').update(patch).eq('id',req.params.id).select().single(); if(error)throw error; res.json({command:data});
  }catch(e){next(e);}});
  router.put('/users/:id', async(req,res,next)=>{try{
    if(req.params.id===req.admin.id && req.body.is_active===false) return res.status(400).json({error:'You cannot deactivate your own account'});
    const patch={}; if(typeof req.body.is_active==='boolean')patch.is_active=req.body.is_active;
    if(['user','admin'].includes(req.body.role) && req.admin.role==='owner')patch.role=req.body.role;
    if(!Object.keys(patch).length)return res.status(400).json({error:'No permitted changes'});
    const {data,error}=await supabase.from('profiles').update(patch).eq('id',req.params.id).select('id,display_name,role,is_active').single(); if(error)throw error; res.json({user:data});
  }catch(e){next(e);}});
  router.get('/runtime-commands',(req,res)=>res.json({commands:commands.map(c=>({pattern:c.pattern,alias:c.alias,desc:c.desc,category:c.category,filename:c.filename}))}));
  router.use((err, req, res, next) => { console.error('[ADMIN API]', err.message); res.status(500).json({ error: 'Internal server error' }); });
  // ---------- Developers & keys ----------
  router.get('/developers', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('developers')
        .select('id, name, email, is_active, created_at').order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ developers: data });
    } catch (e) { next(e); }
  });

  router.post('/developers', async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim().slice(0, 100);
      const email = req.body?.email ? String(req.body.email).trim().slice(0, 200) : null;
      if (!name) return res.status(400).json({ error: 'Name required' });
      const { data, error } = await supabase.from('developers').insert({ name, email }).select().single();
      if (error) throw error;
      res.status(201).json({ developer: data });
    } catch (e) { next(e); }
  });

  router.put('/developers/:id/active', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('developers')
        .update({ is_active: req.body?.is_active === true }).eq('id', req.params.id)
        .select('id, is_active').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Developer not found' });
      res.json({ developer: data });
    } catch (e) { next(e); }
  });

  router.get('/developers/:id/keys', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('developer_keys')
        .select('id, key_prefix, expires_at, revoked_at, last_used_at, created_at')
        .eq('developer_id', req.params.id).order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ keys: data });
    } catch (e) { next(e); }
  });

  
  router.post('/developers/:id/keys', async (req, res, next) => {
    try {
      const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 365);
      const { key, prefix, hash } = generateKey();
      const expires_at = new Date(Date.now() + days * 86400000).toISOString();
      const { data, error } = await supabase.from('developer_keys')
        .insert({ developer_id: req.params.id, key_prefix: prefix, key_hash: hash, expires_at })
        .select('id, key_prefix, expires_at').single();
      if (error) throw error;
      res.status(201).json({ key, meta: data });
    } catch (e) { next(e); }
  });

  router.post('/keys/:id/revoke', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('developer_keys')
        .update({ revoked_at: new Date().toISOString() }).eq('id', req.params.id)
        .select('id, revoked_at').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Key not found' });
      res.json({ key: data });
    } catch (e) { next(e); }
  });

  
  router.get('/broadcasts', async (req, res, next) => {
    try {
      let q = supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(30);
      if (req.query.session_id) q = q.eq('session_id', String(req.query.session_id));
      const { data, error } = await q;
      if (error) throw error;
      res.json({ broadcasts: data });
    } catch (e) { next(e); }
  });

  router.post('/broadcasts', async (req, res, next) => {
    try {
      if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirmation required' });
      const job = await enqueueBroadcast({
        supabase,
        sessionId: String(req.body?.session_id || ''),
        message: req.body?.message,
        createdBy: req.admin.id,
        metadata: { by: 'admin' },
      });
      res.status(201).json({ broadcast: job });
    } catch (e) { next(e); }
  });

  router.post('/broadcasts/:id/cancel', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('broadcasts')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('id', req.params.id).in('status', ['queued', 'running']).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Broadcast not found or already finished' });
      res.json({ broadcast: data });
    } catch (e) { next(e); }
  });

  
  router.post('/sessions/:id/deactivate', async (req, res, next) => {
    try {
      const { error } = await supabase.from('bot_sessions')
        .update({ is_active: false, status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('session_id', req.params.id);
      if (error) throw error;
      await disconnectSession(req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  
  router.use((err, req, res, next) => {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ADMIN API]', err && err.message);
    res.status(500).json({ error: 'Internal server error' });
  });
  return router;
}
module.exports=createAdminApi;
