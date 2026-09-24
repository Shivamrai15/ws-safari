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
exports.canJoinRoom = exports.parseRoom = void 0;
const config_1 = require("./config");
const OBJECT_ID = /^[a-f\d]{24}$/i;
const authorizers = {
    user: (socket, id) => __awaiter(void 0, void 0, void 0, function* () { return id === socket.data.user.userId; }),
    playlist: (socket, id) => __awaiter(void 0, void 0, void 0, function* () {
        if (!OBJECT_ID.test(id))
            return false;
        const response = yield fetch(`${config_1.PROTECTED_BASE_URL}/api/v2/playlist/${id}`, {
            headers: { Authorization: `Bearer ${socket.data.token}` },
            signal: AbortSignal.timeout(config_1.AUTHORIZE_TIMEOUT_MS),
        });
        return response.ok;
    }),
};
const parseRoom = (room) => {
    if (typeof room !== "string")
        return null;
    const separator = room.indexOf(":");
    if (separator <= 0)
        return null;
    const type = room.slice(0, separator);
    const id = room.slice(separator + 1);
    if (!id || !(type in authorizers))
        return null;
    return { type, id };
};
exports.parseRoom = parseRoom;
const canJoinRoom = (socket, room) => __awaiter(void 0, void 0, void 0, function* () {
    const parsed = (0, exports.parseRoom)(room);
    if (!parsed)
        return false;
    return authorizers[parsed.type](socket, parsed.id);
});
exports.canJoinRoom = canJoinRoom;
