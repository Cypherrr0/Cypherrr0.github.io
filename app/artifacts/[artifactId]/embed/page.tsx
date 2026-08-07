import { notFound } from "next/navigation";
import { ArtifactRunner } from "@/components/artifact-runner";
import {
  getPublishedArtifact,
  getPublishedArtifacts,
} from "@/lib/artifacts";

export const dynamicParams = false;

type ArtifactEmbedPageProps = {
  params: Promise<{ artifactId: string }>;
};

export function generateStaticParams() {
  const artifacts = getPublishedArtifacts();
  return artifacts.length
    ? artifacts.map((artifact) => ({ artifactId: artifact.id }))
    : [{ artifactId: "unavailable" }];
}

export default async function ArtifactEmbedPage({
  params,
}: ArtifactEmbedPageProps) {
  const { artifactId } = await params;
  const artifact = getPublishedArtifact(artifactId);

  if (!artifact) {
    if (artifactId === "unavailable" && !getPublishedArtifacts().length) {
      return <main className="artifact-empty">暂无交互制品。</main>;
    }
    notFound();
  }

  return (
    <main className="artifact-embed-page">
      <ArtifactRunner
        artifactId={artifact.id}
        capabilities={artifact.capabilities}
        html={artifact.html}
        mobile={artifact.mobile}
        previewPath={`/artifacts/${artifact.id}/preview`}
        runtime={artifact.resolvedRuntime}
        title={artifact.title}
      />
    </main>
  );
}
