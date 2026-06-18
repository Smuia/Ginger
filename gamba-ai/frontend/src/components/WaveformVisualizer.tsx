'use client';

import { useRef, useEffect, useCallback } from 'react';

interface WaveformVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

/**
 * Canvas-based audio waveform visualizer that reacts to live microphone input.
 * Renders concentric radial bars around the mic button area.
 */
export default function WaveformVisualizer({ stream, isActive }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const centerX = width / 2;
    const centerY = height / 2;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      const barCount = 64;
      const baseRadius = Math.min(width, height) * 0.22;
      const maxBarHeight = Math.min(width, height) * 0.18;
      const sliceAngle = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barHeight = value * maxBarHeight + 2;

        const angle = i * sliceAngle - Math.PI / 2;
        const x1 = centerX + Math.cos(angle) * baseRadius;
        const y1 = centerY + Math.sin(angle) * baseRadius;
        const x2 = centerX + Math.cos(angle) * (baseRadius + barHeight);
        const y2 = centerY + Math.sin(angle) * (baseRadius + barHeight);

        // Gold gradient based on intensity
        const alpha = 0.3 + value * 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(160, 120, 10, ${alpha})`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Inner glow ring
      const avgValue = dataArray.reduce((sum, v) => sum + v, 0) / bufferLength / 255;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius - 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(160, 120, 10, ${0.08 + avgValue * 0.25})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    render();
  }, []);

  useEffect(() => {
    if (!isActive || !stream) {
      // Clean up when inactive
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    // Set up audio analysis
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      source.disconnect();
      audioCtx.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [isActive, stream, draw]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx?.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}
