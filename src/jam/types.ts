export type JamMode = "EVERYONE_PLAYS" | "HOST_SPEAKER";
export type JoinApproval = "OPEN" | "HOST_APPROVES";

export interface JamSettings {
    mode: JamMode;
    guestsCanControlPlayback: boolean;
    guestsCanAddSongs: boolean;
    guestsCanReorderAndRemove: boolean;
    joinApproval: JoinApproval;
    maxMembers: number;
    endWhenHostLeaves: boolean;
}

export interface JamSong {
    id: string;
    name: string;
    image: string;
    url: string;
    duration: number;
    albumId: string;
    album: Record<string, unknown>;
    artists?: { id: string; name: string; image?: string }[];
}

export interface JamTrack {
    itemId: string;
    song: JamSong;
    addedBy: string;
}

export interface JamMember {
    userId: string;
    name: string;
    image: string | null;
    joinedAt: number;
}

export interface JamPlayback {
    status: "playing" | "paused";
    positionMs: number;
    updatedAt: number;
}

export interface JamState {
    id: string;
    code: string;
    hostId: string;
    createdAt: number;
    version: number;
    settings: JamSettings;
    members: JamMember[];
    pending: JamMember[];
    queue: JamTrack[];
    currentIndex: number;
    playback: JamPlayback;
}

export interface JamProfile {
    name: string;
    image: string | null;
}

export type JamCommand =
    | { type: "PLAY"; positionMs?: number }
    | { type: "PAUSE"; positionMs?: number }
    | { type: "SEEK"; positionMs: number }
    | { type: "NEXT" }
    | { type: "PREV" }
    | { type: "TRACK_ENDED"; itemId: string }
    | { type: "ADD"; songs: JamSong[]; next?: boolean }
    | { type: "PLAY_SONGS"; songs: JamSong[] }
    | { type: "REPLACE_QUEUE"; songs: JamSong[] }
    | { type: "JUMP"; itemId: string }
    | { type: "REMOVE"; itemId: string }
    | { type: "MOVE"; itemIds: string[] }
    | { type: "SHUFFLE" }
    | { type: "UPDATE_SETTINGS"; settings: Partial<JamSettings> }
    | { type: "KICK"; userId: string }
    | { type: "TRANSFER_HOST"; userId: string };

export type JamCommandType = JamCommand["type"];
