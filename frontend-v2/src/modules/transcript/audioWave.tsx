import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
    isRecording: boolean;
}

const AudioWaveform = ({ isRecording }: AudioWaveformProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const analyserRef = useRef<AnalyserNode | undefined>(undefined);
    const audioContextRef = useRef<AudioContext | undefined>(undefined);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set up canvas dimensions with device pixel ratio
        const setupCanvas = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            ctx.scale(dpr, dpr);
            canvas.style.width = `100%`;
            canvas.style.height = `${rect.height}px`;
        };

        setupCanvas();

        const drawFlatLine = () => {
            const width = canvas.width / window.devicePixelRatio;
            const height = canvas.height / window.devicePixelRatio;

            ctx.fillStyle = '#f3f4f6';
            ctx.fillRect(0, 0, width, height);

            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 2;
            ctx.stroke();
        };

        const startVisualization = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

                // Create audio context and analyser
                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;

                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);

                analyserRef.current = analyser;
                audioContextRef.current = audioContext;

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const draw = () => {
                    const width = canvas.width / window.devicePixelRatio;
                    const height = canvas.height / window.devicePixelRatio;

                    analyser.getByteTimeDomainData(dataArray);

                    ctx.fillStyle = '#f3f4f6';
                    ctx.fillRect(0, 0, width, height);

                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#dc2626';
                    ctx.beginPath();

                    const sliceWidth = width / bufferLength;
                    let x = 0;

                    for (let i = 0; i < bufferLength; i++) {
                        const v = dataArray[i] / 128.0;
                        const y = (v * height) / 2;

                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }

                        x += sliceWidth;
                    }

                    ctx.lineTo(width, height / 2);
                    ctx.stroke();

                    animationFrameRef.current = requestAnimationFrame(draw);
                };

                draw();
            } catch (error) {
                console.error('Error accessing microphone:', error);
                drawFlatLine();
            }
        };

        if (isRecording) {
            startVisualization();
        } else {
            if (audioContextRef.current?.state !== 'closed') {
                audioContextRef.current?.close();
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            drawFlatLine();
        }

        // Clean up
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (audioContextRef.current?.state !== 'closed') {
                audioContextRef.current?.close();
            }
        };
    }, [isRecording]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

export default AudioWaveform;
