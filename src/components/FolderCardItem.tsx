import { FolderCardMenu } from "./FolderCardMenu";

interface FolderOption {
  id: string;
  name: string;
  parentId: string | null;
}

export interface FolderCardItemData {
  id: string;
  name: string;
  parentId: string | null;
  spaceId: string;
  videoCount: number;
  thumbnails: string[];
}

interface FolderCardItemProps {
  folder: FolderCardItemData;
  folders: FolderOption[];
  onRenamed: (id: string, name: string) => void;
  onMoved: (id: string, parentId: string | null) => void;
  onDeleted: (id: string) => void;
}

export function FolderCardItem({ folder, folders, onRenamed, onMoved, onDeleted }: FolderCardItemProps) {
  const { id, name, parentId, spaceId, videoCount, thumbnails } = folder;
  const remaining = Math.max(videoCount - thumbnails.length, 0);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border-default bg-bg-secondary transition-all duration-200 hover:scale-[1.02] hover:border-border-hover hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
      <a href={`/dashboard?space=${spaceId}&folderId=${id}`} className="block">
        <div className="relative aspect-video bg-bg-tertiary p-3">
          <div className="absolute left-0 top-0 h-8 w-20 rounded-br-2xl bg-bg-secondary"></div>
          <div className="grid h-full grid-cols-2 gap-2 overflow-hidden rounded-lg pt-3">
            {thumbnails.length > 0 ? (
              thumbnails.map((thumbnail, index) => (
                <div key={index} className="relative overflow-hidden rounded-md bg-bg-primary">
                  <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                  {index === thumbnails.length - 1 && remaining > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-semibold text-white">
                      +{remaining}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 flex h-full items-center justify-center rounded-lg bg-bg-primary">
                <svg className="h-12 w-12 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V6.75A2.25 2.25 0 014.5 4.5h5.379c.596 0 1.169.237 1.591.659l1.122 1.122c.422.422.995.659 1.591.659H19.5a2.25 2.25 0 012.25 2.25v3.56M2.25 12.75v4.5A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25v-4.5M2.25 12.75h19.5" />
                </svg>
              </div>
            )}
          </div>
        </div>
        <div className="p-4">
          <h3 className="truncate text-sm font-semibold text-text-primary">{name}</h3>
          <p className="mt-1.5 text-xs text-text-tertiary">
            {videoCount} {videoCount === 1 ? "file" : "files"}
          </p>
        </div>
      </a>
      <div className="absolute right-2 top-2 z-10">
        <FolderCardMenu
          folderId={id}
          folderName={name}
          parentId={parentId}
          folders={folders}
          onRenamed={onRenamed}
          onMoved={onMoved}
          onDeleted={onDeleted}
        />
      </div>
    </div>
  );
}
