import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';

interface AudioPlayButtonProps {
    audioUrl: string | null;
    isLoading: boolean;
    onGenerate: () => void;
    isGenerateDisabled: boolean;
}

const AudioPlayButton = ({ audioUrl, isLoading, onGenerate, isGenerateDisabled }: AudioPlayButtonProps) => {
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!audioUrl || !audioRef.current) return;
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        // audioRef.current.play().catch(e => console.warn('Audio autoplay blocked', e));  //auto play feature
    }, [audioUrl]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
        };
    }, []);

    const toggleAudioPlay = async () => {
        if (!audioRef.current) return;
        try {
            if (audioRef.current.paused) {
                await audioRef.current.play();
            } else {
                audioRef.current.pause();
            }
        } catch (e) {
            console.error('Audio playback error', e);
        }
    };

    const handleAudioSeek = (value: number) => {
        if (!audioRef.current || !Number.isFinite(value)) return;
        audioRef.current.currentTime = value;
        setAudioCurrentTime(value);
    };

    return (
        <>
            <audio
                ref={audioRef}
                src={audioUrl || undefined}
                preload="auto"
                className="hidden"
                onPlay={() => setIsAudioPlaying(true)}
                onPause={() => setIsAudioPlaying(false)}
                onEnded={() => setIsAudioPlaying(false)}
                onLoadedMetadata={e => setAudioDuration(e.currentTarget.duration || 0)}
                onDurationChange={e => setAudioDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={e => setAudioCurrentTime(e.currentTarget.currentTime || 0)}
            />
            {audioUrl ? (
                <Button outlined disabled={isLoading} onClick={toggleAudioPlay} startIcon={isAudioPlaying ? <Pause size={16} /> : <Play size={16} />}>
                    <input
                        type="range"
                        min={0}
                        max={audioDuration || 0}
                        step={0.1}
                        value={Math.min(audioCurrentTime, audioDuration || 0)}
                        onChange={e => handleAudioSeek(Number(e.target.value))}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        className="h-2 w-32 cursor-pointer accent-blue-600"
                        aria-label="Audio seek"
                    />
                </Button>
            ) : (
                <Button disabled={isGenerateDisabled || isLoading} onClick={onGenerate} startIcon={isLoading ? <Spinner size={16} /> : null}>
                    {isLoading ? 'Generating audio...' : 'Generate Audio'}
                </Button>
            )}
        </>
    );
};

export default AudioPlayButton;
