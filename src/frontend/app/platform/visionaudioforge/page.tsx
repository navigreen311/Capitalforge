'use client';

// ============================================================
// /platform/visionaudioforge — document and audio analysis
//
// This showed processed documents, extraction confidence scores and
// agent activity. No endpoint serves any of it.
// ============================================================

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">VisionAudioForge</h1>
        <p className="text-sm text-gray-500 mt-1">Document and audio analysis.</p>
      </div>

      <section
        aria-label="Not implemented"
        className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2"
      >
        <h2 className="text-sm font-semibold text-amber-900">Not implemented</h2>
        <p className="text-xs text-amber-900 leading-relaxed">
          Nothing here processes a document or a recording. The page showed extraction results
          with confidence scores, agent statuses and a processing queue — all literals, against
          documents nobody submitted.
        </p>
      </section>
    </div>
  );
}
