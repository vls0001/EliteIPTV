# Roost

Where your people hang out. A Discord-style chat app (servers, DMs, hangouts, games, polls and AI) plus its marketing website.

## Files

```
roost/
  index.html              Marketing website (landing page)
  app.html                The app
  manifest.webmanifest    Lets phones install the app from the browser (PWA)
  assets/                 Icon and product screenshots
  css/
    tokens.css            Colours, fonts and themes (dark, OLED, light)
    app.css               App layout and components (desktop, tablet, phone)
    site.css              Website styles
  js/
    config.js             Name, limits, roles, emoji. Rename the app here.
    app.js                Start-up, live sync, layout, header, phone tabs, quick switcher
    state.js              Shared state, permissions, unread tracking, navigation
    lib/
      dom.js              Element builder, icons, modals, menus, toasts, formatting
      text.js             Safe message formatting (bold, links, mentions, spoilers, code)
      sound.js            Notification sounds and soundboard (synthesised, no audio files)
    backend/
      index.js            Picks a backend
      artifact.js         Live backend (Claude: shared database, presence, AI, uploads)
      local.js            Demo backend (this browser only; used anywhere else)
      seed.js             Demo data and the data model
    features/
      messages.js         Message list, reactions, edit/delete/pin, replies, threads, files
      composer.js         Message box, slash commands, @mentions, uploads, polls, games
      send.js             Posting messages, unread markers, mention notifications
      widgets.js          Polls, tic-tac-toe, rock paper scissors, trivia, dice, watch parties
      ai.js               AI bot, catch-up, translate, auto-mod, trivia questions
      servers.js          Server rail, channels, create/join/explore, settings, roles, moderation
      people.js           Avatars, profiles, friends, DMs, status, settings, themes
      panels.js           Members, pins, search, mentions inbox, thread panel
      voice.js            Hangouts with soundboard and emotes
```

## Run it locally

Any static file server works:

```
cd roost
python3 -m http.server 8000
```

Open http://localhost:8000 for the website and http://localhost:8000/app.html for the app.
Outside Claude the app runs in **demo mode** (example people, data saved in your browser). Add `?demo` to force it.

## Going to production and phones

1. **Backend:** write `js/backend/firebase.js` (or Supabase) with the same methods as `artifact.js`
   (`watchCol`, `watchDoc`, `getCol`, `getDoc`, `set`, `update`, `del`, `add`, `profiles`, `presence`, `onPeers`, `emit`, `on`, `ai`, `upload`)
   and return it from `backend/index.js`. Paths in `seed.js` map directly to Firestore collections.
2. **Phones:** the app is already responsive and installable. For app-store builds, wrap this folder with
   Capacitor (`npx cap init`, `npx cap add ios`, `npx cap add android`) and add push notifications.
3. **Voice/video:** add WebRTC (e.g. LiveKit or Daily) inside `features/voice.js`; hangout presence is already in place.
4. **Payments:** Roost+ and Server Boost are on the website but not wired up. Stripe Checkout is the quickest route.

## Slash commands

`/poll Question | A | B`, `/ttt`, `/rps`, `/trivia [topic]`, `/roll 2d6`, `/flip`, `/watch link`, `/ai question`, `/catchup`, `/shrug`, `/tableflip`, `/me action`
