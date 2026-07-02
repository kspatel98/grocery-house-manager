import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { House, InvitePreview } from '../types';

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [message, setMessage] = useState('Loading invitation...');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadPreview() {
      try {
        const { data } = await api.get<InvitePreview>(`/houses/join/${token}/preview`, { params: { t: Date.now() } });
        setPreview(data);
        setMessage('');
        setError('');
      } catch (err) {
        setPreview(null);
        setMessage('');
        setError(errorMessage(err));
      }
    }
    loadPreview();
  }, [token]);

  async function acceptInvite() {
    try {
      setBusy(true);
      const { data } = await api.post<House>(`/houses/join/${token}`);
      navigate(`/houses/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function declineInvite() {
    navigate('/houses');
  }

  return (
    <main className="page shell">
      <section className="panel invite-confirm-panel">
        {message && <p>{message}</p>}
        {error && <div className="error">{error}</div>}

        {preview && (
          <>
            <p className="eyebrow">House invitation</p>
            <h1>Join {preview.house_name}?</h1>
            <p className="invite-copy">
              <strong>{preview.inviter_name}</strong>{preview.inviter_email ? ` (${preview.inviter_email})` : ''} invited you to join this house.
            </p>
            {preview.expires_at && <p className="hint">This invitation expires on {new Date(preview.expires_at).toLocaleString()}.</p>}
            {preview.already_member && <div className="success">You are already a member of this house.</div>}

            <div className="profile-actions">
              {preview.already_member ? (
                <Link to={`/houses/${preview.house_id}`} className="primary center-link">Open house</Link>
              ) : (
                <button className="primary" onClick={acceptInvite} disabled={busy}>{busy ? 'Joining...' : 'Accept and join house'}</button>
              )}
              <button className="secondary" onClick={declineInvite} disabled={busy}>Decline</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
