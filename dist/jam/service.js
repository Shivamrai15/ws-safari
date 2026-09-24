"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JamService = exports.sanitizeProfile = exports.jamRoom = void 0;
const settings_1 = require("./settings");
const store_1 = require("./store");
const reducer_1 = require("./reducer");
const catalog_1 = require("./catalog");
const ABSENCE_GRACE_MS = 5 * 60 * 1000;
const SONG_COMMANDS = new Set(["ADD", "PLAY_SONGS", "REPLACE_QUEUE"]);
const jamRoom = (jamId) => `jam:${jamId}`;
exports.jamRoom = jamRoom;
const userRoom = (userId) => `user:${userId}`;
const sanitizeProfile = (value) => {
    const input = (value && typeof value === "object" ? value : {});
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : "Listener";
    const image = typeof input.image === "string" && /^https?:\/\//.test(input.image) ? input.image.slice(0, 500) : null;
    return { name, image };
};
exports.sanitizeProfile = sanitizeProfile;
const toMember = (userId, profile) => ({
    userId,
    name: profile.name,
    image: profile.image,
    joinedAt: Date.now(),
});
const finiteNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const text = (value) => (typeof value === "string" ? value : "");
class JamService {
    constructor(nsp, store) {
        this.nsp = nsp;
        this.store = store;
        this.absenceTimers = new Map();
    }
    broadcast(state) {
        this.nsp.to((0, exports.jamRoom)(state.id)).emit("jam:state", state);
    }
    attachUser(userId, state) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.store.linkUsers(state, [userId]);
            this.nsp.in(userRoom(userId)).socketsJoin((0, exports.jamRoom)(state.id));
        });
    }
    detachUser(userId, jamId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.store.unlinkUsers(jamId, [userId]);
            this.nsp.in(userRoom(userId)).socketsLeave((0, exports.jamRoom)(jamId));
        });
    }
    current(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.store.findForUser(user.userId);
            if (state) {
                this.nsp.in(userRoom(user.userId)).socketsJoin((0, exports.jamRoom)(state.id));
            }
            return { ok: true, state };
        });
    }
    create(user, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.leave(user.userId);
            const mode = payload.mode === "HOST_SPEAKER" ? "HOST_SPEAKER" : "EVERYONE_PLAYS";
            const settings = (0, settings_1.mergeSettings)((0, settings_1.defaultSettings)(mode), payload.settings);
            const member = toMember(user.userId, (0, exports.sanitizeProfile)(payload.profile));
            const state = yield this.store.create(({ id, code }) => ({
                id,
                code,
                hostId: user.userId,
                createdAt: Date.now(),
                version: 1,
                settings,
                members: [member],
                pending: [],
                queue: [],
                currentIndex: -1,
                playback: { status: "paused", positionMs: 0, updatedAt: Date.now() },
            }));
            this.nsp.in(userRoom(user.userId)).socketsJoin((0, exports.jamRoom)(state.id));
            return { ok: true, state };
        });
    }
    join(user, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const code = (0, store_1.normalizeCode)(payload.code);
            const target = yield this.store.findByCode(code);
            if (!target)
                return { ok: false, error: "No Jam found with that code" };
            if (target.members.some((member) => member.userId === user.userId)) {
                yield this.attachUser(user.userId, target);
                return { ok: true, state: target };
            }
            const existing = yield this.store.findForUser(user.userId);
            if (existing && existing.id !== target.id) {
                yield this.leave(user.userId);
            }
            const profile = (0, exports.sanitizeProfile)(payload.profile);
            const result = yield this.store.mutate(target.id, (state) => {
                if (state.members.some((member) => member.userId === user.userId)) {
                    return { ok: true, state, value: "joined", changed: false };
                }
                if (state.members.length >= state.settings.maxMembers) {
                    return { ok: false, error: "This Jam is full" };
                }
                if (state.settings.joinApproval === "HOST_APPROVES") {
                    if (state.pending.some((member) => member.userId === user.userId)) {
                        return { ok: true, state, value: "pending", changed: false };
                    }
                    return {
                        ok: true,
                        value: "pending",
                        changed: true,
                        state: Object.assign(Object.assign({}, state), { pending: [...state.pending, toMember(user.userId, profile)] }),
                    };
                }
                return {
                    ok: true,
                    value: "joined",
                    changed: true,
                    state: Object.assign(Object.assign({}, state), { members: [...state.members, toMember(user.userId, profile)] }),
                };
            });
            if (!result.ok)
                return result;
            if (result.value === "pending") {
                if (result.changed) {
                    this.broadcast(result.state);
                    this.nsp.to(userRoom(result.state.hostId)).emit("jam:join-request", {
                        userId: user.userId,
                        name: profile.name,
                    });
                }
                return { ok: false, pending: true, error: "Waiting for the host to let you in" };
            }
            yield this.attachUser(user.userId, result.state);
            if (result.changed)
                this.broadcast(result.state);
            return { ok: true, state: result.state };
        });
    }
    respondToJoin(user, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.store.findForUser(user.userId);
            if (!state)
                return { ok: false, error: "You're not in a Jam" };
            if (state.hostId !== user.userId)
                return { ok: false, error: "Only the host can let people in" };
            const targetId = text(payload.userId);
            const approve = payload.approve === true;
            const result = yield this.store.mutate(state.id, (current) => {
                const candidate = current.pending.find((member) => member.userId === targetId);
                if (!candidate)
                    return { ok: true, state: current, value: false, changed: false };
                const pending = current.pending.filter((member) => member.userId !== targetId);
                if (!approve) {
                    return { ok: true, value: true, changed: true, state: Object.assign(Object.assign({}, current), { pending }) };
                }
                if (current.members.length >= current.settings.maxMembers) {
                    return { ok: false, error: "This Jam is full" };
                }
                return {
                    ok: true,
                    value: true,
                    changed: true,
                    state: Object.assign(Object.assign({}, current), { pending, members: [...current.members, Object.assign(Object.assign({}, candidate), { joinedAt: Date.now() })] }),
                };
            });
            if (!result.ok)
                return result;
            if (!result.value)
                return { ok: true, state: result.state };
            if (approve) {
                yield this.attachUser(targetId, result.state);
            }
            else {
                this.nsp.to(userRoom(targetId)).emit("jam:rejected", { code: result.state.code });
            }
            this.broadcast(result.state);
            return { ok: true, state: result.state };
        });
    }
    leave(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.store.findForUser(userId);
            if (!state)
                return { ok: true, state: null };
            const result = yield this.store.mutate(state.id, (current) => {
                if (!current.members.some((member) => member.userId === userId)) {
                    return { ok: true, state: current, value: "left", changed: false };
                }
                const members = current.members.filter((member) => member.userId !== userId);
                if (members.length === 0 || (current.hostId === userId && current.settings.endWhenHostLeaves)) {
                    return { ok: true, value: "end", changed: true, state: Object.assign(Object.assign({}, current), { members }) };
                }
                const hostId = current.hostId === userId ? members[0].userId : current.hostId;
                return { ok: true, value: "left", changed: true, state: Object.assign(Object.assign({}, current), { members, hostId }) };
            });
            if (!result.ok)
                return { ok: true, state: null };
            if (result.value === "end") {
                yield this.end(result.state, "The host ended the Jam");
                yield this.detachUser(userId, state.id);
                return { ok: true, state: null };
            }
            yield this.detachUser(userId, state.id);
            if (result.changed)
                this.broadcast(result.state);
            return { ok: true, state: null };
        });
    }
    endByHost(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.store.findForUser(user.userId);
            if (!state)
                return { ok: true, state: null };
            if (state.hostId !== user.userId)
                return { ok: false, error: "Only the host can end the Jam" };
            yield this.end(state, "The host ended the Jam");
            return { ok: true, state: null };
        });
    }
    end(state, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            this.nsp.to((0, exports.jamRoom)(state.id)).emit("jam:ended", { jamId: state.id, reason });
            this.nsp.in((0, exports.jamRoom)(state.id)).socketsLeave((0, exports.jamRoom)(state.id));
            yield this.store.delete(state);
        });
    }
    command(user, token, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.store.findForUser(user.userId);
            if (!state)
                return { ok: false, error: "You're not in a Jam" };
            const type = text(payload.type);
            if (!(0, reducer_1.canRun)(state, user.userId, type)) {
                return { ok: false, error: "You don't have permission to do that in this Jam" };
            }
            const command = yield this.buildCommand(type, payload, token);
            if (!command)
                return { ok: false, error: "Unknown Jam command" };
            const result = yield this.store.mutate(state.id, (current) => {
                const reduced = (0, reducer_1.reduceJam)(current, command, user.userId, Date.now());
                return reduced.ok ? Object.assign(Object.assign({}, reduced), { value: null }) : reduced;
            });
            if (!result.ok)
                return result;
            if (result.changed) {
                this.broadcast(result.state);
                if (command.type === "KICK") {
                    yield this.detachUser(command.userId, state.id);
                    this.nsp.to(userRoom(command.userId)).emit("jam:ended", { jamId: state.id, reason: "You were removed from the Jam" });
                }
            }
            return { ok: true, state: result.state };
        });
    }
    buildCommand(type, payload, token) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (SONG_COMMANDS.has(type)) {
                const songs = yield (0, catalog_1.fetchSongs)((0, catalog_1.sanitizeSongIds)(payload.songIds), token);
                if (type === "ADD")
                    return { type, songs, next: payload.next === true };
                if (type === "PLAY_SONGS")
                    return { type, songs };
                return { type: "REPLACE_QUEUE", songs };
            }
            switch (type) {
                case "PLAY":
                case "PAUSE": {
                    const positionMs = finiteNumber(payload.positionMs);
                    return positionMs === undefined ? { type } : { type, positionMs };
                }
                case "SEEK": {
                    const positionMs = finiteNumber(payload.positionMs);
                    return positionMs === undefined ? null : { type, positionMs };
                }
                case "NEXT":
                case "PREV":
                case "SHUFFLE":
                    return { type };
                case "TRACK_ENDED":
                case "JUMP":
                case "REMOVE":
                    return { type, itemId: text(payload.itemId) };
                case "MOVE":
                    return { type, itemIds: Array.isArray(payload.itemIds) ? payload.itemIds.filter((id) => typeof id === "string") : [] };
                case "UPDATE_SETTINGS":
                    return { type, settings: ((_a = payload.settings) !== null && _a !== void 0 ? _a : {}) };
                case "KICK":
                case "TRANSFER_HOST":
                    return { type, userId: text(payload.userId) };
                default:
                    return null;
            }
        });
    }
    cancelAbsenceCheck(userId) {
        const timer = this.absenceTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.absenceTimers.delete(userId);
        }
    }
    scheduleAbsenceCheck(userId) {
        this.cancelAbsenceCheck(userId);
        const timer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            this.absenceTimers.delete(userId);
            try {
                const sockets = yield this.nsp.in(userRoom(userId)).fetchSockets();
                if (sockets.length === 0) {
                    yield this.leave(userId);
                }
            }
            catch (error) {
                console.error("JAM ABSENCE CHECK ERROR", error);
            }
        }), ABSENCE_GRACE_MS);
        this.absenceTimers.set(userId, timer);
    }
}
exports.JamService = JamService;
