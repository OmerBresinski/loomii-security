/**
 * Sibling Context Helper
 *
 * Generates a brief summary of sibling sources in the same project,
 * enabling per-source reviews to detect cross-cutting security risks.
 *
 * Each source in a project gets summaries of its siblings injected into
 * the context bundle, so the AI agent is aware of the broader system
 * architecture even when reviewing a single source.
 */

interface SiblingSource {
  id: string;
  title: string;
  content: string;
  projectId: string | null;
}

/**
 * Generate a sibling context string for a specific source within a project.
 * Returns summaries of all other sources in the same project.
 *
 * @param allSources - All sources (events/items) available
 * @param currentSourceId - The source being reviewed (excluded from siblings)
 * @param projectId - The project to scope siblings to
 * @returns Formatted string with sibling summaries, or empty string if no siblings
 */
export function getSiblingSummaries(
  allSources: SiblingSource[],
  currentSourceId: string,
  projectId: string
): string {
  const siblings = allSources.filter(
    (s) => s.projectId === projectId && s.id !== currentSourceId
  );

  if (siblings.length === 0) return "";

  const summaries = siblings.map((s) => {
    const preview = (s.content || "").substring(0, 150).replace(/\n/g, " ").trim();
    return `- ${s.title}: ${preview}`;
  });

  return `Other sources in this project:\n${summaries.join("\n")}`;
}
