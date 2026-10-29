import { useQuery } from '@tanstack/react-query';
import { listMessages, queryKeys } from '../api.js';
import { ErrorBox, Loading } from '../components.jsx';
import { formatDateTime } from '../format.js';

export function Conversation({ ticketId, viewerRole }) {
  const messages = useQuery({ queryKey: queryKeys.messages(ticketId), queryFn: () => listMessages(ticketId) });

  if (messages.isPending) {
    return <Loading />;
  }
  if (messages.error) {
    return <ErrorBox error={messages.error} onRetry={messages.refetch} />;
  }
  if (messages.data.length === 0) {
    return <p className="text-sm text-slate-500">No replies yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {messages.data.map((message) => {
        const fromSupport = message.senderRole === 'ADMIN';
        const sender = message.senderRole === viewerRole && viewerRole === 'AUTHOR' ? 'You' : message.senderName;

        return (
          <li
            key={message.id}
            className={`rounded-lg border p-3 text-sm ${fromSupport ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
          >
            <p className="mb-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{sender}</span> · {formatDateTime(message.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
