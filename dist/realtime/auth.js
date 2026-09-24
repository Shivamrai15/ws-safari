"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateSocket = exports.verifyAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("./config");
const verifyAccessToken = (token) => {
    if (typeof token !== "string" || !config_1.JWT_SECRET)
        return null;
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET);
        if (typeof decoded.userId !== "string")
            return null;
        return {
            userId: decoded.userId,
            email: typeof decoded.email === "string" ? decoded.email : "",
        };
    }
    catch (_a) {
        return null;
    }
};
exports.verifyAccessToken = verifyAccessToken;
const authenticateSocket = (socket, next) => {
    var _a;
    const token = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token;
    const user = (0, exports.verifyAccessToken)(token);
    if (!user) {
        return next(new Error("unauthorized"));
    }
    socket.data.user = user;
    socket.data.token = token;
    next();
};
exports.authenticateSocket = authenticateSocket;
