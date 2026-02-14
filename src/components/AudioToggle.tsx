import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

interface AudioToggleProps {
  muted: boolean;
  onToggle: () => void;
}

const AudioToggle = ({ muted, onToggle }: AudioToggleProps) => (
  <motion.button
    onClick={onToggle}
    className="glass rounded-md p-2 border border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/30 transition-colors"
    whileTap={{ scale: 0.9 }}
    title={muted ? "Unmute ambient audio" : "Mute ambient audio"}
  >
    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-neon-cyan" />}
  </motion.button>
);

export default AudioToggle;
