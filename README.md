# VECTOR HAVOC (VectorGamex 2026)

Online 3D shooter. Runs in any modern browser on phone, PC or Mac. Needs a Node host (Render, Railway, a VPS...).

## Run it
    npm install
    npm start          # http://localhost:3000
Developer console: `/dev` (default PIN **8881**, change it in Security, or set the `DEV_PIN` environment variable).

## Deploy (Render)
1. Put this folder in a GitHub repo. 2. New Web Service, build `npm install`, start `node server.js`.
3. Set `DEV_PIN`. 4. For permanent saving of accounts/coins/settings, add a Disk mounted at `/data` and set `DATA_DIR=/data` (paid plan). Free hosting sleeps and forgets data on restart.
5. Optional voice over mobile data: set `TURN_URL`, `TURN_USER`, `TURN_PASS` environment variables.

## Modes
Quick Play (online pool, bots fill empty seats), Practice (Easy/Normal/Hard fair bots), Private rooms with 4-letter codes, Team Deathmatch, Free For All, Grid Control, Gun Game, Battle Royale (open world, closing grid).

## Payments (OPay)
No payment gateway is connected. Players transfer to the account number in the developer console (Store tab), then submit an order with name and phone. You see it in **Orders**, check your OPay app, press **Approve**, and coins/items are delivered instantly.

## What you can edit in /dev without code
Payment account, store items/prices/rarities/exclusives, coin packs, daily rewards, operators, weapons, modes (incl. Battle Royale circle), maps (paint, generate, open-world), branding, logo, bot difficulty, rewards, touch defaults, custom CSS/JS (push updates), music, backups.

## Install as app
Open the game in Chrome, menu, Install app / Add to Home screen. The logo comes from `public/icons` or the logo you upload in /dev (App & logo).

## New in HAVOC
- First person, third person (shoulder cam) and tactical views (V key / VIEW button). ADS, crouch, slide, jump, frag grenades, rocket launcher.
- Battle Royale squads of 4 (blue, green, yellow, orange), armor tiers 1-3, dog tags, scan-to-revive with parachute return, scorestreak UAV.
- Drivable muscle car and ATV (drift, crush) and a helicopter (pilot or passenger), blue shrinking zone, full explosion engine with scorch marks and screen shake.
- Season 1 "Neon Horizon" presented by VectorVibes: 40-tier pass, mythic guns and skins, lucky draw with disclosed odds, artist page with Spotify link. Seasons 2 and 3 lobby themes included.
- Emote wheel (B key), squad lobby, hit markers with sound, floating score text.
- Dev console (/dev): Live Gun Studio, season manager, analytics (players, ping, FPS, transactions), maps, orders.

## Honest notes
- Payments are manual: the player transfers to your OPay account, submits name and phone, you press Approve in /dev. Nothing is credited automatically. For automatic verification later, integrate Paystack or Flutterwave.
- The default OPay number is 9166388610. Check it and edit it in /dev (Store tab).
- Shooting is on a flat plane, so there are no true headshots.
- No revenue is guaranteed. Test on real phones before promoting.
