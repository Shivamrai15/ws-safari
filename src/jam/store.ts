import { randomInt, randomUUID } from "crypto";
import { RedisClient } from "../realtime/redis";
import { JamState } from "./types";

export const JAM_TTL_SECONDS = 6 * 60 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_CAS_ATTEMPTS = 5;

const jamKey = (jamId: string) => `jam:${jamId}`;
const codeKey = (code: string) => `jam-code:${code}`;
const userKey = (userId: string) => `jam-user:${userId}`;

const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local state = cjson.decode(current)
if tonumber(state.version) ~= tonumber(ARGV[1]) then return -1 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;

export type MutateResult<T> =
    | { ok: true; state: JamState; value: T; changed: boolean }
    | { ok: false; error: string };

export type Mutation<T> = (state: JamState) =>
    | { ok: true; state: JamState; value: T; changed: boolean }
    | { ok: false; error: string };

export const normalizeCode = (code: unknown) =>
    typeof code === "string" ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";

export class JamStore {
    constructor(private readonly redis: RedisClient) {}

    async get(jamId: string): Promise<JamState | null> {
        const raw = await this.redis.get(jamKey(jamId));
        return raw ? (JSON.parse(raw) as JamState) : null;
    }

    async findByCode(code: string): Promise<JamState | null> {
        const jamId = await this.redis.get(codeKey(normalizeCode(code)));
        return jamId ? this.get(jamId) : null;
    }

    async findForUser(userId: string): Promise<JamState | null> {
        const jamId = await this.redis.get(userKey(userId));
        if (!jamId) return null;
        const state = await this.get(jamId);
        if (!state || !state.members.some((member) => member.userId === userId)) {
            await this.redis.del(userKey(userId));
            return null;
        }
        return state;
    }

    async create(build: (ids: { id: string; code: string }) => JamState): Promise<JamState> {
        const id = randomUUID();
        for (let attempt = 0; attempt < 10; attempt++) {
            const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
            const reserved = await this.redis.set(codeKey(code), id, { NX: true, EX: JAM_TTL_SECONDS });
            if (reserved !== "OK") continue;
            const state = build({ id, code });
            await this.redis.set(jamKey(id), JSON.stringify(state), { EX: JAM_TTL_SECONDS });
            await this.linkUsers(state, state.members.map((member) => member.userId));
            return state;
        }
        throw new Error("Could not allocate a Jam code");
    }

    async mutate<T>(jamId: string, mutation: Mutation<T>): Promise<MutateResult<T>> {
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
            const current = await this.get(jamId);
            if (!current) return { ok: false, error: "This Jam has ended" };

            const result = mutation(current);
            if (!result.ok) return result;
            if (!result.changed) return { ...result, state: current };

            const next: JamState = { ...result.state, version: current.version + 1 };
            const outcome = await this.redis.eval(CAS_SCRIPT, {
                keys: [jamKey(jamId)],
                arguments: [String(current.version), JSON.stringify(next), String(JAM_TTL_SECONDS)],
            });

            if (outcome === 0) return { ok: false, error: "This Jam has ended" };
            if (outcome === 1) {
                await this.redis.expire(codeKey(next.code), JAM_TTL_SECONDS);
                return { ok: true, state: next, value: result.value, changed: true };
            }
        }
        return { ok: false, error: "The Jam is busy, please try again" };
    }

    async linkUsers(state: JamState, userIds: string[]) {
        await Promise.all(userIds.map((userId) =>
            this.redis.set(userKey(userId), state.id, { EX: JAM_TTL_SECONDS })
        ));
    }

    async unlinkUsers(jamId: string, userIds: string[]) {
        await Promise.all(userIds.map(async (userId) => {
            if ((await this.redis.get(userKey(userId))) === jamId) {
                await this.redis.del(userKey(userId));
            }
        }));
    }

    async delete(state: JamState) {
        await this.unlinkUsers(state.id, state.members.map((member) => member.userId));
        await this.redis.del([jamKey(state.id), codeKey(state.code)]);
    }
}
