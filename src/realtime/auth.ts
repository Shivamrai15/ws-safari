import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { JWT_SECRET } from "./config";

export interface SocketUser {
    userId: string;
    email: string;
}

export const verifyAccessToken = (token: unknown): SocketUser | null => {
    if (typeof token !== "string" || !JWT_SECRET) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId?: unknown; email?: unknown };
        if (typeof decoded.userId !== "string") return null;
        return {
            userId: decoded.userId,
            email: typeof decoded.email === "string" ? decoded.email : "",
        };
    } catch {
        return null;
    }
};

export const authenticateSocket = (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token;
    const user = verifyAccessToken(token);
    if (!user) {
        return next(new Error("unauthorized"));
    }
    socket.data.user = user;
    socket.data.token = token;
    next();
};
