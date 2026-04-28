import { useState } from "react";
import { ToastViewport, useToast } from "./Toast";

interface Space {
  id: string;
  name: string;
  ownerId: string;
  requiredApprovals: number;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  displayName: string;
  email: string;
}

interface Invite {
  id: string;
  spaceId: string;
  email: string;
  invitedBy: string;
  token: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
}

interface SpaceSettingsProps {
  space: Space;
  members: Member[];
  pendingInvites: Invite[];
  currentUserId: string;
  currentUserRole: string;
  isDefaultSpace: boolean;
}

export function SpaceSettings({
  space: initialSpace,
  members: initialMembers,
  pendingInvites: initialInvites,
  currentUserId,
  currentUserRole,
  isDefaultSpace,
}: SpaceSettingsProps) {
  const isOwner = currentUserRole === "owner";

  const [space, setSpace] = useState(initialSpace);
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);

  // Settings form state
  const [name, setName] = useState(space.name);
  const [requiredApprovals, setRequiredApprovals] = useState(space.requiredApprovals);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  // General action state
  const [actionError, setActionError] = useState("");

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const res = await fetch(`/api/spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), requiredApprovals }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        space?: Space;
      } | null;

      if (!res.ok) throw new Error(data?.error || "Failed to update settings");
      if (data?.space) setSpace(data.space);
      setSettingsSuccess("Settings saved");
      setTimeout(() => setSettingsSuccess(""), 3000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSaving(true);

    try {
      const res = await fetch(`/api/spaces/${space.id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        invite?: Invite;
      } | null;

      if (!res.ok) throw new Error(data?.error || "Failed to send invite");
      if (data?.invite) setInvites((prev) => [...prev, data.invite!]);
      setInviteEmail("");
      showToast("Invite sent");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to invite", "error");
    } finally {
      setInviteSaving(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setActionError("");
    try {
      const res = await fetch(`/api/spaces/${space.id}/invites/${inviteId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to revoke invite");
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to revoke");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setActionError("");
    try {
      const res = await fetch(`/api/spaces/${space.id}/members/${userId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const handleLeave = async () => {
    if (!confirm("Are you sure you want to leave this space?")) return;
    setActionError("");
    try {
      const res = await fetch(`/api/spaces/${space.id}/leave`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to leave space");
      window.location.href = "/dashboard";
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to leave");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${space.name}"? All videos and folders in this space will be permanently deleted.`)) return;
    setActionError("");
    try {
      const res = await fetch(`/api/spaces/${space.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to delete space");
      window.location.href = "/dashboard";
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-8">
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{space.name}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {isOwner ? "Manage your space settings, members, and invites." : "View space members."}
        </p>
      </div>

      {actionError && (
        <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
          {actionError}
        </div>
      )}

      {/* Space Settings (owner only) */}
      {isOwner && (
        <section className="rounded-xl border border-border-default bg-bg-secondary p-6">
          <h2 className="text-base font-semibold text-text-primary">Space Settings</h2>
          <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="space-name">
                Name
              </label>
              <input
                id="space-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={settingsSaving}
                className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="required-approvals">
                Required Approvals
              </label>
              <input
                id="required-approvals"
                type="number"
                min={0}
                max={100}
                value={requiredApprovals}
                onChange={(e) => setRequiredApprovals(parseInt(e.target.value) || 0)}
                disabled={settingsSaving}
                className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                Set to 0 to disable the approval workflow.
              </p>
            </div>

            {settingsError && (
              <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
                {settingsError}
              </div>
            )}
            {settingsSuccess && (
              <div className="rounded-lg bg-accent-success/15 px-4 py-2 text-sm text-accent-success">
                {settingsSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={settingsSaving || !name.trim()}
              className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
            >
              {settingsSaving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        </section>
      )}

      {/* Members */}
      <section className="rounded-xl border border-border-default bg-bg-secondary p-6">
        <h2 className="text-base font-semibold text-text-primary">
          Members ({members.length})
        </h2>
        <ul className="mt-4 divide-y divide-border-default">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {member.displayName}
                  {member.userId === currentUserId && (
                    <span className="ml-2 text-xs text-text-tertiary">(you)</span>
                  )}
                </p>
                <p className="text-xs text-text-tertiary">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    member.role === "owner"
                      ? "bg-accent-primary/15 text-accent-primary"
                      : "bg-bg-tertiary text-text-secondary"
                  }`}
                >
                  {member.role}
                </span>
                {isOwner && member.userId !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.userId)}
                    className="rounded-lg px-2 py-1 text-xs text-accent-danger transition-colors hover:bg-accent-danger/15"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isOwner && members.length <= 1 && (
          <div className="mt-4 rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-secondary">
            Invite teammates so they can review, comment, and approve videos in this space.
          </div>
        )}

        {!isOwner && (
          <div className="mt-4 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={handleLeave}
              className="rounded-lg border border-accent-danger px-4 py-2 text-sm font-medium text-accent-danger transition-colors hover:bg-accent-danger/15"
            >
              Leave Space
            </button>
          </div>
        )}
      </section>

      {/* Pending Invites (owner only) */}
      {isOwner && (
        <section className="rounded-xl border border-border-default bg-bg-secondary p-6">
          <h2 className="text-base font-semibold text-text-primary">Invites</h2>

          <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3 lg:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviteSaving}
              placeholder="colleague@example.com"
              className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50 lg:flex-1"
            />
            <button
              type="submit"
              disabled={inviteSaving || !inviteEmail.trim()}
              className="w-full rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50 lg:w-auto"
            >
              {inviteSaving ? "Sending..." : "Send Invite"}
            </button>
          </form>

          {invites.length > 0 && (
            <ul className="mt-4 divide-y divide-border-default">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-text-primary">{invite.email}</p>
                    <p className="text-xs text-text-tertiary">
                      Invited {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(invite.id)}
                    className="rounded-lg px-2 py-1 text-xs text-accent-danger transition-colors hover:bg-accent-danger/15"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}

          {invites.length === 0 && (
            <p className="mt-4 text-sm text-text-tertiary">No pending invites.</p>
          )}
        </section>
      )}

      {/* Danger Zone (owner only) */}
      {isOwner && !isDefaultSpace && (
        <section className="rounded-xl border border-accent-danger/30 bg-bg-secondary p-6">
          <h2 className="text-base font-semibold text-accent-danger">Danger Zone</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Permanently delete this space and all its videos, folders, and data.
            This cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            className="mt-4 rounded-lg bg-accent-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-danger/90"
          >
            Delete Space
          </button>
        </section>
      )}
    </div>
  );
}
