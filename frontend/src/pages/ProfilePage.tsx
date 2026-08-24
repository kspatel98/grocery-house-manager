import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { money } from "../currency";
import type { AccountBootstrap, AccountDeletePreview, BillingRenewalDetails, PersonalInsights, Subscription, UserProfile } from "../types";

const PLAN_LABELS: Record<string, string> = {
  free: "Free Starter",
  basic: "Basic Home",
  family: "Family Plus",
  pro: "Household Pro",
};

function isPaidStatus(status?: string) {
  return ["active", "trialing", "past_due", "cancel_at_period_end", "paid"].includes(
    (status || "").toLowerCase(),
  );
}

function isAdminGranted(status?: string) {
  return (status || "").toLowerCase() === "admin_granted";
}

function isCancelledAtPeriodEnd(status?: string) {
  return (status || "").toLowerCase() === "cancel_at_period_end";
}

function SectionMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <div className="error form-message">{error}</div>;
  if (success) return <div className="success form-message">{success}</div>;
  return null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem("account_profile_cache");
    if (!cached) return null;
    try {
      return JSON.parse(cached) as UserProfile;
    } catch {
      localStorage.removeItem("account_profile_cache");
      return null;
    }
  });
  const [insights, setInsights] = useState<PersonalInsights | null>(null);
  const [renewalDetails, setRenewalDetails] = useState<BillingRenewalDetails | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deletePreview, setDeletePreview] = useState<AccountDeletePreview | null>(null);
  const [deletePreviewBusy, setDeletePreviewBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingSuccess, setBillingSuccess] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [profileRefreshing, setProfileRefreshing] = useState(true);
  const navigate = useNavigate();

  const expectedDeleteName = profile?.full_name || profile?.email || "";
  const isLoadingProfile = profile === null && profileRefreshing;
  const planName = profile?.plan_name;
  const planLabel = planName ? PLAN_LABELS[planName] || planName : "Loading...";
  const paid = profile ? isPaidStatus(profile.subscription_status) : false;
  const cachedGrantEnd = profile?.subscription_current_period_end ? new Date(profile.subscription_current_period_end).getTime() : null;
  const adminGranted = profile
    ? isAdminGranted(profile.subscription_status) && planName !== "free" && (cachedGrantEnd === null || (!Number.isNaN(cachedGrantEnd) && cachedGrantEnd > Date.now()))
    : false;
  const planUnlocked = paid || adminGranted;
  const proActive = planName === "pro" && planUnlocked;
  const familyActive = planName === "family" && planUnlocked;
  const basicActive = planName === "basic" && planUnlocked;
  const periodEnd = renewalDetails?.current_period_end || profile?.subscription_current_period_end;
  const periodEndLabel = periodEnd ? new Date(periodEnd).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  const nextPaymentLabel = renewalDetails?.next_payment_at ? new Date(renewalDetails.next_payment_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  const nextPaymentAmount = typeof renewalDetails?.next_payment_amount === "number"
    ? `${renewalDetails.next_payment_amount.toFixed(2)} ${(renewalDetails.currency || "CAD").toUpperCase()}`
    : "";

  const personalPlanAction = useMemo(() => {
    if (proActive)
      return { label: "Household Pro active", kind: "status" as const };
    if (familyActive)
      return { label: "Upgrade to Household Pro", kind: "link" as const };
    if (basicActive)
      return { label: "Upgrade personal tools", kind: "link" as const };
    return { label: "Upgrade personal tools", kind: "link" as const };
  }, [proActive, familyActive, basicActive]);

  async function loadProfile() {
    try {
      setProfileRefreshing(true);
      const { data } = await api.get<AccountBootstrap>("/account/bootstrap", {
        params: { t: Date.now() },
      });
      const mergedProfile = {
        ...data.user,
        plan_name: data.subscription.plan_name,
        subscription_status: data.subscription.subscription_status,
        subscription_current_period_end: data.subscription.current_period_end,
      };
      setProfile(mergedProfile);
      setInsights(data.insights);
      try {
        const renewalRes = await api.get<BillingRenewalDetails>("/billing/renewal-details", { params: { t: Date.now() } });
        setRenewalDetails(renewalRes.data);
      } catch {
        setRenewalDetails(null);
      }
      localStorage.setItem("account_profile_cache", JSON.stringify(mergedProfile));
      localStorage.setItem("account_is_admin", data.is_admin ? "true" : "false");
      window.dispatchEvent(new Event("account:refresh"));
      setFullName(mergedProfile.full_name || "");
      setAvatarUrl(mergedProfile.avatar_url || "");
      setCountry(mergedProfile.country || "");
      setCity(mergedProfile.city || "");
      setPageError("");
    } catch (err) {
      setPageError(errorMessage(err));
    } finally {
      setProfileRefreshing(false);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    try {
      setBusy(true);
      const { data } = await api.post<UserProfile>("/auth/me/edit", {
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
      });
      const mergedProfile = {
        ...data,
        plan_name: profile?.plan_name || data.plan_name,
        subscription_status: profile?.subscription_status || data.subscription_status,
        subscription_current_period_end: profile?.subscription_current_period_end || data.subscription_current_period_end,
      };
      setProfile(mergedProfile);
      localStorage.setItem("account_profile_cache", JSON.stringify(mergedProfile));
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          avatar_url: data.avatar_url,
          country: data.country,
          city: data.city,
          currency_code: data.currency_code,
        }),
      );
      setProfileSuccess("Profile updated.");
      try {
        const insightsRes = await api.get<PersonalInsights>("/auth/me/insights");
        setInsights(insightsRes.data);
      } catch {
        setInsights(null);
      }
    } catch (err) {
      setProfileError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function clearPasswordForm() {
    setOldPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordError("");
    setPasswordSuccess("");
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    try {
      setPasswordBusy(true);
      const { data } = await api.post<{ ok: boolean; message: string }>("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmNewPassword,
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess(data.message || "Password updated.");
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function syncSubscription() {
    setBillingError("");
    setBillingSuccess("");
    try {
      setSyncBusy(true);
      const { data } = await api.post<Subscription>("/billing/sync-subscription");
      await loadProfile();
      setBillingSuccess(`Subscription synced. Current plan: ${PLAN_LABELS[data.plan_name] || data.plan_name}.`);
    } catch (err) {
      setBillingError(errorMessage(err));
    } finally {
      setSyncBusy(false);
    }
  }

  async function loadDeletePreview() {
    setDeleteError("");
    try {
      setDeletePreviewBusy(true);
      const { data } = await api.get<AccountDeletePreview>("/auth/me/delete-preview");
      setDeletePreview(data);
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setDeletePreviewBusy(false);
    }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setDeleteError("");
    if (!expectedDeleteName || deleteConfirmName.trim() !== expectedDeleteName) {
      setDeleteError(`Type exactly: ${expectedDeleteName}`);
      return;
    }
    if (deletePreview?.blocked_shared_houses.length) {
      setDeleteError(deletePreview.message);
      return;
    }
    if (deletePreview?.solo_owned_houses.length) {
      const names = deletePreview.solo_owned_houses.join(", ");
      if (!confirm(`Deleting your account will also permanently delete these owned house(s): ${names}. All sections, products, shopping lists, receipts, prices, and activities inside them will be lost. Continue?`)) {
        return;
      }
    }

    try {
      setDeleteBusy(true);
      await api.post("/auth/me/delete", { confirm_name: deleteConfirmName.trim() });
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("account_profile_cache");
      localStorage.removeItem("account_is_admin");
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleteBusy(false);
    }
  }

  async function cancelSubscription() {
    if (!confirm("Cancel your subscription at the end of the current billing period? You will keep paid features until the period ends.")) return;
    setBillingError("");
    setBillingSuccess("");
    try {
      setCancelBusy(true);
      const { data } = await api.post<{ message: string; current_period_end?: string }>("/billing/cancel-subscription");
      setBillingSuccess(data.message || "Subscription cancellation scheduled.");
      await loadProfile();
    } catch (err) {
      setBillingError(errorMessage(err));
    } finally {
      setCancelBusy(false);
    }
  }

  async function manageBilling() {
    setBillingError("");
    setBillingSuccess("");
    try {
      const { data } = await api.post<{ url: string }>("/billing/customer-portal");
      window.location.href = data.url;
    } catch (err) {
      setBillingError(errorMessage(err));
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("account_profile_cache");
    localStorage.removeItem("account_is_admin");
    navigate("/login");
  }

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <main className="page shell">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>Profile</h1>
          <p>Manage your account details, subscription, logout, and account deletion from here.</p>
        </div>
      </header>

      {pageError && <div className="error">{pageError}</div>}
      {profileRefreshing && profile && <div className="hint">Refreshing your account details...</div>}

      {isLoadingProfile && (
        <section className="panel profile-panel">
          <p className="eyebrow">Account</p>
          <h2>Loading your account...</h2>
          <p>Please wait while we load your profile, plan, and billing status.</p>
        </section>
      )}

      {profile && (
        <section className="panel profile-panel">
          <div className="profile-header">
            <div className="profile-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : (fullName || profile.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2>{profile.full_name || "Your profile"}</h2>
              <p>{profile.email}</p>
            </div>
          </div>

          <div className="plan-summary-card upgraded-plan-summary">
            <div className="plan-summary-main">
              <p className="eyebrow">Current plan</p>
              <h3>{planLabel}</h3>
              <p>
                {adminGranted
                  ? `${planLabel} access was granted by admin. No subscription payment is attached to this access.`
                  : proActive
                    ? "Household Pro is active. Your personal premium tools and owned-house limits are unlocked."
                    : paid
                      ? `${planLabel} is active. Only this premium plan can remain active on your account at one time.`
                      : "You are currently on the Free Starter plan."}
              </p>
            </div>
            <span className={`plan-status-badge ${adminGranted ? "admin-granted" : proActive ? "pro" : paid ? "paid" : "free"}`}>
              {adminGranted ? "Admin granted" : proActive ? "Pro active" : paid ? "Paid active" : "Free"}
            </span>

            {planUnlocked && (
              <div className="billing-date-grid">
                <div className="billing-date-card expiry-card">
                  <span>{adminGranted ? "Plan expiry" : "Current plan period expiry"}</span>
                  <strong className="plan-expiry-red">{periodEndLabel || (adminGranted ? "No expiry — lifetime access" : "Date unavailable")}</strong>
                  {!adminGranted && renewalDetails?.auto_renews && <small>This is the end of the current billing period; the plan renews automatically.</small>}
                  {isCancelledAtPeriodEnd(profile.subscription_status) && <small>Cancellation is scheduled. Access ends on this date.</small>}
                </div>
                <div className="billing-date-card renewal-card">
                  <span>Next plan renewal payment</span>
                  {adminGranted ? (
                    <>
                      <strong>No payment</strong>
                      <small>Admin-granted access does not charge your payment method.</small>
                    </>
                  ) : renewalDetails?.auto_renews ? (
                    <>
                      <strong>{nextPaymentLabel || periodEndLabel || "Date unavailable"}</strong>
                      <b>{nextPaymentAmount ? `$${nextPaymentAmount}` : "Amount unavailable"}</b>
                      <small>The amount is based on the next Stripe renewal preview when available.</small>
                    </>
                  ) : (
                    <>
                      <strong>No automatic deduction scheduled</strong>
                      <small>Your current paid access remains available until its period end.</small>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="profile-details">
            <div><strong>Email</strong><span>{profile.email || "-"}</span></div>
            <div><strong>Login method</strong><span>{profile.auth_provider || "-"}</span></div>
            <div><strong>Country</strong><span>{profile.country || "Add country"}</span></div>
            <div><strong>City</strong><span>{profile.city || "Add city"}</span></div>
            <div><strong>Currency</strong><span>{profile.currency_code || "CAD"}</span></div>
            <div><strong>User ID</strong><span>{profile.id || "-"}</span></div>
            <div><strong>Account created</strong><span>{profile.created_at ? new Date(profile.created_at).toLocaleString() : "-"}</span></div>
            <div><strong>Plan</strong><span>{planLabel}</span></div>
            <div><strong>Access type</strong><span>{adminGranted ? "Admin granted premium access" : paid ? "Stripe subscription" : "Free account"}</span></div>
          </div>

          <div className="profile-actions profile-plan-actions">
            {adminGranted ? (
              <>
                <Link to="/pricing" className="secondary center-link">View plans</Link>
                <span className="admin-grant-billing-note">No billing or cancellation action is needed for admin-granted access.</span>
              </>
            ) : paid ? (
              <>
                <button className="primary" onClick={manageBilling}>Manage billing</button>
                <button className="secondary" onClick={syncSubscription} disabled={syncBusy}>{syncBusy ? "Syncing..." : "Sync subscription"}</button>
                {!isCancelledAtPeriodEnd(profile.subscription_status) && (
                  <button className="secondary danger-button" onClick={cancelSubscription} disabled={cancelBusy}>{cancelBusy ? "Scheduling cancellation..." : "Cancel subscription"}</button>
                )}
              </>
            ) : (
              <>
                <Link to="/pricing" className="primary center-link">View plans</Link>
                <button className="secondary" onClick={syncSubscription} disabled={syncBusy}>{syncBusy ? "Syncing..." : "I already paid — sync subscription"}</button>
              </>
            )}
          </div>
          <SectionMessage error={billingError} success={billingSuccess} />

          <form onSubmit={saveProfile} className="profile-form">
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Profile image URL
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
            </label>
            <div className="form-row">
              <label>
                Country
                <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" />
              </label>
              <label>
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamilton" />
              </label>
            </div>
            <SectionMessage error={profileError} success={profileSuccess} />
            <div className="profile-actions">
              <button className="primary" disabled={busy}>{busy ? "Saving..." : "Save profile"}</button>
              <button type="button" className="secondary danger-button" onClick={logout}>Logout</button>
            </div>
          </form>
        </section>
      )}

      {profile && profile.auth_provider === "email" && (
        <section className="panel profile-panel password-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Security</p>
              <h2>Change password</h2>
              <p>For email/password accounts, enter your old password and your new password twice.</p>
            </div>
          </div>
          <form onSubmit={changePassword} className="profile-form password-change-form">
            <label>
              Old password
              <input type="password" minLength={8} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
            </label>
            <div className="form-row">
              <label>
                New password
                <input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </label>
              <label>
                Confirm new password
                <input type="password" minLength={8} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required />
              </label>
            </div>
            <SectionMessage error={passwordError} success={passwordSuccess} />
            <p className="small-muted password-rule-note">For security, your new password cannot match any of your last 5 passwords.</p>
            <div className="profile-actions">
              <button className="primary" disabled={passwordBusy}>{passwordBusy ? "Updating..." : "Update password"}</button>
              <button type="button" className="secondary" onClick={clearPasswordForm} disabled={passwordBusy || (!oldPassword && !newPassword && !confirmNewPassword)}>Clear / cancel</button>
            </div>
          </form>
        </section>
      )}

      {profile && profile.auth_provider !== "email" && (
        <section className="panel profile-panel password-panel">
          <p className="eyebrow">Security</p>
          <h2>Password</h2>
          <p>Your account uses Google sign-in, so password changes are managed through Google.</p>
        </section>
      )}

      {profile && insights && (
        <section className="panel profile-panel personal-insights-panel">
          <div className="panel-title-row insights-title-row">
            <div>
              <p className="eyebrow">Personal premium tools</p>
              <h2>Your personal insights</h2>
              <p>House features follow the house owner's plan. These tools belong to your own account and grow with your own subscription.</p>
            </div>
            <div className="insights-actions">
              {personalPlanAction.kind === "status" ? (
                <span className="plan-status-badge pro">{personalPlanAction.label}</span>
              ) : (
                <Link to="/pricing" className="secondary center-link">{personalPlanAction.label}</Link>
              )}
              {paid && !adminGranted && <button className="secondary" onClick={manageBilling}>Manage billing</button>}
            </div>
          </div>
          <div className="stats-grid four profile-insights-grid">
            <div className="stat-card"><strong>{insights.receipts_uploaded}</strong><span>Receipts uploaded</span></div>
            <div className="stat-card"><strong>{insights.prices_recorded}</strong><span>Prices recorded</span></div>
            <div className="stat-card"><strong>{insights.stores_tracked}</strong><span>Stores tracked</span></div>
            <div className="stat-card"><strong>{money(insights.estimated_personal_spend, profile.currency_code)}</strong><span>Tracked spend</span></div>
          </div>
          <ul className="feature-list compact-feature-list">
            {insights.premium_tools.map((tool) => <li key={tool}>{tool}</li>)}
          </ul>
        </section>
      )}

      {profile && (
        <section className="panel danger-zone">
          <div>
            <p className="eyebrow">Danger zone</p>
            <h2>Delete account</h2>
            <p>This permanently deletes your account. For safety, if you own shared houses with other members, delete will be blocked until you remove members or handle those houses first.</p>
          </div>

          {!showDelete ? (
            <button className="secondary danger-button" onClick={() => { setShowDelete(true); loadDeletePreview(); }}>Delete my account</button>
          ) : (
            <form onSubmit={deleteAccount} className="delete-account-form">
              <p>Type <strong>{expectedDeleteName}</strong> to confirm.</p>
              {deletePreviewBusy && <div className="hint">Checking owned houses before account deletion...</div>}
              {deletePreview && (
                <div className={deletePreview.can_delete ? "hint delete-preview-box" : "error delete-preview-box"}>
                  <strong>{deletePreview.can_delete ? "Deletion safety check" : "Action required before deleting"}</strong>
                  <p>{deletePreview.message}</p>
                  {deletePreview.blocked_shared_houses.length > 0 && <p>Shared owned houses: {deletePreview.blocked_shared_houses.join(", ")}</p>}
                  {deletePreview.solo_owned_houses.length > 0 && <p>Owned houses that will be deleted with your account: {deletePreview.solo_owned_houses.join(", ")}</p>}
                </div>
              )}
              <input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} placeholder={expectedDeleteName} />
              <SectionMessage error={deleteError} />
              <div className="profile-actions">
                <button
                  className="danger-primary"
                  disabled={deleteBusy || deletePreviewBusy || !!deletePreview?.blocked_shared_houses.length || deleteConfirmName.trim() !== expectedDeleteName}
                >
                  {deleteBusy ? "Deleting..." : "Permanently delete account"}
                </button>
                <button type="button" className="secondary" onClick={() => { setShowDelete(false); setDeleteConfirmName(""); setDeleteError(""); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
