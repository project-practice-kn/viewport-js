export type GalleryData = {
  title: string;
  description: string;
  theme: string;
  coverId: string | null;
  cover: { id: string; filename: string; width: number; height: number; url: string } | null;
  token: string;
  total: number;
  totalBytes: number;
  offset: number;
  photos: {
    id: string;
    filename: string;
    width: number;
    height: number;
    size: number;
    url: string;
    thumbnailUrl: string;
  }[];
  previewsHref: string;
  pageHref: string;
  downloadBase: string;
  archiveHref: string;
  preview?: boolean;
  editorHref?: string;
};
