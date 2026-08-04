import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublishedArtifact,
  getPublishedArtifacts,
} from "@/lib/artifacts";

export const dynamicParams = false;

type ArtifactPageProps = {
  params: Promise<{ artifactId: string }>;
};

export function generateStaticParams() {
  const artifacts = getPublishedArtifacts();
  return artifacts.length
    ? artifacts.map((artifact) => ({ artifactId: artifact.id }))
    : [{ artifactId: "unavailable" }];
}

export async function generateMetadata({
  params,
}: ArtifactPageProps): Promise<Metadata> {
  const artifact = getPublishedArtifact((await params).artifactId);
  return artifact
    ? {
        description: artifact.description,
        title: artifact.title,
      }
    : {};
}

export default async function ArtifactPage({ params }: ArtifactPageProps) {
  const { artifactId } = await params;
  const artifact = getPublishedArtifact(artifactId);

  if (!artifact) {
    if (artifactId === "unavailable" && !getPublishedArtifacts().length) {
      return <main className="artifact-empty">暂无交互制品。</main>;
    }
    notFound();
  }

  return (
    <main className="artifact-page" id="main-content" tabIndex={-1}>
      <nav aria-label="交互制品导航" className="artifact-page-nav">
        <Link href="/">C/P</Link>
        <span aria-hidden="true">/</span>
        <Link href="/wiki/">Wiki</Link>
        <span aria-hidden="true">/</span>
        <span>Artifact</span>
      </nav>
      <header className="artifact-page-header">
        <p>{artifact.artifactRole}</p>
        <h1>{artifact.title}</h1>
        <p>{artifact.description}</p>
      </header>
      <section className="artifact-page-stage" aria-label={artifact.title}>
        <iframe
          allow={artifact.capabilities.includes("fullscreen") ? "fullscreen" : ""}
          src={`/artifacts/${artifact.id}/embed/`}
          title={artifact.title}
        />
      </section>
      <footer className="artifact-page-footer">
        <p>{artifact.interaction}</p>
        <Link href={`/wiki/${artifact.sourceDocumentPath.replace(/\.md$/i, "")}/`}>
          返回原文
        </Link>
      </footer>
    </main>
  );
}
