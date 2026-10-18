// Interactive message cards: polls, games, dice, watch parties.
import { h, icon, toast, fmtTime } from "../lib/dom.js";
import { S, nameOf, write } from "../state.js";

const upd = (path, data, what) => write(() => S.api.update(path, data), what);

// ---------- polls ----------
export function pollCard(m, path) {
  const p = m.poll; if (!p) return null;
  const votes = p.votes || {};
  const counts = p.options.map(() => 0);
  for (const uid in votes) if (votes[uid] >= 0 && votes[uid] < counts.length) counts[votes[uid]]++;
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = votes[S.me];
  const card = h("div", { class: "card poll" }, h("div", { class: "card-hd" }, icon("poll", 16), h("b", { text: p.q })));
  p.options.forEach((opt, i) => {
    const pct = total ? Math.round(counts[i] / total * 100) : 0;
    const voters = Object.keys(votes).filter(u => votes[u] === i);
    card.append(h("button", {
      type: "button", class: "poll-opt" + (mine === i ? " mine" : ""), disabled: p.closed || !S.api.canWrite,
      title: voters.map(nameOf).join(", "),
      onclick: () => upd(path, { poll: { votes: { [S.me]: mine === i ? -1 : i } } }, "vote"),
    }, h("span", { class: "poll-bar", style: { width: pct + "%" } }), h("span", { class: "poll-label", text: opt }), h("span", { class: "poll-n", text: counts[i] + (total ? " · " + pct + "%" : "") })));
  });
  card.append(h("div", { class: "card-ft" }, h("span", { class: "dim", text: total + (total === 1 ? " vote" : " votes") + (p.closed ? " · closed" : "") }),
    m.by === S.me && !p.closed ? h("button", { type: "button", class: "link-btn", onclick: () => upd(path, { poll: { closed: true } }, "close the poll") }, "Close poll") : null));
  return card;
}

// ---------- tic-tac-toe ----------
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function tttWinner(b) {
  for (const [a, c, d] of LINES) if (b[a] !== "-" && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.includes("-") ? null : "draw";
}
function tttCard(m, path, g) {
  const myMark = g.x === S.me ? "x" : g.o === S.me ? "o" : null;
  const canJoin = !g.o && g.x !== S.me && !g.winner;
  let status;
  if (g.winner === "draw") status = "It's a draw.";
  else if (g.winner) status = nameOf(g[g.winner]) + " wins! 🏆";
  else if (!g.o) status = "Waiting for someone to join as O";
  else status = (g.turn === myMark ? "Your turn" : nameOf(g[g.turn]) + "'s turn") + " (" + g.turn.toUpperCase() + ")";
  const grid = h("div", { class: "ttt" });
  [...g.board].forEach((c, i) => {
    const can = !g.winner && myMark && g.turn === myMark && c === "-" && g.o;
    grid.append(h("button", { type: "button", class: "ttt-cell " + c, disabled: !can, "aria-label": "Cell " + (i + 1) + (c !== "-" ? ", " + c.toUpperCase() : ""),
      onclick: () => {
        const b = g.board.slice(0, i) + myMark + g.board.slice(i + 1);
        upd(path, { game: { board: b, turn: myMark === "x" ? "o" : "x", winner: tttWinner(b) } }, "make that move");
      } }, c === "-" ? "" : c.toUpperCase()));
  });
  return h("div", { class: "card game" },
    h("div", { class: "card-hd" }, icon("game", 16), h("b", { text: "Tic-tac-toe" }), h("span", { class: "dim grow-r", text: nameOf(g.x) + " vs " + (g.o ? nameOf(g.o) : "?") })),
    grid,
    h("div", { class: "card-ft" }, h("span", { text: status }),
      canJoin ? h("button", { type: "button", class: "btn sm primary", onclick: () => upd(path, { game: { o: S.me } }, "join the game") }, "Play as O") : null));
}

// ---------- rock paper scissors ----------
const RPS = { r: "🪨 Rock", p: "📄 Paper", s: "✂️ Scissors" };
const beats = { r: "s", p: "r", s: "p" };
function rpsCard(m, path, g) {
  const picks = g.picks || {};
  const players = [g.a, g.b].filter(Boolean);
  const done = g.b && picks[g.a] && picks[g.b];
  const amIn = players.includes(S.me);
  let result = "";
  if (done) {
    const pa = picks[g.a], pb = picks[g.b];
    result = pa === pb ? "Draw! Both picked " + RPS[pa] : nameOf(beats[pa] === pb ? g.a : g.b) + " wins with " + RPS[beats[pa] === pb ? pa : pb];
  }
  const canJoin = !g.b && g.a !== S.me;
  const canPick = (amIn || canJoin) && !picks[S.me] && !done;
  return h("div", { class: "card game" },
    h("div", { class: "card-hd" }, icon("game", 16), h("b", { text: "Rock, paper, scissors" }), h("span", { class: "dim grow-r", text: nameOf(g.a) + " vs " + (g.b ? nameOf(g.b) : "?") })),
    h("div", { class: "rps-row" }, players.map(u => h("div", { class: "rps-p" }, h("b", { text: nameOf(u) }), h("span", { class: "rps-pick", text: done ? RPS[picks[u]] : picks[u] ? "Locked in 🔒" : "Thinking…" })))),
    canPick ? h("div", { class: "rps-btns" }, Object.keys(RPS).map(k => h("button", { type: "button", class: "btn", onclick: () => {
      const patch = { game: { picks: { [S.me]: k } } };
      if (canJoin) patch.game.b = S.me;
      upd(path, patch, "pick");
    } }, RPS[k]))) : null,
    h("div", { class: "card-ft" }, h("span", { text: done ? result : !g.b ? "Waiting for an opponent" : picks[S.me] ? "Waiting for the other pick" : "" })));
}

// ---------- trivia ----------
export const TRIVIA_BANK = [
  { q: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Neptune", "Mars"], answer: 1 },
  { q: "What year did the first iPhone come out?", options: ["2005", "2007", "2009", "2010"], answer: 1 },
  { q: "Which game features a character called Master Chief?", options: ["Destiny", "Halo", "Gears of War", "Doom"], answer: 1 },
  { q: "How many hearts does an octopus have?", options: ["1", "2", "3", "8"], answer: 2 },
  { q: "What's the best-selling video game of all time?", options: ["Tetris", "GTA V", "Minecraft", "Mario Kart 8"], answer: 2 },
  { q: "Which country invented pizza margherita?", options: ["Greece", "Italy", "USA", "France"], answer: 1 },
  { q: "What does 'GG' stand for?", options: ["Get Going", "Good Game", "Great Goal", "Go Green"], answer: 1 },
  { q: "Which element has the symbol 'Au'?", options: ["Silver", "Gold", "Argon", "Aluminium"], answer: 1 },
  { q: "In Among Us, what are the bad guys called?", options: ["Traitors", "Imposters", "Spies", "Mimics"], answer: 1 },
  { q: "What's the largest ocean?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2 },
  { q: "Which band released 'Bohemian Rhapsody'?", options: ["The Beatles", "Queen", "ABBA", "Oasis"], answer: 1 },
  { q: "How many players are on a football (soccer) team on the pitch?", options: ["9", "10", "11", "12"], answer: 2 },
  { q: "Which Pokémon is #25 in the Pokédex?", options: ["Eevee", "Pikachu", "Charmander", "Jigglypuff"], answer: 1 },
  { q: "What's the hardest natural substance?", options: ["Quartz", "Diamond", "Graphene", "Titanium"], answer: 1 },
  { q: "Which company makes the PlayStation?", options: ["Nintendo", "Microsoft", "Sony", "Sega"], answer: 2 },
  { q: "What's the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
  { q: "Which animal is the fastest on land?", options: ["Lion", "Cheetah", "Horse", "Greyhound"], answer: 1 },
  { q: "In Minecraft, what do you need to make a Nether portal?", options: ["Bedrock", "Obsidian", "Netherrack", "Glowstone"], answer: 1 },
  { q: "How many minutes are in a day?", options: ["1,240", "1,440", "1,640", "2,400"], answer: 1 },
  { q: "Who painted the Mona Lisa?", options: ["Michelangelo", "Van Gogh", "Leonardo da Vinci", "Picasso"], answer: 2 },
];
function triviaCard(m, path, g) {
  const answers = g.answers || {};
  const over = Date.now() >= g.endsAt;
  const mine = answers[S.me];
  const right = Object.keys(answers).filter(u => answers[u] === g.answer);
  return h("div", { class: "card game trivia" },
    h("div", { class: "card-hd" }, icon("sparkle", 16), h("b", { text: "Trivia" }), h("span", { class: "dim grow-r" + (over ? "" : " tick"), "data-ends": over ? null : g.endsAt, text: over ? "Finished" : Math.ceil((g.endsAt - Date.now()) / 1000) + "s left" })),
    h("p", { class: "trivia-q", text: g.q }),
    h("div", { class: "trivia-opts" }, g.options.map((o, i) => h("button", {
      type: "button", disabled: over || mine !== undefined || !S.api.canWrite,
      class: "trivia-opt" + (mine === i ? " mine" : "") + (over && i === g.answer ? " right" : "") + (over && mine === i && i !== g.answer ? " wrong" : ""),
      onclick: () => upd(path, { game: { answers: { [S.me]: i } } }, "answer"),
    }, h("span", { text: "ABCD"[i] }), o))),
    h("div", { class: "card-ft" }, h("span", { text: over ? (right.length ? "Got it right: " + right.map(nameOf).join(", ") : "Nobody got it! The answer was " + g.options[g.answer]) : Object.keys(answers).length + " answered" + (mine !== undefined ? " · you're locked in" : "") })));
}

export function gameCard(m, path) {
  const g = m.game; if (!g) return null;
  if (g.type === "ttt") return tttCard(m, path, g);
  if (g.type === "rps") return rpsCard(m, path, g);
  if (g.type === "trivia") return triviaCard(m, path, g);
  return null;
}

// ---------- dice & coin ----------
export function rollDice(expr) {
  const mm = String(expr || "1d6").toLowerCase().match(/^(\d{0,2})d(\d{1,4})$/);
  const n = Math.min(20, Math.max(1, +(mm && mm[1] || 1))), sides = Math.min(1000, Math.max(2, +(mm && mm[2] || 6)));
  const results = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  return { expr: n + "d" + sides, results, total: results.reduce((a, b) => a + b, 0) };
}
export function rollCard(m) {
  const r = m.roll; if (!r) return null;
  if (r.coin) return h("div", { class: "card roll" }, h("span", { class: "roll-big", text: r.coin === "heads" ? "🪙 Heads" : "🪙 Tails" }));
  return h("div", { class: "card roll" }, icon("dice", 18), h("span", { class: "dim", text: r.expr }), h("span", { class: "roll-big", text: r.total }), r.results.length > 1 ? h("span", { class: "dim", text: "(" + r.results.join(" + ") + ")" }) : null);
}

// ---------- watch party ----------
export function watchCard(m, path) {
  const w = m.watch; if (!w) return null;
  const now = Date.now();
  const host = m.by === S.me;
  let state;
  if (!w.startAt) state = h("span", { text: host ? "Start the countdown when everyone's ready." : "Waiting for " + nameOf(m.by) + " to start." });
  else if (now < w.startAt) state = h("span", { class: "watch-cd tick", "data-ends": w.startAt, "data-label": "Press play in ", text: "Press play in " + Math.ceil((w.startAt - now) / 1000) });
  else state = h("span", { text: "Started at " + fmtTime(w.startAt) + ". Press play now if you haven't!" });
  return h("div", { class: "card watch" },
    h("div", { class: "card-hd" }, icon("film", 16), h("b", { text: "Watch party" })),
    h("a", { class: "watch-link", href: w.url, target: "_blank", rel: "noopener noreferrer" }, icon("play", 16), h("span", { text: w.title || w.url })),
    h("div", { class: "card-ft" }, state,
      host ? h("button", { type: "button", class: "btn sm primary", onclick: () => upd(path, { watch: { startAt: Date.now() + 5000 } }, "start the countdown") }, w.startAt ? "Restart" : "Start countdown") : null));
}

export function newTTT() { return { kind: "game", text: "", game: { type: "ttt", board: "---------", x: S.me, o: null, turn: "x", winner: null } }; }
export function newRPS() { return { kind: "game", text: "", game: { type: "rps", a: S.me, b: null, picks: {} } }; }
export function newTrivia(q) { return { kind: "game", text: "", game: Object.assign({ type: "trivia", answers: {}, endsAt: Date.now() + 30000 }, q) }; }
export function newPoll(q, options) { return { kind: "poll", text: q, poll: { q, options, votes: {} } }; }
export function newWatch(url, title) {
  if (!/^https?:\/\//i.test(url)) { toast("Use a full link starting with https://"); return null; }
  return { kind: "watch", text: "", watch: { url, title: title || url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60), startAt: null } };
}
