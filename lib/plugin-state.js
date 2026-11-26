"use strict";
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "nexa-disabled-plugins.json");
let cachedNames = [];
let cachedMtime = -1;
let lastCheckAt = 0;

function base(name) {
    return path.basename(String(name || "")).toLowerCase();
}

function read() {
    const now = Date.now();
    if (now - lastCheckAt < 2000) return [...cachedNames];
    lastCheckAt = now;
    try {
        const stat = fs.statSync(FILE);
        if (stat.mtimeMs !== cachedMtime) {
            const value = JSON.parse(fs.readFileSync(FILE, "utf8"));
            cachedNames = Array.isArray(value)
                ? [...new Set(value.map(base).filter(Boolean))]
                : [];
            cachedMtime = stat.mtimeMs;
        }
    } catch {
        cachedNames = [];
        cachedMtime = -1;
    }
    return [...cachedNames];
}

function write(names) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const unique = [...new Set(names.map(base).filter(Boolean))];
    fs.writeFileSync(FILE, JSON.stringify(unique, null, 2));
    cachedNames = unique;
    lastCheckAt = Date.now();
    try {
        cachedMtime = fs.statSync(FILE).mtimeMs;
    } catch {
        cachedMtime = -1;
    }
}

function isDisabled(filename) {
    return read().includes(base(filename));
}

function setDisabled(filename, disabled) {
    const name = base(filename);
    if (!name.endsWith(".js") || name === "nexa-ai.js") {
        throw new Error("Invalid plugin filename");
    }
    const names = read().filter(item => item !== name);
    if (disabled) names.push(name);
    write(names);
    return [...names];
}

module.exports = { read, isDisabled, setDisabled };
