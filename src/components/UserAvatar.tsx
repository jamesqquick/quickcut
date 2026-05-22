import { useState } from "react";

type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, { container: string; text: string }> = {
  sm: { container: "h-6 w-6", text: "text-[10px]" },
  md: { container: "h-7 w-7", text: "text-[10px]" },
  lg: { container: "h-8 w-8", text: "text-xs" },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface UserAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
  showTooltip?: boolean;
  muted?: boolean;
}

export function UserAvatar({
  name,
  imageUrl,
  size = "sm",
  className = "",
  showTooltip = false,
  muted = false,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { container, text } = sizeClasses[size];
  const bgClass = muted ? "bg-accent-primary/60" : "bg-accent-primary";
  const showImage = imageUrl && !imgError;

  const avatarClassName = showTooltip ? "" : className;
  const wrapperClassName = showTooltip ? className : "";

  const avatar = showImage ? (
    <img
      src={imageUrl}
      alt={name}
      onError={() => setImgError(true)}
      className={`${container} shrink-0 rounded-full object-cover ${avatarClassName}`}
    />
  ) : (
    <span
      className={`flex ${container} shrink-0 items-center justify-center rounded-full ${bgClass} ${text} font-medium text-white ${avatarClassName}`}
    >
      {getInitials(name)}
    </span>
  );

  if (!showTooltip) return avatar;

  return (
    <span className={`group/avatar relative inline-flex ${wrapperClassName}`}>
      {avatar}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border-default bg-bg-primary px-2 py-1 text-[11px] text-text-secondary shadow-lg group-hover/avatar:block"
      >
        {name}
      </span>
    </span>
  );
}

export { getInitials };
