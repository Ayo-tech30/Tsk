const admin = require('firebase-admin');

// ============================================================
// FIREBASE SERVICE ACCOUNT - Already configured with your creds
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": "nexo-violet",
  "private_key_id": "a7eea1699c3de416c2c1082962077e03bd5a1004",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD24VQoEwD/pNme\nkFAlmu+PwwqkMC0rsGbXE4pfAKwIv3CvNWQGvWKsCodzQ3frmdePhY8HOjteLTKy\nHc4f8BkkoA9orsD0FgYgEMcBFBf7p5n0TedRbSvCa7mpcykt/pkOK12pPakAsP+O\nKhji9wQ2+61vDohf1YEJ3wYfcX8Vvk688uGym1X3MopQrWvXr4gkTr0aZ5WNFxaz\nJr9erjBGuO40kvFlIZ+aPr+c6Fj1t08aSEHS0bpHD+6BrmhQuet1z6toX/E6hnlj\nSFWT/s0K3L+0SYmV+stjGugxsKcNvA9GTrJ8cBOjouo2HGgiMeQzcKG6N6hRt3Qf\n/sL99CmXAgMBAAECggEAa6eCbR8sVk3qX4yKhntzb3sbjtE7QUvg7HSm6BqA6ieg\n2aYsggvflSnaOtb22hPxvbH91qb78GtBKg55LdAjBqeNUJazqTxZW241eTDr7F7/\ncVrvPcCfTl5vTYbcNCRLVbRvWTd8FMMaDUIqK/6PJfLFhCIQMcoGROmt39Q8GJxS\ns/SAT99MfBUNKFofwE2NgNLYs0RZKUcfjFQAeZIbfokOTrQFQfZc2NoJGLVoQpnh\nv0EtcgCphsiNA6N3pWZBHmRf0Bc2aucTXktZZ/HM9TNU2/jK18A0tulNXBHInSIW\nhEITaXNKrPk+qXma7MVQ4Mjh6cu3s6U6x7sNmp4rwQKBgQD8ubceFIdee4n1gEbz\nybIsMsRYhVu87vI8PpB2poDFrtSySijdiQwVkxoAN/zjR0/kprWuMGcnkGJfKp1b\n2jpvlJUvwQ3nFR7byEjiWMSfjE0fYK8Oa2nTyo38zvLWAiHk+KZkMJA2uakxipOd\nlJcPaHb5rctlIhVi9Esy9NRwUQKBgQD6FDmO3qsQ6UWjgqtxtWbiquUotNHUqWSA\nRZRueNbtSK41ymVP8yCam2zlNT24geZPldrzWTFxjmcCTfqbQzk/v5GtgmL7xsun\nziQpleOCsX5IfcM7gZwyPhM7fkSXdJnT9rA+222YJoORxKr9Mq338WOWN1WxZHDU\nlqkkPR4pZwKBgCfgkgFgEeAZtDIVtJxhFgkdVZf2KvyL45MX+CmQqj8HEC61vu79\n4fdBh9fC/ddK+FNG7uH2Z0B56tvDWKMWsyPKGSQ43R26Wm0plD6K7TOTqtOpqNWo\no0E08+SRLwYPvhNoHLEwbIEGGKlliVdTC+b1f9hz0OU7VI6Rp4/5y8+RAoGBAIy8\naRAAO+FOhkRYu0dIwVf6uPBJonS9x7NwdPIey0XKS1A2UQHHX6fipEvxxIRbhlNv\nkEK3BV5Ut5/SZqCOGl/H3aH56N6sp9wN5MgKdHkOjnUZYY/Rhye3S3eFvfBGTHO/\nNryJHIot0olsVpYbuU/55wOYrH8ieWUKTLH6O0ktAoGBALrEJReLJvwaRt4xnEkR\nHF6BNmuX7CD96bfMlEYdVtuykhcOWusi9RVYbrgJb0Afhe9GoBakPdY2ds/lQvSg\nTYf8b1blnjaqW6LtwKQXee+tju1PXkPmacDJNa9O4/Qa6R05ENhIF2x03YB9FDjC\nkEHVF2CzfdVvjd5p/kLaEsFt\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@nexo-violet.iam.gserviceaccount.com",
  "client_id": "108955771584722856465",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40nexo-violet.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
  };

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
  });
}

const db = admin.firestore();

// ============================================================
// DATABASE HELPER FUNCTIONS
// ============================================================

const Database = {
  // Users
  async getUser(jid) {
    const doc = await db.collection('users').doc(jid).get();
    return doc.exists ? doc.data() : null;
  },
  async setUser(jid, data) {
    await db.collection('users').doc(jid).set(data, { merge: true });
  },
  async updateUser(jid, data) {
    await db.collection('users').doc(jid).update(data);
  },

  // Economy
  async getBalance(jid) {
    const user = await this.getUser(jid);
    return user ? (user.balance || 0) : 0;
  },
  async addBalance(jid, amount) {
    const user = await this.getUser(jid) || { balance: 0 };
    await this.setUser(jid, { balance: (user.balance || 0) + amount });
  },
  async removeBalance(jid, amount) {
    const user = await this.getUser(jid) || { balance: 0 };
    const newBal = Math.max(0, (user.balance || 0) - amount);
    await this.setUser(jid, { balance: newBal });
    return newBal;
  },

  // Groups
  async getGroup(groupId) {
    const doc = await db.collection('groups').doc(groupId).get();
    return doc.exists ? doc.data() : {};
  },
  async setGroup(groupId, data) {
    await db.collection('groups').doc(groupId).set(data, { merge: true });
  },

  // Warns
  async getWarns(jid, groupId) {
    const doc = await db.collection('warns').doc(`${groupId}_${jid}`).get();
    return doc.exists ? (doc.data().warns || 0) : 0;
  },
  async addWarn(jid, groupId, reason) {
    const ref = db.collection('warns').doc(`${groupId}_${jid}`);
    const doc = await ref.get();
    const warns = doc.exists ? (doc.data().warns || 0) : 0;
    await ref.set({ warns: warns + 1, reasons: admin.firestore.FieldValue.arrayUnion(reason) }, { merge: true });
    return warns + 1;
  },
  async resetWarns(jid, groupId) {
    await db.collection('warns').doc(`${groupId}_${jid}`).delete();
  },

  // Banned users
  async isBanned(jid) {
    const doc = await db.collection('banned').doc(jid).get();
    return doc.exists;
  },
  async banUser(jid) {
    await db.collection('banned').doc(jid).set({ banned: true, at: Date.now() });
  },
  async unbanUser(jid) {
    await db.collection('banned').doc(jid).delete();
  },

  // Blacklist
  async getBlacklist(groupId) {
    const doc = await db.collection('blacklist').doc(groupId).get();
    return doc.exists ? (doc.data().words || []) : [];
  },
  async addBlacklist(groupId, word) {
    await db.collection('blacklist').doc(groupId).set({
      words: admin.firestore.FieldValue.arrayUnion(word.toLowerCase())
    }, { merge: true });
  },
  async removeBlacklist(groupId, word) {
    await db.collection('blacklist').doc(groupId).set({
      words: admin.firestore.FieldValue.arrayRemove(word.toLowerCase())
    }, { merge: true });
  },

  // Activity tracking
  async logActivity(jid, groupId) {
    const key = `${groupId}_${jid}`;
    await db.collection('activity').doc(key).set({
      jid, groupId, count: admin.firestore.FieldValue.increment(1), last: Date.now()
    }, { merge: true });
  },
  async getGroupActivity(groupId) {
    const snap = await db.collection('activity').where('groupId', '==', groupId).orderBy('count', 'desc').limit(10).get();
    return snap.docs.map(d => d.data());
  },

  // AFK
  async setAFK(jid, reason) {
    await db.collection('afk').doc(jid).set({ reason, since: Date.now() });
  },
  async getAFK(jid) {
    const doc = await db.collection('afk').doc(jid).get();
    return doc.exists ? doc.data() : null;
  },
  async removeAFK(jid) {
    await db.collection('afk').doc(jid).delete();
  },

  // Cards
  async getCards(jid) {
    const doc = await db.collection('cards').doc(jid).get();
    return doc.exists ? (doc.data().cards || []) : [];
  },
  async addCard(jid, card) {
    await db.collection('cards').doc(jid).set({
      cards: admin.firestore.FieldValue.arrayUnion(card)
    }, { merge: true });
  },

  // Richlist
  async getRichlist(groupId) {
    const snap = await db.collection('users').where('groupId', '==', groupId).orderBy('balance', 'desc').limit(10).get();
    return snap.docs.map(d => ({ jid: d.id, ...d.data() }));
  },
  async getGlobalRichlist() {
    const snap = await db.collection('users').orderBy('balance', 'desc').limit(10).get();
    return snap.docs.map(d => ({ jid: d.id, ...d.data() }));
  },

  // Stardust
  async getStardust(jid) {
    const user = await this.getUser(jid);
    return user ? (user.stardust || 0) : 0;
  },
  async addStardust(jid, amount) {
    await this.setUser(jid, { stardust: admin.firestore.FieldValue.increment(amount) });
  },

  // Spawn cards
  async setSpawn(spawnId, data) {
    await db.collection('spawns').doc(spawnId).set(data, { merge: true });
  },
  async getSpawn(spawnId) {
    const doc = await db.collection('spawns').doc(spawnId).get();
    return doc.exists ? doc.data() : null;
  },

  // Daily cooldown
  async getDailyCooldown(jid) {
    const doc = await db.collection('cooldowns').doc(`daily_${jid}`).get();
    return doc.exists ? doc.data().timestamp : 0;
  },
  async setDailyCooldown(jid) {
    await db.collection('cooldowns').doc(`daily_${jid}`).set({ timestamp: Date.now() });
  },

  // Generic cooldown (for dig/fish/beg/claim)
  async getCooldown(key) {
    try {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      const doc = await db.collection('cooldowns').doc(safeKey).get();
      return doc.exists ? doc.data().timestamp : 0;
    } catch { return 0; }
  },
  async setCooldown(key, timestamp) {
    try {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      await db.collection('cooldowns').doc(safeKey).set({ timestamp });
    } catch {}
  },

  // Spawn by short ID (6-char code)
  async getSpawnByShortId(shortId) {
    try {
      const snap = await db.collection('spawns')
        .where('shortId', '==', shortId.toUpperCase())
        .where('claimed', '==', false)
        .limit(1).get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch { return null; }
  },
  async claimSpawn(spawnDocId) {
    try {
      await db.collection('spawns').doc(spawnDocId).update({
        claimed: true,
        claimedAt: Date.now(),
      });
    } catch {}
  },

  // Sudo list
  async getSudoList() {
    try {
      const doc = await db.collection('config').doc('sudo').get();
      return doc.exists ? (doc.data().numbers || []) : [];
    } catch { return []; }
  },
  async addSudo(number) {
    try {
      await db.collection('config').doc('sudo').set({
        numbers: admin.firestore.FieldValue.arrayUnion(number)
      }, { merge: true });
    } catch {}
  },
  async removeSudo(number) {
    try {
      await db.collection('config').doc('sudo').set({
        numbers: admin.firestore.FieldValue.arrayRemove(number)
      }, { merge: true });
    } catch {}
  },
};

module.exports = { db, admin, Database };
