'use strict';

const DELAY_MIN_MS = 4000;   // messages අතර අවම delay (WhatsApp ban අවදානම අඩු කරන්න) මෙක වෙනස් කරන්න එපා
const DELAY_MAX_MS = 8000;
const DAILY_CAP = 300;       
const BATCH_SIZE = 20;
const POLL_MS = 10000;
const MAX_CONTACTS = 5000;

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);


async function enqueueBroadcast({ supabase, sessionId, message, createdBy = null, metadata = {} }) {
    const text = String(message || '').trim();
    if (!text || text.length > 4000) throw new HttpError(400, 'Message must be 1-4000 characters');
    if (!sessionId) throw new HttpError(400, 'session_id required');

    const { data: contacts, error } = await supabase.from('session_contacts')
        .select('whatsapp_jid').eq('session_id', sessionId).limit(MAX_CONTACTS);
    if (error) throw error;

    const jids = (contacts || []).map((c) => c.whatsapp_jid)
        .filter((j) => String(j).endsWith('@s.whatsapp.net'));
    if (!jids.length) throw new HttpError(400, 'No contacts for this number yet');

    const { data: job, error: jobErr } = await supabase.from('broadcasts')
        .insert({ created_by: createdBy, session_id: sessionId, message: text, total: jids.length, metadata })
        .select().single();
    if (jobErr) throw jobErr;

    for (let i = 0; i < jids.length; i += 500) {
        const rows = jids.slice(i, i + 500).map((whatsapp_jid) => ({ broadcast_id: job.id, whatsapp_jid }));
        const { error: rErr } = await supabase.from('broadcast_recipients').insert(rows);
        if (rErr) throw rErr;
    }
    return job;
}

function createBroadcastWorker({ supabase, getSocket }) {
    let busy = false;

    async function countRecipients(jobId, status) {
        const { count, error } = await supabase.from('broadcast_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('broadcast_id', jobId).eq('status', status);
        if (error) throw error;
        return count || 0;
    }

    async function sentLast24h() {
        const since = new Date(Date.now() - 86400000).toISOString();
        const { count, error } = await supabase.from('broadcast_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent').gte('sent_at', since);
        if (error) throw error;
        return count || 0;
    }

    async function isCancelled(jobId) {
        const { data } = await supabase.from('broadcasts').select('status').eq('id', jobId).maybeSingle();
        return !data || data.status === 'cancelled';
    }

    async function claimNext() {
        const { data: next } = await supabase.from('broadcasts')
            .select('id').eq('status', 'queued').order('created_at').limit(1).maybeSingle();
        if (!next) return null;
        const { data } = await supabase.from('broadcasts')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', next.id).eq('status', 'queued').select().maybeSingle();
        return data || null;
    }

    async function processJob(job) {
        const { data: session } = await supabase.from('bot_sessions')
            .select('is_active').eq('session_id', job.session_id).maybeSingle();
        if (!session || session.is_active === false) {
            await supabase.from('broadcasts').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', job.id);
            return;
        }
        if (!getSocket(job.session_id)?.user) {
            await supabase.from('broadcasts').update({ status: 'queued', started_at: null }).eq('id', job.id);
            return;
        }

        let cancelled = false;
        let halted = false;
        while (!halted) {
            if (await isCancelled(job.id)) { cancelled = true; break; }
            if ((await sentLast24h()) >= DAILY_CAP) break;

            const { data: batch, error } = await supabase.from('broadcast_recipients')
                .select('id, whatsapp_jid').eq('broadcast_id', job.id).eq('status', 'pending')
                .order('id').limit(BATCH_SIZE);
            if (error) throw error;
            if (!batch || batch.length === 0) break;

            for (const r of batch) {
                const sock = getSocket(job.session_id);
                if (!sock || !sock.user) { halted = true; break; }
                try {
                    await sock.sendMessage(r.whatsapp_jid, { text: job.message });
                    await supabase.from('broadcast_recipients')
                        .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r.id);
                } catch (e) {
                    await supabase.from('broadcast_recipients')
                        .update({ status: 'failed', error_message: String((e && e.message) || e).slice(0, 500) })
                        .eq('id', r.id);
                }
                await sleep(randomDelay());
            }
        }

        const sent = await countRecipients(job.id, 'sent');
        const failed = await countRecipients(job.id, 'failed');
        const pending = await countRecipients(job.id, 'pending');
        const status = cancelled ? 'cancelled' : (pending > 0 ? 'queued' : 'done');
        await supabase.from('broadcasts').update({
            status, sent, failed,
            finished_at: status === 'done' ? new Date().toISOString() : null,
        }).eq('id', job.id);
    }

    async function tick() {
        if (busy) return;
        busy = true;
        try {
            const job = await claimNext();
            if (job) await processJob(job);
        } catch (e) {
            console.error('[BROADCAST]', e.message);
        } finally {
            busy = false;
        }
    }

    return {
        start() {
            const timer = setInterval(tick, POLL_MS);
            if (timer.unref) timer.unref();
        },
        tick,
    };
}

module.exports = { enqueueBroadcast, createBroadcastWorker, HttpError };
