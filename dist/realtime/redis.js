"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisClient = void 0;
const redis_1 = require("redis");
const [redisHost, redisPortText] = (process.env.REDIS_URL || "localhost").split(":");
const redisPort = Number(redisPortText) || Number(process.env.REDIS_PORT) || 16296;
const createRedisClient = () => {
    const client = (0, redis_1.createClient)({
        username: "default",
        password: process.env.REDIS_PASSWORD || "",
        socket: {
            host: redisHost,
            port: redisPort,
        },
    });
    client.on("error", (err) => console.error("Redis Client Error", err));
    return client;
};
exports.createRedisClient = createRedisClient;
