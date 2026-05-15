import { actions } from "astro:actions";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ToastViewport, useToast } from "./Toast";
import { friendlyActionErrorMessage } from "../lib/errors";

interface Space {
  id: string;
  name: string;
  ownerId: string;
  requiredApprovals: number;
  pipelineEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  name: string;
  email?: string;
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

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  // General action state
  const [actionError, setActionError] = useState("");

  // Destructive-action dialog state
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError("");

    try {
      const { data, error } = await actions.space.update({
        id: space.id,
        name: name.trim(),
        requiredApprovals,
      });
      if (error) {
        throw new Error(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't save your space settings. Please try again.",
          ),
        );
      }
      if (data?.space) setSpace(data.space);
      showToast("Settings saved");
    } catch (err) {
      setSettingsError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't save your space settings. Please try again.",
        ),
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSaving(true);

    try {
      const { data, error } = await actions.space.createInvite({
        id: space.id,
        email: inviteEmail.trim(),
      });
      if (error) {
        throw new Error(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't send that invite. Check the email address and try again.",
          ),
        );
      }
      if (data?.invite) setInvites((prev) => [...prev, data.invite!]);
      setInviteEmail("");
      showToast("Invite sent");
    } catch (err) {
      showToast(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't send that invite. Check the email address and try again.",
        ),
        "error",
      );
    } finally {
      setInviteSaving(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setActionError("");
    // Optimistic: remove immediately, restore on failure
    const previous = invites;
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    try {
      const { error } = await actions.space.revokeInvite({
        id: space.id,
        inviteId,
      });
      if (error) {
        throw new Error(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't revoke that invite. Please refresh and try again.",
          ),
        );
      }
    } catch (err) {
      setInvites(previous);
      setActionError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't revoke that invite. Please refresh and try again.",
        ),
      );
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setActionError("");
    // Optimistic: remove immediately, restore on failure
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
    try {
      const { error } = await actions.space.removeMember({
        id: space.id,
        userId,
      });
      if (error) {
        throw new Error(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't remove that member. Please refresh and try again.",
          ),
        );
      }
    } catch (err) {
      setMembers(previous);
      setActionError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't remove that member. Please refresh and try again.",
        ),
      );
    }
  };

  const confirmLeave = async () => {
    setActionError("");
    setLeaveLoading(true);
    try {
      const { error } = await actions.space.leave({ id: space.id });
      if (error) {
        throw new Error(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't leave the space. Please try again.",
          ),
        );
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setActionError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't leave the space. Please try again.",
        ),
      );
      setLeaveLoading(false);
      setLeaveOpen(false);
    }
  };

  const confirmDelete = async () => {
    setActionError("");
    setDeleteLoading(true);
    try {
      const { error } = await actions.space.delete({ id: space.id });
      if (error) {
        throw new Error(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't delete the space. Please try again.",
          ),
        );
      }
      // Persist a toast across the navigation to /dashboard. The dashboard
      // page mounts a <PendingToast /> that consumes and displays this.
      try {
        sessionStorage.setItem(
          "pendingToast",
          JSON.stringify({
            message: `Deleted "${space.name}"`,
            variant: "success",
          }),
        );
      } catch {
        // Ignore storage failures (private mode, quota, etc.) — the redirect
        // still succeeds, only the toast is lost.
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setActionError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't delete the space. Please try again.",
        ),
      );
      setDeleteLoading(false);
      setDeleteOpen(false);
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
        <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm break-words text-accent-danger">
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
              <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm break-words text-accent-danger">
                {settingsError}
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
                  {member.name}
                  {member.userId === currentUserId && (
                    <span className="ml-2 text-xs text-text-tertiary">(you)</span>
                  )}
                </p>
                {member.email && (
                  <p className="text-xs text-text-tertiary">{member.email}</p>
                )}
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
              onClick={() => setLeaveOpen(true)}
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
            onClick={() => setDeleteOpen(true)}
            className="mt-4 rounded-lg bg-accent-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-danger/90"
          >
            Delete Space
          </button>
        </section>
      )}

      <ConfirmDialog
        isOpen={leaveOpen}
        title="Leave this space?"
        description="You'll lose access to all videos and folders in this space."
        confirmLabel="Leave space"
        variant="danger"
        loading={leaveLoading}
        onConfirm={confirmLeave}
        onCancel={() => setLeaveOpen(false)}
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        title={`Delete "${space.name}"?`}
        description="All videos, folders, and data in this space will be permanently deleted. This cannot be undone."
        confirmLabel="Delete space"
        variant="danger"
        loading={deleteLoading}
        requireTypedConfirmation={space.name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
