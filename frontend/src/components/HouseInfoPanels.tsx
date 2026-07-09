import { useMemo, useState } from 'react';
import type { Activity, HouseMember } from '../types';

type MembersPanelProps = {
  members: HouseMember[];
  currentUserId?: number;
  houseRole?: 'owner' | 'admin' | 'member';
  onRemoveMember?: (member: HouseMember) => void;
};

type MembersDrawerProps = MembersPanelProps & {
  open: boolean;
  onClose: () => void;
  onCreateInvite?: () => void | Promise<void>;
  inviteUrl?: string;
};

function memberInitial(member: HouseMember) {
  return (member.full_name || member.email || 'M').slice(0, 1).toUpperCase();
}

function roleLabel(role: HouseMember['role']) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function MemberAvatar({ member }: { member: HouseMember }) {
  return (
    <div className="avatar">
      {member.avatar_url ? <img src={member.avatar_url} alt="" /> : memberInitial(member)}
    </div>
  );
}

function MemberRow({ member, currentUserId, houseRole, onRemoveMember }: MembersPanelProps & { member: HouseMember }) {
  const isOwner = houseRole === 'owner';
  const isCurrentUser = member.user_id === currentUserId;
  const canKick = isOwner && !isCurrentUser && member.role !== 'owner';

  return (
    <div className="member-row member-row-with-action">
      <MemberAvatar member={member} />
      <div className="member-main">
        <strong>{member.full_name || 'House member'}{isCurrentUser ? ' (you)' : ''}</strong>
        <small>
          <span className={`role-badge role-${member.role}`}>{roleLabel(member.role)}</span>
          <span> Email hidden for privacy</span>
        </small>
      </div>
      {canKick && <button className="danger small-button" onClick={() => onRemoveMember?.(member)}>Kick out</button>}
    </div>
  );
}

export function MembersPanel({ members, currentUserId, houseRole, onRemoveMember }: MembersPanelProps) {
  const shownMembers = members.slice(0, 5);

  return (
    <section className="panel members-panel compact-members-panel">
      <div className="panel-title-row">
        <div>
          <h2>House members</h2>
          <p>{members.length} member{members.length === 1 ? '' : 's'} in this house.</p>
        </div>
      </div>
      <div className="member-list compact-member-list">
        {shownMembers.map((member) => (
          <MemberRow key={member.id} member={member} members={members} currentUserId={currentUserId} houseRole={houseRole} onRemoveMember={onRemoveMember} />
        ))}
      </div>
    </section>
  );
}

export function HouseMembersBar({ members, currentUserId, onOpen }: { members: HouseMember[]; currentUserId?: number; onOpen: () => void }) {
  const visibleMembers = members.slice(0, 6);
  const currentUser = members.find((member) => member.user_id === currentUserId);

  return (
    <section className="panel house-members-bar">
      <div>
        <p className="eyebrow">House members</p>
        <h2>{members.length} member{members.length === 1 ? '' : 's'}</h2>
        <p>{currentUser ? `You are joined as ${roleLabel(currentUser.role)}.` : 'Manage who can view and update this house.'}</p>
      </div>
      <div className="member-avatar-stack" aria-label="House member preview">
        {visibleMembers.map((member) => (
          <span key={member.id} className={`stacked-avatar stacked-role-${member.role}`} title={member.full_name || roleLabel(member.role)}>
            {member.avatar_url ? <img src={member.avatar_url} alt="" /> : memberInitial(member)}
          </span>
        ))}
        {members.length > visibleMembers.length && <span className="stacked-avatar more-avatar">+{members.length - visibleMembers.length}</span>}
      </div>
      <button className="secondary" onClick={onOpen}>View members</button>
    </section>
  );
}

export function MembersDrawer({ open, onClose, members, currentUserId, houseRole, onRemoveMember, onCreateInvite, inviteUrl }: MembersDrawerProps) {
  const [query, setQuery] = useState('');
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => [member.full_name, member.role, member.email].filter(Boolean).join(' ').toLowerCase().includes(normalized));
  }, [members, query]);

  if (!open) return null;

  return (
    <div className="side-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="side-drawer members-drawer" role="dialog" aria-modal="true" aria-label="House members" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">House members</p>
            <h2>{members.length} member{members.length === 1 ? '' : 's'}</h2>
            <p>People who can access this house. Owners can remove non-owner members.</p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close members panel">×</button>
        </div>

        <div className="drawer-actions">
          {onCreateInvite && <button className="primary full" onClick={onCreateInvite}>Copy invite link</button>}
          {inviteUrl && <div className="success compact-message">Invite copied: {inviteUrl}</div>}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members..." />
        </div>

        <div className="drawer-member-list">
          {!filteredMembers.length && <p className="small-muted">No members match your search.</p>}
          {filteredMembers.map((member) => (
            <MemberRow key={member.id} member={member} members={members} currentUserId={currentUserId} houseRole={houseRole} onRemoveMember={onRemoveMember} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function activityIcon(action: string) {
  if (action.includes('shopping')) return '🛒';
  if (action.includes('receipt')) return '🧾';
  if (action.includes('member') || action.includes('invite') || action.includes('joined')) return '👥';
  if (action.includes('section')) return '📂';
  if (action.includes('product')) return '📦';
  if (action.includes('house')) return '🏠';
  return '✨';
}

export function ActivityFeed({ activities, onRefresh }: { activities: Activity[]; onRefresh: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const recentActivities = useMemo(() => activities.slice(0, 5), [activities]);

  return (
    <section className="panel activity-panel compact-activity-panel">
      <div className="panel-title-row">
        <div>
          <h2>Recent activity</h2>
          <p>Latest updates from this house.</p>
        </div>
        <button className="secondary" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="activity-list compact-activity-list timeline-activity-list">
        {!activities.length && <p className="small-muted">No activity yet.</p>}
        {recentActivities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
      </div>
      {activities.length > recentActivities.length && (
        <button className="ghost-button full see-all-activity" onClick={() => setShowAll(true)}>
          See all activity ({activities.length})
        </button>
      )}

      {showAll && (
        <div className="modal-backdrop activity-modal-backdrop" onClick={() => setShowAll(false)}>
          <section className="modal activity-modal" role="dialog" aria-modal="true" aria-label="All house activity" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <div>
                <p className="eyebrow">House activity</p>
                <h2>All recent updates</h2>
              </div>
              <button onClick={() => setShowAll(false)} aria-label="Close activity">×</button>
            </div>
            <div className="activity-list full-activity-list timeline-activity-list">
              {activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  return (
    <article className={`activity-row activity-${activity.action}`}>
      <span className="activity-icon" aria-hidden="true">{activityIcon(activity.action || '')}</span>
      <div>
        <strong>{activity.message}</strong>
        <small>{new Date(activity.created_at).toLocaleString()}</small>
      </div>
    </article>
  );
}
