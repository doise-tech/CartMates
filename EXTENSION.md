# Cartmates

Shop together, save together. A Chrome extension (Manifest V3). On every page there is a Cartmates tab on the right edge that slides out a side drawer, and can grow to a full-page view. On product pages a Save button works like pinning to a board: pick a list or make one on the spot, then share it with a permanent invite code. You can also start a live party, see who is online while you browse, chat, like and tag, and review a shared cart. Cartmates never handles payments. It only does the maths and links you to each shop's checkout.

Backend: your `cartmates` Supabase project (Auth, Postgres with row level security, Realtime). Everything else runs in the extension.

## Two ways to see it

| | What it is | How |
| --- | --- | --- |
| Web preview | The real popup and party bar on a pretend shop, with every flow linked | `npm run build:web`, then open `dist-web/cartmates.html` |
| Extension | The same code against Supabase | `npm run build`, then load `dist/` in Chrome |

Both run the same `ui/app.js` and `ui/party-bar.js`. Only the store differs: `store/mock.js` (in memory) for the preview and tests, `store/supabase.js` for the extension.

## Flows

1. Get started: welcome, create account, sign in, permissions, your lists
2. Start a party: new list, pick a list, invite friends, party hub
3. Join a party: enter code, you joined
4. Shop together: the bar on the shop page (presence, Save item, chat)
5. Decide together: shared list, item (like, tag, discuss, claim)
6. Review and check out: cart, split between members, store links
7. Wrap up: end the party, past parties
8. Stay in the loop: activity, settings, profile, notification settings

## Data model (in Supabase)

`profiles`, `lists`, `list_members`, `parties`, `party_members`, `products`, `list_items`, `tags`, `item_tags`, `reactions`, `messages`. RPCs: `save_item` (finds or creates the product, adds it to a list), `join_party` (joins by a live party's code), and from migration `0004`: `join_list` (joins by a list's permanent code) and `reset_list_invite` (owner makes a new code). The Join box accepts either kind of code. The extension only uses the anon key; row level security decides what each person can see.

Notes on how the UI maps to it:
- Save works any time, with or without a party. If you are in a live party on that list, the item is also tagged to the party.
- The share message links to `INSTALL_URL` in `ui/share.js`. Swap it for the Chrome Web Store link when you publish.
- The toolbar icon still opens the same app as a popup (useful on pages where extensions can't add the drawer, like chrome:// pages).
- Item talk uses `messages.item_id`, so it works while a party is live.
- Activity is worked out from timestamps since you last looked. There is no background worker.
- Cart split is a calculation only (equal, or by who claimed what, plus suggested evening-out moves). Nothing is stored.

## Run it

```bash
npm install
cp .env.example .env     # paste your project URL and anon key. Never the service_role key
npm test                 # flows, party bar, split maths, price parsing
npm run build            # writes ./dist
npm run build:web        # writes ./dist-web
```

Chrome: `chrome://extensions`, turn on Developer mode, Load unpacked, pick `dist`. After changes run `npm run build` (or `npm run watch`) and reload the card.

Try it with two accounts in two browser profiles: start a party in one, send the code, join from the other, then open any shop.

## Put it on GitHub

```bash
git remote add origin https://github.com/doise-tech/CartMates.git
git push -u origin main
```

`.env` and `dist/` are git-ignored.
