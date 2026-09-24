"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const express_rate_limit_1 = require("express-rate-limit");
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("./realtime/redis");
const gateway_1 = require("./realtime/gateway");
const config_1 = require("./realtime/config");
const service_1 = require("./jam/service");
const store_1 = require("./jam/store");
const handlers_1 = require("./jam/handlers");
const PORT = process.env.PORT || 8080;
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.CLIENT || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});
const limiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 1000,
    limit: 50,
    standardHeaders: "draft-7",
    legacyHeaders: false
});
app.use(limiter);
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: process.env.CLIENT || "http://localhost:3000",
    methods: ["GET"]
}));
app.get("/", (req, res) => {
    res.send("Websocket server is working");
});
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        service: "Real-time Event Gateway",
        version: "2.0.0"
    });
});
const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
]);
function attachRedisAdapter() {
    return __awaiter(this, void 0, void 0, function* () {
        const pubClient = (0, redis_1.createRedisClient)();
        const subClient = pubClient.duplicate();
        subClient.on("error", (err) => console.error("Redis Client Error", err));
        try {
            yield withTimeout(Promise.all([pubClient.connect(), subClient.connect()]), config_1.REDIS_CONNECT_TIMEOUT_MS);
            io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
            console.log("Socket.IO Redis adapter attached");
        }
        catch (error) {
            console.error("Running without Socket.IO Redis adapter", error);
            pubClient.destroy();
            subClient.destroy();
        }
    });
}
function createJamService(realtime) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = (0, redis_1.createRedisClient)();
        try {
            yield withTimeout(client.connect(), config_1.REDIS_CONNECT_TIMEOUT_MS);
            return new service_1.JamService(realtime, new store_1.JamStore(client));
        }
        catch (error) {
            console.error("Jam is disabled because Redis is unavailable", error);
            client.destroy();
            return null;
        }
    });
}
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        yield attachRedisAdapter();
        const realtime = (0, gateway_1.setupRealtimeGateway)(io);
        const eventSubscriber = (0, redis_1.createRedisClient)();
        eventSubscriber.connect().catch((error) => console.error("Realtime event subscriber failed to connect", error));
        (0, gateway_1.forwardRealtimeEvents)(realtime, eventSubscriber);
        const jamService = yield createJamService(realtime);
        realtime.on("connection", (socket) => (0, handlers_1.registerJamHandlers)(socket, jamService));
        server.listen(PORT, () => {
            console.log(`App is listening on PORT ${PORT}`);
        });
    });
}
start();
