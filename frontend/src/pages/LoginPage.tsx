import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import type { AuthResponse } from "../types";

declare global {
  interface Window {
    google?: any;
  }
}

type ResetStep = "request" | "verify" | "reset";

type ForgotRequestResponse = {
  ok: boolean;
  message: string;
  debug_code?: string | null;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("request");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("Canada");
  const [city, setCity] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState("");
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    const message = localStorage.getItem("session_expired_message");
    if (message) {
      setError(message);
      localStorage.removeItem("session_expired_message");
    }
  }, []);

  function saveAuth(data: AuthResponse) {
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    navigate("/houses");
  }

  function openForgotPassword() {
    setForgotOpen(true);
    setIsRegister(false);
    setResetStep("request");
    setResetEmail(email || "");
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetMessage("");
    setError("");
  }

  function closeForgotPassword() {
    setForgotOpen(false);
    setResetMessage("");
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? { full_name: fullName, email, password, country, city }
        : { email, password };
      const { data } = await api.post<AuthResponse>(endpoint, payload);
      saveAuth(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function requestPasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResetMessage("");
    try {
      setResetBusy(true);
      const { data } = await api.post<ForgotRequestResponse>("/auth/forgot-password/request", {
        email: resetEmail,
      });
      setResetMessage(data.debug_code ? `${data.message} Dev code: ${data.debug_code}` : data.message);
      setResetStep("verify");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  }

  async function verifyPasswordResetCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResetMessage("");
    try {
      setResetBusy(true);
      const { data } = await api.post<{ verified: boolean; message: string }>("/auth/forgot-password/verify", {
        email: resetEmail,
        code: resetCode,
      });
      setResetMessage(data.message);
      setResetStep("reset");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  }

  async function completePasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResetMessage("");
    if (resetNewPassword !== resetConfirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    try {
      setResetBusy(true);
      const { data } = await api.post<{ ok: boolean; message: string }>("/auth/forgot-password/reset", {
        email: resetEmail,
        code: resetCode,
        new_password: resetNewPassword,
        confirm_password: resetConfirmPassword,
      });
      setResetMessage(data.message || "Password reset successfully. Please login.");
      setForgotOpen(false);
      setIsRegister(false);
      setEmail(resetEmail);
      setPassword("");
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  }

  useEffect(() => {
    if (!googleClientId || forgotOpen) return;

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !window.google) return false;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential: string }) => {
          setError("");
          try {
            const { data } = await api.post<AuthResponse>("/auth/google", {
              credential: response.credential,
            });
            saveAuth(data);
          } catch (err) {
            setError(errorMessage(err));
          }
        },
      });
      const target = document.getElementById("google-signin");
      if (target) {
        target.innerHTML = "";
        window.google.accounts.id.renderButton(target, {
          theme: "outline",
          size: "large",
          width: 320,
        });
      }
      return true;
    };

    if (!renderGoogleButton()) {
      const timer = window.setInterval(() => {
        if (renderGoogleButton()) window.clearInterval(timer);
      }, 300);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [googleClientId, forgotOpen]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <img
          className="auth-logo"
          src="/brand/grocery-house-manager-logo.png"
          alt="Grocery House Manager"
        />
        <p className="brand-kicker">A SupremDas Group product</p>
        <h1>Grocery House Manager</h1>
        <p>
          Shared grocery inventory, shopping lists, members, and activity
          updates for your household.
        </p>

        {!forgotOpen && (
          <>
            {googleClientId ? (
              <div id="google-signin" className="google-box" />
            ) : (
              <div className="hint">
                Add VITE_GOOGLE_CLIENT_ID to enable Google login.
              </div>
            )}

            <div className="divider">
              <span>or</span>
            </div>
            <form onSubmit={submit} className="stack">
              {isRegister && (
                <>
                  <label>
                    Full name
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </label>
                  <div className="form-row auth-location-row">
                    <label>
                      Country
                      <input
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Canada"
                        required
                      />
                    </label>
                    <label>
                      City
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Hamilton"
                        required
                      />
                    </label>
                  </div>
                </>
              )}
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {error && <div className="error">{error}</div>}
              {resetMessage && <div className="success">{resetMessage}</div>}
              <button className="primary" type="submit">
                {isRegister ? "Create account" : "Login"}
              </button>
            </form>
            {!isRegister && (
              <button className="link-button forgot-link" onClick={openForgotPassword}>
                Forgot password?
              </button>
            )}
            <button
              className="link-button"
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister
                ? "Already have an account? Login"
                : "New here? Create account"}
            </button>
          </>
        )}

        {forgotOpen && (
          <section className="forgot-password-box">
            <p className="eyebrow">Account recovery</p>
            <h2>Reset password</h2>
            <p className="small-muted">
              Enter your registered email. We will send a verification code, then you can set a new password.
            </p>

            {resetStep === "request" && (
              <form onSubmit={requestPasswordReset} className="stack">
                <label>
                  Registered email
                  <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                </label>
                {error && <div className="error">{error}</div>}
                {resetMessage && <div className="success">{resetMessage}</div>}
                <button className="primary" disabled={resetBusy}>{resetBusy ? "Sending..." : "Send verification code"}</button>
              </form>
            )}

            {resetStep === "verify" && (
              <form onSubmit={verifyPasswordResetCode} className="stack">
                <label>
                  Verification code
                  <input inputMode="numeric" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6-digit code" required />
                </label>
                {error && <div className="error">{error}</div>}
                {resetMessage && <div className="success">{resetMessage}</div>}
                <button className="primary" disabled={resetBusy}>{resetBusy ? "Verifying..." : "Verify code"}</button>
                <button type="button" className="secondary" onClick={() => setResetStep("request")}>Send a new code</button>
              </form>
            )}

            {resetStep === "reset" && (
              <form onSubmit={completePasswordReset} className="stack">
                <label>
                  New password
                  <input type="password" minLength={8} value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} required />
                </label>
                <label>
                  Confirm new password
                  <input type="password" minLength={8} value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} required />
                </label>
                {error && <div className="error">{error}</div>}
                {resetMessage && <div className="success">{resetMessage}</div>}
                <button className="primary" disabled={resetBusy}>{resetBusy ? "Saving..." : "Save new password"}</button>
              </form>
            )}

            <button className="link-button" onClick={closeForgotPassword}>
              Back to login
            </button>
          </section>
        )}

        <Link to="/" className="home-link">
          ← Back to website
        </Link>
      </section>
      <footer className="auth-footer">
        © {new Date().getFullYear()} SupremDas Group. All rights reserved.
      </footer>
    </main>
  );
}
