/*
 * rpc4SoundCloud — Vencord plugin
 *
 * Connects (as a WebSocket *client*) to the local relay server, and every
 * time it gets a fresh "now playing" payload from the SoundCloud tab, it
 * dispatches a LOCAL_ACTIVITY_UPDATE — the exact same Flux action the
 * built-in CustomRPC plugin uses to push a Rich Presence to Discord.
 *
 * Drop this folder into your Vencord source tree at:
 *   src/userplugins/rpc4SoundCloud/index.tsx
 * then run `pnpm build` (or your usual dev build command) and enable
 * "rpc4SoundCloud" in Settings > Plugins.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { FluxDispatcher } from "@webpack/common";

interface NowPlaying {
    title: string | null;
    artist: string | null;
    artworkUrl: string | null;
    playing: boolean;
    url: string;
}

export const settings = definePluginSettings({
    relayPort: {
        type: OptionType.NUMBER,
        description: "Port the local rpc4SoundCloud relay server is listening on",
        default: 6989,
    },
    appId: {
        type: OptionType.STRING,
        description: "Optional Discord Application ID (from the Developer Portal) to brand the activity. Leave blank to use a generic one.",
        default: "",
    },
});

let socket: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentTrackStartedAt: number | null = null;
let lastTrackKey: string | null = null;

function buildActivity(data: NowPlaying): Activity | undefined {
    if (!data.title) return undefined;

    // Track "start" timestamp resets whenever the track itself changes,
    // so the little elapsed-time bar on the profile behaves like Spotify's.
    const trackKey = `${data.title}::${data.artist}`;
    if (trackKey !== lastTrackKey) {
        lastTrackKey = trackKey;
        currentTrackStartedAt = Date.now();
    }

    const activity: Activity = {
        application_id: settings.store.appId || "0",
        name: "SoundCloud",
        details: data.title,
        state: data.artist || undefined,
        type: ActivityType.LISTENING,
        flags: 1 << 0,
    };

    if (data.playing && currentTrackStartedAt) {
        activity.timestamps = { start: currentTrackStartedAt };
    }

    if (data.artworkUrl) {
        // Discord's Rich Presence assets accept a direct external image URL
        // here, not just pre-registered application asset keys. If the
        // artwork doesn't render for other people, the usual fallback is
        // prefixing it as `mp:external/<url>` — worth trying if this doesn't
        // just work.
        activity.assets = {
            large_image: data.artworkUrl,
            large_text: data.title,
        };
    }

    return activity;
}

function pushActivity(activity: Activity | undefined) {
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: activity ?? null,
        socketId: "rpc4SoundCloud",
    });
}

function connect() {
    const port = settings.store.relayPort || 6989;
    socket = new WebSocket(`ws://127.0.0.1:${port}`);

    socket.onopen = () => console.log("[rpc4SoundCloud] connected to relay");

    socket.onmessage = event => {
        try {
            const data: NowPlaying | null = JSON.parse(event.data);
            pushActivity(data ? buildActivity(data) : undefined);
        } catch (e) {
            console.error("[rpc4SoundCloud] bad payload from relay", e);
        }
    };

    socket.onclose = () => {
        pushActivity(undefined); // clear presence when we lose the browser side
        reconnectTimeout = setTimeout(connect, 3000);
    };

    socket.onerror = () => socket?.close();
}

function disconnect() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    socket?.close();
    socket = null;
    pushActivity(undefined);
    lastTrackKey = null;
    currentTrackStartedAt = null;
}

export default definePlugin({
    name: "rpc4SoundCloud",
    description: "Shows what you're listening to on SoundCloud as a Discord Rich Presence, fed live from a browser extension.",
    authors: [{ name: "you", id: 0n }],
    settings,

    start() {
        connect();
    },
    stop() {
        disconnect();
    },
});