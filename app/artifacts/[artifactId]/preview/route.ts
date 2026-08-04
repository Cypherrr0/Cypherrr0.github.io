import {
  getPublishedArtifact,
  getPublishedArtifacts,
} from "@/lib/artifacts";

export const dynamicParams = false;

type ArtifactPreviewRouteProps = {
  params: Promise<{ artifactId: string }>;
};

export function generateStaticParams() {
  const artifacts = getPublishedArtifacts();
  return artifacts.length
    ? artifacts.map((artifact) => ({ artifactId: artifact.id }))
    : [{ artifactId: "unavailable" }];
}

export async function GET(
  _request: Request,
  { params }: ArtifactPreviewRouteProps,
) {
  const { artifactId } = await params;
  const artifact = getPublishedArtifact(artifactId);

  if (!artifact) {
    if (artifactId === "unavailable" && !getPublishedArtifacts().length) {
      return new Response("No artifact preview.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(artifact.previewContent), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": artifact.previewContentType,
    },
  });
}
