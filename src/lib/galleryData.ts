export type GalleryData = {
  title: string;
  description: string;
  theme: string;
  coverId: string | null;
  token: string;
  photos: {
    id: string;
    filename: string;
    width: number;
    height: number;
    size: number;
    url: string;
  }[];
  previewsHref: string;
  pageHref: string;
  downloadBase: string;
  archiveHref: string;
  preview?: boolean;
  editorHref?: string;
};
