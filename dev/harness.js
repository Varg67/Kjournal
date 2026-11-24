// The dev harness: a stand-in for Kindroid around the real screen. Kept small; window.dev drives it from tests.
import { runProgram } from '../run/program.js';

const frame = document.getElementById('screen');
const files = new Map();
const kins = [{ id: 'sample-alexi', name: 'Alexi', on: true }, { id: 'sample-quinn', name: 'Quinn', on: true }];
const $ = (id) => document.getElementById(id);
let failWrites = false;
const log = [];

function note(line) {
  log.push(line);
  $('log').textContent = log.slice(-60).join('\n');
}

function post(message) { frame.contentWindow.postMessage(message, '*'); }

function sendKins() {
  const current = $('current').value || undefined;
  post({ kin: 'kins', ok: true, kins: kins.filter((k) => k.on).map(({ id, name }) => ({ id, name })), ...(current ? { current } : {}) });
}

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || !e.data || typeof e.data.kin !== 'string') return;
  const m = e.data;
  note(`screen → ${m.kin}${m.path ? ` ${m.path}` : ''}`);
  if (m.kin === 'kins') sendKins();
  else if (m.kin === 'files.read') post({ kin: 'files.read', path: m.path, body: files.has(m.path) ? files.get(m.path) : null });
  else if (m.kin === 'files.write') {
    if (!failWrites) files.set(m.path, String(m.body));
    post({ kin: 'files.write', path: m.path, ok: !failWrites });
    drawFiles();
  }
});

function drawFiles() {
  const box = $('files');
  box.textContent = '';
  for (const [path, body] of [...files.entries()].sort()) {
    const d = document.createElement('details');
    d.className = 'file';
    const s = document.createElement('summary');
    s.textContent = `${path} (${body.length} chars)`;
    const pre = document.createElement('pre');
    pre.className = 'out';
    pre.textContent = body;
    d.append(s, pre);
    box.append(d);
  }
}

function drawKins() {
  const box = $('kins');
  box.textContent = '';
  for (const k of kins) {
    const label = document.createElement('label');
    label.className = 'row';
    const box2 = document.createElement('input');
    box2.type = 'checkbox';
    box2.checked = k.on;
    box2.onchange = () => { k.on = box2.checked; sendKins(); };
    label.append(box2, k.name);
    box.append(label);
  }
  for (const sel of [$('current'), $('act-kin')]) {
    const keep = sel.value;
    while (sel.options.length > (sel.id === 'current' ? 1 : 0)) sel.remove(sel.options.length - 1);
    for (const k of kins) sel.add(new Option(k.name, k.id));
    sel.value = keep || (sel.id === 'act-kin' ? kins[0].id : '');
  }
}

// The run's kin functions, over the same files.
const kin = { get: async (p) => (files.has(p) ? files.get(p) : null), put: async (p, t) => { files.set(p, t); drawFiles(); } };

async function act(action, input) {
  const result = await runProgram({ event: { trigger: 'action', action, input, kin: $('act-kin').value }, kin });
  $('act-out').textContent = `kin end${result.ok ? '' : ' --failed'}:\n${result.message}`;
  note(`run → ${action}: ${result.ok ? 'done' : 'failed'}`);
  return result;
}

$('act-save').onclick = () => act('save_journal_entry', { title: $('act-title').value, entry: $('act-entry').value, keyphrases: $('act-phrases').value.split(',') });
$('act-read').onclick = () => act('read_journal', { query: $('act-query').value });
$('send-kins').onclick = sendKins;
$('current').onchange = sendKins;
$('fail').onchange = (e) => { failWrites = e.target.checked; };
$('clear').onclick = () => { files.clear(); drawFiles(); frame.src = frame.src; };
$('load-sample').onclick = async () => {
  files.set('journal.json', await (await fetch('../sample/journal.json')).text());
  drawFiles();
  frame.src = frame.src;
};

window.dev = { files, kins, act, sendKins, setFail: (v) => { failWrites = v; }, reload: () => { frame.src = frame.src; } };
drawKins();
drawFiles();
