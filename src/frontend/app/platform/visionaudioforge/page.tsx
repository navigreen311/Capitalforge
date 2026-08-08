'use client';

// ============================================================
// /platform/visionaudioforge — document and audio analysis
//
// This showed processed documents, extraction confidence scores and
// agent activity. No endpoint serves any of it.
//
// The amber card this used to carry said the right thing in the wrong
// register: amber is what a warning looks like, and a page that is
// working correctly and has nothing to show is not a warning.
// ============================================================

import { CapabilityState } from '@/components/ui/capability-state';

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">VisionAudioForge</h1>
        <p className="text-sm text-gray-500 mt-1">Document and audio analysis.</p>
      </div>

      <CapabilityState
        state="not_built"
        title="Document and audio analysis"
        detail="Nothing here processes a document or a recording. The page showed extraction results with confidence scores, agent statuses and a processing queue — all literals, against documents nobody submitted."
        unblock={{
          kind: 'unblocked_by',
          text: 'a service that processes a submitted document or recording, and an endpoint that serves what it found.',
        }}
      />
    </div>
  );
}
