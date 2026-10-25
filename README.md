# Mahjong Night

American-style mahjong in the browser: solo against bots, or online with friends by room code. No accounts.

- Play: https://nicknaiser.github.io/mahjong/
- Built-in Practice Card is original to this app (not the NMJL card); use the Card editor to enter your own.

## Development

    npm install
    npm test          # rules tests + bot-vs-bot simulations
    npm run build     # writes dist/index.html, dist/artifact.html and docs/index.html (the website)

`docs/` is what GitHub Pages serves.
