/* Presales Studio — sign-in & encryption
   The application code, effort catalogue and rate card are published only in
   encrypted form (AES-256-GCM). Each user's entry in /data/keys.json holds the
   content key, encrypted with a key derived from their username + password
   (PBKDF2-SHA256, 210,000 iterations). Nothing readable is published, and
   usernames are stored only as hashes. */
window.PSAuth = (function () {
  var enc = new TextEncoder(), dec = new TextDecoder();
  var STORE = 'ps_session', HOURS = 12, ITER = 210000;

  function b64e(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function b64d(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function rnd(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  async function sha256hex(t) {
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)));
    return Array.prototype.map.call(h, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function userId(user) { return sha256hex('presales:' + String(user || '').trim().toLowerCase()); }
  async function passKey(user, pass, salt, iter, usage) {
    var base = await crypto.subtle.importKey('raw', enc.encode(String(user).trim().toLowerCase() + '\u0000' + pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage);
  }
  function rawKey(b64, usage) { return crypto.subtle.importKey('raw', b64d(b64), { name: 'AES-GCM' }, false, usage); }

  function save(o) { o.exp = Date.now() + HOURS * 3600e3; try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { try { sessionStorage.setItem(STORE, JSON.stringify(o)); } catch (e2) {} } }
  function session() {
    var raw = null;
    try { raw = localStorage.getItem(STORE) || sessionStorage.getItem(STORE); } catch (e) {}
    try { var o = JSON.parse(raw || 'null'); if (!o || !o.k || Date.now() > o.exp) { signOut(); return null; } return o; } catch (e) { return null; }
  }
  function signOut() { try { localStorage.removeItem(STORE); sessionStorage.removeItem(STORE); } catch (e) {} }

  async function login(user, pass) {
    var kf = await (await fetch('/data/keys.json', { cache: 'no-store' })).json();
    var id = await userId(user), e = kf.users[id];
    var iter = kf.iter || ITER;
    // always derive, so a wrong username takes as long as a wrong password
    var key = await passKey(user, pass, e ? b64d(e.salt) : rnd(16), iter, ['decrypt']);
    if (!e) return null;
    try {
      var p = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(e.iv) }, key, b64d(e.ct))));
      var s = { k: p.k, name: p.name, role: p.role, user: p.user };
      save(s); return s;
    } catch (err) { return null; }
  }

  async function decryptText(url) {
    var s = session(); if (!s) throw new Error('not signed in');
    var f = await (await fetch(url, { cache: 'no-cache' })).json();
    var k = await rawKey(s.k, ['decrypt']);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(f.iv) }, k, b64d(f.ct)));
  }
  async function encryptText(text) {
    var s = session(); if (!s) throw new Error('not signed in');
    var k = await rawKey(s.k, ['encrypt']), iv = rnd(12);
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(text));
    return JSON.stringify({ v: 1, iv: b64e(iv), ct: b64e(ct) });
  }
  /* Admin: create a keys.json entry for a new user (wraps the current content key). */
  async function makeUser(user, pass, name, role) {
    var s = session(); if (!s) throw new Error('not signed in');
    var salt = rnd(16), iv = rnd(12);
    var key = await passKey(user, pass, salt, ITER, ['encrypt']);
    var payload = JSON.stringify({ k: s.k, name: name, role: role, user: String(user).trim().toLowerCase() });
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(payload));
    return { id: await userId(user), entry: { salt: b64e(salt), iv: b64e(iv), ct: b64e(ct) } };
  }
  function genPassword() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', b = rnd(14), s = '';
    for (var i = 0; i < b.length; i++) s += A[b[i] % A.length];
    return 'Ps-' + s.slice(0, 7) + '-' + s.slice(7);
  }
  return { login: login, session: session, signOut: signOut, decryptText: decryptText, encryptText: encryptText, makeUser: makeUser, userId: userId, genPassword: genPassword, HOURS: HOURS };
})();
