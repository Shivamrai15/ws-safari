import { Namespace } from "socket.io";
import { SocketUser } from "../realtime/auth";
import { defaultSettings, mergeSettings } from "./settings";
import { JamStore, normalizeCode } from "./store";
import { reduceJam, canRun } from "./reducer";
import { fetchSongs, sanitizeSongIds } from "./catalog";
import { JamCommand, JamMember, JamMode, JamProfile, JamState } from "./types";

const ABSENCE_GRACE_MS = 5 * 60 * 1000;
const SONG_COMMANDS = new Set(["ADD", "PLAY_SONGS", "REPLACE_QUEUE"]);

export type JamResult =
    | { ok: true; state: JamState | null }
    | { ok: false; error: string; pending?: boolean };

export const jamRoom = (jamId: string) => `jam:${jamId}`;
const userRoom = (userId: string) => `user:${userId}`;

export const sanitizeProfile = (value: unknown): JamProfile => {
    const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : "Listener";
    const image = typeof input.image === "string" && /^https?:\/\//.test(input.image) ? input.image.slice(0, 500) : null;
    return { name, image };
};

const toMember = (userId: string, profile: JamProfile): JamMember => ({
    userId,
    name: profile.name,
    image: profile.image,
    joinedAt: Date.now(),
});

const finiteNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const text = (value: unknown) => (typeof value === "string" ? value : "");

export class JamService {
    private absenceTimers = new Map<string, NodeJS.Timeout>();

    constructor(private readonly nsp: Namespace, private readonly store: JamStore) {}

    private broadcast(state: JamState) {
        this.nsp.to(jamRoom(state.id)).emit("jam:state", state);
    }

    private async attachUser(userId: string, state: JamState) {
        await this.store.linkUsers(state, [userId]);
        this.nsp.in(userRoom(userId)).socketsJoin(jamRoom(state.id));
    }

    private async detachUser(userId: string, jamId: string) {
        await this.store.unlinkUsers(jamId, [userId]);
        this.nsp.in(userRoom(userId)).socketsLeave(jamRoom(jamId));
    }

    async current(user: SocketUser): Promise<JamResult> {
        const state = await this.store.findForUser(user.userId);
        if (state) {
            this.nsp.in(userRoom(user.userId)).socketsJoin(jamRoom(state.id));
        }
        return { ok: true, state };
    }

    async create(user: SocketUser, payload: Record<string, unknown>): Promise<JamResult> {
        await this.leave(user.userId);

        const mode: JamMode = payload.mode === "HOST_SPEAKER" ? "HOST_SPEAKER" : "EVERYONE_PLAYS";
        const settings = mergeSettings(defaultSettings(mode), payload.settings);
        const member = toMember(user.userId, sanitizeProfile(payload.profile));

        const state = await this.store.create(({ id, code }) => ({
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

        this.nsp.in(userRoom(user.userId)).socketsJoin(jamRoom(state.id));
        return { ok: true, state };
    }

    async join(user: SocketUser, payload: Record<string, unknown>): Promise<JamResult> {
        const code = normalizeCode(payload.code);
        const target = await this.store.findByCode(code);
        if (!target) return { ok: false, error: "No Jam found with that code" };

        if (target.members.some((member) => member.userId === user.userId)) {
            await this.attachUser(user.userId, target);
            return { ok: true, state: target };
        }

        const existing = await this.store.findForUser(user.userId);
        if (existing && existing.id !== target.id) {
            await this.leave(user.userId);
        }

        const profile = sanitizeProfile(payload.profile);
        const result = await this.store.mutate<"joined" | "pending">(target.id, (state) => {
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
                    state: { ...state, pending: [...state.pending, toMember(user.userId, profile)] },
                };
            }
            return {
                ok: true,
                value: "joined",
                changed: true,
                state: { ...state, members: [...state.members, toMember(user.userId, profile)] },
            };
        });

        if (!result.ok) return result;

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

        await this.attachUser(user.userId, result.state);
        if (result.changed) this.broadcast(result.state);
        return { ok: true, state: result.state };
    }

    async respondToJoin(user: SocketUser, payload: Record<string, unknown>): Promise<JamResult> {
        const state = await this.store.findForUser(user.userId);
        if (!state) return { ok: false, error: "You're not in a Jam" };
        if (state.hostId !== user.userId) return { ok: false, error: "Only the host can let people in" };

        const targetId = text(payload.userId);
        const approve = payload.approve === true;

        const result = await this.store.mutate<boolean>(state.id, (current) => {
            const candidate = current.pending.find((member) => member.userId === targetId);
            if (!candidate) return { ok: true, state: current, value: false, changed: false };
            const pending = current.pending.filter((member) => member.userId !== targetId);
            if (!approve) {
                return { ok: true, value: true, changed: true, state: { ...current, pending } };
            }
            if (current.members.length >= current.settings.maxMembers) {
                return { ok: false, error: "This Jam is full" };
            }
            return {
                ok: true,
                value: true,
                changed: true,
                state: { ...current, pending, members: [...current.members, { ...candidate, joinedAt: Date.now() }] },
            };
        });

        if (!result.ok) return result;
        if (!result.value) return { ok: true, state: result.state };

        if (approve) {
            await this.attachUser(targetId, result.state);
        } else {
            this.nsp.to(userRoom(targetId)).emit("jam:rejected", { code: result.state.code });
        }
        this.broadcast(result.state);
        return { ok: true, state: result.state };
    }

    async leave(userId: string): Promise<JamResult> {
        const state = await this.store.findForUser(userId);
        if (!state) return { ok: true, state: null };

        const result = await this.store.mutate<"left" | "end">(state.id, (current) => {
            if (!current.members.some((member) => member.userId === userId)) {
                return { ok: true, state: current, value: "left", changed: false };
            }
            const members = current.members.filter((member) => member.userId !== userId);
            if (members.length === 0 || (current.hostId === userId && current.settings.endWhenHostLeaves)) {
                return { ok: true, value: "end", changed: true, state: { ...current, members } };
            }
            const hostId = current.hostId === userId ? members[0]!.userId : current.hostId;
            return { ok: true, value: "left", changed: true, state: { ...current, members, hostId } };
        });

        if (!result.ok) return { ok: true, state: null };

        if (result.value === "end") {
            await this.end(result.state, "The host ended the Jam");
            await this.detachUser(userId, state.id);
            return { ok: true, state: null };
        }

        await this.detachUser(userId, state.id);
        if (result.changed) this.broadcast(result.state);
        return { ok: true, state: null };
    }

    async endByHost(user: SocketUser): Promise<JamResult> {
        const state = await this.store.findForUser(user.userId);
        if (!state) return { ok: true, state: null };
        if (state.hostId !== user.userId) return { ok: false, error: "Only the host can end the Jam" };
        await this.end(state, "The host ended the Jam");
        return { ok: true, state: null };
    }

    private async end(state: JamState, reason: string) {
        this.nsp.to(jamRoom(state.id)).emit("jam:ended", { jamId: state.id, reason });
        this.nsp.in(jamRoom(state.id)).socketsLeave(jamRoom(state.id));
        await this.store.delete(state);
    }

    async command(user: SocketUser, token: string, payload: Record<string, unknown>): Promise<JamResult> {
        const state = await this.store.findForUser(user.userId);
        if (!state) return { ok: false, error: "You're not in a Jam" };

        const type = text(payload.type) as JamCommand["type"];
        if (!canRun(state, user.userId, type)) {
            return { ok: false, error: "You don't have permission to do that in this Jam" };
        }

        const command = await this.buildCommand(type, payload, token);
        if (!command) return { ok: false, error: "Unknown Jam command" };

        const result = await this.store.mutate<null>(state.id, (current) => {
            const reduced = reduceJam(current, command, user.userId, Date.now());
            return reduced.ok ? { ...reduced, value: null } : reduced;
        });

        if (!result.ok) return result;

        if (result.changed) {
            this.broadcast(result.state);
            if (command.type === "KICK") {
                await this.detachUser(command.userId, state.id);
                this.nsp.to(userRoom(command.userId)).emit("jam:ended", { jamId: state.id, reason: "You were removed from the Jam" });
            }
        }

        return { ok: true, state: result.state };
    }

    private async buildCommand(type: JamCommand["type"], payload: Record<string, unknown>, token: string): Promise<JamCommand | null> {
        if (SONG_COMMANDS.has(type)) {
            const songs = await fetchSongs(sanitizeSongIds(payload.songIds), token);
            if (type === "ADD") return { type, songs, next: payload.next === true };
            if (type === "PLAY_SONGS") return { type, songs };
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
                return { type, itemIds: Array.isArray(payload.itemIds) ? payload.itemIds.filter((id): id is string => typeof id === "string") : [] };
            case "UPDATE_SETTINGS":
                return { type, settings: (payload.settings ?? {}) as Record<string, unknown> };
            case "KICK":
            case "TRANSFER_HOST":
                return { type, userId: text(payload.userId) };
            default:
                return null;
        }
    }

    cancelAbsenceCheck(userId: string) {
        const timer = this.absenceTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.absenceTimers.delete(userId);
        }
    }

    scheduleAbsenceCheck(userId: string) {
        this.cancelAbsenceCheck(userId);
        const timer = setTimeout(async () => {
            this.absenceTimers.delete(userId);
            try {
                const sockets = await this.nsp.in(userRoom(userId)).fetchSockets();
                if (sockets.length === 0) {
                    await this.leave(userId);
                }
            } catch (error) {
                console.error("JAM ABSENCE CHECK ERROR", error);
            }
        }, ABSENCE_GRACE_MS);
        this.absenceTimers.set(userId, timer);
    }
}
