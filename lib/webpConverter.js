const fs = require('fs')
const os = require('os')
const path = require('path')
const { exec } = require('child_process')


let ffmpegPath
try { ffmpegPath = require('ffmpeg-static') } catch { ffmpegPath = 'ffmpeg' }

const run = (command) =>
    new Promise((resolve, reject) =>
        exec(command, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                err.stderr = stderr
                reject(err)
            } else {
                resolve(stderr || '')
            }
        })
    )

const makeWorkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'webpconv-'))
const cleanup = (dir) => {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

/**
 * Animated WebP එකේ frames PNG files විදියට extract කරනවා (sharp)
 * @returns {{ frames: number, fps: number }}
 */
async function extractFrames(webpBuffer, dir) {
    const sharp = require('sharp')
    const meta = await sharp(webpBuffer).metadata()
    const pages = meta.pages || 1

    
    let fps = 15
    if (Array.isArray(meta.delay) && meta.delay.length) {
        const avg = meta.delay.reduce((a, b) => a + b, 0) / meta.delay.length
        if (avg > 0) fps = Math.min(30, Math.max(5, Math.round(1000 / avg)))
    }

    let written = 0
    for (let i = 0; i < pages; i++) {
        try {
            await sharp(webpBuffer, { page: i })
                .png()
                .toFile(path.join(dir, `frame_${String(written).padStart(4, '0')}.png`))
            written++
        } catch {  }
    }

    if (written === 0) throw new Error('WebP එකෙන් frames extract කරන්න බැරි වුණා.')
    return { frames: written, fps }
}


async function webp2png(webpBuffer) {
    const sharp = require('sharp')
    return await sharp(webpBuffer).png().toBuffer()
}


async function webp2gif(webpBuffer) {
    const dir = makeWorkDir()
    const palette = path.join(dir, 'palette.png')
    const output = path.join(dir, 'out.gif')

    try {
        const { fps } = await extractFrames(webpBuffer, dir)
        const input = path.join(dir, 'frame_%04d.png')
        const scale =
            `fps=${fps},scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,` +
            'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000'

        await run(`"${ffmpegPath}" -y -framerate ${fps} -i "${input}" -vf "${scale},palettegen" "${palette}"`)
        await run(
            `"${ffmpegPath}" -y -framerate ${fps} -i "${input}" -i "${palette}" ` +
            `-lavfi "${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" -loop 0 "${output}"`
        )

        if (!fs.existsSync(output)) throw new Error('GIF file එක හැදුණේ නැහැ.')
        const buf = fs.readFileSync(output)
        if (!buf.length) throw new Error('GIF file එක හිස්.')
        return buf
    } finally {
        cleanup(dir)
    }
}

async function detectCropBox(framePath) {
    try {
        const out = await run(`"${ffmpegPath}" -i "${framePath}" -vf "cropdetect=24:2:0" -frames:v 1 -f null -`)
        const matches = [...out.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
        if (!matches.length) return null
        const [, w, h, x, y] = matches[matches.length - 1]
        return { w: +w, h: +h, x: +x, y: +y }
    } catch {
        return null
    }
}

/**
 * Animated sticker (WebP) -> MP4
 * @param {Buffer} webpBuffer
 * @param {{ fillMode?: 'pad' | 'cover' }} options
 */
async function webp2mp4(webpBuffer, { fillMode = 'pad' } = {}) {
    const dir = makeWorkDir()
    const output = path.join(dir, 'out.mp4')

    try {
        const { fps } = await extractFrames(webpBuffer, dir)
        const input = path.join(dir, 'frame_%04d.png')

        let filter
        if (fillMode === 'cover') {
            let strip = ''
            const box = await detectCropBox(path.join(dir, 'frame_0000.png'))
            if (box && (box.w < 512 || box.h < 512)) {
                strip = `crop=${box.w}:${box.h}:${box.x}:${box.y},`
            }
            filter = `${strip}scale=512:512:flags=lanczos:force_original_aspect_ratio=increase,crop=512:512`
        } else {
            filter =
                'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,' +
                'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black'
        }

        await run(
            `"${ffmpegPath}" -y -framerate ${fps} -i "${input}" -vf "${filter}" ` +
            `-c:v libx264 -pix_fmt yuv420p -movflags +faststart "${output}"`
        )

        if (!fs.existsSync(output)) throw new Error('MP4 file එක හැදුණේ නැහැ.')
        const buf = fs.readFileSync(output)
        if (!buf.length) throw new Error('MP4 file එක හිස්.')
        return buf
    } finally {
        cleanup(dir)
    }
}

module.exports = { webp2png, webp2gif, webp2mp4 }
