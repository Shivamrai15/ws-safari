import { JamMode, JamSettings } from "./types";

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 16;

export const defaultSettings = (mode: JamMode): JamSettings => ({
    mode,
    guestsCanControlPlayback: true,
    guestsCanAddSongs: true,
    guestsCanReorderAndRemove: false,
    joinApproval: "OPEN",
    maxMembers: 8,
    endWhenHostLeaves: mode === "HOST_SPEAKER",
});

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const mergeSettings = (base: JamSettings, patch: unknown): JamSettings => {
    if (!patch || typeof patch !== "object") return base;
    const input = patch as Record<string, unknown>;
    const next: JamSettings = { ...base };

    if (input.mode === "EVERYONE_PLAYS" || input.mode === "HOST_SPEAKER") next.mode = input.mode;
    if (input.joinApproval === "OPEN" || input.joinApproval === "HOST_APPROVES") next.joinApproval = input.joinApproval;
    if (isBoolean(input.guestsCanControlPlayback)) next.guestsCanControlPlayback = input.guestsCanControlPlayback;
    if (isBoolean(input.guestsCanAddSongs)) next.guestsCanAddSongs = input.guestsCanAddSongs;
    if (isBoolean(input.guestsCanReorderAndRemove)) next.guestsCanReorderAndRemove = input.guestsCanReorderAndRemove;
    if (isBoolean(input.endWhenHostLeaves)) next.endWhenHostLeaves = input.endWhenHostLeaves;
    if (typeof input.maxMembers === "number" && Number.isFinite(input.maxMembers)) {
        next.maxMembers = Math.min(MAX_MEMBERS, Math.max(MIN_MEMBERS, Math.round(input.maxMembers)));
    }

    return next;
};
