import { createClient } from "redis";

export const createRedisClient = () => {
    const client = createClient({
        username: "default",
        password: process.env.REDIS_PASSWORD || "",
        socket: {
            host: process.env.REDIS_URL || "localhost",
            port: Number(process.env.REDIS_PORT) || 16296,
        },
    });
    client.on("error", (err) => console.error("Redis Client Error", err));
    return client;
};

export type RedisClient = ReturnType<typeof createRedisClient>;
