// The screen's side of the page around it (Kindroid guide, "A screen"): a locked frame that talks to its parent with
// postMessage.
//   { kin: "kins" }                  -> { kin: "kins", ok, kins: [{ id, name }], current? }   (also pushed on change)
//   { kin: "files.read", path }      -> { kin: "files.read", path, body }                    (body null: no file yet)
//   { kin: "files.write", path, body } -> { kin: "files.write", path, ok }
// As Clotheskin learned: the page may not listen yet when the frame starts, so the handshake and reads are sent again
// until answered. A reply names only the path, so there is one read per path at a time (repeats share it), and writes
// of one path go in order.

export class Channel {
  constructor({ post, subscribe, timeouts }) {
    this.post = post;
    this.t = Object.assign({ connect: 4000, resend: 500, read: 12000, readResend: 1500, write: 10000 }, timeouts || {});
    this.waiting = {};
    this.reads = {};
    this.writes = {};
    this.kinsListeners = [];
    this.heard = false;
    subscribe((data) => this.onMessage(data));
  }

  onMessage(data) {
    if (!data || typeof data !== 'object' || typeof data.kin !== 'string') return;
    this.heard = true;
    if (data.kin === 'kins') {
      const kins = data.ok === false || !Array.isArray(data.kins) ? [] : data.kins.filter((k) => k && typeof k.id === 'string').map((k) => ({ id: k.id, name: typeof k.name === 'string' && k.name.trim() ? k.name.trim() : 'Kin' }));
      const current = typeof data.current === 'string' ? data.current : null;
      this.kinsListeners.slice().forEach((fn) => fn(kins, current));
      return;
    }
    const queue = this.waiting[`${data.kin}:${data.path}`];
    const entry = queue && queue.shift();
    if (entry) { clearTimeout(entry.timer); clearInterval(entry.resend); entry.resolve(data); }
  }

  wait(key, { timeout, resend, message }) {
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      const queue = this.waiting[key] || (this.waiting[key] = []);
      queue.push(entry);
      entry.timer = setTimeout(() => {
        clearInterval(entry.resend);
        const i = queue.indexOf(entry);
        if (i >= 0) queue.splice(i, 1);
        reject(new Error('Kindroid did not answer.'));
      }, timeout);
      this.post(message);
      if (resend) entry.resend = setInterval(() => this.post(message), resend);
    });
  }

  /** The attached Kins, asked again every half second until the page answers. Resolves { kins, current }. */
  kins(timeout) {
    return new Promise((resolve, reject) => {
      const off = this.onKins((kins, current) => { done(); resolve({ kins, current }); });
      const resend = setInterval(() => this.post({ kin: 'kins' }), this.t.resend);
      const timer = setTimeout(() => { done(); reject(new Error('Kindroid did not answer.')); }, timeout || this.t.connect);
      function done() { off(); clearInterval(resend); clearTimeout(timer); }
      this.post({ kin: 'kins' });
    });
  }

  onKins(fn) {
    this.kinsListeners.push(fn);
    return () => { this.kinsListeners = this.kinsListeners.filter((f) => f !== fn); };
  }

  /** A file as text, or null when it does not exist yet. */
  read(path) {
    if (!this.reads[path]) {
      this.reads[path] = this.wait(`files.read:${path}`, { timeout: this.t.read, resend: this.t.readResend, message: { kin: 'files.read', path } })
        .then((r) => (typeof r.body === 'string' ? r.body : r.body == null ? null : JSON.stringify(r.body)))
        .finally(() => { delete this.reads[path]; });
    }
    return this.reads[path];
  }

  write(path, body) {
    const prev = this.writes[path] || Promise.resolve();
    const next = prev.catch(() => {}).then(() => this.wait(`files.write:${path}`, { timeout: this.t.write, message: { kin: 'files.write', path, body } }))
      .then((r) => { if (r.ok === false) throw new Error(`Kindroid did not save ${path}.`); return true; });
    this.writes[path] = next;
    return next;
  }
}

/** The channel of a screen inside a frame (null when opened as a plain page). */
export function frameChannel(win) {
  if (!win.parent || win.parent === win) return null;
  return new Channel({
    post: (m) => win.parent.postMessage(m, '*'),
    subscribe: (fn) => win.addEventListener('message', (e) => { if (e.source === win.parent) fn(e.data); }),
  });
}
