// Example data for demo mode only (never written to the live database).
//
// Data model (same paths in every backend):
//   users/{uid}                         profile: bio, pronouns, banner, status, custom, activity, servers[], blocked[]
//   servers/{sid}                       name, icon, color, desc, ownerId, invite, welcome, rules, filter[], aiMod, emoji{}, lastAt
//   servers/{sid}/channels/{cid}        name, type (text|voice|announce), topic, order, slowmode, lastAt, lastBy
//   servers/{sid}/members/{uid}         role (owner|mod|member), joinedAt, mutedUntil
//   servers/{sid}/bans/{uid}            by, at, reason
//   .../channels/{cid}/messages/{mid}   by, text, at, edited, replyTo, reactions{emoji:{uid:true}}, files[], pinned, kind, poll, game, watch
//   .../messages/{mid}/replies/{rid}    thread replies
//   dms/{dmId}                          members[], group, name, lastAt, lastBy, lastText
//   dms/{dmId}/messages/{mid}
//   friends/{a__b}                      users[], from, state (pending|accepted), at
//   inbox/{uid}/items/{id}              mentions and replies for that person
//   data/users/{uid}/reads              private read markers

export const DEMO_ME = { id: "me", name: "You", color: "#E4E4E7" };

export const DEMO_PEOPLE = [
  { id: "u-sam", name: "Sam", color: "#FBBF24", online: true, voice: "s-lads/c-lounge", status: "online", activity: "Playing Helldivers 2", bio: "Railgun enjoyer. Usually on after 9." },
  { id: "u-priya", name: "Priya", color: "#4ADE80", online: true, status: "idle", custom: "cooking 🍜", bio: "Final year CS. Ask me about Rust." },
  { id: "u-marcus", name: "Marcus", color: "#60A5FA", online: false, status: "online", bio: "Clips guy." },
  { id: "u-jordan", name: "Jordan", color: "#A78BFA", online: true, status: "dnd", custom: "at work till 6", bio: "" },
  { id: "u-aisha", name: "Aisha", color: "#F472B6", online: false, status: "online", activity: "Listening to Fred again..", bio: "Sunday league captain ⚽" },
];

export function seedDemo(put, me) {
  const now = Date.now();
  const m = mins => now - mins * 60000;
  const R = (...ids) => Object.fromEntries(ids.map(i => [i, true]));

  put("users/" + me, { bio: "", status: "online", servers: ["s-lads", "s-flat"], blocked: [], joinedAt: m(60 * 24 * 30) });
  for (const p of DEMO_PEOPLE) put("users/" + p.id, { bio: p.bio, status: p.status, custom: p.custom || "", activity: p.activity || "", servers: [], blocked: [], banner: p.color, joinedAt: m(60 * 24 * 40) });

  // The Lads
  put("servers/s-lads", { name: "The Lads", icon: "🎮", color: "#60A5FA", desc: "Games, clips and chaos.", ownerId: me, createdAt: m(60 * 24 * 30), invite: "lads22", welcome: "Welcome to The Lads 👋 Grab a role, say hi in #general and check #announcements.", rules: "1. Be decent.\n2. No spoilers outside #spoilers.\n3. Clips go in #clips.", filter: [], aiMod: false, emoji: {}, lastAt: m(2) });
  const lads = [
    ["c-announce", "announcements", "announce", "News from the mods", 0],
    ["c-general", "general", "text", "Anything goes", 1],
    ["c-clips", "clips", "text", "Best bits from sessions", 2],
    ["c-memes", "memes", "text", "Quality not guaranteed", 3],
    ["c-lounge", "Lounge", "voice", "", 4],
    ["c-squad", "Squad", "voice", "", 5],
  ];
  for (const [id, name, type, topic, order] of lads) put("servers/s-lads/channels/" + id, { name, type, topic, order, slowmode: 0, lastAt: type === "voice" ? 0 : m(order === 1 ? 2 : 90 + order * 30), lastBy: "u-sam" });
  put("servers/s-lads/members/" + me, { role: "owner", joinedAt: m(60 * 24 * 30) });
  put("servers/s-lads/members/u-sam", { role: "mod", joinedAt: m(60 * 24 * 29) });
  for (const id of ["u-priya", "u-marcus", "u-jordan", "u-aisha"]) put("servers/s-lads/members/" + id, { role: "member", joinedAt: m(60 * 24 * 20) });

  const g = "servers/s-lads/channels/c-general/messages/";
  put(g + "g1", { by: "u-marcus", text: "anyone on later?", at: m(60 * 26), kind: "text", reactions: { "👀": R("u-sam", "u-jordan") } });
  put(g + "g2", { by: "u-sam", text: "did you see the patch notes 😭 they nerfed the railgun AGAIN", at: m(60 * 3), kind: "text", reactions: { "😭": R("u-marcus", "u-priya", me) }, threadCount: 2, threadLastAt: m(50) });
  put(g + "g2/replies/t1", { by: "u-marcus", text: "it's over for us", at: m(60) });
  put(g + "g2/replies/t2", { by: "u-priya", text: "skill issue tbh", at: m(50) });
  put(g + "g3", { by: "u-priya", text: "**Reminder:** bins go out tonight. That means you <@" + me + ">", at: m(45), kind: "text", pinned: true });
  put(g + "g4", { by: "u-jordan", text: "what are we playing this weekend", at: m(30), kind: "poll", poll: { q: "What are we playing this weekend?", options: ["Helldivers 2", "Rocket League", "Minecraft", "Something new"], votes: { "u-sam": 0, "u-marcus": 0, "u-priya": 2, "u-jordan": 1 } } });
  put(g + "g5", { by: "u-sam", text: "helldivers obviously", at: m(20), kind: "text", replyTo: { id: "g4", by: "u-jordan", text: "what are we playing this weekend" } });
  put(g + "g6", { by: "u-marcus", text: "first to 3 wins, loser buys pizza", at: m(8), kind: "game", game: { type: "ttt", board: "x-o-x----", x: "u-marcus", o: "u-sam", turn: "o", winner: null } });
  put(g + "g7", { by: "u-sam", text: "here's the map we were talking about https://example.com/maps/creek", at: m(2), kind: "text" });

  put("servers/s-lads/channels/c-announce/messages/a1", { by: me, text: "Server's open! Invite code is **lads22**. Be nice.", at: m(60 * 24 * 3), kind: "text" });
  put("servers/s-lads/channels/c-clips/messages/c1", { by: "u-marcus", text: "Friday's best moment: Sam falling off the map ||again||", at: m(60 * 20), kind: "text", reactions: { "😂": R("u-priya", "u-jordan", "u-aisha") } });
  put("servers/s-lads/channels/c-memes/messages/m1", { by: "u-jordan", text: "me explaining to my boss why I need Friday off ```\nreason: squad needs me\n```", at: m(60 * 5), kind: "text" });

  // Uni Flat
  put("servers/s-flat", { name: "Uni Flat", icon: "🏠", color: "#4ADE80", desc: "Flat 4B group chat", ownerId: "u-priya", createdAt: m(60 * 24 * 60), invite: "flat4b", welcome: "Flat 4B. Bills in #bills, everything else in #general.", rules: "Wash your mugs.", filter: [], aiMod: false, emoji: {}, lastAt: m(70) });
  put("servers/s-flat/channels/c-general", { name: "general", type: "text", topic: "", order: 1, slowmode: 0, lastAt: m(70), lastBy: "u-priya" });
  put("servers/s-flat/channels/c-bills", { name: "bills", type: "text", topic: "Who owes what", order: 2, slowmode: 0, lastAt: m(60 * 30), lastBy: "u-aisha" });
  put("servers/s-flat/channels/c-kitchen", { name: "Kitchen", type: "voice", topic: "", order: 3, slowmode: 0 });
  put("servers/s-flat/members/u-priya", { role: "owner", joinedAt: m(60 * 24 * 60) });
  put("servers/s-flat/members/" + me, { role: "member", joinedAt: m(60 * 24 * 50) });
  put("servers/s-flat/members/u-aisha", { role: "mod", joinedAt: m(60 * 24 * 55) });
  put("servers/s-flat/channels/c-general/messages/f1", { by: "u-priya", text: "who left the oven on", at: m(70), kind: "text", reactions: { "💀": R("u-aisha") } });
  put("servers/s-flat/channels/c-bills/messages/b1", { by: "u-aisha", text: "Internet is £8.50 each this month", at: m(60 * 30), kind: "text" });

  // A server you're not in yet (shows in Explore)
  put("servers/s-five", { name: "Five-a-side", icon: "⚽", color: "#F472B6", desc: "Sunday league, 10:30 kick off", ownerId: "u-aisha", createdAt: m(60 * 24 * 90), invite: "goal10", welcome: "Sunday 10:30. Bring shin pads.", rules: "", filter: [], aiMod: false, emoji: {}, lastAt: m(60 * 6) });
  put("servers/s-five/channels/c-general", { name: "general", type: "text", topic: "", order: 1, slowmode: 0, lastAt: m(60 * 6), lastBy: "u-aisha" });
  put("servers/s-five/members/u-aisha", { role: "owner", joinedAt: m(60 * 24 * 90) });
  put("servers/s-five/channels/c-general/messages/x1", { by: "u-aisha", text: "Need 2 more for Sunday!", at: m(60 * 6), kind: "text" });

  // DMs
  const dm = [me, "u-sam"].sort().join("__");
  put("dms/" + dm, { members: [me, "u-sam"], group: false, lastAt: m(15), lastBy: "u-sam", lastText: "you still owe me £12 for pizza btw", createdAt: m(60 * 24) });
  put("dms/" + dm + "/messages/d1", { by: me, text: "gg last night", at: m(60 * 14), kind: "text" });
  put("dms/" + dm + "/messages/d2", { by: "u-sam", text: "you still owe me £12 for pizza btw", at: m(15), kind: "text" });

  // Friends
  put("friends/" + [me, "u-sam"].sort().join("__"), { users: [me, "u-sam"], from: "u-sam", state: "accepted", at: m(60 * 24 * 20) });
  put("friends/" + [me, "u-priya"].sort().join("__"), { users: [me, "u-priya"], from: me, state: "accepted", at: m(60 * 24 * 20) });
  put("friends/" + [me, "u-jordan"].sort().join("__"), { users: [me, "u-jordan"], from: "u-jordan", state: "pending", at: m(60 * 2) });

  // Inbox
  put("inbox/" + me + "/items/i1", { by: "u-priya", at: m(45), text: "**Reminder:** bins go out tonight. That means you <@" + me + ">", where: { sid: "s-lads", cid: "c-general" }, mid: "g3", kind: "mention" });
}
