import { readFile } from "node:fs/promises";
import {
  getWikiMediaAsset,
  getWikiMediaAssets,
} from "@/lib/wiki";

export const dynamicParams = false;

type MediaRouteProps = {
  params: Promise<{ fileName: string }>;
};

export function generateStaticParams() {
  const assets = getWikiMediaAssets();

  return assets.length
    ? assets.map((asset) => ({
        fileName: asset.fileName,
      }))
    : [{ fileName: "unavailable.txt" }];
}

export async function GET(_request: Request, { params }: MediaRouteProps) {
  const { fileName } = await params;
  const asset = getWikiMediaAsset(fileName);
  if (!asset) {
    if (fileName === "unavailable.txt" && !getWikiMediaAssets().length) {
      return new Response("No published media.", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  return new Response(await readFile(asset.filePath), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": asset.contentType,
    },
  });
}
