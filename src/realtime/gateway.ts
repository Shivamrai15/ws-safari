import { Namespace, Server } from "socket.io";
import { authenticateSocket, SocketUser, verifyAccessToken } from "./auth";
import { canJoinRoom, parseRoom } from "./rooms";
import { REALTIME_CHANNEL } from "./config";
import { RedisClient } from "./redis";

type Ack = (response: { ok: boolean }) => void;

const userRoom = (userId: string) => `user:${userId}`;

export const setupRealtimeGateway = (io: Server) => {
    const nsp = io.of("/v2");
    nsp.use(authenticateSocket);

    nsp.on("connection", (socket) => {
        const user = socket.data.user as SocketUser;
        socket.join(userRoom(user.userId));

        socket.on("auth:refresh", (payload: { token?: unknown }, ack?: Ack) => {
            const refreshed = verifyAccessToken(payload?.token);
            if (!refreshed || refreshed.userId !== user.userId) {
                ack?.({ ok: false });
                return;
            }
            socket.data.token = payload.token;
            ack?.({ ok: true });
        });

        socket.on("room:join", async (payload: { room?: unknown }, ack?: Ack) => {
            try {
                const allowed = await canJoinRoom(socket, payload?.room);
                if (allowed) {
                    socket.join(payload.room as string);
                }
                ack?.({ ok: allowed });
            } catch (error) {
                console.error("ROOM JOIN ERROR", error);
                ack?.({ ok: false });
            }
        });

        socket.on("room:leave", (payload: { room?: unknown }, ack?: Ack) => {
            const room = payload?.room;
            if (parseRoom(room) && room !== userRoom(user.userId)) {
                socket.leave(room as string);
            }
            ack?.({ ok: true });
        });
    });

    return nsp;
};

export const forwardRealtimeEvents = (nsp: Namespace, subscriber: RedisClient) => {
    subscriber.subscribe(REALTIME_CHANNEL, (raw) => {
        try {
            const { room, event, payload } = JSON.parse(raw);
            if (typeof room !== "string" || typeof event !== "string") return;
            if (event === "room:evict") {
                if (typeof payload?.room === "string") {
                    nsp.local.in(room).socketsLeave(payload.room);
                }
                return;
            }
            nsp.local.to(room).emit(event, payload ?? {});
        } catch (error) {
            console.error("Invalid realtime event", error);
        }
    }).catch((error) => console.error("Failed to subscribe to realtime events", error));
};
