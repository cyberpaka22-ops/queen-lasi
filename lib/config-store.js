'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    throw new Error('Supabase credentials missing');
}

const supabase = createClient(url, key, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});


const defaultSettings = {
    AUTO_WELCOME: false,
    AUTO_GOODBYE: false,
    WELCOME_MESSAGE: '',
    GOODBYE_MESSAGE: ''
};

Object.assign(config, defaultSettings);


const allowed = new Set(Object.keys(config));

const SETTINGS_KEY = 'global';


async function loadConfig() {
    const { data, error } = await supabase
        .from('bot_settings')
        .select('id, setting_value, settings')
        .eq('setting_key', SETTINGS_KEY)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    if (data) {
        const saved = data.setting_value || data.settings;

        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            for (const name of allowed) {
                if (Object.prototype.hasOwnProperty.call(saved, name)) {
                    config[name] = saved[name];
                }
            }
        }
    }

    return config;
}


async function saveConfig(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('Invalid settings');
    }

    for (const [name, value] of Object.entries(patch)) {
        if (!allowed.has(name)) {
            throw new Error('Unsupported setting: ' + name);
        }

        if (Array.isArray(config[name])) {
            if (!Array.isArray(value)) {
                throw new Error('Invalid array setting: ' + name);
            }
        } else if (typeof value !== typeof config[name]) {
            throw new Error('Invalid value type: ' + name);
        }
    }

    const updatedConfig = Object.assign({}, config, patch);

    const { data: existing, error: findError } = await supabase
        .from('bot_settings')
        .select('id')
        .eq('setting_key', SETTINGS_KEY)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (findError) throw findError;

    const payload = {
        setting_key: SETTINGS_KEY,
        setting_value: updatedConfig,
        settings: updatedConfig,
        updated_at: new Date().toISOString()
    };

    let result;

    if (existing) {
        result = await supabase
            .from('bot_settings')
            .update(payload)
            .eq('id', existing.id);
    } else {
        result = await supabase
            .from('bot_settings')
            .insert(payload);
    }

    if (result.error) throw result.error;

   
    Object.assign(config, patch);

    return config;
}


module.exports = {
    loadConfig,
    saveConfig,
    allowed
};
