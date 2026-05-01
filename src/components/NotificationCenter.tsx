import { useState } from "react";
import type { PendingInviteForUser } from "../lib/invites";
import type { UserNotification } from "../lib/notifications";
import { ToastViewport, useToast } from "./Toast";

interface NotificationCenterProps {
  invites: PendingInviteForUser[];
  notifications: UserNotification[];
}

interface AcceptInviteResponse {
  success?: boolean;
  spaceId?: string;
  error?: string;
}

interface AcceptedSpace {
  id: string;
  name: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getNotificationLabel(type: UserNotification["type"]): string {
  if (type.startsWith("script_comment")) return "Script feedback";
  if (type.endsWith("reply")) return "Reply";
  return "Video comment";
}

export function NotificationCenter({ invites, notifications }: NotificationCenterProps) {
  const [pendingInvites, setPendingInvites] = useState(invites);
  const [commentNotifications, setCommentNotifications] = useState(notifications);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [acceptedSpaces, setAcceptedSpaces] = useState<AcceptedSpace[]>([]);
  const { toasts, showToast, dismissToast } = useToast();

  const markRead = async (notificationId: string) => {
    const wasUnread = commentNotifications.some(
      (notification) => notification.id === notificationId && !notification.readAt,
    );
    setMarkingId(notificationId);
    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to mark notification read");
      setCommentNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() }
            : notification,
        ),
      );
      if (wasUnread) window.dispatchEvent(new CustomEvent("quickcut:notification-read"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update notification", "error");
      throw err;
    } finally {
      setMarkingId(null);
    }
  };

  const handleOpenNotification = async (notification: UserNotification) => {
    if (!notification.readAt) {
      try {
        await markRead(notification.id);
      } catch {
        return;
      }
    }
    window.location.assign(notification.href);
  };

  const handleAccept = async (invite: PendingInviteForUser) => {
    setLoadingToken(invite.token);

    try {
      const res = await fetch(`/api/invites/${invite.token}/accept`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as AcceptInviteResponse | null;

      if (!res.ok) throw new Error(data?.error || "Failed to accept invite");

      setPendingInvites((current) => current.filter((item) => item.token !== invite.token));
      setAcceptedSpaces((current) => [
        { id: data?.spaceId || invite.spaceId, name: invite.spaceName },
        ...current,
      ]);
      window.dispatchEvent(new CustomEvent("quickcut:invite-accepted"));
      showToast(`Joined ${invite.spaceName}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to accept invite", "error");
    } finally {
      setLoadingToken(null);
    }
  };

  const hasAnyNotifications = pendingInvites.length > 0 || commentNotifications.length > 0;

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {acceptedSpaces.length > 0 && (
        <div className="mb-6 space-y-2">
          {acceptedSpaces.map((space) => (
            <div key={space.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-success/30 bg-accent-success/10 px-4 py-3 text-sm text-text-primary">
              <span>
                You joined <span className="font-medium">{space.name}</span>.
              </span>
              <a
                href={`/dashboard?space=${space.id}`}
                className="rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Open space
              </a>
            </div>
          ))}
        </div>
      )}

      {!hasAnyNotifications ? (
        <div className="rounded-2xl border border-border-default bg-bg-secondary p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-text-tertiary">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary">No pending notifications</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Space invites, comment activity, and replies will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {pendingInvites.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">Invites</h2>
              <ul className="space-y-3">
                {pendingInvites.map((invite) => {
                  const isLoading = loadingToken === invite.token;

                  return (
                    <li key={invite.id} className="rounded-2xl border border-border-default bg-bg-secondary p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            Invitation to join {invite.spaceName}
                          </p>
                          <p className="mt-1 text-sm text-text-secondary">
                            {invite.inviterDisplayName} invited you to collaborate in this space.
                          </p>
                          <p className="mt-1 text-xs text-text-tertiary">
                            Invited {new Date(invite.createdAt).toLocaleDateString()} by {invite.inviterEmail}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/invites/${invite.token}`}
                            className="rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
                          >
                            View invite
                          </a>
                          <button
                            type="button"
                            onClick={() => handleAccept(invite)}
                            disabled={isLoading || loadingToken !== null}
                            className="rounded-lg bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                          >
                            {isLoading ? "Accepting..." : "Accept Invite"}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {commentNotifications.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">Comment activity</h2>
              <ul className="space-y-3">
                {commentNotifications.map((notification) => {
                  const unread = !notification.readAt;
                  const isMarking = markingId === notification.id;

                  return (
                    <li key={notification.id} className={`rounded-2xl border p-5 ${unread ? "border-accent-primary/40 bg-accent-primary/10" : "border-border-default bg-bg-secondary"}`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <button
                          type="button"
                          onClick={() => handleOpenNotification(notification)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {unread && <span className="h-2 w-2 rounded-full bg-accent-primary" aria-label="Unread" />}
                            <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                              {getNotificationLabel(notification.type)}
                            </span>
                            <span className="text-xs text-text-tertiary">{formatDate(notification.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-text-primary">{notification.title}</p>
                          {notification.body && (
                            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{notification.body}</p>
                          )}
                        </button>
                        <div className="flex flex-wrap gap-2">
                          {!notification.readAt && (
                            <button
                              type="button"
                              onClick={() => markRead(notification.id)}
                              disabled={isMarking}
                              className="rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                            >
                              {isMarking ? "Marking..." : "Mark read"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenNotification(notification)}
                            className="rounded-lg bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
