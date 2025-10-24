import React, { useEffect, useRef, useState } from "react";

export default function app() {
  const [sipUser, setSipUser] = useState("1000");
  const [sipPass, setSipPass] = useState("1234");
  const [destination, setDestination] = useState("1001");

  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasActiveCall, setHasActiveCall] = useState(false);

  const userAgentRef = useRef(null);
  const registererRef = useRef(null);
  const activeSessionRef = useRef(null);
  const sipModuleRef = useRef(null);
  const attemptingReconnectionRef = useRef(false);
  const shouldBeConnectedRef = useRef(true);
  const remoteAudioRef = useRef(null);

  const sipServerHost = "mkwebtech.servehttp.com";
  const reconnectionAttempts = 3;
  const reconnectionDelay = 4;

  function getAudioElement(ref) {
    const el = ref.current;
    if (!el || !(el instanceof HTMLAudioElement)) {
      throw new Error("Remote audio element not found.");
    }
    return el;
  }

  const attemptReconnection = async (reconnectionAttempt = 1) => {
    if (!shouldBeConnectedRef.current) return;
    if (attemptingReconnectionRef.current) return;
    if (reconnectionAttempt > reconnectionAttempts) {
      console.error("Reconnection attempts failed.");
      return;
    }
    if (!userAgentRef.current) return;

    console.log(`Reconnection attempt ${reconnectionAttempt}...`);
    attemptingReconnectionRef.current = true;

    setTimeout(() => {
      if (!shouldBeConnectedRef.current) {
        attemptingReconnectionRef.current = false;
        return;
      }
      userAgentRef.current.reconnect()
        .then(() => {
          console.log("Reconnected successfully.");
          attemptingReconnectionRef.current = false;
        })
        .catch(() => {
          console.warn(`Reconnect attempt ${reconnectionAttempt} failed.`);
          attemptingReconnectionRef.current = false;
          attemptReconnection(reconnectionAttempt + 1);
        });
    }, reconnectionAttempt === 1 ? 0 : reconnectionDelay * 1000);
  };

  function setupRemoteMedia(session) {
    const remoteAudio = getAudioElement(remoteAudioRef);
    const stream = session.sessionDescriptionHandler.remoteMediaStream;
    remoteAudio.srcObject = stream;
    remoteAudio.play().catch((e) => console.error("Remote audio play failed:", e));
  }

  function cleanupMedia() {
    const remoteAudio = getAudioElement(remoteAudioRef);
    remoteAudio.srcObject = null;
  }

  async function handleIncomingCall(invitation) {
    if (activeSessionRef.current) {
      console.warn("Already in a call, rejecting new invitation.");
      await invitation.reject();
      return;
    }
    activeSessionRef.current = invitation;
    setHasActiveCall(true);

    invitation.stateChange.addListener((newState) => {
      const { SessionState } = sipModuleRef.current;
      switch (newState) {
        case SessionState.Establishing:
          console.log("Incoming call establishing...");
          break;
        case SessionState.Established:
          console.log("Incoming call established.");
          setupRemoteMedia(invitation);
          break;
        case SessionState.Terminated:
          console.log("Incoming call terminated.");
          activeSessionRef.current = undefined;
          setHasActiveCall(false);
          cleanupMedia();
          break;
      }
    });

    try {
      await invitation.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      console.log("Incoming call accepted.");
    } catch (error) {
      console.error("Failed to accept incoming call:", error);
    }
  }

  const connect = async () => {
    if (!sipModuleRef.current) {
      try {
        sipModuleRef.current = await import('https://cdn.jsdelivr.net/npm/sip.js@0.20.0/+esm');
      } catch (e) {
        console.error("Failed to import sip.js:", e);
        return;
      }
    }

    const { UserAgent, Registerer, RegistererState } = sipModuleRef.current;
    const server = `wss://${sipServerHost}:7443`;
    const uri = UserAgent.makeURI(`sip:${sipUser}@${sipServerHost}`);
    if (!uri) {
      console.error("Failed to create URI");
      return;
    }

    const userAgentOptions = {
      transportOptions: { server },
      uri,
      authorizationUsername: sipUser,
      authorizationPassword: sipPass,
      delegate: {
        onInvite: (invitation) => handleIncomingCall(invitation),
        onConnect: () => {
          console.log("WebSocket Connected.");
          registererRef.current?.register().catch(console.error);
        },
        onDisconnect: (error) => {
          console.warn("WebSocket Disconnected.");
          if (error) attemptReconnection();
        }
      }
    };

    const userAgent = new UserAgent(userAgentOptions);
    const registerer = new Registerer(userAgent);

    registerer.stateChange.addListener((newState) => {
      switch (newState) {
        case RegistererState.Registered:
          setIsRegistered(true);
          setIsConnected(true);
          break;
        case RegistererState.Unregistered:
        case RegistererState.Terminated:
          setIsRegistered(false);
          setIsConnected(false);
          break;
      }
    });

    userAgentRef.current = userAgent;
    registererRef.current = registerer;
    shouldBeConnectedRef.current = true;

    try {
      await userAgent.start();
    } catch (error) {
      console.error("Failed to start UserAgent:", error);
      userAgentRef.current = undefined;
      registererRef.current = undefined;
    }
  };

  const placeCall = async () => {
    if (!userAgentRef.current || !registererRef.current || !registererRef.current.registered) {
      console.error("UserAgent not registered.");
      return;
    }
    if (activeSessionRef.current) {
      console.warn("A call is already in progress.");
      return;
    }

    const { UserAgent, Inviter, SessionState } = sipModuleRef.current;
    const target = UserAgent.makeURI(`sip:${destination}@${sipServerHost}`);
    if (!target) {
      console.error("Failed to create target URI");
      return;
    }

    const inviter = new Inviter(userAgentRef.current, target);
    inviter.stateChange.addListener((newState) => {
      switch (newState) {
        case SessionState.Establishing:
          console.log("Outgoing call establishing...");
          break;
        case SessionState.Established:
          setupRemoteMedia(inviter);
          break;
        case SessionState.Terminated:
          activeSessionRef.current = undefined;
          setHasActiveCall(false);
          cleanupMedia();
          break;
      }
    });

    try {
      await inviter.invite({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      activeSessionRef.current = inviter;
      setHasActiveCall(true);
    } catch (error) {
      console.error("Failed to send call invitation:", error);
    }
  };

  const hangup = async () => {
    const activeSession = activeSessionRef.current;
    if (!activeSession) return;

    const { SessionState, Inviter } = sipModuleRef.current;

    try {
      switch (activeSession.state) {
        case SessionState.Initial:
        case SessionState.Establishing:
          if (activeSession instanceof Inviter) await activeSession.cancel();
          else await activeSession.reject();
          break;
        case SessionState.Established:
          await activeSession.bye();
          break;
      }
    } catch (error) {
      console.error("Failed to end call:", error);
    }
  };

  const disconnect = async () => {
    shouldBeConnectedRef.current = false;
    await registererRef.current?.unregister().catch(console.error);
    await userAgentRef.current?.stop().catch(console.error);
    userAgentRef.current = null;
    registererRef.current = null;
    activeSessionRef.current = null;
    setIsConnected(false);
    setIsRegistered(false);
    setHasActiveCall(false);
    cleanupMedia();
  };

  useEffect(() => {
    const onOnline = () => attemptReconnection();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      disconnect();
    };
  }, []);

  return (
    <div className="container my-5">
      <h2 className="text-center mb-4">Audio Call Testing App</h2>

      <div id="connection-form" className="mx-auto" style={{ maxWidth: 500 }}>
        <div className="form-group mb-3">
          <label htmlFor="sip-user">Username</label>
          <input
            type="text"
            className="form-control"
            id="sip-user"
            value={sipUser}
            onChange={(e) => setSipUser(e.target.value)}
            required
          />
        </div>
        <div className="form-group mb-3">
          <label htmlFor="sip-pass">Password</label>
          <input
            type="password"
            className="form-control"
            id="sip-pass"
            value={sipPass}
            onChange={(e) => setSipPass(e.target.value)}
            required
          />
        </div>
        <div className="form-group mb-3">
          <label htmlFor="sip-destination">Destination</label>
          <input
            type="text"
            className="form-control"
            id="sip-destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="d-flex p-2 gap-2">
        <button className="btn btn-primary" onClick={connect} disabled={isConnected}>Connect</button>
        <button className="btn btn-primary" onClick={placeCall} disabled={!isRegistered || hasActiveCall}>Place Call</button>
        <button className="btn btn-primary" onClick={hangup} disabled={!hasActiveCall}>Hangup Call</button>
        <button className="btn btn-primary" onClick={disconnect} disabled={!isConnected}>Disconnect</button>
      </div>

      <p className="mt-3">When the call is established, the remote audio is added to the following HTML5 audio element...</p>
      <audio ref={remoteAudioRef} controls className="form-control" />
    </div>
  );
}
