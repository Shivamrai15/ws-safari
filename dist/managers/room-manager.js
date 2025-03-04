"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const user_manager_1 = require("./user-manager");
const events_1 = require("../libs/events");
class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.users = new Map();
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getUser(socketId) {
        return this.users.get(socketId);
    }
    joinRoom(payload, socket, io) {
        var _a;
        const existingEntry = [...this.users.values()].find((entry) => entry.user.email === payload.email && entry.roomId === payload.roomId);
        if (existingEntry) {
            existingEntry.user.socketId = socket.id;
            this.users.delete(existingEntry.user.socketId);
            this.users.set(socket.id, { user: existingEntry.user, roomId: payload.roomId });
        }
        else {
            const user = new user_manager_1.User(payload.name, payload.email, socket.id, payload.isHost, payload.image);
            this.users.set(socket.id, { user, roomId: payload.roomId });
            let room = this.getRoom(payload.roomId);
            if (!room) {
                room = { roomId: payload.roomId, users: [] };
                this.rooms.set(payload.roomId, room);
            }
            room.users.push(user);
        }
        socket.join(payload.roomId);
        io.to(payload.roomId).emit(events_1.UPDATE_USER, (_a = this.getRoom(payload.roomId)) === null || _a === void 0 ? void 0 : _a.users, payload.roomId);
    }
    leaveRoom(socket, io) {
        const entry = this.getUser(socket.id);
        if (!entry)
            return;
        const room = this.getRoom(entry.roomId);
        if (!room)
            return;
        room.users = room.users.filter((user) => user.socketId !== socket.id);
        this.users.delete(socket.id);
        if (room.users.length === 0) {
            this.rooms.delete(entry.roomId);
        }
        else {
            io.to(entry.roomId).emit(events_1.UPDATE_USER, room.users, entry.roomId);
        }
        socket.leave(entry.roomId);
        socket.emit(events_1.LEAVE_ROOM);
    }
    end(roomId, io) {
        const room = this.getRoom(roomId);
        if (!room)
            return;
        room.users.forEach((user) => {
            const socket = io.sockets.sockets.get(user.socketId);
            if (socket) {
                socket.leave(roomId);
                socket.emit(events_1.LEAVE_ROOM);
            }
            this.users.delete(user.socketId);
        });
        this.rooms.delete(roomId);
    }
}
exports.RoomManager = RoomManager;
