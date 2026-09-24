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
exports.sanitizeSongIds = void 0;
exports.fetchSongs = fetchSongs;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://catalog-safari.onrender.com";
const CATALOG_TIMEOUT_MS = 60 * 1000;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const MAX_BATCH = 50;
const sanitizeSongIds = (value) => {
    if (!Array.isArray(value))
        return [];
    const ids = value.filter((id) => typeof id === "string" && OBJECT_ID.test(id));
    return Array.from(new Set(ids)).slice(0, MAX_BATCH);
};
exports.sanitizeSongIds = sanitizeSongIds;
function fetchSongs(ids, token) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (ids.length === 0)
            return [];
        const response = yield fetch(`${PUBLIC_BASE_URL}/api/v2/song/batch`, {
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
        const body = yield response.json();
        const songs = (_a = body.data) !== null && _a !== void 0 ? _a : [];
        const order = new Map(ids.map((id, index) => [id, index]));
        return songs
            .filter((song) => order.has(song.id))
            .sort((a, b) => order.get(a.id) - order.get(b.id));
    });
}
