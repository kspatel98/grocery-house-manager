import type { Activity, HouseMember } from '../types';

type MembersPanelProps = {
  members: HouseMember[];
  currentUserId?: number;
  houseRole?: 'owner' | 'admin' | 'member';
  onRemoveMember?: (member: HouseMember) => void;
};

export function MembersPanel({ members, currentUserId, houseRole, onRemoveMember }: MembersPanelProps) {
  const isOwner = houseRole === 'owner';

  return (
    <section className="panel members-panel">
      <h2>House members</h2>
      <p>{members.length} user{members.length === 1 ? '' : 's'} in this house.</p>
      <div className="member-list">
        {members.map((member) => {
          const isCurrentUser = member.user_id === currentUserId;
          const canKick = isOwner && !isCurrentUser && member.role !== 'owner';

          return (
            <div key={member.id} className="member-row member-row-with-action">
              <div className="avatar">{member.avatar_url ? <img src={member.avatar_url} alt="" /> : (member.full_name || 'M').slice(0, 1).toUpperCase()}</div>
              <div className="member-main">
                <strong>{member.full_name || 'House member'}{isCurrentUser ? ' (you)' : ''}</strong>
                <small>{member.role} • email hidden for privacy</small>
              </div>
              {canKick && <button className="danger small-button" onClick={() => onRemoveMember?.(member)}>Kick out</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ActivityFeed({ activities, onRefresh }: { activities: Activity[]; onRefresh: () => void }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-title-row">
        <div>
          <h2>Activity</h2>
          <p>Everyone in this house can see these updates.</p>
        </div>
        <button className="secondary" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="activity-list">
        {!activities.length && <p className="small-muted">No activity yet.</p>}
        {activities.map((activity) => (
          <article key={activity.id} className="activity-row">
            <strong>{activity.message}</strong>
            <small>{new Date(activity.created_at).toLocaleString()}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
