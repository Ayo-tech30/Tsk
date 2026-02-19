const sharp = require('sharp');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

const TEMP = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP, { recursive: true });

async function downloadMedia(msg, sock) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  return await downloadMediaMessage(msg, 'buffer', {}, {
    logger: require('pino')({ level: 'silent' }),
    reuploadRequest: sock.updateMediaMessage
  });
}

function getQuotedMsg(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return {
    message: ctx.quotedMessage,
    key: { id: ctx.stanzaId, remoteJid: msg.key.remoteJid, participant: ctx.participant }
  };
}

function addExifToWebp(webpBuf, packname, author) {
  try {
    const json = JSON.stringify({
      'sticker-pack-id': `com.shadowgarden.${Date.now()}`,
      'sticker-pack-name': packname,
      'sticker-pack-publisher': author,
      'emojis': ['🌸']
    });
    const exifJson = Buffer.from(json, 'utf8');
    const pad = exifJson.length % 2 !== 0 ? Buffer.alloc(1) : Buffer.alloc(0);
    const exifChunkData = Buffer.concat([exifJson, pad]);
    const exifChunkHeader = Buffer.alloc(8);
    exifChunkHeader.write('EXIF', 0, 'ascii');
    exifChunkHeader.writeUInt32LE(exifJson.length, 4);
    const exifChunk = Buffer.concat([exifChunkHeader, exifChunkData]);

    if (webpBuf.slice(0, 4).toString('ascii') !== 'RIFF') return webpBuf;
    if (webpBuf.slice(8, 12).toString('ascii') !== 'WEBP') return webpBuf;

    const chunkType = webpBuf.slice(12, 16).toString('ascii');
    let newBuf;

    if (chunkType === 'VP8X') {
      newBuf = Buffer.concat([webpBuf, exifChunk]);
      newBuf[20] = newBuf[20] | 0x08;
      newBuf.writeUInt32LE(newBuf.length - 8, 4);
    } else {
      const vp8xFlags = Buffer.alloc(4);
      vp8xFlags.writeUInt32LE(0x08, 0);
      const canvasSize = Buffer.alloc(6);
      canvasSize.writeUIntLE(511, 0, 3);
      canvasSize.writeUIntLE(511, 3, 3);
      const vp8xChunkData = Buffer.concat([vp8xFlags, canvasSize]);
      const vp8xHeader = Buffer.alloc(8);
      vp8xHeader.write('VP8X', 0, 'ascii');
      vp8xHeader.writeUInt32LE(vp8xChunkData.length, 4);
      const vp8xChunk = Buffer.concat([vp8xHeader, vp8xChunkData]);
      newBuf = Buffer.concat([webpBuf.slice(0, 12), vp8xChunk, webpBuf.slice(12), exifChunk]);
      newBuf.writeUInt32LE(newBuf.length - 8, 4);
    }
    return newBuf;
  } catch (e) {
    return webpBuf;
  }
}

async function imageToSticker(buffer, packname, author) {
  const png = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const webp = await sharp(png)
    .webp({ quality: 80, lossless: false, alphaQuality: 100 })
    .toBuffer();
  return addExifToWebp(webp, packname, author);
}

module.exports = {
  async sticker(ctx) {
    const { sock, msg, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    const msgType = Object.keys(target.message || {})[0];

    if (!['imageMessage', 'videoMessage', 'stickerMessage', 'gifMessage'].includes(msgType)) {
      return ctx.reply('❌ Reply to an *image* or *video* to make a sticker!\n\nUsage: Reply to image/video then send *.s*');
    }

    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      if (msgType === 'imageMessage') {
        const sticker = await imageToSticker(buffer, config.STICKER_NAME, config.STICKER_AUTHOR);
        await sock.sendMessage(groupId, { sticker }, { quoted: msg });
        await ctx.react('✅');
      } else if (['videoMessage', 'gifMessage'].includes(msgType)) {
        const inPath = path.join(TEMP, `in_${Date.now()}.mp4`);
        const outPath = path.join(TEMP, `out_${Date.now()}.webp`);
        fs.writeFileSync(inPath, buffer);
        await new Promise((res, rej) => {
          exec(
            `ffmpeg -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=15" -loop 0 -t 8 -an -vsync 0 "${outPath}"`,
            { timeout: 60000 }, (err) => err ? rej(err) : res()
          );
        });
        let webpBuf = fs.readFileSync(outPath);
        webpBuf = addExifToWebp(webpBuf, config.STICKER_NAME, config.STICKER_AUTHOR);
        await sock.sendMessage(groupId, { sticker: webpBuf }, { quoted: msg });
        try { fs.unlinkSync(inPath); fs.unlinkSync(outPath); } catch {}
        await ctx.react('✅');
      }
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Sticker failed: ${e.message}\n\nFor video stickers make sure *ffmpeg* is installed!`);
    }
  },

  async take(ctx) {
    const { msg, sock, groupId, body } = ctx;
    if (!body) return ctx.reply('❌ Usage: *.take <pack name>, <author>*\nExample: .take Shadow Garden, KYNX\n\nReply to an image or sticker.');
    const parts = body.split(',');
    const packname = parts[0]?.trim() || config.STICKER_NAME;
    const author = parts[1]?.trim() || config.STICKER_AUTHOR;
    const target = getQuotedMsg(msg) || msg;
    if (!target) return ctx.reply('❌ Reply to an image or sticker!');
    const msgType = Object.keys(target.message || {})[0];
    if (!['imageMessage', 'stickerMessage'].includes(msgType)) return ctx.reply('❌ Reply to an image or sticker!');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const webp = msgType === 'imageMessage'
        ? await imageToSticker(buffer, packname, author)
        : addExifToWebp(buffer, packname, author);
      await sock.sendMessage(groupId, { sticker: webp }, { quoted: msg });
      await ctx.reply(`✅ *Sticker tagged!*\n📦 Pack: *${packname}*\n✍️ Author: *${author}*`);
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },

  async turnimg(ctx) {
    const { msg, sock, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    const msgType = Object.keys(target.message || {})[0];
    if (msgType !== 'stickerMessage') return ctx.reply('❌ Reply to a sticker to convert to image!');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const png = await sharp(buffer).png().toBuffer();
      await sock.sendMessage(groupId, { image: png, caption: '🖼️ Here you go!' }, { quoted: msg });
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },

  async rotate(ctx) {
    const { msg, sock, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    const msgType = Object.keys(target.message || {})[0];
    if (msgType !== 'imageMessage') return ctx.reply('❌ Reply to an image!\nUsage: .rotate [90/180/270]');
    const deg = parseInt(ctx.body) || 90;
    if (![90, 180, 270].includes(deg)) return ctx.reply('❌ Valid degrees: 90, 180, 270');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const rotated = await sharp(buffer).rotate(deg).toBuffer();
      await sock.sendMessage(groupId, { image: rotated, caption: `🔄 Rotated ${deg}°` }, { quoted: msg });
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },

  async turnvid(ctx) {
    const { msg, sock, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    if (!target) return ctx.reply('❌ Reply to an animated sticker!');
    const msgType = Object.keys(target.message || {})[0];
    if (msgType !== 'stickerMessage') return ctx.reply('❌ Reply to an animated sticker!');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const inPath = path.join(TEMP, `stk_${Date.now()}.webp`);
      const outPath = path.join(TEMP, `vid_${Date.now()}.mp4`);
      fs.writeFileSync(inPath, buffer);
      await new Promise((res, rej) => {
        exec(`ffmpeg -i "${inPath}" -movflags faststart -pix_fmt yuv420p -vf scale=512:512 "${outPath}"`, { timeout: 30000 }, (err) => err ? rej(err) : res());
      });
      if (fs.existsSync(outPath)) {
        const vidBuf = fs.readFileSync(outPath);
        await sock.sendMessage(groupId, { video: vidBuf, caption: '🎬 Here you go!', mimetype: 'video/mp4' }, { quoted: msg });
        try { fs.unlinkSync(inPath); fs.unlinkSync(outPath); } catch {}
        await ctx.react('✅');
      } else {
        throw new Error('Conversion produced no output');
      }
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },
};// ============================================================
// STICKER METADATA - Simple JSON EXIF chunk for WhatsApp
// ============================================================
function buildStickerExif(packname, author) {
  const json = JSON.stringify({
    'sticker-pack-id': `com.shadowgarden.${Date.now()}`,
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    'emojis': ['🌸'],
    'android-app-store-link': '',
    'ios-app-store-link': ''
  });

  const jsonBuf = Buffer.from(json, 'utf8');

  // Minimal TIFF/EXIF wrapping
  const tiffHeader = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, // LE TIFF magic
    0x08, 0x00, 0x00, 0x00, // Offset to IFD
  ]);

  // One IFD entry: UserComment (tag 0x9286), type UNDEFINED (7), count, offset
  const ifdEntryCount = Buffer.from([0x01, 0x00]);
  const ifdEntry = Buffer.alloc(12);
  ifdEntry.writeUInt16LE(0x9286, 0); // UserComment tag
  ifdEntry.writeUInt16LE(0x07, 2);   // UNDEFINED type
  ifdEntry.writeUInt32LE(jsonBuf.length, 4); // count
  ifdEntry.writeUInt32LE(tiffHeader.length + 2 + 12 + 4, 8); // offset to value
  const nextIFD = Buffer.from([0x00, 0x00, 0x00, 0x00]);

  const tiffData = Buffer.concat([tiffHeader, ifdEntryCount, ifdEntry, nextIFD, jsonBuf]);
  const exifPrefix = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const exifPayload = Buffer.concat([exifPrefix, tiffData]);

  // Pad to even length
  const padded = exifPayload.length % 2 === 1
    ? Buffer.concat([exifPayload, Buffer.from([0x00])])
    : exifPayload;

  // EXIF WebP chunk: "EXIF" + uint32LE(size) + data
  const chunk = Buffer.concat([
    Buffer.from('EXIF'),
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(padded.length, 0); return b; })(),
    padded
  ]);
  return chunk;
}

function injectStickerMetadata(webpBuf, packname, author) {
  try {
    if (webpBuf.slice(0, 4).toString() !== 'RIFF') return webpBuf;
    if (webpBuf.slice(8, 12).toString() !== 'WEBP') return webpBuf;

    const exifChunk = buildStickerExif(packname, author);
    const chunkType = webpBuf.slice(12, 16).toString();

    if (chunkType === 'VP8X') {
      // Already extended — set EXIF flag (bit 3 of flags)
      const out = Buffer.from(webpBuf);
      const flags = out.readUInt32LE(20);
      out.writeUInt32LE(flags | 0x8, 20);
      const result = Buffer.concat([out, exifChunk]);
      result.writeUInt32LE(result.length - 8, 4);
      return result;
    } else {
      // Simple format — add VP8X chunk before existing data
      const vp8xData = Buffer.alloc(10);
      vp8xData.writeUInt32LE(0x00000008, 0); // EXIF flag
      // width-1 and height-1 in 24-bit LE (use 511 = 512-1 as safe default)
      vp8xData[4] = 0xFF; vp8xData[5] = 0x01; vp8xData[6] = 0x00;
      vp8xData[7] = 0xFF; vp8xData[8] = 0x01; vp8xData[9] = 0x00;

      const vp8xSizeLE = Buffer.alloc(4);
      vp8xSizeLE.writeUInt32LE(10, 0);

      const vp8xChunk = Buffer.concat([Buffer.from('VP8X'), vp8xSizeLE, vp8xData]);
      const body = webpBuf.slice(12); // Everything after RIFF+size+WEBP

      const totalBody = Buffer.concat([vp8xChunk, body, exifChunk]);
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32LE(4 + totalBody.length, 0); // 4 = "WEBP"

      return Buffer.concat([Buffer.from('RIFF'), sizeBuf, Buffer.from('WEBP'), totalBody]);
    }
  } catch (e) {
    return webpBuf; // Return original on failure — still usable sticker
  }
}

module.exports = {
  async sticker(ctx) {
    const { sock, msg, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    const msgType = Object.keys(target.message || {})[0];

    if (!['imageMessage', 'videoMessage', 'stickerMessage', 'gifMessage'].includes(msgType)) {
      return ctx.reply('❌ Reply to an *image* or *video* to make a sticker!\n\nUsage: Reply to image/video then send *.s*');
    }

    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      if (msgType === 'imageMessage') {
        const sticker = await imageToSticker(buffer, config.STICKER_NAME, config.STICKER_AUTHOR);
        await sock.sendMessage(groupId, { sticker }, { quoted: msg });
        await ctx.react('✅');
      } else if (['videoMessage', 'gifMessage'].includes(msgType)) {
        const inPath = path.join(TEMP, `in_${Date.now()}.mp4`);
        const outPath = path.join(TEMP, `out_${Date.now()}.webp`);
        fs.writeFileSync(inPath, buffer);
        await new Promise((res, rej) => {
          exec(
            `ffmpeg -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=15" -loop 0 -t 8 -an -vsync 0 "${outPath}"`,
            { timeout: 60000 }, (err) => err ? rej(err) : res()
          );
        });
        let webpBuf = fs.readFileSync(outPath);
        webpBuf = addExifToWebp(webpBuf, config.STICKER_NAME, config.STICKER_AUTHOR);
        await sock.sendMessage(groupId, { sticker: webpBuf }, { quoted: msg });
        try { fs.unlinkSync(inPath); fs.unlinkSync(outPath); } catch {}
        await ctx.react('✅');
      }
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Sticker failed: ${e.message}\n\nFor video stickers make sure *ffmpeg* is installed!`);
    }
  },

  async take(ctx) {
    const { msg, sock, groupId, body } = ctx;
    if (!body) return ctx.reply('❌ Usage: *.take <pack name>, <author>*\nExample: .take Shadow Garden, KYNX\n\nReply to an image or sticker.');
    const parts = body.split(',');
    const packname = parts[0]?.trim() || config.STICKER_NAME;
    const author = parts[1]?.trim() || config.STICKER_AUTHOR;
    const target = getQuotedMsg(msg) || msg;
    if (!target) return ctx.reply('❌ Reply to an image or sticker!');
    const msgType = Object.keys(target.message || {})[0];
    if (!['imageMessage', 'stickerMessage'].includes(msgType)) return ctx.reply('❌ Reply to an image or sticker!');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const webp = msgType === 'imageMessage'
        ? await imageToSticker(buffer, packname, author)
        : addExifToWebp(buffer, packname, author);
      await sock.sendMessage(groupId, { sticker: webp }, { quoted: msg });
      await ctx.reply(`✅ *Sticker tagged!*\n📦 Pack: *${packname}*\n✍️ Author: *${author}*`);
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },

  async turnimg(ctx) {
    const { msg, sock, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    const msgType = Object.keys(target.message || {})[0];
    if (msgType !== 'stickerMessage') return ctx.reply('❌ Reply to a sticker to convert to image!');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const png = await sharp(buffer).png().toBuffer();
      await sock.sendMessage(groupId, { image: png, caption: '🖼️ Here you go!' }, { quoted: msg });
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },

  async rotate(ctx) {
    const { msg, sock, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    const msgType = Object.keys(target.message || {})[0];
    if (msgType !== 'imageMessage') return ctx.reply('❌ Reply to an image!\nUsage: .rotate [90/180/270]');
    const deg = parseInt(ctx.body) || 90;
    if (![90, 180, 270].includes(deg)) return ctx.reply('❌ Valid degrees: 90, 180, 270');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const rotated = await sharp(buffer).rotate(deg).toBuffer();
      await sock.sendMessage(groupId, { image: rotated, caption: `🔄 Rotated ${deg}°` }, { quoted: msg });
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },

  async turnvid(ctx) {
    const { msg, sock, groupId } = ctx;
    const target = getQuotedMsg(msg) || msg;
    if (!target) return ctx.reply('❌ Reply to an animated sticker!');
    const msgType = Object.keys(target.message || {})[0];
    if (msgType !== 'stickerMessage') return ctx.reply('❌ Reply to an animated sticker!');
    await ctx.react('⏳');
    try {
      const buffer = await downloadMedia(target, sock);
      const inPath = path.join(TEMP, `stk_${Date.now()}.webp`);
      const outPath = path.join(TEMP, `vid_${Date.now()}.mp4`);
      fs.writeFileSync(inPath, buffer);
      await new Promise((res, rej) => {
        exec(`ffmpeg -i "${inPath}" -movflags faststart -pix_fmt yuv420p -vf scale=512:512 "${outPath}"`, { timeout: 30000 }, (err) => err ? rej(err) : res());
      });
      if (fs.existsSync(outPath)) {
        const vidBuf = fs.readFileSync(outPath);
        await sock.sendMessage(groupId, { video: vidBuf, caption: '🎬 Here you go!', mimetype: 'video/mp4' }, { quoted: msg });
        try { fs.unlinkSync(inPath); fs.unlinkSync(outPath); } catch {}
        await ctx.react('✅');
      } else {
        throw new Error('Conversion produced no output');
      }
    } catch (e) {
      await ctx.react('❌');
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  },
};
