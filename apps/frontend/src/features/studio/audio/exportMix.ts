/**
 * exportMix — attach a mixed-down PCM track to a rendered MP4 (Phase 4 Run 3, 4.8).
 *
 * The video track is PACKET-COPIED (no re-encode): packets are read from the input
 * with an EncodedPacketSink and fed, in decode order, to an EncodedVideoPacketSource
 * built from the input track's codec, with the track's decoder config passed as the
 * first packet's metadata. The mixed audio is fed as AudioSamples (f32-planar,
 * ~21 ms chunks) to an AudioSampleSource encoding AAC.
 *
 * The input's own audio track is NOT copied — the render that produced `videoBlob`
 * was made muted, and even if an audio track were present it is dropped here: the
 * mixed audio is the only audio in the output.
 *
 * Mediabunny 1.47 API verified against the installed dist types:
 * Input / BlobSource / ALL_FORMATS / EncodedPacketSink / EncodedVideoPacketSource /
 * AudioSample / AudioSampleSource / Output / Mp4OutputFormat / BufferTarget.
 */
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

export interface MuxMixedAudioOptions {
  videoBlob: Blob;
  audio: { channels: [Float32Array, Float32Array]; sampleRate: number };
  onProgress?: (fraction: number) => void;
}

/** Audio chunk size fed to the encoder: 1024 frames (~21 ms at 48 kHz). */
const AUDIO_CHUNK_FRAMES = 1024;

/**
 * Mux `audio` (stereo PCM) into a copy of `videoBlob`'s video track as AAC.
 * Throws a clear Error when the input has no video track (or no known codec).
 * Resolves to the finished MP4 as a Blob.
 */
export async function muxMixedAudioIntoMp4(opts: MuxMixedAudioOptions): Promise<Blob> {
  const input = new Input({ source: new BlobSource(opts.videoBlob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack().catch(() => null);
    if (!videoTrack) throw new Error("muxMixedAudioIntoMp4: the rendered video has no video track to copy.");
    const codec = await videoTrack.getCodec().catch(() => null);
    if (!codec) throw new Error("muxMixedAudioIntoMp4: the rendered video's codec could not be determined.");
    const decoderConfig = await videoTrack.getDecoderConfig().catch(() => null);

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const videoSource = new EncodedVideoPacketSource(codec);
    output.addVideoTrack(videoSource);

    const [left, right] = opts.audio.channels;
    const frameCount = Math.min(left.length, right.length);
    const audioSource = frameCount > 0 ? new AudioSampleSource({ codec: "aac", bitrate: 192_000 }) : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();
    try {
      // Video packet copy and audio feeding run concurrently: the muxer interleaves
      // the two tracks by timestamp internally, and serial feeding could stall on
      // one track's backpressure while the other is starved.
      const videoTask = (async () => {
        const sink = new EncodedPacketSink(videoTrack);
        let first = true;
        let copied = 0;
        for await (const packet of sink.packets()) {
          const meta: EncodedVideoChunkMetadata | undefined =
            first && decoderConfig ? { decoderConfig } : undefined;
          await videoSource.add(packet, meta);
          first = false;
          copied++;
          if (copied % 30 === 0) opts.onProgress?.(0.25);
        }
      })();

      const audioTask = (async () => {
        if (!audioSource) return;
        const { sampleRate } = opts.audio;
        for (let start = 0; start < frameCount; start += AUDIO_CHUNK_FRAMES) {
          const frames = Math.min(AUDIO_CHUNK_FRAMES, frameCount - start);
          // f32-planar layout: all of L's frames, then all of R's frames.
          const data = new Float32Array(frames * 2);
          data.set(left.subarray(start, start + frames), 0);
          data.set(right.subarray(start, start + frames), frames);
          const sample = new AudioSample({
            data: data.buffer as ArrayBuffer,
            format: "f32-planar",
            numberOfChannels: 2,
            sampleRate,
            timestamp: start / sampleRate,
          });
          await audioSource.add(sample);
          sample.close();
        }
        opts.onProgress?.(0.75);
      })();

      await Promise.all([videoTask, audioTask]);
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    }
    opts.onProgress?.(1);
    if (!target.buffer) throw new Error("muxMixedAudioIntoMp4: muxing finished without producing a file.");
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}
