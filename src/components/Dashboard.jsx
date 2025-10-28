import React, { useState, useRef, useEffect } from "react";
import {
  UserAgent,
  Inviter,
  Registerer,
  SessionState,
} from "sip.js";
import IncomingCall from "./IncomingCall";

const Dashboard = ({ sipSession, sipServer }) => {
  const { sipUser, userAgent, registerer } = sipSession;

  const [number, setNumber] = useState("");
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [callTime, setCallTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState(null);

  const [ringing, setRinging] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [incomingInvitation, setIncomingInvitation] = useState(null);
  const [remoteParty, setRemoteParty] = useState("");

  const userAgentRef = useRef(userAgent);
  const registererRef = useRef(registerer);
  const activeSessionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callTimerRef = useRef(null);

  // --- Handle Incoming Calls ---
  useEffect(() => {
    if (!userAgent) return;
    const handleInvite = (invitation) => {
      console.log("Incoming invitation received.");
      setRinging((currentRinging) => {
        if (currentRinging || activeSessionRef.current) {
          console.warn("Already busy (ringing or in call). Rejecting.");
          invitation.reject();
          return currentRinging;
        }
        console.log("Setting ringing state to true.");
        setIncomingInvitation(invitation);
        const callerId =
          invitation.remoteIdentity.displayName ||
          invitation.remoteIdentity.uri.user ||
          "Unknown";
        setRemoteParty(callerId);
        return true;
      });
    };
    userAgent.delegate.onInvite = handleInvite;
    return () => {
      if (userAgent) userAgent.delegate.onInvite = undefined;
    };
  }, [userAgent]);

  // --- Format timer (hh:mm:ss) ---
  const formatTime = (seconds) => {
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // --- Accept & Reject Handlers ---
  const handleAccept = async () => {
    if (!incomingInvitation) return;
    setRinging(false);
    activeSessionRef.current = incomingInvitation;

    activeSessionRef.current.stateChange.addListener((newState) => {
      switch (newState) {
        case SessionState.Established:
          console.log("✅ Incoming call established");
          setInCall(true);
          setupRemoteMedia(activeSessionRef.current);
          break;
        case SessionState.Terminated:
          console.log("❌ Incoming call terminated");
          activeSessionRef.current = undefined;
          setInCall(false);
          cleanupMedia();
          setIncomingInvitation(null);
          setRemoteParty("");
          break;
      }
    });

    try {
      await activeSessionRef.current.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
      });
    } catch (error) {
      console.error("Failed to accept call:", error);
    }
  };

  const handleReject = async () => {
    if (!incomingInvitation) return;
    try {
      await incomingInvitation.reject();
      console.log("Call rejected.");
    } catch (error) {
      console.error("Failed to reject call:", error);
    }
    setRinging(false);
    setInCall(false);
    setIncomingInvitation(null);
    setRemoteParty("");
    cleanupMedia();
  };

  // --- Setup Remote Media ---
  const setupRemoteMedia = (session) => {
    if (!remoteAudioRef.current) {
      console.error("Remote audio element ref not found.");
      return;
    }
    
    const pc = session.sessionDescriptionHandler?.peerConnection;
    try {
      if (pc) {
        const remoteStream = new MediaStream();
        pc.getReceivers().forEach((receiver) => {
          if (receiver.track) remoteStream.addTrack(receiver.track);
        });

        if (remoteStream.getTracks().length > 0) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current
            .play()
            .catch((err) => console.warn("Auto-play blocked:", err));
        } else {
          // no tracks yet; keep UI ready — don't teardown
          console.warn("No remote tracks found yet on peerConnection receivers.");
        }
      } else if (session.sessionDescriptionHandler?.remoteMediaStream) {
        // fallback for older sip.js exposing remoteMediaStream
        remoteAudioRef.current.srcObject =
          session.sessionDescriptionHandler.remoteMediaStream;
        remoteAudioRef.current
          .play()
          .catch((err) => console.warn("Auto-play blocked:", err));
      } else {
        console.warn("No peerConnection or remoteMediaStream available on session.");
      }
    } catch (err) {
      console.warn("setupRemoteMedia error:", err);
    }

    // start/reset call timer (use ref)
    setCallTime(0);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallTime((prev) => prev + 1);
    }, 1000);
  };

  // --- Cleanup Media ---
  const cleanupMedia = () => {
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      } catch (e) {
        // ignore
      }
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallTime(0);
  };

  // --- Place Call ---
  const handleDial = async () => {
    if (!userAgentRef.current || !registererRef.current?.registered) {
      alert("You are not registered. Please connect first.");
      return;
    }
    if (activeSessionRef.current) {
      alert("You are already in a call.");
      return;
    }
    const target = UserAgent.makeURI(`sip:${number}@${sipServer}`);
    if (!target) {
      alert("Invalid number or SIP target.");
      return;
    }

    // Create the Inviter
    const inviter = new Inviter(userAgentRef.current, target);
    setRemoteParty(number);
    setIsDialing(true);

    // Added logging to see the state change on rejection
    inviter.stateChange.addListener((newState) => {
      console.log("📞 OUTGOING CALL STATE:", newState);
      switch (newState) {
        case SessionState.Establishing:
          console.log("📞 Outgoing call establishing...");
          break;

        case SessionState.Established:
          console.log("✅ Call established");
          setIsDialing(false);  // Stop spinner
          setupRemoteMedia(inviter);
          setInCall(true); // Show in-call UI
          break;

        case SessionState.Terminated:
          // This should fire when 1001 rejects the call
          console.log("❌ Call terminated (Reason: " + (inviter.stateReason || "N/A") + ")");
          setIsDialing(false);
          activeSessionRef.current = undefined;
          setInCall(false);
          cleanupMedia();
          setRemoteParty("");
          break;
      }
    });

    // Set active session immediately (so incoming state doesn't think we're free)
    activeSessionRef.current = inviter;

    // --- Send the invite (fire-and-forget) ---
    try {
      // Await invite to allow the promise to surface immediate transport errors.
      await inviter.invite({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
      });

    } catch (error) {
      console.error("Failed to send call invitation:", error);
      alert("Failed to place call. Check network or SIP target.");
      setIsDialing(false);
      setRemoteParty("");
      activeSessionRef.current = undefined;
    }
  };


  // Updated hangup logic from your reference file
  const handleHangup = async () => {
    const session = activeSessionRef.current;
    if (!session) return;

    try {
      // Check state to decide what action to take
      switch (session.state) {
        case SessionState.Initial:
        case SessionState.Establishing:
          // If we are dialing (Inviter), we CANCEL
          if (session instanceof Inviter) {
            console.log("Canceling outgoing call...");
            await session.cancel();
          } else {
            // If we are ringing (Invitation), we REJECT
            console.log("Rejecting incoming call...");
            await session.reject(); // This mirrors handleReject
          }
          break;
        case SessionState.Established:
          // If call is established, we HANG UP
          console.log("Hanging up established call...");
          await session.bye();
          break;
      }
    } catch (error) {
      console.error("Failed to hang up/reject/cancel:", error);
    }
    
    // The 'Terminated' listener will handle cleanup, but we can
    // preemptively reset state to be safe.
    setInCall(false);
    setIsDialing(false);
    setRinging(false);
    setRemoteParty("");
    activeSessionRef.current = null;
    cleanupMedia();
  };

  // --- Toggle mute ---
  const handleMuteToggle = () => {
    const session = activeSessionRef.current;
    if (!session) return;
    const pc = session.sessionDescriptionHandler?.peerConnection;
    if (!pc) {
      console.warn("No peerConnection for muting");
      return;
    }

    // Flip state and apply to senders
    const newMuted = !muted;
    pc.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === "audio") {
        sender.track.enabled = !newMuted; // enabled = not muted
      }
    });
    setMuted(newMuted);
  };

  // --- Dialpad ---
  const addDigit = (d) => setNumber((prev) => prev + d);
  const clearDigit = () => setNumber((prev) => prev.slice(0, -1));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  return (
    // ... JSX is unchanged ...
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      {ringing ? ( // State 1: Incoming Call
        <IncomingCall
          caller={remoteParty || "Unknown"}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      ) : (
        // State 2, 3, 4: Idle, Dialing, or In Call
        <div className="p-8 bg-white rounded-3xl shadow-2xl w-96 text-center relative">
          {/* HEADER */}
          <h2 className="text-xl font-semibold mb-2 text-gray-800">
            {inCall
              ? "In Call"
              : isDialing
              ? "Dialing..."
              : "SIP Dashboard"}
          </h2>
          <p className="text-sm text-gray-500 mb-6">Logged in as {sipUser}</p>

          {/* ======================= IDLE, DIALING SCREEN ======================= */}
          {!inCall && (
            <>
              {isDialing ? ( // State 3: Dialing
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                  <h3 className="text-2xl font-semibold text-gray-800">
                    Calling {remoteParty}
                  </h3>
                  <p className="text-gray-500 mt-1">Establishing...</p>
                  <div className="my-8 animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
                  <button
                    onClick={handleHangup} // This now correctly calls CANCEL
                    className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white text-3xl rounded-full shadow-lg flex items-center justify-center transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" className="w-6 h-6"><path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" /></svg>
                  </button>
                </div>
              ) : (
                // State 2: Idle
                <>
                  {/* Dial Input */}
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Enter number"
                    className="w-full mb-5 p-3 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  {/* Numpad */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((num) => (
                      <button key={num} className="py-4 text-xl bg-gray-100 hover:bg-gray-200 rounded-full shadow-inner transition" onClick={() => addDigit(num)}>
                        {num}
                      </button>
                    ))}
                  </div>
                  {/* Action Buttons */}
                  <div className="relative flex justify-center items-center">
                    {/* CALL BUTTON */}
                    <button onClick={handleDial} className="flex items-center justify-center w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full shadow-lg transition" title="Call">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="#fff" viewBox="0 0 24 24" className="w-6 h-6"><path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" /></svg>
                    </button>
                    {/* CLEAR BUTTON */}
                    {number && (
                      <button onClick={clearDigit} className="absolute right-10 flex items-center justify-center" title="Clear">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" className="w-6 h-6 text-gray-600 hover:text-red-500 transition"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ======================= IN CALL SCREEN ======================= */}
          {inCall && ( // State 4: In Call
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <div className="mb-6">
                <div className="w-24 h-24 flex items-center justify-center mx-auto mb-4 text-3xl">
                  {formatTime(callTime)}
                </div>
                <h3 className="text-2xl font-semibold text-gray-800">
                  Call with {remoteParty}
                </h3>
                <p className="text-gray-500 mt-1">Connected</p>
              </div>
              {/* In-call Controls */}
              <div className="w-72 flex items-center justify-around mb-6">
                <button className="transition" onClick={() => alert("Add user feature coming soon")}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
                </button>
                <button className={`p-4 rounded-full transition ${ muted ? "bg-yellow-200 hover:bg-yellow-300" : "bg-gray-100 hover:bg-gray-200" }`} onClick={handleMuteToggle}>
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button className="transition" onClick={() => alert("In-call numpad feature coming soon")}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#444" strokeWidth={1} className="w-8 h-8"><path d="M7 4C7 5.38071 5.88071 6.5 4.5 6.5C3.11929 6.5 2 5.38071 2 4C2 2.61929 3.11929 1.5 4.5 1.5C5.88071 1.5 7 2.61929 7 4Z" fill="#444" /><path d="M14.5 4C14.5 5.38071 13.3807 6.5 12 6.5C10.6193 6.5 9.5 5.38071 9.5 4C9.5 2.61929 10.6193 1.5 12 1.5C13.3807 1.5 14.5 2.61929 14.5 4Z" fill="#444" /><path d="M19.5 6.5C20.8807 6.5 22 5.38071 22 4C22 2.61929 20.8807 1.5 19.5 1.5C18.1193 1.5 17 2.61929 17 4C17 5.38071 18.1193 6.5 19.5 6.5Z" fill="#444" /></svg>
                </button>
              </div>
              {/* End Call Button */}
              <button
                onClick={handleHangup} // This now correctly calls BYE
                className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white text-3xl rounded-full shadow-lg flex items-center justify-center transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" className="w-6 h-6"><path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" /></svg>
              </button>
            </div>
          )}
          {/* This is the fix. The audio element exists, and 
              setupRemoteMedia will attach the stream to it.
            */}
          <audio ref={remoteAudioRef} hidden />
        </div>
      )}
    </div>
  );
};

export default Dashboard;