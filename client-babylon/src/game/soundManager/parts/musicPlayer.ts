export const MUSIC_DIR = "/assets/audio/music/";

export interface MusicTrack {
  file: string;
  volume: number;
}

export const MUSIC_TRACKS: Record<string, MusicTrack> = {
  menu: { file: "battle_variant_1.mp3", volume: 0.2 },
  battle: { file: "battle_variant_2.mp3", volume: 0.2 },
};
