import { getSfxUrl, SFX_CATALOG } from "./parts/sfxCatalog";
import { MUSIC_DIR, MUSIC_TRACKS } from "./parts/musicPlayer";

const CROSSFADE_SEC = 2.5;
const DUCK_AMOUNT = 0.4; // music drops to 40% of its volume during priority SFX
const DUCK_RELEASE_SEC = 0.6;

/** Priority SFX that trigger music ducking */
const DUCK_SFX = new Set(["goal", "goalCrowd", "victory", "defeat"]);

export class SoundManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private currentMusic: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicName = "";
  private musicVolume = 0;
  private sfxVolume = 1;
  private muted = false;
  private loadingPromise: Promise<void> | null = null;

  /** Call once from a click/touch handler to create AudioContext */
  unlock() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.loadingPromise = this.loadAll();
  }

  async waitForLoad() {
    await this.loadingPromise;
  }

  get isReady() {
    return this.ctx !== null;
  }

  private async loadAll() {
    if (!this.ctx) return;
    const promises: Promise<void>[] = [];

    for (const [name, entry] of Object.entries(SFX_CATALOG)) {
      const bufferList: AudioBuffer[] = [];
      this.buffers.set(name, bufferList);
      for (const file of entry.files) {
        promises.push(
          fetch(getSfxUrl(file))
            .then((r) => r.arrayBuffer())
            .then((data) => this.ctx!.decodeAudioData(data))
            .then((buf) => {
              bufferList.push(buf);
            })
            .catch(() => {}),
        );
      }
    }

    for (const [name, track] of Object.entries(MUSIC_TRACKS)) {
      const bufferList: AudioBuffer[] = [];
      this.buffers.set(`music_${name}`, bufferList);
      promises.push(
        fetch(MUSIC_DIR + track.file)
          .then((r) => r.arrayBuffer())
          .then((data) => this.ctx!.decodeAudioData(data))
          .then((buf) => {
            bufferList.push(buf);
          })
          .catch(() => {}),
      );
    }

    await Promise.all(promises);
  }

  play(name: string) {
    if (this.muted || !this.ctx) return;
    const bufs = this.buffers.get(name);
    if (!bufs || bufs.length === 0) return;
    const entry = SFX_CATALOG[name];
    if (!entry) return;

    const buf = bufs[Math.floor(Math.random() * bufs.length)];
    const source = this.ctx.createBufferSource();
    source.buffer = buf;

    if (entry.pitchRange) {
      source.playbackRate.value =
        1 + (Math.random() * 2 - 1) * entry.pitchRange;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = entry.volume * this.sfxVolume;
    source.connect(gain).connect(this.ctx.destination);
    source.start();

    // Duck music for priority SFX
    if (DUCK_SFX.has(name)) {
      this.duckMusic();
    }
  }

  playMusic(name: string) {
    if (!this.ctx) return;
    if (this.musicName === name && this.currentMusic) return;

    const bufs = this.buffers.get(`music_${name}`);
    if (!bufs || bufs.length === 0) return;
    const track = MUSIC_TRACKS[name];
    if (!track) return;

    // Crossfade: fade out old
    if (this.currentMusic && this.musicGain && this.ctx) {
      const oldGain = this.musicGain;
      const oldSource = this.currentMusic;
      const now = this.ctx.currentTime;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);
      setTimeout(() => {
        try {
          oldSource.stop();
        } catch {}
      }, CROSSFADE_SEC * 1000);
    }

    // Start new track
    const source = this.ctx.createBufferSource();
    source.buffer = bufs[0];
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.ctx.destination);
    source.start();

    // Fade in new
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(track.volume, now + CROSSFADE_SEC);

    this.currentMusic = source;
    this.musicGain = gain;
    this.musicName = name;
    this.musicVolume = track.volume;
  }

  stopMusic() {
    if (this.musicGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0, now + 1);
      const src = this.currentMusic;
      setTimeout(() => {
        try {
          src?.stop();
        } catch {}
      }, 1000);
    }
    this.currentMusic = null;
    this.musicGain = null;
    this.musicName = "";
  }

  /** Temporarily lower music volume for important SFX */
  private duckMusic() {
    if (!this.musicGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(
      this.musicVolume * DUCK_AMOUNT,
      now + 0.08,
    );
    // Restore after release
    this.musicGain.gain.setValueAtTime(
      this.musicVolume * DUCK_AMOUNT,
      now + 0.08 + DUCK_RELEASE_SEC,
    );
    this.musicGain.gain.linearRampToValueAtTime(
      this.musicVolume,
      now + 0.08 + DUCK_RELEASE_SEC + 0.5,
    );
  }

  stopLoop(_name: string) {}

  setSfxVolume(v: number) {
    this.sfxVolume = v;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopMusic();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
