import { Server, Socket } from "socket.io";
import { User } from "./user-manager";
import { LEAVE_ROOM, UPDATE_USER } from "../libs/events";

interface Room {
    roomId: string;
    users: User[];
}

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private users: Map<string, { user: User; roomId: string }> = new Map();

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    getUser(socketId: string) {
        return this.users.get(socketId);
    }

    joinRoom(
        payload: { name: string; email: string; roomId: string; isHost: boolean; image?: string },
        socket: Socket,
        io: Server
    ) {
        const existingEntry = [...this.users.values()].find((entry) => entry.user.email === payload.email && entry.roomId === payload.roomId);
        if (existingEntry) {
            existingEntry.user.socketId = socket.id;
            this.users.delete(existingEntry.user.socketId);
            this.users.set(socket.id, { user: existingEntry.user, roomId: payload.roomId });
        } else {
            const user = new User(payload.name, payload.email, socket.id, payload.isHost, payload.image);
            this.users.set(socket.id, { user, roomId: payload.roomId });
            let room = this.getRoom(payload.roomId);
            if (!room) {
                room = { roomId: payload.roomId, users: [] };
                this.rooms.set(payload.roomId, room);
            }
             room.users.push(user);
        }
        socket.join(payload.roomId);
        io.to(payload.roomId).emit(UPDATE_USER, this.getRoom(payload.roomId)?.users, payload.roomId);
    }

    leaveRoom(socket: Socket, io: Server) {
        const entry = this.getUser(socket.id);
        if (!entry) return;

        const room = this.getRoom(entry.roomId);
        if (!room) return;

        room.users = room.users.filter((user) => user.socketId !== socket.id);
        this.users.delete(socket.id);
        if (room.users.length === 0) {
            this.rooms.delete(entry.roomId);
        } else {
            io.to(entry.roomId).emit(UPDATE_USER, room.users, entry.roomId);
        }
        socket.leave(entry.roomId);
        socket.emit(LEAVE_ROOM);
    }

    end(roomId: string, io: Server) {
        const room = this.getRoom(roomId);
        if (!room) return;
        room.users.forEach((user) => {
            const socket = io.sockets.sockets.get(user.socketId);
            if (socket) {
                socket.leave(roomId);
                socket.emit(LEAVE_ROOM);
            }
            this.users.delete(user.socketId);
        });
        this.rooms.delete(roomId);
    }
}