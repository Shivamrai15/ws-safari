import { Socket } from "socket.io";
import { AUTHORIZE_TIMEOUT_MS, PROTECTED_BASE_URL } from "./config";
import { SocketUser } from "./auth";

type RoomAuthorizer = (socket: Socket, id: string) => Promise<boolean>;

const OBJECT_ID = /^[a-f\d]{24}$/i;

const authorizers: Record<string, RoomAuthorizer> = {
    user: async (socket, id) => id === (socket.data.user as SocketUser).userId,
    playlist: async (socket, id) => {
        if (!OBJECT_ID.test(id)) return false;
        const response = await fetch(`${PROTECTED_BASE_URL}/api/v2/playlist/${id}`, {
            headers: { Authorization: `Bearer ${socket.data.token}` },
            signal: AbortSignal.timeout(AUTHORIZE_TIMEOUT_MS),
        });
        return response.ok;
    },
};

export const parseRoom = (room: unknown) => {
    if (typeof room !== "string") return null;
    const separator = room.indexOf(":");
    if (separator <= 0) return null;
    const type = room.slice(0, separator);
    const id = room.slice(separator + 1);
    if (!id || !(type in authorizers)) return null;
    return { type, id };
};

export const canJoinRoom = async (socket: Socket, room: unknown) => {
    const parsed = parseRoom(room);
    if (!parsed) return false;
    return authorizers[parsed.type]!(socket, parsed.id);
};
