import { useMemo, useState } from "react";
import { CreateFolderDialog, type CreatedFolder } from "./CreateFolderDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { FolderCardItem, type FolderCardItemData } from "./FolderCardItem";
import { VideoCardItem, type VideoCardItemData } from "./VideoCardItem";

interface FolderOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface DashboardGridProps {
  spaceId: string;
  currentFolderId: string | null;
  initialFolders: FolderCardItemData[];
  initialVideos: VideoCardItemData[];
  /**
   * The complete folder tree for the current space. Used to populate the
   * "Move to folder" dropdown without an extra fetch. Distinct from
   * `initialFolders`, which only contains the children of the current folder.
   */
  initialAllFolders: FolderOption[];
  emptyHeading: string;
  emptyDescription: string;
}

/**
 * Client-rendered grid of folders and videos for the dashboard. Owns the
 * folder/video state so create / rename / move / delete actions update the UI
 * in place without a full page reload.
 */
export function DashboardGrid({
  spaceId,
  currentFolderId,
  initialFolders,
  initialVideos,
  initialAllFolders,
  emptyHeading,
  emptyDescription,
}: DashboardGridProps) {
  const [folders, setFolders] = useState<FolderCardItemData[]>(initialFolders);
  const [videos, setVideos] = useState<VideoCardItemData[]>(initialVideos);
  const [allFolders, setAllFolders] = useState<FolderOption[]>(initialAllFolders);

  const handleFolderCreated = (folder: CreatedFolder) => {
    setAllFolders((current) => [
      ...current,
      { id: folder.id, name: folder.name, parentId: folder.parentId },
    ]);
    // Only add the new folder to the visible grid if it belongs to the current
    // folder view. The create dialog passes the same `parentId` we render
    // with, so this should always be true, but we double-check defensively.
    if ((folder.parentId ?? null) !== currentFolderId) return;
    const newFolder: FolderCardItemData = {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      spaceId: folder.spaceId,
      videoCount: 0,
      thumbnails: [],
    };
    setFolders((current) => [...current, newFolder]);
  };

  const handleFolderRenamed = (id: string, name: string) => {
    setFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    );
    setAllFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    );
  };

  const handleFolderMoved = (id: string, newParentId: string | null) => {
    // The move dialog hides the folder's current location, so any successful
    // move means the folder leaves the current view.
    setFolders((current) => current.filter((folder) => folder.id !== id));
    setAllFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, parentId: newParentId } : folder)),
    );
  };

  const handleFolderDeleted = (id: string) => {
    setFolders((current) => current.filter((folder) => folder.id !== id));
    setAllFolders((current) => current.filter((folder) => folder.id !== id));
  };

  const handleVideoMoved = (id: string, _newFolderId: string | null) => {
    setVideos((current) => current.filter((video) => video.id !== id));
  };

  const handleVideoDeleted = (id: string) => {
    setVideos((current) => current.filter((video) => video.id !== id));
  };

  const folderOptions = useMemo<FolderOption[]>(() => allFolders, [allFolders]);
  const isEmpty = folders.length === 0 && videos.length === 0;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1" />
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={`/spaces/${spaceId}/calendar?space=${spaceId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary sm:px-5"
            aria-label="Open launch calendar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="hidden sm:inline">Calendar</span>
          </a>
          <NewProjectDialog folderId={currentFolderId} spaceId={spaceId} />
          <CreateFolderDialog
            parentId={currentFolderId}
            spaceId={spaceId}
            onCreated={handleFolderCreated}
          />
        </div>
      </div>

      {isEmpty ? (
        <EmptyGridState heading={emptyHeading} description={emptyDescription} />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <FolderCardItem
              key={folder.id}
              folder={folder}
              folders={folderOptions}
              onRenamed={handleFolderRenamed}
              onMoved={handleFolderMoved}
              onDeleted={handleFolderDeleted}
            />
          ))}
          {videos.map((video) => (
            <VideoCardItem
              key={video.id}
              video={video}
              folders={folderOptions}
              onDeleted={handleVideoDeleted}
              onMoved={handleVideoMoved}
            />
          ))}
        </div>
      )}
    </>
  );
}

function EmptyGridState({ heading, description }: { heading: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <svg
        className="mb-6 h-16 w-16 text-text-tertiary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5"
        />
      </svg>
      <h2 className="text-xl font-semibold text-text-primary">{heading}</h2>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
    </div>
  );
}
