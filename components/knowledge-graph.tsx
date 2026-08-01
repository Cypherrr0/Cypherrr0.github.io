"use client";

import { useEffect, useMemo, useRef } from "react";
import type { WikiPageSummary } from "@/lib/wiki";

type KnowledgeGraphProps = {
  activeDomain: string;
  pages: WikiPageSummary[];
};

type GraphNode = {
  domain: string;
  id: string;
  kind: "domain" | "topic" | "page";
  label: string;
  x: number;
  y: number;
  z: number;
};

type GraphEdge = {
  from: number;
  to: number;
};

type GraphModel = {
  edges: GraphEdge[];
  nodes: GraphNode[];
};

const DOMAIN_POSITION: Record<string, [number, number, number]> = {
  learning: [-125, -32, -28],
  tech: [82, -18, 24],
  writing: [8, 118, -16],
};

export function KnowledgeGraph({
  activeDomain,
  pages,
}: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const model = useMemo(() => buildGraph(pages), [pages]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let frame = 0;
    let isVisible = true;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let isMounted = true;

    const draw = (time = 0) => {
      if (!width || !height) {
        return;
      }

      const styles = getComputedStyle(canvas);
      const foreground = styles.getPropertyValue("--foreground").trim();
      const muted = styles.getPropertyValue("--muted").trim();
      const border = styles.getPropertyValue("--border").trim();
      const mono =
        styles.getPropertyValue("--font-geist-mono").trim() || "monospace";
      const angle = reducedMotion.matches ? 0.38 : time * 0.000075;
      const tilt = -0.16 + Math.sin(angle * 0.42) * 0.035;
      const projected = model.nodes.map((node) =>
        projectNode(node, angle, tilt, width, height),
      );

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;

      for (const edge of model.edges) {
        const fromNode = model.nodes[edge.from];
        const toNode = model.nodes[edge.to];
        const from = projected[edge.from];
        const to = projected[edge.to];
        const isActive =
          fromNode.domain === activeDomain && toNode.domain === activeDomain;

        context.globalAlpha = isActive ? 0.24 : 0.075;
        context.strokeStyle = isActive ? foreground : border;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }

      const order = projected
        .map((point, index) => ({ index, z: point.z }))
        .sort((left, right) => left.z - right.z);

      for (const item of order) {
        const node = model.nodes[item.index];
        const point = projected[item.index];
        const isActive = node.domain === activeDomain;
        const radius =
          node.kind === "domain" ? 4.5 : node.kind === "topic" ? 3 : 1.8;

        context.globalAlpha = isActive
          ? node.kind === "page"
            ? 0.7
            : 0.95
          : node.kind === "page"
            ? 0.2
            : 0.4;
        context.fillStyle = isActive ? foreground : muted;
        context.beginPath();
        context.arc(point.x, point.y, radius * point.scale, 0, Math.PI * 2);
        context.fill();

        if (
          node.kind === "domain" ||
          (node.kind === "topic" && isActive && point.z > -35)
        ) {
          context.globalAlpha = node.kind === "domain" ? 0.9 : 0.62;
          context.fillStyle = foreground;
          context.font =
            node.kind === "domain"
              ? `500 11px ${mono}, monospace`
              : `400 9px ${mono}, monospace`;
          context.textBaseline = "middle";
          context.fillText(
            node.label,
            point.x + 8,
            point.y + (node.kind === "domain" ? -1 : 0),
          );
        }
      }

      context.globalAlpha = 1;
    };

    const animate = (time: number) => {
      draw(time);
      if (!reducedMotion.matches && isVisible) {
        frame = requestAnimationFrame(animate);
      }
    };

    const restart = () => {
      cancelAnimationFrame(frame);
      if (reducedMotion.matches) {
        draw();
      } else if (isVisible) {
        frame = requestAnimationFrame(animate);
      }
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      width = Math.max(1, Math.round(entry.contentRect.width));
      height = Math.max(1, Math.round(entry.contentRect.height));
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      restart();
    });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      restart();
    });

    resizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    reducedMotion.addEventListener("change", restart);
    void document.fonts.ready.then(() => {
      if (isMounted) {
        restart();
      }
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      reducedMotion.removeEventListener("change", restart);
    };
  }, [activeDomain, model]);

  return (
    <div className="knowledge-graph">
      <canvas
        aria-label="Corepedia 知识关系图：页面按学习、技术和写作三个知识域连接"
        ref={canvasRef}
        role="img"
      />
    </div>
  );
}

function buildGraph(pages: WikiPageSummary[]): GraphModel {
  const visiblePages = pages.filter((page) => !isIndexPage(page));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIndex = new Map<string, number>();
  const domains = [...new Set(visiblePages.map((page) => page.slug[0]))];

  for (const [domainIndex, domain] of domains.entries()) {
    const position =
      DOMAIN_POSITION[domain] ||
      pointAround([0, 0, 0], domainIndex, domains.length, 110);
    addNode({
      domain,
      id: domain,
      kind: "domain",
      label: domain.toUpperCase(),
      x: position[0],
      y: position[1],
      z: position[2],
    });
  }

  for (const page of visiblePages) {
    const domain = page.slug[0];
    let parentId = domain;

    for (let depth = 1; depth < page.slug.length - 1; depth += 1) {
      const topicId = page.slug.slice(0, depth + 1).join("/");
      if (!nodeIndex.has(topicId)) {
        const parent = nodes[nodeIndex.get(parentId) as number];
        const siblings = pages.filter(
          (candidate) =>
            candidate.slug.slice(0, depth).join("/") ===
            page.slug.slice(0, depth).join("/"),
        );
        const position = pointAround(
          [parent.x, parent.y, parent.z],
          hashString(topicId) % Math.max(1, siblings.length),
          Math.max(3, siblings.length),
          58 + depth * 14,
          hashString(topicId),
        );
        const topicIndex = addNode({
          domain,
          id: topicId,
          kind: "topic",
          label: formatSegment(page.slug[depth]),
          x: position[0],
          y: position[1],
          z: position[2],
        });
        edges.push({
          from: nodeIndex.get(parentId) as number,
          to: topicIndex,
        });
      }
      parentId = topicId;
    }

    const parent = nodes[nodeIndex.get(parentId) as number];
    const pageId = page.slug.join("/");
    const siblingPages = visiblePages.filter(
      (candidate) =>
        candidate.slug.slice(0, -1).join("/") ===
        page.slug.slice(0, -1).join("/"),
    );
    const position = pointAround(
      [parent.x, parent.y, parent.z],
      siblingPages.findIndex((candidate) => candidate.path === page.path),
      Math.max(3, siblingPages.length),
      46,
      hashString(pageId),
    );
    const pageIndex = addNode({
      domain,
      id: pageId,
      kind: "page",
      label: page.title,
      x: position[0],
      y: position[1],
      z: position[2],
    });
    edges.push({
      from: nodeIndex.get(parentId) as number,
      to: pageIndex,
    });
  }

  return { edges, nodes };

  function addNode(node: GraphNode) {
    const index = nodes.length;
    nodes.push(node);
    nodeIndex.set(node.id, index);
    return index;
  }
}

function pointAround(
  center: [number, number, number],
  index: number,
  total: number,
  radius: number,
  seed = index + total,
): [number, number, number] {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + seed * 0.013;
  const vertical = ((seed % 7) - 3) * 7;
  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + Math.sin(angle) * radius * 0.72,
    center[2] + Math.sin(angle * 1.7) * radius * 0.55 + vertical,
  ];
}

function projectNode(
  node: GraphNode,
  angle: number,
  tilt: number,
  width: number,
  height: number,
) {
  const cosY = Math.cos(angle);
  const sinY = Math.sin(angle);
  const rotatedX = node.x * cosY - node.z * sinY;
  const rotatedZ = node.x * sinY + node.z * cosY;
  const cosX = Math.cos(tilt);
  const sinX = Math.sin(tilt);
  const rotatedY = node.y * cosX - rotatedZ * sinX;
  const depth = node.y * sinX + rotatedZ * cosX;
  const perspective = 620;
  const perspectiveScale = perspective / (perspective + depth);
  const fitScale = Math.min(width / 620, height / 440);

  return {
    scale: perspectiveScale,
    x: width / 2 + rotatedX * perspectiveScale * fitScale,
    y: height / 2 + rotatedY * perspectiveScale * fitScale,
    z: depth,
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function isIndexPage(page: WikiPageSummary) {
  return page.path.endsWith("/index.md");
}

function formatSegment(segment: string) {
  return segment
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
