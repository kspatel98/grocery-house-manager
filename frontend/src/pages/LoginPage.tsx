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
  const [loginError, setLoginError] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [authBusy, setAuthBusy] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    const message = localStorage.getItem("session_expired_message");
    if (message) {
      setLoginError(message);
      localStorage.removeItem("session_expired_message");
    }
  }, []);

  function saveAuth(data: AuthResponse) {
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.removeItem("account_is_admin");
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
    setResetError("");
    setLoginError("");
  }

  function closeForgotPassword() {
    setForgotOpen(false);
    setResetMessage("");
    setResetError("");
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    setResetMessage("");
    try {
      setAuthBusy(true);
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? { full_name: fullName, email, password, country, city }
        : { email, password };
      const { data } = await api.post<AuthResponse>(endpoint, payload);
      saveAuth(data);
    } catch (err) {
      setLoginError(errorMessage(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestPasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setResetError("");
    setResetMessage("");
    try {
      setResetBusy(true);
      const { data } = await api.post<ForgotRequestResponse>("/auth/forgot-password/request", { email: resetEmail });
      setResetMessage(
        data.debug_code
          ? `${data.message} Dev code: ${data.debug_code}`
          : `${data.message} Check your inbox, spam, and promotions folder. It can take 1–2 minutes to arrive.`,
      );
      setResendCooldown(60);
      setResetStep("verify");
    } catch (err) {
      setResetError(errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  }

  async function verifyPasswordResetCode(event: React.FormEvent) {
    event.preventDefault();
    setResetError("");
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
      setResetError(errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  }

  async function completePasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setResetError("");
    setResetMessage("");
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("New passwords do not match.");
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
      setLoginError("");
      setResetError("");
    } catch (err) {
      setResetError(errorMessage(err));
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
          setLoginError("");
          try {
            const { data } = await api.post<AuthResponse>("/auth/google", { credential: response.credential });
            saveAuth(data);
          } catch (err) {
            setLoginError(errorMessage(err));
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
        <img className="auth-logo" src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
        <p className="brand-kicker">A SupremDas Group product</p>
        <h1>Grocery House Manager</h1>
        <p>Shared grocery inventory, shopping lists, members, and activity updates for your household.</p>

        {!forgotOpen && (
          <>
            {googleClientId ? (
              <div id="google-signin" className="google-box" />
            ) : (
              <div className="hint">Add VITE_GOOGLE_CLIENT_ID to enable Google login.</div>
            )}

            <div className="divider"><span>or</span></div>
            <form onSubmit={submit} className="stack">
              {isRegister && (
                <>
                  <label>
                    Full name
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </label>
                  <div className="form-row auth-location-row">
                    <label>
                      Country
                      <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" required />
                    </label>
                    <label>
                      City
                      <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamilton" required />
                    </label>
                  </div>
                </>
              )}
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {loginError && <div className="error form-message">{loginError}</div>}
              {resetMessage && <div className="success form-message">{resetMessage}</div>}
              <button className="primary" type="submit" disabled={authBusy}>{authBusy ? "Please wait..." : isRegister ? "Create account" : "Login"}</button>
            </form>
            {!isRegister && (
              <button className="link-button forgot-link" onClick={openForgotPassword}>Forgot password?</button>
            )}
            <button className="link-button" onClick={() => { setIsRegister(!isRegister); setLoginError(""); }}>
              {isRegister ? "Already have an account? Login" : "New here? Create account"}
            </button>
          </>
        )}

        {forgotOpen && (
          <section className="forgot-password-box">
            <p className="eyebrow">Account recovery</p>
            <h2>Reset password</h2>
            <p className="small-muted">Enter your registered email. We will send a verification code, then you can set a new password.</p>

            {resetStep === "request" && (
              <form onSubmit={requestPasswordReset} className="stack">
                <label>
                  Registered email
                  <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                </label>
                {resetBusy && <div className="hint form-message">Sending your verification code. This can take up to 30 seconds. Keep this page open.</div>}
                {resetError && <div className="error form-message">{resetError}</div>}
                {resetMessage && <div className="success form-message">{resetMessage}</div>}
                <button className="primary" disabled={resetBusy || resendCooldown > 0}>
                  {resetBusy ? "Sending..." : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Send verification code"}
                </button>
              </form>
            )}

            {resetStep === "verify" && (
              <form onSubmit={verifyPasswordResetCode} className="stack">
                <label>
                  Verification code
                  <input inputMode="numeric" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6-digit code" required />
                </label>
                <p className="small-muted no-email-note">No email yet? Check spam/promotions and wait 1–2 minutes. If still missing, use “Send a new code”.</p>
                {resetError && <div className="error form-message">{resetError}</div>}
                {resetMessage && <div className="success form-message">{resetMessage}</div>}
                <button className="primary" disabled={resetBusy}>{resetBusy ? "Verifying..." : "Verify code"}</button>
                <button
                  type="button"
                  className="secondary"
                  disabled={resetBusy || resendCooldown > 0}
                  onClick={() => { setResetStep("request"); setResetMessage(""); setResetError(""); }}
                >
                  {resendCooldown > 0 ? `Send a new code in ${resendCooldown}s` : "Send a new code"}
                </button>
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
                <p className="small-muted password-rule-note">For security, your new password cannot match any of your last 5 passwords.</p>
                {resetError && <div className="error form-message">{resetError}</div>}
                {resetMessage && <div className="success form-message">{resetMessage}</div>}
                <button className="primary" disabled={resetBusy}>{resetBusy ? "Saving..." : "Save new password"}</button>
              </form>
            )}

            <button className="link-button" onClick={closeForgotPassword}>Back to login</button>
          </section>
        )}

        <Link to="/" className="home-link">← Back to website</Link>
      </section>
      <footer className="auth-footer">© {new Date().getFullYear()} SupremDas Group. All rights reserved.</footer>
    </main>
  );
}
