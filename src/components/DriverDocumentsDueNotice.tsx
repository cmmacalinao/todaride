import { useRides } from '../context/RideContext'
import { DocumentUploadField } from './DocumentUploadField'
import { DOCUMENT_LABEL, missingRequiredDocuments } from '../lib/requiredDocuments'
import type { Driver } from '../types'

// What an approved driver owes, and the means to hand it over.
//
// documentsDueBy is stamped on a driver at registration and again when a
// document becomes required, but until this existed nothing ever told the
// driver about it: the date sat in the record, the driver drove on unaware,
// and the deadline could only ever arrive as a surprise. A deadline nobody is
// told about is not a deadline, it is a trap.
//
// The upload is inside the notice on purpose. An approved driver had no way
// to submit a document at all — the re-upload fields live on the pending
// application screen, which an approved driver never sees again. Telling
// somebody to produce a paper while giving them nowhere to put it is worse
// than saying nothing, so the notice carries the field.
export function DriverDocumentsDueNotice({ driver }: { driver: Driver }) {
  const { requiredDocuments, resubmitDriverDocument } = useRides()
  const missing = missingRequiredDocuments(driver.documents, requiredDocuments)

  // Nothing owed, or no date given: say nothing. A banner that is always
  // there is one nobody reads.
  if (missing.length === 0 || !driver.documentsDueBy) return null

  const due = new Date(driver.documentsDueBy)
  const overdue = due.getTime() < Date.now()

  return (
    <div
      className={`rounded-lg px-3 py-2 text-[11px] leading-snug ${
        overdue ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'
      }`}
    >
      <p className="font-semibold">
        📄 {overdue ? 'Lumipas na ang deadline' : 'Kailangan pa ang mga papeles'} —{' '}
        {missing.map((t) => DOCUMENT_LABEL[t]).join(', ')}
      </p>
      <p className="mt-0.5">
        {overdue
          ? `Dapat naipasa ito noong ${due.toLocaleDateString()}. Mag-upload na para hindi maantala ang pasada mo.`
          : `Hanggang ${due.toLocaleDateString()} ang bigay sa iyo. Puwede mong i-upload dito ngayon.`}
      </p>
      <div className="mt-2 space-y-2">
        {missing.map((type) => (
          <DocumentUploadField
            key={type}
            label={DOCUMENT_LABEL[type]}
            dataUrl={driver.documents[type].dataUrl}
            onUpload={(dataUrl) => resubmitDriverDocument(driver.id, type, dataUrl)}
          />
        ))}
      </div>
    </div>
  )
}
