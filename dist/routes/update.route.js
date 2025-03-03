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
exports.updateRouter = void 0;
const express_1 = require("express");
const db_1 = require("../libs/db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const updateRouter = (0, express_1.Router)();
exports.updateRouter = updateRouter;
updateRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const albumsRef = yield db_1.db.album.findMany({
            select: {
                id: true,
                name: true
            }
        });
        const albums = albumsRef.map((album) => (Object.assign(Object.assign({}, album), { type: "ALBUM" })));
        const songsRef = yield db_1.db.song.findMany({
            select: {
                id: true,
                name: true
            }
        });
        const songs = songsRef.map((song) => (Object.assign(Object.assign({}, song), { type: "SONG" })));
        const artistsRef = yield db_1.db.artist.findMany({
            select: {
                id: true,
                name: true
            }
        });
        const artists = artistsRef.map((artist) => (Object.assign(Object.assign({}, artist), { type: "ARTIST" })));
        const fields = [...albums, ...songs, ...artists];
        const filePath = path_1.default.join(__dirname, "data.json");
        fs_1.default.writeFile(filePath, JSON.stringify(fields), (err) => {
            if (err) {
                console.log("Something went wrong while writing the file");
            }
        });
        return res.json({ success: true }).status(201);
    }
    catch (error) {
        console.log("DB update error");
        return res.send("Internal server error").status(500);
    }
}));
