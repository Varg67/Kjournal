// The screen's entry. Inside Kindroid it is a locked frame: it connects to the page around it, then starts the app.
import { JOURNAL_FILE } from '../core/constants.js';
import { frameChannel } from './channel.js';
import { startApp } from './app.js';
import { h, fill } from './dom.js';
import { icon } from './icons.js';

const FILES_ONLY_AFTER_MS = 1500;

export function boot() {
  const root = document.getElementById('app');
  if (!root) return;
  const channel = frameChannel(window);
  if (!channel) {
    message(root, 'Journal is a Kindroid app: open it from Apps in Kindroid. To try it on a computer, run npm start and open the page it prints.');
    return;
  }
  // Connected when the page lists the Kins. A page that answers files but not the Kins also counts after a moment:
  // the App Library takes the card's picture from sample/ with no Kindroid around.
  let done = false;
  const go = (kins, current) => {
    if (done) return;
    done = true;
    startApp({ root, channel, kins, current });
  };
  channel.kins(8000).then(({ kins, current }) => go(kins, current), () => { if (!channel.heard) message(root, 'The page around Journal did not answer. Close and reopen the app; Kindroid may be busy.'); });
  channel.read(JOURNAL_FILE).then(() => setTimeout(() => go(null, null), FILES_ONLY_AFTER_MS), () => {});
}

function message(root, text) {
  fill(root, h('div', { class: 'card-msg' }, icon('book', 28), h('h2', {}, 'Journal'), h('p', {}, text)));
}
