// Picks a backend: live (inside Claude) or demo (anywhere else, or with ?demo).
// For production, add e.g. firebase.js with the same methods and return it here.
import { createArtifactBackend } from "./artifact.js";
import { createLocalBackend } from "./local.js";

export async function connect() {
  const forceDemo = new URLSearchParams(location.search).has("demo") || location.hash.includes("demo-data");
  if (!forceDemo) {
    try {
      const live = await Promise.race([createArtifactBackend(), new Promise(r => setTimeout(() => r(null), 12000))]);
      if (live) return live;
    } catch (e) { console.warn("Live backend unavailable, using demo", e); }
  }
  return createLocalBackend();
}
