import express from "express";
import cors from "cors";
import http from "http";
import { rateLimit } from "express-rate-limit";
import { Namespace, Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createRedisClient } from "./realtime/redis";
import { forwardRealtimeEvents, setupRealtimeGateway } from "./realtime/gateway";
import { REDIS_CONNECT_TIMEOUT_MS } from "./realtime/config";
import { JamService } from "./jam/service";
import { JamStore } from "./jam/store";
import { registerJamHandlers } from "./jam/handlers";


const PORT = process.env.PORT! || 8080;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors : {
        origin : process.env.CLIENT || "http://localhost:3000",
        methods : ["GET", "POST"]
    }
});

const limiter = rateLimit({
    windowMs : 1000,
    limit : 50,
    standardHeaders : "draft-7",
    legacyHeaders : false
});


app.use(limiter);
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT || "http://localhost:3000",
    methods : ["GET"]
}));

app.get("/", (req, res)=>{
    res.send("Websocket server is working");
});

app.get("/api/v1/health", (req, res)=>{
    res.status(200).json({
        status: "healthy",
        service: "Real-time Event Gateway",
        version: "2.0.0"
    });
});


const withTimeout = <T>(promise: Promise<T>, ms: number) => Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
]);

async function attachRedisAdapter() {
    const pubClient = createRedisClient();
    const subClient = pubClient.duplicate();
    subClient.on("error", (err) => console.error("Redis Client Error", err));
    try {
        await withTimeout(Promise.all([pubClient.connect(), subClient.connect()]), REDIS_CONNECT_TIMEOUT_MS);
        io.adapter(createAdapter(pubClient, subClient));
        console.log("Socket.IO Redis adapter attached");
    } catch (error) {
        console.error("Running without Socket.IO Redis adapter", error);
        pubClient.destroy();
        subClient.destroy();
    }
}

async function createJamService(realtime: Namespace) {
    const client = createRedisClient();
    try {
        await withTimeout(client.connect(), REDIS_CONNECT_TIMEOUT_MS);
        return new JamService(realtime, new JamStore(client));
    } catch (error) {
        console.error("Jam is disabled because Redis is unavailable", error);
        client.destroy();
        return null;
    }
}

async function start() {
    await attachRedisAdapter();

    const realtime = setupRealtimeGateway(io);
    const eventSubscriber = createRedisClient();
    eventSubscriber.connect().catch((error) => console.error("Realtime event subscriber failed to connect", error));
    forwardRealtimeEvents(realtime, eventSubscriber);

    const jamService = await createJamService(realtime);
    realtime.on("connection", (socket) => registerJamHandlers(socket, jamService));

    server.listen(PORT, ()=>{
        console.log(`App is listening on PORT ${PORT}`)
    });
}

start();
