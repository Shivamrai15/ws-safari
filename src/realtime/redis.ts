import { createClient } from "redis";

const [redisHost, redisPortText] = (process.env.REDIS_URL || "localhost").split(":");
const redisPort = Number(redisPortText) || Number(process.env.REDIS_PORT) || 16296;

export const createRedisClient = () => {
    const client = createClient({
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

export type RedisClient = ReturnType<typeof createRedisClient>;
