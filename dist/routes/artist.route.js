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
exports.artistRouter = void 0;
const express_1 = require("express");
const db_1 = require("../libs/db");
const SONGS_BATCH = 10;
const DISCOGRAPHY_BATCH = 6;
const artistRouter = (0, express_1.Router)();
exports.artistRouter = artistRouter;
artistRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.query;
        if (!id) {
            return res.send("Artist Id is missing").status(401);
        }
        const songs = yield db_1.db.song.findMany({
            where: {
                artistIds: {
                    has: id
                }
            },
            include: {
                album: true
            }
        });
        return res.json(songs);
    }
    catch (error) {
        return res.send("Internal server error").status(500);
    }
}));
artistRouter.get("/views", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.query;
        if (!id) {
            return res.send("Artist Id is missing").status(401);
        }
        const artist = yield db_1.db.view.count({
            where: {
                song: {
                    artistIds: {
                        has: id
                    }
                }
            }
        });
        if (!artist) {
            return res.send("Artist not found").status(404);
        }
        return res.json({ views: artist });
    }
    catch (error) {
        return res.send("Internal server error").status(500);
    }
}));
artistRouter.get("/songs", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, cursor } = req.query;
        if (!id) {
            return res.send("Artist Id is missing").status(401);
        }
        let songs = [];
        if (cursor) {
            songs = yield db_1.db.song.findMany({
                where: {
                    artists: {
                        some: {
                            id: id
                        }
                    }
                },
                include: {
                    album: true,
                    artists: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                take: SONGS_BATCH,
                skip: 1,
                cursor: {
                    id: cursor
                },
                orderBy: {
                    name: "asc"
                }
            });
        }
        else {
            songs = yield db_1.db.song.findMany({
                where: {
                    artists: {
                        some: {
                            id: id
                        }
                    }
                },
                include: {
                    album: true,
                    artists: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                take: SONGS_BATCH,
                orderBy: {
                    name: "asc"
                }
            });
        }
        let nextCursor = null;
        if (songs.length === SONGS_BATCH) {
            nextCursor = songs[SONGS_BATCH - 1].id;
        }
        return res.json({
            items: songs,
            nextCursor
        }).status(200);
    }
    catch (error) {
        return res.send("Internal server error").status(500);
    }
}));
artistRouter.get("/discography", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, cursor } = req.query;
        if (!id) {
            return res.send("Missing Artist Id").status(400);
        }
        let albums = [];
        if (cursor) {
            albums = yield db_1.db.album.findMany({
                where: {
                    songs: {
                        some: {
                            artistIds: {
                                has: id
                            }
                        }
                    }
                },
                include: {
                    songs: {
                        include: {
                            artists: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    release: "desc"
                },
                take: DISCOGRAPHY_BATCH,
                skip: 1,
                cursor: {
                    id: cursor
                },
            });
        }
        else {
            albums = yield db_1.db.album.findMany({
                where: {
                    songs: {
                        some: {
                            artistIds: {
                                has: id
                            }
                        }
                    }
                },
                include: {
                    songs: {
                        include: {
                            artists: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    release: "desc"
                },
                take: DISCOGRAPHY_BATCH,
            });
        }
        let nextCursor = null;
        if (albums.length === DISCOGRAPHY_BATCH) {
            nextCursor = albums[DISCOGRAPHY_BATCH - 1].id;
        }
        return res.json({
            items: albums,
            nextCursor
        });
    }
    catch (error) {
        console.log("DISCOGRAPHY API ERROR", error);
        return res.send("Internal server error").status(500);
    }
}));
