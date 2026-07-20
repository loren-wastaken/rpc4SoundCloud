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
import { ApplicationAssetUtils, FluxDispatcher } from "@webpack/common";

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
        description: "Discord Application ID (from the Developer Portal). Required for artwork to render — without one, Discord shows a placeholder instead of the real cover art.",
        default: "",
    },
});

let socket: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentTrackStartedAt: number | null = null;
let lastTrackKey: string | null = null;

// Discord doesn't accept arbitrary image URLs directly in `assets.large_image`
// — it has to be an asset ID resolved against a real, registered Application.
// This is the same lookup CustomRPC and arRPC use internally. It fails
// (returns nothing useful) if no valid appId is configured, so we treat that
// as "no artwork" rather than crashing.
async function resolveArtwork(appId: string, url: string): Promise<string | undefined> {
    try {
        const [assetId] = await ApplicationAssetUtils.fetchAssetIds(appId, [url]);
        return assetId;
    } catch (e) {
        console.error("[rpc4SoundCloud] failed to resolve artwork asset", e);
        return undefined;
    }
}

async function buildActivity(data: NowPlaying): Promise<Activity | undefined> {
    if (!data.title) return undefined;

    // Track "start" timestamp resets whenever the track itself changes,
    // so the little elapsed-time bar on the profile behaves like Spotify's.
    const trackKey = `${data.title}::${data.artist}`;
    if (trackKey !== lastTrackKey) {
        lastTrackKey = trackKey;
        currentTrackStartedAt = Date.now();
    }

    const appId = settings.store.appId || "0";

    const activity: Activity = {
        application_id: appId,
        name: "SoundCloud",
        details: data.title,
        state: data.artist || undefined,
        type: ActivityType.LISTENING,
        flags: 1 << 0,
    };

    if (data.playing && currentTrackStartedAt) {
        activity.timestamps = { start: currentTrackStartedAt };
    }

    if (data.artworkUrl && settings.store.appId) {
        const assetId = await resolveArtwork(appId, data.artworkUrl);
        if (assetId) {
            activity.assets = {
                large_image: assetId,
                large_text: data.title,
            };
        }
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

    socket.onmessage = async event => {
        try {
            const data: NowPlaying | null = JSON.parse(event.data);
            pushActivity(data ? await buildActivity(data) : undefined);
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