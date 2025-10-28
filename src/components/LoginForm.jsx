import React, { useRef, useState } from "react";
// Using static imports as requested
import {
  UserAgent,
  Registerer,
  RegistererState
} from "sip.js";

const LoginForm = ({ onConnected, sipServer }) => {
  const [sipUser, setSipUser] = useState("");
  const [sipPass, setSipPass] = useState("");
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const userAgentRef = useRef(null);
  const registererRef = useRef(null);

  const sipServerHost = sipServer;
  const sipWssPort = 7443; // 7443 for SSL or 5066 for no SSL

  const connectHandler = async () => {
    setError("");
    if (!sipUser || !sipPass) {
      setError("Please enter username and password.");
      return;
    }
    setIsConnecting(true);

    try {
      const uri = UserAgent.makeURI(`sip:${sipUser}@${sipServerHost}`);
      if (!uri) {
        setError("Invalid SIP URI.");
        setIsConnecting(false);
        return;
      }

      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const server = `${wsProtocol}://${sipServerHost}:${sipWssPort}`;

      // ⬇️⬇️⬇️ THIS IS THE CRITICAL CONFIG FOR AUDIO/NAT ⬇️⬇️⬇️
      const userAgentOptions = {
        transportOptions: { server },
        uri,
        authorizationUsername: sipUser,
        authorizationPassword: sipPass,
        delegate: {
          onConnect: () => console.log("WebSocket connected."),
          onDisconnect: (error) => {
            console.warn("WebSocket disconnected:", error);
            setError("Disconnected from SIP server");
          },
        },
        // This block helps the browser find the right network path
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
            ],
          },
        },
      };
      // ⬆️⬆️⬆️ END OF AUDIO FIX BLOCK ⬆️⬆️⬆️

      const registererOptions = {
        instanceId: UserAgent.newUUID(), // Creates a unique ID
        expires: 300,
      };

      const userAgent = new UserAgent(userAgentOptions); // Pass the options
      const registerer = new Registerer(userAgent, registererOptions);

      registerer.stateChange.addListener((newState) => {
        console.log("Registerer state:", newState);
        switch (newState) {
          case RegistererState.Registered:
            // onConnected({ sipUser, userAgent, registerer });
            break;
          case RegistererState.Unregistered:
          case RegistererState.Terminated:
            setError("Authentication failed. Check username or password.");
            break;
        }
      });

      userAgentRef.current = userAgent;
      registererRef.current = registerer;

      await userAgent.start();
      await registerer.register();

      // Now that start + register completed successfully, notify parent
      onConnected({ sipUser, userAgent, registerer });

    } catch (err) {
      console.error("Connection error:", err);
      setError("Connection failed: " + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    // ... JSX is unchanged ...
    <div className="flex items-center justify-center min-h-screen bg-gray-800">
      <div className="relative p-8 bg-white rounded-3xl shadow-xl w-96 text-center">
        {/* User Icon at the top */}
        <div className="absolute -top-13 left-1/2 -translate-x-1/2 bg-green-500 p-4 rounded-full shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="white" className="size-15">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </div>

        {/* Form Fields */}
        <div className="mt-8 space-y-4">
          {/* Username Input */}
          <div className="relative">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Username"
              value={sipUser}
              onChange={(e) => setSipUser(e.target.value)}
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray" className="size-6">
                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="password"
              placeholder="Password"
              value={sipPass}
              onChange={(e) => setSipPass(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-red-500 mt-3">{error}</p>}

        {/* Login Button */}
        <button
          className="btn-connect"
          type="submit"
          onClick={connectHandler}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "CONNECT"}
        </button>
      </div>
    </div>
  )
}

export default LoginForm;