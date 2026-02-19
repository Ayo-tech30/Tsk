const { Database } = require('../database/firebase');
const config = require('../../config');
const CARDS_LIST = require('./cards').CARDS_LIST;

function getMentioned(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

module.exports = {
  async kick(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    if (!ctx.isBotAdmin) return ctx.reply('❌ Make me admin first!');
    const mentioned = getMentioned(ctx.msg);
    if (!mentioned.length) return ctx.reply('❌ Mention someone to kick!');
    for (const jid of mentioned) {
      await ctx.sock.groupParticipantsUpdate(ctx.groupId, [jid], 'remove').catch(() => {});
    }
    await ctx.reply(`✅ Kicked ${mentioned.map(j => `@${j.split('@')[0]}`).join(', ')}`);
  },

  async delete(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('❌ Admins only!');
    const quotedKey = ctx.msg.message?.extendedTextMessage?.contextInfo;
    if (!quotedKey?.quotedMessage) return ctx.reply('❌ Reply to a message to delete it!');
    const key = { remoteJid: ctx.groupId, fromMe: false, id: quotedKey.stanzaId, participant: quotedKey.participant };
    await ctx.sock.sendMessage(ctx.groupId, { delete: key }).catch(() => {});
    await ctx.reply('🗑️ Message deleted!');
  },

  async antilink(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const { groupId, body } = ctx;
    const state = body.toLowerCase();
    if (state === 'set') {
      const action = ctx.args[2]?.toLowerCase();
      if (!['kick', 'warn', 'delete'].includes(action)) return ctx.reply('❌ Valid actions: kick, warn, delete');
      await Database.setGroup(groupId, { antilink_action: action });
      return ctx.reply(`✅ Anti-link action set to: *${action}*`);
    }
    if (!['on', 'off'].includes(state)) return ctx.reply('Usage: .antilink on/off\n.antilink set [kick/warn/delete]');
    await Database.setGroup(groupId, { antilink: state === 'on' });
    await ctx.reply(`✅ Anti-link ${state === 'on' ? '🔒 enabled' : '🔓 disabled'}!`);
  },

  async warn(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const { sock, msg, groupId, body } = ctx;
    const mentioned = getMentioned(msg);
    if (!mentioned.length) return ctx.reply('❌ Mention someone to warn!');
    const reason = body.replace(/@\d+/g, '').trim() || 'No reason provided';
    for (const jid of mentioned) {
      const warns = await Database.addWarn(jid, groupId, reason);
      await sock.sendMessage(groupId, {
        text: `⚠️ *Warning Issued!*\n\n👤 User: @${jid.split('@')[0]}\n📝 Reason: ${reason}\n🔢 Warnings: ${warns}/${config.MAX_WARNS}`,
        mentions: [jid]
      }, { quoted: msg });
      if (warns >= config.MAX_WARNS) {
        await sock.groupParticipantsUpdate(groupId, [jid], 'remove').catch(() => {});
        await sock.sendMessage(groupId, { text: `🔨 @${jid.split('@')[0]} was kicked after ${config.MAX_WARNS} warnings!`, mentions: [jid] });
        await Database.resetWarns(jid, groupId);
      }
    }
  },

  async resetwarn(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const mentioned = getMentioned(ctx.msg);
    if (!mentioned.length) return ctx.reply('❌ Mention someone!');
    for (const jid of mentioned) await Database.resetWarns(jid, ctx.groupId);
    await ctx.reply(`✅ Warnings reset for ${mentioned.map(j => `@${j.split('@')[0]}`).join(', ')}`);
  },

  async groupinfo(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    try {
      const meta = await ctx.sock.groupMetadata(ctx.groupId);
      const admins = meta.participants.filter(p => p.admin).length;
      const createdAt = new Date(meta.creation * 1000).toLocaleDateString();
      await ctx.reply(
        `📋 *Group Information*\n\n` +
        `┌─────────────────\n` +
        `│ 🏷️ Name: ${meta.subject}\n` +
        `│ 👥 Members: ${meta.participants.length}\n` +
        `│ 👑 Admins: ${admins}\n` +
        `│ 📅 Created: ${createdAt}\n` +
        `│ 🆔 ID: ${ctx.groupId.split('@')[0]}\n` +
        `│ 📝 Desc: ${meta.desc || 'No description'}\n` +
        `└─────────────────`
      );
    } catch (e) { await ctx.reply('❌ Could not fetch group info!'); }
  },

  async welcome(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const state = ctx.body.toLowerCase();
    if (!['on', 'off'].includes(state)) return ctx.reply('Usage: .welcome on/off');
    await Database.setGroup(ctx.groupId, { welcome_enabled: state === 'on' });
    await ctx.reply(`✅ Welcome messages ${state === 'on' ? '🟢 enabled' : '🔴 disabled'}!`);
  },

  async setwelcome(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    if (!ctx.body) return ctx.reply('❌ Provide a welcome message!\nUse {user} for the username.');
    await Database.setGroup(ctx.groupId, { welcome_message: ctx.body });
    await ctx.reply('✅ Welcome message set!\n\nPreview:\n' + ctx.body.replace('{user}', 'NewMember'));
  },

  async leave(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const state = ctx.body.toLowerCase();
    if (!['on', 'off'].includes(state)) return ctx.reply('Usage: .leave on/off');
    await Database.setGroup(ctx.groupId, { leave_enabled: state === 'on' });
    await ctx.reply(`✅ Leave messages ${state === 'on' ? '🟢 enabled' : '🔴 disabled'}!`);
  },

  async setleave(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    if (!ctx.body) return ctx.reply('❌ Provide a leave message!\nUse {user} for username.');
    await Database.setGroup(ctx.groupId, { leave_message: ctx.body });
    await ctx.reply('✅ Leave message set!');
  },

  async promote(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    if (!ctx.isBotAdmin) return ctx.reply('❌ Make me admin first!');
    const mentioned = getMentioned(ctx.msg);
    if (!mentioned.length) return ctx.reply('❌ Mention someone to promote!');
    await ctx.sock.groupParticipantsUpdate(ctx.groupId, mentioned, 'promote').catch(() => {});
    await ctx.reply(`✅ Promoted ${mentioned.map(j => `@${j.split('@')[0]}`).join(', ')} to admin!`);
  },

  async demote(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    if (!ctx.isBotAdmin) return ctx.reply('❌ Make me admin first!');
    const mentioned = getMentioned(ctx.msg);
    if (!mentioned.length) return ctx.reply('❌ Mention someone to demote!');
    await ctx.sock.groupParticipantsUpdate(ctx.groupId, mentioned, 'demote').catch(() => {});
    await ctx.reply(`✅ Demoted ${mentioned.map(j => `@${j.split('@')[0]}`).join(', ')}!`);
  },

  async mute(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    await Database.setGroup(ctx.groupId, { muted: true });
    await ctx.reply('🔇 Group muted! Only admins can send messages.');
  },

  async unmute(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    await Database.setGroup(ctx.groupId, { muted: false });
    await ctx.reply('🔊 Group unmuted! Everyone can send messages.');
  },

  async hidetag(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const meta = await ctx.sock.groupMetadata(ctx.groupId);
    const members = meta.participants.map(p => p.id);
    await ctx.sock.sendMessage(ctx.groupId, {
      text: ctx.body || '📢 Important announcement',
      mentions: members
    });
  },

  // ============================================================
  // COOL TAGALL LAYOUT
  // ============================================================
  async tagall(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const { sock, groupId, body, msg } = ctx;
    const meta = await sock.groupMetadata(groupId);
    const members = meta.participants;
    const message = body || '📢 Attention everyone!';

    const admins = members.filter(p => p.admin);
    const regular = members.filter(p => !p.admin);

    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const adminTags = admins.map(p => `┃ 👑 @${p.id.split('@')[0]}`).join('\n');
    const memberTags = regular.map(p => `┃ 👤 @${p.id.split('@')[0]}`).join('\n');

    const tagText =
      `╭━━━━━━━━━━━━━━━━━━━╮\n` +
      `┃   🌸 *SHADOW GARDEN* 🌸   \n` +
      `┃   📢 *GROUP ANNOUNCEMENT*  \n` +
      `╰━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `┏━━━━━━━━━━━━━━━━━━━┓\n` +
      `┃ 💬 *Message*\n` +
      `┃ ${message}\n` +
      `┗━━━━━━━━━━━━━━━━━━━┛\n\n` +
      `┏━「 👑 *Admins* (${admins.length}) 」\n` +
      `${adminTags || '┃ None'}\n` +
      `┗━━━━━━━━━━━━━━━━━━━\n\n` +
      `┏━「 👥 *Members* (${regular.length}) 」\n` +
      `${memberTags}\n` +
      `┗━━━━━━━━━━━━━━━━━━━\n\n` +
      `⏰ ${time}  📅 ${date}\n` +
      `⋆☽ ᴘᴏᴡᴇʀᴇᴅ ʙʏ Sʜᴀᴅᴏᴡ Gᴀʀᴅᴇɴ ☾⋆`;

    await sock.sendMessage(groupId, {
      text: tagText,
      mentions: members.map(p => p.id)
    }, { quoted: msg });
  },

  async activity(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    const data = await Database.getGroupActivity(ctx.groupId);
    if (!data.length) return ctx.reply('📊 No activity data yet!');
    const medals = ['🥇', '🥈', '🥉'];
    const list = data.map((d, i) => `${medals[i] || `${i + 1}.`} @${d.jid.split('@')[0]} — ${d.count} msgs`).join('\n');
    await ctx.sock.sendMessage(ctx.groupId, {
      text: `📊 *Group Activity (Top 10)*\n\n${list}`,
      mentions: data.map(d => d.jid)
    }, { quoted: ctx.msg });
  },

  async active(ctx) { return module.exports.activity(ctx); },

  async inactive(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    const data = await Database.getGroupActivity(ctx.groupId);
    const meta = await ctx.sock.groupMetadata(ctx.groupId);
    const activeJids = new Set(data.map(d => d.jid));
    const inactive = meta.participants.filter(p => !activeJids.has(p.id) && !p.admin);
    if (!inactive.length) return ctx.reply('✅ Everyone is active!');
    const list = inactive.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`).join('\n');
    await ctx.sock.sendMessage(ctx.groupId, {
      text: `😴 *Inactive Members* (${inactive.length})\n\n${list}`,
      mentions: inactive.map(p => p.id)
    }, { quoted: ctx.msg });
  },

  async open(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    await ctx.sock.groupSettingUpdate(ctx.groupId, 'not_announcement');
    await ctx.reply('🔓 Group is now *open*! Everyone can send messages.');
  },

  async close(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    await ctx.sock.groupSettingUpdate(ctx.groupId, 'announcement');
    await ctx.reply('🔒 Group is now *closed*! Only admins can send messages.');
  },

  async purge(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const code = ctx.args[1];
    if (code !== 'CONFIRM') return ctx.reply('⚠️ This will remove all non-admin members!\nTo confirm: *.purge CONFIRM*');
    if (!ctx.isBotAdmin) return ctx.reply('❌ I need admin privileges!');
    const meta = await ctx.sock.groupMetadata(ctx.groupId);
    const nonAdmins = meta.participants.filter(p => !p.admin).map(p => p.id);
    await ctx.sock.groupParticipantsUpdate(ctx.groupId, nonAdmins, 'remove').catch(() => {});
    await ctx.reply(`🧹 Purged ${nonAdmins.length} members!`);
  },

  async antism(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const state = ctx.body.toLowerCase();
    if (!['on', 'off'].includes(state)) return ctx.reply('Usage: .antism on/off');
    await Database.setGroup(ctx.groupId, { antism: state === 'on' });
    await ctx.reply(`✅ Anti-spam ${state === 'on' ? '🟢 enabled' : '🔴 disabled'}!`);
  },

  async blacklist(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    if (!ctx.isAdmin) return ctx.reply('❌ Admins only!');
    const [, action, ...wordParts] = ctx.args;
    const word = wordParts.join(' ');
    if (action === 'add') {
      if (!word) return ctx.reply('Usage: .blacklist add [word]');
      await Database.addBlacklist(ctx.groupId, word);
      await ctx.reply(`✅ Added "*${word}*" to blacklist!`);
    } else if (action === 'remove') {
      if (!word) return ctx.reply('Usage: .blacklist remove [word]');
      await Database.removeBlacklist(ctx.groupId, word);
      await ctx.reply(`✅ Removed "*${word}*" from blacklist!`);
    } else if (action === 'list') {
      const words = await Database.getBlacklist(ctx.groupId);
      if (!words.length) return ctx.reply('📋 Blacklist is empty!');
      await ctx.reply(`🚫 *Blacklisted Words*\n\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`);
    } else {
      await ctx.reply('Usage:\n.blacklist add [word]\n.blacklist remove [word]\n.blacklist list');
    }
  },

  async groupstats(ctx) {
    if (!ctx.isGroup) return ctx.reply('❌ Groups only!');
    const meta = await ctx.sock.groupMetadata(ctx.groupId);
    const settings = await Database.getGroup(ctx.groupId);
    const admins = meta.participants.filter(p => p.admin).length;
    await ctx.reply(
      `📊 *Group Stats*\n\n` +
      `┌─────────────────\n` +
      `│ 👥 Members: ${meta.participants.length}\n` +
      `│ 👑 Admins: ${admins}\n` +
      `│ 🔗 Anti-link: ${settings.antilink ? '✅' : '❌'}\n` +
      `│ 🚫 Anti-spam: ${settings.antism ? '✅' : '❌'}\n` +
      `│ 👋 Welcome: ${settings.welcome_enabled ? '✅' : '❌'}\n` +
      `│ 🚪 Leave msg: ${settings.leave_enabled ? '✅' : '❌'}\n` +
      `│ 🔇 Muted: ${settings.muted ? '✅' : '❌'}\n` +
      `└─────────────────`
    );
  },

  // ============================================================
  // .sudo - Owner adds trusted numbers
  // ============================================================
  async sudo(ctx) {
    if (!ctx.isOwner) return ctx.reply('❌ Only the bot owner can use this command!');
    const num = ctx.body.replace(/[^0-9]/g, '');
    if (!num || num.length < 7) return ctx.reply('❌ Invalid number!\nUsage: .sudo 2348012345678');
    await Database.addSudo(num);
    await ctx.reply(
      `✅ *Sudo Added!*\n\n` +
      `📱 Number: *${num}*\n` +
      `✨ They can now use: .join .exit .ban .unban\n\n` +
      `To remove: *.removesudo ${num}*`
    );
  },

  async removesudo(ctx) {
    if (!ctx.isOwner) return ctx.reply('❌ Only the bot owner can use this command!');
    const num = ctx.body.replace(/[^0-9]/g, '');
    if (!num) return ctx.reply('❌ Usage: .removesudo <number>');
    await Database.removeSudo(num);
    await ctx.reply(`✅ Removed *${num}* from sudo list!`);
  },

  async listsudo(ctx) {
    if (!ctx.isOwner) return ctx.reply('❌ Only the bot owner can use this command!');
    const sudos = await Database.getSudoList();
    const all = [...new Set([...config.SUDO_NUMBERS, ...sudos])];
    await ctx.reply(`👑 *Sudo Numbers*\n\n${all.map((n, i) => `${i + 1}. ${n}${n === config.OWNER_NUMBER ? ' (Owner)' : ''}`).join('\n')}`);
  },

  // ============================================================
  // .spawncard - Spawn a card in current group or via group link
  // Usage: .spawncard [custom message]
  //        .spawncard https://chat.whatsapp.com/xxx [message]
  // ============================================================
  async spawncard(ctx) {
    if (!ctx.isOwner) return ctx.reply('❌ Only the bot owner can spawn cards!');
    const { sock, body, groupId } = ctx;
    const { getRandomInt } = require('../utils/helpers');

    // Lazy load CARDS
    let CARDS;
    try { CARDS = require('./cards').CARDS_LIST || require('./cards').CARDS; } catch {}
    if (!CARDS?.length) return ctx.reply('❌ Card list not available!');

    // Parse: .spawncard [link?] [message?]
    let targetGroupId = groupId;
    let spawnMsg = '✨ A wild card has appeared! Be the first to claim it!';

    if (body) {
      if (body.includes('chat.whatsapp.com/')) {
        const parts = body.split(' ');
        const linkCode = parts[0].split('chat.whatsapp.com/')[1];
        try {
          const info = await sock.groupGetInviteInfo(linkCode);
          targetGroupId = info.id;
          spawnMsg = parts.slice(1).join(' ') || spawnMsg;
        } catch {
          return ctx.reply('❌ Could not get group info from that link!\nMake sure the bot is already in that group.');
        }
      } else {
        spawnMsg = body;
      }
    }

    // Pick random card weighted by tier
    const tierWeights = { Common: 40, Rare: 30, Epic: 20, Legendary: 8, Mythic: 2 };
    let rand = getRandomInt(1, 100), cumulative = 0, tier = 'Common';
    for (const [t, w] of Object.entries(tierWeights)) {
      cumulative += w;
      if (rand <= cumulative) { tier = t; break; }
    }
    const tieredCards = CARDS.filter(c => c.tier === tier);
    const card = tieredCards.length
      ? tieredCards[getRandomInt(0, tieredCards.length - 1)]
      : CARDS[getRandomInt(0, CARDS.length - 1)];

    // Short claim ID (6 chars, easy to type)
    const shortId = Math.random().toString(36).substr(2, 6).toUpperCase();
    const spawnId = `spawn_${shortId}`;

    await Database.setSpawn(spawnId, {
      card,
      shortId,
      claimed: false,
      claimedBy: null,
      groupId: targetGroupId,
      spawnedAt: Date.now(),
    });

    const tierEmoji = { Common: '⚪', Rare: '🔵', Epic: '🟣', Legendary: '🟡', Mythic: '🔴' };
    const tierCooldown = { Common: 'None', Rare: '1 min', Epic: '1.5 mins', Legendary: '2 mins', Mythic: '2 mins' };

    await sock.sendMessage(targetGroupId, {
      text:
        `${card.emoji || '🃏'} ✨ *CARD SPAWNED!* ✨ ${card.emoji || '🃏'}\n\n` +
        `╭━━━━━━━━━━━━━━━━━━━╮\n` +
        `┃   🌸 *SHADOW GARDEN* 🌸   \n` +
        `┃   🎴 *CARD SPAWN EVENT*   \n` +
        `╰━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `📛 *${card.name}*\n` +
        `📺 Series: *${card.series}*\n` +
        `${tierEmoji[card.tier]} Tier: *${card.tier}*\n` +
        `⚡ Power: *${card.power}/100*\n\n` +
        `💬 _${spawnMsg}_\n\n` +
        `┏━━━━━━━━━━━━━━━━━━━┓\n` +
        `┃  🎯 *TO CLAIM TYPE:*\n` +
        `┃  *.claim ${shortId}*\n` +
        `┗━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `⏰ *First to claim wins!*\n` +
        `⏳ Claim cooldown: *${tierCooldown[card.tier]}*`
    });

    if (targetGroupId !== groupId) {
      await ctx.reply(`✅ *${card.name}* (${tier}) spawned in target group!\n🆔 Spawn ID: *${shortId}*`);
    }
  },
};
