"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeSettings = exports.defaultSettings = exports.MAX_MEMBERS = exports.MIN_MEMBERS = void 0;
exports.MIN_MEMBERS = 2;
exports.MAX_MEMBERS = 16;
const defaultSettings = (mode) => ({
    mode,
    guestsCanControlPlayback: true,
    guestsCanAddSongs: true,
    guestsCanReorderAndRemove: false,
    joinApproval: "OPEN",
    maxMembers: 8,
    endWhenHostLeaves: mode === "HOST_SPEAKER",
});
exports.defaultSettings = defaultSettings;
const isBoolean = (value) => typeof value === "boolean";
const mergeSettings = (base, patch) => {
    if (!patch || typeof patch !== "object")
        return base;
    const input = patch;
    const next = Object.assign({}, base);
    if (input.mode === "EVERYONE_PLAYS" || input.mode === "HOST_SPEAKER")
        next.mode = input.mode;
    if (input.joinApproval === "OPEN" || input.joinApproval === "HOST_APPROVES")
        next.joinApproval = input.joinApproval;
    if (isBoolean(input.guestsCanControlPlayback))
        next.guestsCanControlPlayback = input.guestsCanControlPlayback;
    if (isBoolean(input.guestsCanAddSongs))
        next.guestsCanAddSongs = input.guestsCanAddSongs;
    if (isBoolean(input.guestsCanReorderAndRemove))
        next.guestsCanReorderAndRemove = input.guestsCanReorderAndRemove;
    if (isBoolean(input.endWhenHostLeaves))
        next.endWhenHostLeaves = input.endWhenHostLeaves;
    if (typeof input.maxMembers === "number" && Number.isFinite(input.maxMembers)) {
        next.maxMembers = Math.min(exports.MAX_MEMBERS, Math.max(exports.MIN_MEMBERS, Math.round(input.maxMembers)));
    }
    return next;
};
exports.mergeSettings = mergeSettings;
