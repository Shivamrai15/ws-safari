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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJamHandlers = void 0;
const asPayload = (value) => (value && typeof value === "object" ? value : {});
const respond = (ack, body) => {
    if (typeof ack === "function")
        ack(body);
};
const registerJamHandlers = (socket, service) => {
    const user = socket.data.user;
    const handle = (event, run) => {
        socket.on(event, (payload, ack) => __awaiter(void 0, void 0, void 0, function* () {
            const callback = typeof payload === "function" ? payload : ack;
            if (!service) {
                respond(callback, { ok: false, error: "Jam is unavailable right now" });
                return;
            }
            try {
                respond(callback, yield run(asPayload(payload)));
            }
            catch (error) {
                console.error(`${event.toUpperCase()} ERROR`, error);
                respond(callback, { ok: false, error: "Something went wrong, please try again" });
            }
        }));
    };
    socket.on("jam:ping", (payload, ack) => {
        respond(typeof payload === "function" ? payload : ack, { serverTime: Date.now() });
    });
    handle("jam:sync", () => service.current(user));
    handle("jam:create", (payload) => service.create(user, payload));
    handle("jam:join", (payload) => service.join(user, payload));
    handle("jam:respond", (payload) => service.respondToJoin(user, payload));
    handle("jam:leave", () => service.leave(user.userId));
    handle("jam:end", () => service.endByHost(user));
    handle("jam:command", (payload) => service.command(user, String(socket.data.token), payload));
    service === null || service === void 0 ? void 0 : service.cancelAbsenceCheck(user.userId);
    socket.on("disconnect", () => service === null || service === void 0 ? void 0 : service.scheduleAbsenceCheck(user.userId));
};
exports.registerJamHandlers = registerJamHandlers;
