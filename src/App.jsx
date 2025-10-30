import React, { useState, useEffect, useRef } from "react";
import LoginForm from "./components/LoginForm";
import Dashboard from "./components/Dashboard"; // your numpad UI

const App = () => {
  const [sipSession, setSipSession] = useState(null);
  const sipServer = "mkwebtech.myftp.org"; // Make sure this is accessible

  // Keep a ref to the session to access it on unload
  const sessionRef = useRef(null);

  // Update the ref whenever sipSession changes
  useEffect(() => {
    sessionRef.current = sipSession;
  }, [sipSession]);

  useEffect(() => {
    const handleUnload = async (e) => {
      const s = sessionRef.current;
      if (!s) return;
      const { registerer, userAgent } = s;

      try {
        if (registerer) await registerer.unregister();
      } catch (err) {
        console.warn("Error during unregister on unload:", err);
      }
      try {
        if (userAgent) await userAgent.stop();
      } catch (err) {
        console.warn("Error during userAgent.stop on unload:", err);
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, []);

  if (!sipSession) {
    return <LoginForm onConnected={setSipSession} sipServer={sipServer} />;
  } else {
    return <Dashboard sipSession={sipSession} sipServer={sipServer} />;
  }
};

export default App;