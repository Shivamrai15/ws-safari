import { Socket } from "socket.io";
import { SocketUser } from "../realtime/auth";
import { JamResult, JamService } from "./service";

type Ack = (response: unknown) => void;

const asPayload = (value: unknown) =>
    (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

const respond = (ack: unknown, body: unknown) => {
    if (typeof ack === "function") (ack as Ack)(body);
};

export const registerJamHandlers = (socket: Socket, service: JamService | null) => {
    const user = socket.data.user as SocketUser;

    const handle = (event: string, run: (payload: Record<string, unknown>) => Promise<JamResult>) => {
        socket.on(event, async (payload: unknown, ack?: unknown) => {
            const callback = typeof payload === "function" ? payload : ack;
            if (!service) {
                respond(callback, { ok: false, error: "Jam is unavailable right now" });
                return;
            }
            try {
                respond(callback, await run(asPayload(payload)));
            } catch (error) {
                console.error(`${event.toUpperCase()} ERROR`, error);
                respond(callback, { ok: false, error: "Something went wrong, please try again" });
            }
        });
    };

    socket.on("jam:ping", (payload: unknown, ack?: unknown) => {
        respond(typeof payload === "function" ? payload : ack, { serverTime: Date.now() });
    });

    handle("jam:sync", () => service!.current(user));
    handle("jam:create", (payload) => service!.create(user, payload));
    handle("jam:join", (payload) => service!.join(user, payload));
    handle("jam:respond", (payload) => service!.respondToJoin(user, payload));
    handle("jam:leave", () => service!.leave(user.userId));
    handle("jam:end", () => service!.endByHost(user));
    handle("jam:command", (payload) => service!.command(user, String(socket.data.token), payload));

    service?.cancelAbsenceCheck(user.userId);
    socket.on("disconnect", () => service?.scheduleAbsenceCheck(user.userId));
};
