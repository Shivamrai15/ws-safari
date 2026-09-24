"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reduceJam = exports.currentPosition = exports.canRun = exports.START_LEAD_MS = void 0;
const crypto_1 = require("crypto");
const settings_1 = require("./settings");
exports.START_LEAD_MS = 400;
const MAX_HISTORY = 20;
const MAX_QUEUE = 200;
const RESTART_THRESHOLD_MS = 3000;
const PLAYBACK_COMMANDS = ["PLAY", "PAUSE", "SEEK", "NEXT", "PREV", "PLAY_SONGS", "REPLACE_QUEUE", "JUMP"];
const QUEUE_EDIT_COMMANDS = ["REMOVE", "MOVE", "SHUFFLE"];
const HOST_COMMANDS = ["UPDATE_SETTINGS", "KICK", "TRANSFER_HOST"];
const canRun = (state, userId, type) => {
    if (state.hostId === userId)
        return true;
    if (!state.members.some((member) => member.userId === userId))
        return false;
    if (HOST_COMMANDS.includes(type))
        return false;
    if (type === "TRACK_ENDED")
        return state.settings.mode === "EVERYONE_PLAYS";
    if (type === "ADD")
        return state.settings.guestsCanAddSongs;
    if (QUEUE_EDIT_COMMANDS.includes(type))
        return state.settings.guestsCanReorderAndRemove;
    if (PLAYBACK_COMMANDS.includes(type))
        return state.settings.guestsCanControlPlayback;
    return false;
};
exports.canRun = canRun;
const currentPosition = (state, now) => {
    const { playback } = state;
    const track = state.queue[state.currentIndex];
    const durationMs = track ? track.song.duration * 1000 : 0;
    const elapsed = playback.status === "playing" ? Math.max(0, now - playback.updatedAt) : 0;
    const position = playback.positionMs + elapsed;
    return durationMs > 0 ? Math.min(position, durationMs) : position;
};
exports.currentPosition = currentPosition;
const toTracks = (songs, addedBy) => songs.map((song) => ({ itemId: (0, crypto_1.randomUUID)(), song, addedBy }));
const startAt = (state, index, now) => (Object.assign(Object.assign({}, state), { currentIndex: index, playback: { status: "playing", positionMs: 0, updatedAt: now + exports.START_LEAD_MS } }));
const trimHistory = (state) => {
    const overflow = state.currentIndex - MAX_HISTORY;
    let next = state;
    if (overflow > 0) {
        next = Object.assign(Object.assign({}, next), { queue: next.queue.slice(overflow), currentIndex: next.currentIndex - overflow });
    }
    if (next.queue.length > MAX_QUEUE) {
        next = Object.assign(Object.assign({}, next), { queue: next.queue.slice(0, MAX_QUEUE) });
    }
    return next;
};
const hasFinishedQueue = (state, now) => {
    const track = state.queue[state.currentIndex];
    return !!track &&
        state.currentIndex === state.queue.length - 1 &&
        state.playback.status === "paused" &&
        (0, exports.currentPosition)(state, now) >= track.song.duration * 1000;
};
const upcomingSongIds = (state) => new Set(state.queue.slice(Math.max(0, state.currentIndex)).map((track) => track.song.id));
const advance = (state, now) => {
    if (state.currentIndex < state.queue.length - 1) {
        return startAt(state, state.currentIndex + 1, now);
    }
    const track = state.queue[state.currentIndex];
    return Object.assign(Object.assign({}, state), { playback: { status: "paused", positionMs: track ? track.song.duration * 1000 : 0, updatedAt: now } });
};
const reduceJam = (state, command, actorId, now) => {
    if (!(0, exports.canRun)(state, actorId, command.type)) {
        return { ok: false, error: "You don't have permission to do that in this Jam" };
    }
    const unchanged = { ok: true, state, changed: false };
    switch (command.type) {
        case "PLAY": {
            if (state.queue.length === 0)
                return { ok: false, error: "Add a song to start the Jam" };
            const index = state.currentIndex < 0 ? 0 : state.currentIndex;
            const position = typeof command.positionMs === "number" ? command.positionMs : (0, exports.currentPosition)(state, now);
            return {
                ok: true,
                changed: true,
                state: Object.assign(Object.assign({}, state), { currentIndex: index, playback: { status: "playing", positionMs: Math.max(0, position), updatedAt: now + exports.START_LEAD_MS } }),
            };
        }
        case "PAUSE": {
            const position = typeof command.positionMs === "number" ? command.positionMs : (0, exports.currentPosition)(state, now);
            return {
                ok: true,
                changed: true,
                state: Object.assign(Object.assign({}, state), { playback: { status: "paused", positionMs: Math.max(0, position), updatedAt: now } }),
            };
        }
        case "SEEK": {
            if (state.currentIndex < 0)
                return unchanged;
            const playing = state.playback.status === "playing";
            return {
                ok: true,
                changed: true,
                state: Object.assign(Object.assign({}, state), { playback: Object.assign(Object.assign({}, state.playback), { positionMs: Math.max(0, command.positionMs), updatedAt: now + (playing ? exports.START_LEAD_MS : 0) }) }),
            };
        }
        case "NEXT":
            return { ok: true, changed: true, state: advance(state, now) };
        case "PREV": {
            if ((0, exports.currentPosition)(state, now) > RESTART_THRESHOLD_MS || state.currentIndex <= 0) {
                return { ok: true, changed: true, state: startAt(state, Math.max(0, state.currentIndex), now) };
            }
            return { ok: true, changed: true, state: startAt(state, state.currentIndex - 1, now) };
        }
        case "TRACK_ENDED": {
            const current = state.queue[state.currentIndex];
            if (!current || current.itemId !== command.itemId)
                return unchanged;
            return { ok: true, changed: true, state: advance(state, now) };
        }
        case "ADD": {
            const existing = upcomingSongIds(state);
            const tracks = toTracks(command.songs.filter((song) => !existing.has(song.id)), actorId);
            if (tracks.length === 0)
                return unchanged;
            const insertAt = command.next ? Math.max(0, state.currentIndex + 1) : state.queue.length;
            const queue = [...state.queue.slice(0, insertAt), ...tracks, ...state.queue.slice(insertAt)];
            let next = Object.assign(Object.assign({}, state), { queue });
            if (state.currentIndex < 0 || hasFinishedQueue(state, now)) {
                next = startAt(next, insertAt, now);
            }
            return { ok: true, changed: true, state: trimHistory(next) };
        }
        case "PLAY_SONGS": {
            if (command.songs.length === 0)
                return unchanged;
            const ids = new Set(command.songs.map((song) => song.id));
            const head = state.queue.slice(0, state.currentIndex + 1);
            const rest = state.queue.slice(state.currentIndex + 1).filter((track) => !ids.has(track.song.id));
            const queue = [...head, ...toTracks(command.songs, actorId), ...rest];
            return { ok: true, changed: true, state: trimHistory(startAt(Object.assign(Object.assign({}, state), { queue }), head.length, now)) };
        }
        case "REPLACE_QUEUE": {
            if (command.songs.length === 0)
                return unchanged;
            const history = state.queue.slice(0, state.currentIndex + 1);
            const queue = [...history, ...toTracks(command.songs, actorId)];
            return { ok: true, changed: true, state: trimHistory(startAt(Object.assign(Object.assign({}, state), { queue }), history.length, now)) };
        }
        case "JUMP": {
            const index = state.queue.findIndex((track) => track.itemId === command.itemId);
            if (index < 0)
                return { ok: false, error: "That song is no longer in the queue" };
            return { ok: true, changed: true, state: startAt(state, index, now) };
        }
        case "REMOVE": {
            const index = state.queue.findIndex((track) => track.itemId === command.itemId);
            if (index < 0)
                return unchanged;
            if (index === state.currentIndex)
                return { ok: false, error: "You can't remove the song that's playing" };
            const queue = state.queue.filter((_, i) => i !== index);
            return {
                ok: true,
                changed: true,
                state: Object.assign(Object.assign({}, state), { queue, currentIndex: index < state.currentIndex ? state.currentIndex - 1 : state.currentIndex }),
            };
        }
        case "MOVE": {
            const head = state.queue.slice(0, state.currentIndex + 1);
            const upcoming = state.queue.slice(state.currentIndex + 1);
            const byId = new Map(upcoming.map((track) => [track.itemId, track]));
            if (command.itemIds.length !== upcoming.length || !command.itemIds.every((id) => byId.has(id))) {
                return { ok: false, error: "The queue changed, please try again" };
            }
            return {
                ok: true,
                changed: true,
                state: Object.assign(Object.assign({}, state), { queue: [...head, ...command.itemIds.map((id) => byId.get(id))] }),
            };
        }
        case "SHUFFLE": {
            const head = state.queue.slice(0, state.currentIndex + 1);
            const upcoming = [...state.queue.slice(state.currentIndex + 1)];
            for (let i = upcoming.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
            }
            return { ok: true, changed: true, state: Object.assign(Object.assign({}, state), { queue: [...head, ...upcoming] }) };
        }
        case "UPDATE_SETTINGS":
            return { ok: true, changed: true, state: Object.assign(Object.assign({}, state), { settings: (0, settings_1.mergeSettings)(state.settings, command.settings) }) };
        case "KICK": {
            if (command.userId === state.hostId)
                return { ok: false, error: "The host can't be removed" };
            return {
                ok: true,
                changed: true,
                state: Object.assign(Object.assign({}, state), { members: state.members.filter((member) => member.userId !== command.userId), pending: state.pending.filter((member) => member.userId !== command.userId) }),
            };
        }
        case "TRANSFER_HOST": {
            if (!state.members.some((member) => member.userId === command.userId)) {
                return { ok: false, error: "That person isn't in the Jam" };
            }
            return { ok: true, changed: true, state: Object.assign(Object.assign({}, state), { hostId: command.userId }) };
        }
    }
};
exports.reduceJam = reduceJam;
