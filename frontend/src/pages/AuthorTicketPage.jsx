import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { fieldError, getTicket, postMessage, queryKeys } from '../api.js';
import { Button, Card, ErrorBox, Field, Loading, StatusBadge, inputClass } from '../components.jsx';
import { formatDateTime } from '../format.js';
import { Conversation } from './Conversation.jsx';

export function AuthorTicketPage() {
  const { ticketId } = useParams();
  const ticket = useQuery({ queryKey: queryKeys.ticket(ticketId), queryFn: () => getTicket(ticketId) });

  if (ticket.isPending) {
    return <Loading />;
  }
  if (ticket.error) {
    return <ErrorBox error={ticket.error} onRetry={ticket.refetch} />;
  }

  const { data } = ticket;

  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/tickets" className="text-sm text-emerald-800 underline">
        ← My Tickets
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{data.subject}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {data.ticketNumber} · {data.book?.title ?? 'General / Account Level'} · Raised {formatDateTime(data.createdAt)}
        </p>
      </div>

      <Card>
        <p className="mb-1 text-xs font-medium text-slate-500">Your query</p>
        <p className="whitespace-pre-wrap text-sm">{data.description}</p>
      </Card>

      <section>
        <h2 className="mb-3 font-semibold">Conversation</h2>
        <Conversation ticketId={ticketId} viewerRole="AUTHOR" />
      </section>

      {data.status === 'CLOSED' ? (
        <p className="text-sm text-slate-600">
          This ticket is closed. If you need more help, please{' '}
          <Link to="/tickets/new" className="text-emerald-800 underline">
            raise a new query
          </Link>
          .
        </p>
      ) : (
        <ReplyForm ticketId={ticketId} isResolved={data.status === 'RESOLVED'} />
      )}
    </div>
  );
}

function ReplyForm({ ticketId, isResolved }) {
  const [body, setBody] = useState('');
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: () => postMessage(ticketId, body),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    replyMutation.mutate();
  }

  const error = replyMutation.error;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Reply" error={fieldError(error, 'body')}>
        <textarea
          className={`${inputClass} min-h-28`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={5000}
          required
        />
      </Field>
      {isResolved && <p className="text-xs text-slate-500">Replying will reopen this ticket.</p>}
      {error && error.code !== 'VALIDATION_ERROR' && <ErrorBox error={error} />}
      <Button type="submit" disabled={replyMutation.isPending}>
        {replyMutation.isPending ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  );
}
