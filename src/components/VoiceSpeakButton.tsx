import { motion } from "framer-motion";
import { Volume2, Loader2 } from "lucide-react";

interface VoiceSpeakButtonProps {
  text: string;
  id: string;
  playingId: string | null;
  onPlay: (text: string, id: string) => void;
}

const VoiceSpeakButton = ({ text, id, playingId, onPlay }: VoiceSpeakButtonProps) => {
  const isPlaying = playingId === id;

  return (
    <motion.button
      className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-neon-cyan/10 transition-colors ml-1 opacity-40 hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        if (!isPlaying) onPlay(text, id);
      }}
      whileTap={{ scale: 0.8 }}
      title="Play voice"
    >
      {isPlaying ? (
        <Loader2 className="w-3 h-3 text-neon-cyan animate-spin" />
      ) : (
        <Volume2 className="w-3 h-3 text-neon-cyan" />
      )}
    </motion.button>
  );
};

export default VoiceSpeakButton;
