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
exports.songRouter = void 0;
const express_1 = require("express");
const db_1 = require("../libs/db");
const songRouter = (0, express_1.Router)();
exports.songRouter = songRouter;
const BATCH = 10;
songRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.query;
        if (!id) {
            return res.send("Missing song Id").status(401);
        }
        const song = yield db_1.db.song.findUnique({
            where: {
                id: id
            },
            include: {
                album: true
            }
        });
        if (!song) {
            return res.send("Song not found").status(404);
        }
        res.json(song).status(200);
    }
    catch (error) {
        return res.send("Internal server error").status(500);
    }
}));
songRouter.get("/most-played", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cursor } = req.query;
        let songs = [];
        if (cursor) {
            songs = yield db_1.db.song.findMany({
                where: {
                    view: {
                        some: {}
                    }
                },
                include: {
                    album: true,
                    artists: {
                        select: {
                            id: true,
                            name: true,
                            image: true
                        }
                    }
                },
                orderBy: [
                    {
                        view: {
                            _count: "desc"
                        }
                    },
                    {
                        name: "asc"
                    }
                ],
                skip: 1,
                cursor: {
                    id: cursor
                },
                take: BATCH
            });
        }
        else {
            songs = yield db_1.db.song.findMany({
                where: {
                    view: {
                        some: {}
                    }
                },
                include: {
                    album: true,
                    artists: {
                        select: {
                            id: true,
                            name: true,
                            image: true
                        }
                    }
                },
                orderBy: [
                    {
                        view: {
                            _count: "desc"
                        }
                    },
                    {
                        name: "asc"
                    }
                ],
                take: BATCH
            });
        }
        let nextCursor = null;
        if (songs.length === BATCH) {
            nextCursor = songs[BATCH - 1].id;
        }
        return res.json({
            items: songs,
            nextCursor
        });
    }
    catch (error) {
        return res.send("Internal server error").status(500);
    }
}));
