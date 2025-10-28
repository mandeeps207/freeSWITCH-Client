"use client";
import { useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { Phone, PhoneOff } from "lucide-react";

const IncomingCall = ({ caller, onAccept, onReject }) => {
  const ringControls = useAnimation();

  // -- Ring animation --
  useEffect(() => {
    let isMounted = true; // 1. Add a "mounted" flag

    const ringLoop = async () => {
      while (isMounted) { // 2. Check the flag in the loop
        
        // 3. Check *before* each animation start
        if (!isMounted) break;
        await ringControls.start({ rotate: -4, transition: { duration: 0.05 } });
        
        if (!isMounted) break;
        await ringControls.start({ rotate: 4, transition: { duration: 0.05 } });
        
        if (!isMounted) break;
        await ringControls.start({ rotate: 0, transition: { duration: 0.05 } });
      }
    };
    ringLoop();

    // 4. On unmount, set the flag to false. The loop will stop.
    return () => {
      isMounted = false;
    };
  }, [ringControls]); // Dependency array is correct

  // -- Play ringtone --
  useEffect(() => {
    const audio = new Audio("/ringtone.mp3");
    audio.loop = true;
    audio.play().catch((e) => console.warn("Ringtone blocked by browser", e));
    return () => audio.pause();
  }, []);

  // -- Handle swipe gestures --
  const handleDragEnd = (_, info) => {
    if (info.offset.x > 120) {
      onAccept();
    } else if (info.offset.x < -120) {
      onReject();
    }
  };

  return (
    // ... (All the JSX is unchanged) ...
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white relative overflow-hidden">
      {/* Expanding ring circle */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.6, 0.9, 0.6],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="w-64 h-64 rounded-full bg-green-500/20" />
      </motion.div>

      {/* Caller info */}
      <motion.div animate={ringControls} className="z-10 text-center mb-12">
        <p className="text-2xl font-semibold">{caller} Calling...</p>
      </motion.div>

      {/* Swipe button */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.9 }}
        className="z-10 w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center shadow-lg cursor-grab"
      >
        <Phone className="w-10 h-10 text-green-400" />
      </motion.div>

      {/* Instructions */}
      <div className="absolute bottom-10 flex justify-between w-full px-10 text-sm text-gray-400">
        <div className="flex flex-col items-center">
          <PhoneOff className="text-red-500 mb-1" />
          Swipe Left
        </div>
        <div className="flex flex-col items-center">
          <Phone className="text-green-500 mb-1" />
          Swipe Right
        </div>
      </div>
    </div>
  );
}

export default IncomingCall;