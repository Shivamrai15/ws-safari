"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTHORIZE_TIMEOUT_MS = exports.REDIS_CONNECT_TIMEOUT_MS = exports.REALTIME_CHANNEL = exports.PROTECTED_BASE_URL = exports.JWT_SECRET = void 0;
exports.JWT_SECRET = process.env.JWT_SECRET;
exports.PROTECTED_BASE_URL = process.env.PROTECTED_BASE_URL || "https://user-safari.onrender.com";
exports.REALTIME_CHANNEL = "realtime:events";
exports.REDIS_CONNECT_TIMEOUT_MS = 10 * 1000;
exports.AUTHORIZE_TIMEOUT_MS = 60 * 1000;
