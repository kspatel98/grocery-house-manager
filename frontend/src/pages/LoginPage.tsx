import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import type { AuthResponse } from "../types";

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? { full_name: fullName, email, password }
        : { email, password };
      const { data } = await api.post<AuthResponse>(endpoint, payload);
      saveAuth(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    if (!googleClientId) return;

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
  }, [googleClientId]);

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
            <label>
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
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
          <button className="primary" type="submit">
            {isRegister ? "Create account" : "Login"}
          </button>
        </form>
        <button
          className="link-button"
          onClick={() => setIsRegister(!isRegister)}
        >
          {isRegister
            ? "Already have an account? Login"
            : "New here? Create account"}
        </button>
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
