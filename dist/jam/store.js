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
exports.JamStore = exports.normalizeCode = exports.JAM_TTL_SECONDS = void 0;
const crypto_1 = require("crypto");
exports.JAM_TTL_SECONDS = 6 * 60 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_CAS_ATTEMPTS = 5;
const jamKey = (jamId) => `jam:${jamId}`;
const codeKey = (code) => `jam-code:${code}`;
const userKey = (userId) => `jam-user:${userId}`;
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local state = cjson.decode(current)
if tonumber(state.version) ~= tonumber(ARGV[1]) then return -1 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;
const normalizeCode = (code) => typeof code === "string" ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
exports.normalizeCode = normalizeCode;
class JamStore {
    constructor(redis) {
        this.redis = redis;
    }
    get(jamId) {
        return __awaiter(this, void 0, void 0, function* () {
            const raw = yield this.redis.get(jamKey(jamId));
            return raw ? JSON.parse(raw) : null;
        });
    }
    findByCode(code) {
        return __awaiter(this, void 0, void 0, function* () {
            const jamId = yield this.redis.get(codeKey((0, exports.normalizeCode)(code)));
            return jamId ? this.get(jamId) : null;
        });
    }
    findForUser(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const jamId = yield this.redis.get(userKey(userId));
            if (!jamId)
                return null;
            const state = yield this.get(jamId);
            if (!state || !state.members.some((member) => member.userId === userId)) {
                yield this.redis.del(userKey(userId));
                return null;
            }
            return state;
        });
    }
    create(build) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = (0, crypto_1.randomUUID)();
            for (let attempt = 0; attempt < 10; attempt++) {
                const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[(0, crypto_1.randomInt)(CODE_ALPHABET.length)]).join("");
                const reserved = yield this.redis.set(codeKey(code), id, { NX: true, EX: exports.JAM_TTL_SECONDS });
                if (reserved !== "OK")
                    continue;
                const state = build({ id, code });
                yield this.redis.set(jamKey(id), JSON.stringify(state), { EX: exports.JAM_TTL_SECONDS });
                yield this.linkUsers(state, state.members.map((member) => member.userId));
                return state;
            }
            throw new Error("Could not allocate a Jam code");
        });
    }
    mutate(jamId, mutation) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
                const current = yield this.get(jamId);
                if (!current)
                    return { ok: false, error: "This Jam has ended" };
                const result = mutation(current);
                if (!result.ok)
                    return result;
                if (!result.changed)
                    return Object.assign(Object.assign({}, result), { state: current });
                const next = Object.assign(Object.assign({}, result.state), { version: current.version + 1 });
                const outcome = yield this.redis.eval(CAS_SCRIPT, {
                    keys: [jamKey(jamId)],
                    arguments: [String(current.version), JSON.stringify(next), String(exports.JAM_TTL_SECONDS)],
                });
                if (outcome === 0)
                    return { ok: false, error: "This Jam has ended" };
                if (outcome === 1) {
                    yield this.redis.expire(codeKey(next.code), exports.JAM_TTL_SECONDS);
                    return { ok: true, state: next, value: result.value, changed: true };
                }
            }
            return { ok: false, error: "The Jam is busy, please try again" };
        });
    }
    linkUsers(state, userIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(userIds.map((userId) => this.redis.set(userKey(userId), state.id, { EX: exports.JAM_TTL_SECONDS })));
        });
    }
    unlinkUsers(jamId, userIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(userIds.map((userId) => __awaiter(this, void 0, void 0, function* () {
                if ((yield this.redis.get(userKey(userId))) === jamId) {
                    yield this.redis.del(userKey(userId));
                }
            })));
        });
    }
    delete(state) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.unlinkUsers(state.id, state.members.map((member) => member.userId));
            yield this.redis.del([jamKey(state.id), codeKey(state.code)]);
        });
    }
}
exports.JamStore = JamStore;
