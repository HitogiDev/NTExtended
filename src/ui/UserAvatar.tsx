import { useEffect, useState } from 'react';

// Keep this rule aligned with getAvatarInitials in NihongoTracker Frontend/src/utils/avatar.ts.
function getAvatarInitials(name?: string, maxLetters = 2): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase().slice(0, maxLetters);
  }
  return trimmed.slice(0, maxLetters).toUpperCase();
}

/** Show the avatar image, or the initials when there is no image or it fails to load. */
export function UserAvatar({
  username,
  avatar,
  className = 'h-10 w-10',
}: {
  username?: string;
  avatar?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  const showImage = Boolean(avatar) && !failed;

  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-full bg-base-300`}>
      {showImage ? (
        <img
          src={avatar}
          alt={username ?? ''}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-sm font-semibold">{getAvatarInitials(username)}</span>
        </div>
      )}
    </div>
  );
}
