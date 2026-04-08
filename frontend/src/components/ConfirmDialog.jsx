export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', confirmClass = 'btn-primary', onConfirm, onCancel, extraContent }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500">{message}</p>
        {extraContent}
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={onConfirm} className={`${confirmClass} flex-1`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
