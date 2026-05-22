/**
 * Simple BPM detector.
 * Strategy: low-pass filter -> energy peaks -> interval histogram -> tempo in 70-180 range.
 * Runs on main thread (small CPU cost on decoded buffer). Acceptable for v1.
 */
export function detectBPM(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate;
  // Use up to first 60s to keep it fast
  const maxSamples = Math.min(buffer.length, sr * 60);
  const data = buffer.getChannelData(0).subarray(0, maxSamples);

  // 1. Compute short-term energy in ~10ms windows
  const win = Math.floor(sr * 0.01);
  const energies = new Float32Array(Math.floor(data.length / win));
  for (let i = 0; i < energies.length; i++) {
    let e = 0;
    const start = i * win;
    for (let j = 0; j < win; j++) {
      const s = data[start + j];
      e += s * s;
    }
    energies[i] = e;
  }

  // 2. Onset detection: spectral flux-like (positive difference)
  const onsets: number[] = [];
  for (let i = 1; i < energies.length; i++) {
    const d = energies[i] - energies[i - 1];
    onsets.push(d > 0 ? d : 0);
  }

  // 3. Autocorrelation over plausible BPM range (60-200)
  const minBpm = 70;
  const maxBpm = 180;
  const framesPerSec = sr / win;
  const minLag = Math.floor((60 / maxBpm) * framesPerSec);
  const maxLag = Math.floor((60 / minBpm) * framesPerSec);
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < onsets.length; i++) {
      score += onsets[i] * onsets[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const bpm = (60 * framesPerSec) / bestLag;
  // Clamp to range with octave correction
  let result = bpm;
  while (result < minBpm) result *= 2;
  while (result > maxBpm) result /= 2;
  return Math.round(result * 10) / 10;
}
