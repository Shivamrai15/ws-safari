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
exports.searchRouter = void 0;
const express_1 = require("express");
const fuse_js_1 = __importDefault(require("fuse.js"));
const db_1 = require("../libs/db");
const data_json_1 = __importDefault(require("./data.json"));
const fuseOptions = {
    keys: ['name'],
    threshold: 0.4
};
const searchRouter = (0, express_1.Router)();
exports.searchRouter = searchRouter;
searchRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        const fuse = new fuse_js_1.default(data_json_1.default, fuseOptions);
        const similarity = fuse.search(query);
        const songRefs = similarity.filter((result) => (result.item.type === "SONG")).map((result) => result.item.id).slice(0, 5);
        ;
        const albumRefs = similarity.filter((result) => (result.item.type === "ALBUM")).map((result) => result.item.id).slice(0, 5);
        ;
        const artistRefs = similarity.filter((result) => (result.item.type === "ARTIST")).map((result) => result.item.id).slice(0, 5);
        ;
        const [albums, artists, songs] = yield db_1.db.$transaction([
            db_1.db.album.findMany({
                where: {
                    id: {
                        in: albumRefs
                    }
                }
            }),
            db_1.db.artist.findMany({
                where: {
                    id: {
                        in: artistRefs
                    }
                },
                select: {
                    id: true,
                    name: true,
                    image: true
                }
            }),
            db_1.db.song.findMany({
                where: {
                    id: {
                        in: songRefs
                    }
                },
                include: {
                    album: true,
                    artists: {
                        select: {
                            id: true,
                            image: true,
                            name: true
                        }
                    }
                }
            }),
        ]);
        songs.sort((a, b) => songRefs.indexOf(a.id) - songRefs.indexOf(b.id));
        albums.sort((a, b) => albumRefs.indexOf(a.id) - albumRefs.indexOf(b.id));
        artists.sort((a, b) => artistRefs.indexOf(a.id) - artistRefs.indexOf(b.id));
        const topResult = similarity[0].item.type === "SONG" ? songs.shift() : similarity[0].item.type === "ALBUM" ? albums.shift() : artists.shift();
        return res.json({ topResult, songs, albums, artists });
    }
    catch (error) {
        console.error(error);
        return res.send("Internal server error").status(500);
    }
}));
searchRouter.get("/song", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        const fuse = new fuse_js_1.default(data_json_1.default, fuseOptions);
        const similarity = fuse.search(query)
            .filter((result) => (result.item.type === "SONG"))
            .map((result) => result.item.id);
        if (similarity.length === 0) {
            return res.json(null).status(200);
        }
        const songs = yield db_1.db.song.findMany({
            where: {
                id: {
                    in: similarity
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
            }
        });
        songs.sort((a, b) => similarity.indexOf(a.id) - similarity.indexOf(b.id));
        return res.json(songs).status(200);
    }
    catch (error) {
        console.error(error);
        return res.send("Internal server error").status(500);
    }
}));
searchRouter.get("/album", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        const fuse = new fuse_js_1.default(data_json_1.default, fuseOptions);
        const similarity = fuse.search(query)
            .filter((result) => (result.item.type === "ALBUM"))
            .map((result) => result.item.id);
        if (similarity.length === 0) {
            return res.json(null).status(200);
        }
        const albums = yield db_1.db.album.findMany({
            where: {
                id: {
                    in: similarity
                }
            },
        });
        albums.sort((a, b) => similarity.indexOf(a.id) - similarity.indexOf(b.id));
        return res.json(albums).status(200);
    }
    catch (error) {
        console.error(error);
        return res.send("Internal server error").status(500);
    }
}));
searchRouter.get("/artist", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        const fuse = new fuse_js_1.default(data_json_1.default, fuseOptions);
        const similarity = fuse.search(query)
            .filter((result) => (result.item.type === "ARTIST"))
            .map((result) => result.item.id);
        if (similarity.length === 0) {
            return res.json(null).status(200);
        }
        const artists = yield db_1.db.artist.findMany({
            where: {
                id: {
                    in: similarity
                }
            },
            select: {
                id: true,
                name: true,
                image: true
            }
        });
        artists.sort((a, b) => similarity.indexOf(a.id) - similarity.indexOf(b.id));
        return res.json(artists).status(200);
    }
    catch (error) {
        console.error(error);
        return res.send("Internal server error").status(500);
    }
}));
