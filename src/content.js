// Rules text and tutorial slides.
export const RULES_HTML = `
<div class="rules">
<h2>How to play</h2>
<p>American Mahjong is played with 152 tiles: three suits (Bams, Craks, Dots) numbered 1–9, four Winds (N, E, W, S), three Dragons, eight Flowers and eight Jokers. Each suit has its own dragon: <b>Green</b> goes with Bams, <b>Red</b> with Craks and <b>White ("Soap")</b> with Dots. The White Dragon also stands for <b>0</b> in year hands like 2026.</p>
<p>Your goal is to be the first to collect 14 tiles that exactly match one hand on the <b>card</b>. Tap 📋 in a game to see the card.</p>

<h3>Reading the card</h3>
<ul>
<li>Each group of identical tiles is shown together: <b>FF</b> is a pair of flowers, <b>222</b> a pung (three), <b>2222</b> a kong (four), <b>22222</b> a quint (five).</li>
<li>Colors show suits. Green, red and blue mean three <i>different</i> suits — any suits you like, as long as same color = same suit and different colors = different suits. The colors don't mean Bams, Craks or Dots specifically.</li>
<li><b>D</b> is the dragon that matches its color's suit. <b>0</b> is the White Dragon.</li>
<li>Hands marked <b>any</b> numbers can be moved: "11 222 3333" can also be "55 666 7777" — any run that fits 1–9. Like-number hands can use any one number.</li>
<li><b>X</b> = exposed hands: you may call discards to complete groups. <b>C</b> = concealed: you may only call the very last tile, for Mahjong.</li>
<li>The number on the right is the hand's value.</li>
</ul>

<h3>The Charleston</h3>
<p>Before play, everyone trades unwanted tiles. Jokers can never be passed.</p>
<ol>
<li><b>First Charleston</b> (required): pass 3 tiles right, then 3 across, then 3 left.</li>
<li>On the last pass (first left) you may <b>blind pass</b>: pass 1, 2 or all 3 of the tiles you are receiving onward without looking at them, instead of tiles from your hand.</li>
<li><b>Second Charleston</b> (optional): if every player agrees, pass left, across, then right (blind pass allowed on the last). Any one player can stop it.</li>
<li><b>Courtesy pass</b>: you and the player across may trade 0–3 tiles. You trade the smaller of the two numbers you each pick.</li>
</ol>

<h3>Play</h3>
<ul>
<li>East (the dealer) starts with 14 tiles and discards first. Play moves to the right.</li>
<li>On your turn you draw a tile, then discard one.</li>
<li><b>Calling</b>: when someone discards, you may call it to complete a pung, kong, quint or sextet. You expose the group face-up on your rack and then discard; play continues from you. Exposures must fit a hand on the card.</li>
<li>You may only call a discard for a <b>pair or single</b> if it gives you Mahjong.</li>
<li>If more than one player wants a tile, Mahjong beats an exposure; otherwise the player next in turn wins.</li>
<li>A discarded Joker can't be called.</li>
</ul>

<h3>Jokers</h3>
<ul>
<li>A Joker can stand in for any tile in a group of 3 or more (pung, kong, quint, sextet) — including flowers.</li>
<li>Jokers can <b>never</b> be used for a single tile or a pair.</li>
<li><b>Joker swap</b>: on your turn, if any exposed group (anyone's) has a Joker standing for a tile you hold, you may trade your tile for that Joker.</li>
</ul>

<h3>Dead hands</h3>
<p>Your hand is <b>dead</b> if you declare Mahjong with a hand that doesn't match the card, or if your exposures can't fit any hand on the card. A dead hand keeps drawing and discarding but can't call tiles or win, and still pays the winner.</p>

<h3>Winning and scoring</h3>
<ul>
<li>Declare <b>Mahjong</b> when your 14 tiles match a hand — from a tile you drew or a discard you called.</li>
<li>Won on a discard: the discarder pays double the hand's value and everyone else pays the value.</li>
<li>Self-drawn: everyone pays double.</li>
<li>Jokerless: a hand with no Jokers is worth double (except Pairs hands, which can't use jokers anyway).</li>
<li>If the wall runs out first, it's a <b>wall game</b>: nobody wins or pays.</li>
<li>The deal moves to the right after every hand.</li>
</ul>

<h3>Two-player game</h3>
<p>Two players sit across from each other with no bots. All Charleston passes go across (3 passes, then an optional 3 more); there is no courtesy pass. The loser pays double on a discard win or on a self-drawn win. Everything else is the same.</p>

<h3>About the card</h3>
<p>The built-in <b>Practice Card</b> was made for this app and is not the official National Mah Jongg League card, which changes every year and is copyrighted. If you own an official card, you can type its hands into the <b>Card editor</b> for your own play.</p>
<p>In this app, the computer checks every hand for you. With <b>Assist</b> on (Settings), it only offers calls and Mahjong that are allowed. Turn Assist off for "real table" rules, where a wrong Mahjong call kills your hand.</p>
</div>`;

export const TUTORIAL = [
  { title: 'Welcome!', body: 'American Mahjong is a rummy-style game with tiles. You want 14 tiles that match one hand on the card. This short tour shows you how.', tiles: ['b1', 'c5', 'd9', 'E', 'R', 'F', 'J'] },
  { title: 'The tiles', body: 'Three suits, numbered 1–9: Bams (sticks), Craks (characters) and Dots (circles). Plus Winds N E W S, three Dragons, Flowers and Jokers.', tiles: ['b3', 'c3', 'd3', 'N', 'E', 'W', 'S'] },
  { title: 'Dragons', body: 'Each suit has a dragon: Green for Bams, Red for Craks, White ("Soap") for Dots. On the card, D means "the dragon that matches this suit". The White Dragon also counts as 0.', tiles: ['G', 'R', 'O'] },
  { title: 'Jokers', body: 'A Joker can replace any tile in a group of 3 or more. Never in a single or a pair. Jokers can never be passed in the Charleston.', tiles: ['J', 'd7', 'd7', 'J'] },
  { title: 'The card', body: 'Tap 📋 any time to see the card. Same color = same suit. "Any" hands can slide to other numbers. X = you may call discards. C = concealed. Tap 💡 for a hint, and the card shows how close you are to each hand.', tiles: [] },
  { title: 'The Charleston', body: 'Before play you pass 3 unwanted tiles right, across, then left. Then you can vote for a second round, and finally trade up to 3 with the player across. Tap tiles to pick them, then tap Pass.', tiles: [] },
  { title: 'Your turn', body: 'You draw automatically. Tap a tile to pick it, then tap Discard (or tap the same tile again). If your 14 tiles match a hand, tap Mahjong!', tiles: [] },
  { title: 'Calling', body: 'When someone discards a tile you can use for a pung (3) or kong (4), buttons pop up — tap one to take the tile and show the group. You can only take a tile for a pair if it wins the game.', tiles: [] },
  { title: 'Have fun!', body: 'Start with a solo game against Easy bots. Rules are under ☰ → Rules any time. Good luck!', tiles: ['F', 'J', 'F'] },
];
