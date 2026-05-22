/** Downsample an AudioBuffer to a peaks array suitable for visualization. */
export function extractPeaks(buffer: AudioBuffer, targetSamples = 2000): Float32Array {
  const channelData =
    buffer.numberOfChannels > 1
      ? mixToMono(buffer)
      : buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channelData.length / targetSamples));
  const peaks = new Float32Array(targetSamples);
  for (let i = 0; i < targetSamples; i++) {
    let max = 0;
    const start = i * block;
    const end = Math.min(channelData.length, start + block);
    for (let j = start; j < end; j++) {
      const v = Math.abs(channelData[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  // Normalize
  let m = 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
  if (m > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= m;
  return peaks;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i];
  }
  for (let i = 0; i < len; i++) out[i] /= buffer.numberOfChannels;
  return out;
}
