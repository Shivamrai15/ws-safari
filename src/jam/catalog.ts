import { JamSong } from "./types";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://catalog-safari.onrender.com";
const CATALOG_TIMEOUT_MS = 60 * 1000;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const MAX_BATCH = 50;

export const sanitizeSongIds = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const ids = value.filter((id): id is string => typeof id === "string" && OBJECT_ID.test(id));
    return Array.from(new Set(ids)).slice(0, MAX_BATCH);
};

export async function fetchSongs(ids: string[], token: string): Promise<JamSong[]> {
    if (ids.length === 0) return [];

    const response = await fetch(`${PUBLIC_BASE_URL}/api/v2/song/batch`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Catalog responded with ${response.status}`);
    }

    const body = await response.json() as { data?: JamSong[] };
    const songs = body.data ?? [];
    const order = new Map(ids.map((id, index) => [id, index]));
    return songs
        .filter((song) => order.has(song.id))
        .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
