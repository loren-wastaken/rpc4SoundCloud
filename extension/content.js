// rpc4SoundCloud — content.js
//
// Runs inside every soundcloud.com tab. Content scripts share the page's DOM
// and most Web APIs (including `navigator`) with the page, even though they
// run in an "isolated world" for their own JS variables. That means we can
// read `navigator.mediaSession` — the same metadata SoundCloud sets so your
// OS media keys / lock screen show "Title — Artist" — without having to
// scrape fragile CSS class names that change every SoundCloud redesign.

const RELAY_URL = "ws://localhost:6989";
const POLL_INTERVAL_MS = 1000;

let socket = null;
let reconnectDelay = 1000;
let lastPayload = null;

function connect() {
  socket = new WebSocket(RELAY_URL);

  socket.addEventListener("open", () => {
    console.log("[rpc4SoundCloud] connected to relay");
    reconnectDelay = 1000; // reset backoff
    lastPayload = null; // force a fresh send so the plugin gets current state
  });

  socket.addEventListener("close", scheduleReconnect);
  socket.addEventListener("error", () => socket.close());
}

function scheduleReconnect() {
  setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000); // exponential backoff, capped at 30s
}

function readNowPlaying() {
  const ms = navigator.mediaSession;
  if (!ms || !ms.metadata) return null;

  const { title, artist, artwork } = ms.metadata;
  // artwork is an array of {src, sizes, type}; grab the biggest one available
  const artworkUrl = Array.isArray(artwork) && artwork.length > 0
    ? artwork[artwork.length - 1].src
    : null;

  return {
    title: title || null,
    artist: artist || null,
    artworkUrl,
    // "playing" | "paused" | "none"
    playing: ms.playbackState === "playing",
    url: location.href,
  };
}

function tick() {
  const payload = readNowPlaying();
  const serialized = JSON.stringify(payload);

  // Only send when something actually changed, so we're not spamming the
  // relay (and Discord) every second with identical data.
  if (serialized !== lastPayload) {
    lastPayload = serialized;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(serialized);
    }
  }
}

connect();
setInterval(tick, POLL_INTERVAL_MS);
