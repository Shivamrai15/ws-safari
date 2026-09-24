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
exports.forwardRealtimeEvents = exports.setupRealtimeGateway = void 0;
const auth_1 = require("./auth");
const rooms_1 = require("./rooms");
const config_1 = require("./config");
const userRoom = (userId) => `user:${userId}`;
const setupRealtimeGateway = (io) => {
    const nsp = io.of("/v2");
    nsp.use(auth_1.authenticateSocket);
    nsp.on("connection", (socket) => {
        const user = socket.data.user;
        socket.join(userRoom(user.userId));
        socket.on("auth:refresh", (payload, ack) => {
            const refreshed = (0, auth_1.verifyAccessToken)(payload === null || payload === void 0 ? void 0 : payload.token);
            if (!refreshed || refreshed.userId !== user.userId) {
                ack === null || ack === void 0 ? void 0 : ack({ ok: false });
                return;
            }
            socket.data.token = payload.token;
            ack === null || ack === void 0 ? void 0 : ack({ ok: true });
        });
        socket.on("room:join", (payload, ack) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const allowed = yield (0, rooms_1.canJoinRoom)(socket, payload === null || payload === void 0 ? void 0 : payload.room);
                if (allowed) {
                    socket.join(payload.room);
                }
                ack === null || ack === void 0 ? void 0 : ack({ ok: allowed });
            }
            catch (error) {
                console.error("ROOM JOIN ERROR", error);
                ack === null || ack === void 0 ? void 0 : ack({ ok: false });
            }
        }));
        socket.on("room:leave", (payload, ack) => {
            const room = payload === null || payload === void 0 ? void 0 : payload.room;
            if ((0, rooms_1.parseRoom)(room) && room !== userRoom(user.userId)) {
                socket.leave(room);
            }
            ack === null || ack === void 0 ? void 0 : ack({ ok: true });
        });
    });
    return nsp;
};
exports.setupRealtimeGateway = setupRealtimeGateway;
const forwardRealtimeEvents = (nsp, subscriber) => {
    subscriber.subscribe(config_1.REALTIME_CHANNEL, (raw) => {
        try {
            const { room, event, payload } = JSON.parse(raw);
            if (typeof room !== "string" || typeof event !== "string")
                return;
            if (event === "room:evict") {
                if (typeof (payload === null || payload === void 0 ? void 0 : payload.room) === "string") {
                    nsp.local.in(room).socketsLeave(payload.room);
                }
                return;
            }
            nsp.local.to(room).emit(event, payload !== null && payload !== void 0 ? payload : {});
        }
        catch (error) {
            console.error("Invalid realtime event", error);
        }
    }).catch((error) => console.error("Failed to subscribe to realtime events", error));
};
exports.forwardRealtimeEvents = forwardRealtimeEvents;
