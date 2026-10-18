// Brand and app-wide settings. Change the name here and it updates everywhere.
export const APP = {
  name: "Roost",
  version: "1.0",
  tagline: "Where your people hang out.",
  botId: "bot",
  botName: "Roost AI",
  keepDays: 60,          // messages older than this are cleaned up
  pageSize: 100,         // messages loaded per conversation
  maxUploadMB: 20,
};

export const ROLES = {
  owner: { label: "Owner", color: "#FBBF24", rank: 3 },
  mod: { label: "Mod", color: "#60A5FA", rank: 2 },
  member: { label: "Member", color: "", rank: 1 },
};

export const STATUSES = {
  online: { label: "Online", color: "var(--ok)" },
  idle: { label: "Idle", color: "var(--idle)" },
  dnd: { label: "Do not disturb", color: "var(--dnd)" },
  invisible: { label: "Invisible", color: "var(--dim)" },
};

export const ACCENTS = {
  mono: null,
  amber: ["#FBBF24", "#1A1100"],
  green: ["#4ADE80", "#04210F"],
  blue: ["#60A5FA", "#04142B"],
  violet: ["#A78BFA", "#170A33"],
  pink: ["#F472B6", "#2B0718"],
  red: ["#F87171", "#2B0707"],
};

export const SERVER_COLORS = ["#FBBF24", "#4ADE80", "#60A5FA", "#A78BFA", "#F472B6", "#F87171", "#2DD4BF", "#FB923C"];

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "👀"];

export const EMOJI = {
  Smileys: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖".split(" "),
  Gestures: "👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🫡 🫶 👀 🧠".split(" "),
  Hearts: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ 💫 ⭐ 🌟 🔥 💯 💥 💢 💤".split(" "),
  Fun: "🎉 🎊 🎈 🎁 🏆 🥇 🎮 🕹️ 🎲 ♟️ 🎯 🎳 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🎧 🎤 🎬 🍿 🎵 🎶 📸 💻 📱 ⌨️ 🖥️ 🚀 🛸 🌙 ☀️ 🌈 ⚡ ❄️ 🌊".split(" "),
  Food: "🍕 🍔 🍟 🌭 🌮 🌯 🍜 🍣 🍩 🍪 🎂 🍰 🍫 🍿 ☕ 🍵 🧋 🍺 🍻 🥂 🍷 🥤 🍎 🍌 🍓 🥑 🌶️".split(" "),
  Animals: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐙 🦈 🐬 🐳 🐢 🦖".split(" "),
};

export const SERVER_ICONS = "🎮 🏠 ⚽ 🎵 🎬 📚 💻 🍕 🚀 🌙 🔥 🐦 🎨 🏀 🧠 💬 🎲 🌿".split(" ");

export const BLOCKED_WORDS_DEFAULT = [];
