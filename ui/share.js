import { h } from '../lib/dom.js';

// Where friends get the extension. Swap for the Chrome Web Store link once it is published.
export const INSTALL_URL = 'https://github.com/doise-tech/cartmates';

export const inviteText = (list, installUrl = INSTALL_URL) =>
  `Join my "${list.name}" list on Cartmates so we can save and shop together.\n1. Add the Cartmates extension: ${installUrl}\n2. Open it, tap "Join with a code", and enter ${list.invite_code}`;

// The share sheet for one list: its permanent code, a ready-to-send invite, and a WhatsApp link.
// Used by the Share screen in the app and by the Save card on shop pages.
export function shareBlock({ list, canReset, onCopy, onReset, installUrl }) {
  const btn = (label, onClick, cls = '') => h('button', { class: `btn ${cls}`.trim(), type: 'button', onClick }, label);
  const text = inviteText(list, installUrl);
  return h('div', { class: 'col' },
    h('div', { class: 'card col center' },
      h('span', { class: 'label' }, `Invite code for ${list.name}`),
      h('div', { class: 'bigcode' }, list.invite_code),
      h('p', { class: 'sub' }, 'Works any time, for anyone you send it to.')),
    h('div', { class: 'row wrap' },
      btn('Copy code', () => onCopy(list.invite_code, 'Code copied'), 'grow'),
      btn('Copy invite message', () => onCopy(text, 'Invite copied'), 'grow primary')),
    h('a', { class: 'btn center', href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Send on WhatsApp'),
    h('p', { class: 'note' }, 'Friends who already have Cartmates tap "Join with a code". Friends who don’t will find the install link in your message.'),
    canReset ? h('div', { class: 'row sp' },
      h('span', { class: 'sub' }, 'Sent it to the wrong person?'),
      btn('Make a new code', onReset, 'small danger')) : null);
}
