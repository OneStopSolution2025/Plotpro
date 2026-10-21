import { useEffect, useRef, useState, useCallback } from "react";

/**
 * GoogleAuthButton Component
 * Renders the official Google Identity Services sign-in button using window.google.accounts.id.
 * If the GIS script is loading, or if the client ID is not configured, provides appropriate accessible feedback.
 */
const GoogleAuthButton = ({ onSuccess, onError, isSubmitting = false }) => {
  const containerRef = useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = useCallback(
    (response) => {
      if (response && response.credential) {
        if (onSuccess) onSuccess(response.credential);
      } else {
        const msg = "No credential received from Google.";
        if (onError) onError(msg);
      }
    },
    [onSuccess, onError]
  );

  useEffect(() => {
    if (!clientId || clientId === "your_google_web_client_id_here") {
      // Missing or placeholder Client ID
      return;
    }

    // Check if script is already present
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById("google-gis-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-gis-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => {
        setLoadError("Failed to load Google Sign-In SDK. Check your internet connection.");
        if (onError) onError("Failed to load Google Sign-In SDK.");
      };
      document.head.appendChild(script);
    } else {
      existingScript.addEventListener("load", () => setScriptLoaded(true));
    }
  }, [clientId, onError]);

  useEffect(() => {
    if (!scriptLoaded || !window.google?.accounts?.id || !containerRef.current || !clientId) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear any prior renders
      containerRef.current.innerHTML = "";

      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "left",
        width: 380,
      });
    } catch (err) {
      console.error("[GoogleAuthButton] Failed to initialize Google button:", err);
      setLoadError("Could not initialize Google Sign-In button.");
    }
  }, [scriptLoaded, clientId, handleCredentialResponse]);

  // If Client ID is not configured in local environment, show actionable prompt on click
  const handleFallbackClick = () => {
    if (!clientId || clientId === "your_google_web_client_id_here") {
      const msg = "Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your local .env file.";
      if (onError) onError(msg);
    } else if (loadError) {
      if (onError) onError(loadError);
    }
  };

  return (
    <div className="google-auth-wrapper" style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      {/* Official Google render target */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          display: scriptLoaded && clientId && clientId !== "your_google_web_client_id_here" ? "flex" : "none",
          justifyContent: "center",
          pointerEvents: isSubmitting ? "none" : "auto",
          opacity: isSubmitting ? 0.6 : 1,
        }}
      />

      {/* Styled fallback button shown when script is still loading or client ID is pending */}
      {(!scriptLoaded || !clientId || clientId === "your_google_web_client_id_here") && (
        <button
          type="button"
          className="login-google-btn"
          onClick={handleFallbackClick}
          disabled={isSubmitting}
          aria-label="Continue with Google"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: "10px" }}>
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>
      )}
    </div>
  );
};

export default GoogleAuthButton;
