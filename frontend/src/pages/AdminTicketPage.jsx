import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  fieldError,
  getDraft,
  getTicket,
  listNotes,
  postMessage,
  postNote,
  queryKeys,
  regenerateDraft,
  sendDraft,
  updateTicket,
} from '../api.js';
import { useMe } from '../auth.jsx';
import { Badge, Button, Card, ErrorBox, Field, Loading, PriorityBadge, SlaBadge, StatusBadge, inputClass } from '../components.jsx';
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS, formatDateTime, label } from '../format.js';
import { Conversation } from './Conversation.jsx';

const DRAFT_POLL_MS = 4000;

const SOURCE_LABELS = {
  RULES: 'rules',
  AI: 'AI',
  ADMIN: 'admin',
};

export function AdminTicketPage() {
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
    <div className="space-y-5">
      <Link to="/admin" className="text-sm text-emerald-800 underline">
        ← Ticket Queue
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{data.subject}</h1>
          <PriorityBadge priority={data.priority} />
          <StatusBadge status={data.status} />
          <SlaBadge ticket={data} />
          {data.needsReview && <Badge tone="amber">Needs review</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {data.ticketNumber} · {data.author.name} · {data.book?.title ?? 'General / Account Level'} · Raised{' '}
          {formatDateTime(data.createdAt)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <p className="mb-1 text-xs font-medium text-slate-500">Author&apos;s query</p>
            <p className="whitespace-pre-wrap text-sm">{data.description}</p>
          </Card>

          <section>
            <h2 className="mb-3 font-semibold">Conversation</h2>
            <Conversation ticketId={ticketId} viewerRole="ADMIN" />
          </section>

          {data.status === 'CLOSED' ? (
            <p className="text-sm text-slate-600">This ticket is closed, so no more replies can be sent.</p>
          ) : (
            <ReplyComposer ticketId={ticketId} />
          )}
        </div>

        <div className="space-y-5">
          <TicketControls ticket={data} />
          <NotesPanel ticketId={ticketId} />
        </div>
      </div>
    </div>
  );
}

function TicketControls({ ticket }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const updateMutation = useMutation({
    mutationFn: (changes) => updateTicket(ticket.id, { ...changes, version: ticket.version }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ticket(ticket.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    },
    onError: (error) => {
      if (error.code === 'VERSION_CONFLICT') {
        queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
      }
    },
  });

  const select = (field, options) => (
    <select
      className={inputClass}
      value={ticket[field]}
      disabled={updateMutation.isPending || ticket.status === 'CLOSED'}
      onChange={(event) => updateMutation.mutate({ [field]: event.target.value })}
    >
      {Object.entries(options).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );

  const isMine = ticket.assignee?.id === me?.id;

  return (
    <Card className="space-y-4">
      <Field label="Status">{select('status', TICKET_STATUS)}</Field>

      <Field label={`Priority (${SOURCE_LABELS[ticket.prioritySource]})`}>{select('priority', TICKET_PRIORITY)}</Field>
      <AiSuggestion ticket={ticket} field="priority" labels={TICKET_PRIORITY} />

      <Field label={`Category (${SOURCE_LABELS[ticket.categorySource]})`}>{select('category', TICKET_CATEGORY)}</Field>
      <AiSuggestion ticket={ticket} field="category" labels={TICKET_CATEGORY} />

      {ticket.ai.rationale && <p className="text-xs text-slate-600">AI reasoning: {ticket.ai.rationale}</p>}
      {ticket.triageStatus === 'PENDING' && <p className="text-xs text-slate-500">AI classification in progress…</p>}
      {ticket.triageStatus === 'FAILED' && (
        <p className="text-xs text-amber-700">AI classification failed, so keyword rules were used. Please check these values.</p>
      )}

      <div className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Assignee</span>
        <div className="flex items-center justify-between gap-2">
          <span>{ticket.assignee?.name ?? 'Unassigned'}</span>
          {!isMine && ticket.status !== 'CLOSED' && (
            <Button variant="secondary" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ assigneeId: me.id })}>
              Assign to me
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        First response due {formatDateTime(ticket.slaDueAt)}
        {ticket.firstResponseAt && ` · answered ${formatDateTime(ticket.firstResponseAt)}`}
      </p>

      {updateMutation.error && <ErrorBox error={updateMutation.error} />}
    </Card>
  );
}

function AiSuggestion({ ticket, field, labels }) {
  const suggestion = ticket.ai[field];
  if (!suggestion || suggestion === ticket[field]) {
    return null;
  }
  const confidence = ticket.ai.confidence === null ? '' : ` (${Math.round(ticket.ai.confidence * 100)}% sure)`;
  return (
    <p className="-mt-3 text-xs text-slate-500">
      AI suggested {label(labels, suggestion)}
      {confidence}
    </p>
  );
}

function ReplyComposer({ ticketId }) {
  const [body, setBody] = useState('');
  const [draftIdInBox, setDraftIdInBox] = useState(null);
  const [handledDraftId, setHandledDraftId] = useState(null);
  const [regeneratingFrom, setRegeneratingFrom] = useState(undefined);
  const queryClient = useQueryClient();

  const draft = useQuery({
    queryKey: queryKeys.draft(ticketId),
    queryFn: () => getDraft(ticketId),
    refetchInterval: (query) => {
      const current = query.state.data;
      const waiting = current?.status === 'PENDING' || (regeneratingFrom !== undefined && (current?.id ?? null) === regeneratingFrom);
      return waiting ? DRAFT_POLL_MS : false;
    },
  });

  const current = draft.data;
  const readyDraft = current?.status === 'READY' && !current.sent ? current : null;
  const isRegenerating = regeneratingFrom !== undefined && (current?.id ?? null) === regeneratingFrom;

  if (regeneratingFrom !== undefined && !isRegenerating) {
    setRegeneratingFrom(undefined);
  }
  if (readyDraft && readyDraft.id !== handledDraftId) {
    setHandledDraftId(readyDraft.id);
    if (body.trim() === '') {
      setBody(readyDraft.content);
      setDraftIdInBox(readyDraft.id);
    }
  }

  function putDraftInBox() {
    setBody(readyDraft.content);
    setDraftIdInBox(readyDraft.id);
  }

  function clearBox() {
    setBody('');
    setDraftIdInBox(null);
  }

  const sendMutation = useMutation({
    mutationFn: () =>
      draftIdInBox && draftIdInBox === readyDraft?.id ? sendDraft(ticketId, draftIdInBox, body) : postMessage(ticketId, body),
    onSuccess: () => {
      clearBox();
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateDraft(ticketId),
    onSuccess: () => {
      setRegeneratingFrom(current?.id ?? null);
      queryClient.invalidateQueries({ queryKey: queryKeys.draft(ticketId) });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    sendMutation.mutate();
  }

  const sendError = sendMutation.error;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Reply to the author</h2>
        <DraftStatus draft={current} isLoading={draft.isPending} isRegenerating={isRegenerating} />
      </div>

      {readyDraft && draftIdInBox !== readyDraft.id && (
        <p className="text-sm text-slate-600">
          An AI draft is ready.{' '}
          <button type="button" className="text-emerald-800 underline" onClick={putDraftInBox}>
            Put it in the reply box
          </button>
        </p>
      )}

      {readyDraft?.internalHints.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          <p className="mb-1 font-medium">For you, not sent to the author:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {readyDraft.internalHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label={draftIdInBox === readyDraft?.id && draftIdInBox ? 'AI draft (edit before sending)' : 'Message'}
          error={fieldError(sendError, 'body')}
        >
          <textarea
            className={`${inputClass} min-h-56`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            required
          />
        </Field>

        {sendError && sendError.code !== 'VALIDATION_ERROR' && <ErrorBox error={sendError} />}
        {sendError?.code === 'UNRESOLVED_PLACEHOLDERS' && (
          <p className="text-sm text-red-700">Still to replace: {sendError.details.placeholders.join(', ')}</p>
        )}
        {regenerateMutation.error && <ErrorBox error={regenerateMutation.error} />}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={sendMutation.isPending}>
            {sendMutation.isPending ? 'Sending…' : 'Send reply'}
          </Button>
          <Button variant="secondary" disabled={regenerateMutation.isPending || isRegenerating} onClick={() => regenerateMutation.mutate()}>
            {current ? 'Regenerate AI draft' : 'Generate AI draft'}
          </Button>
          {body && (
            <Button variant="secondary" onClick={clearBox}>
              Clear
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function DraftStatus({ draft, isLoading, isRegenerating }) {
  if (isLoading) {
    return null;
  }
  if (isRegenerating || draft?.status === 'PENDING') {
    return <Badge tone="blue">AI is writing a draft…</Badge>;
  }
  if (!draft) {
    return <Badge>No AI draft yet</Badge>;
  }
  if (draft.status === 'FAILED') {
    return <Badge tone="red">AI draft failed. Write a reply or try again</Badge>;
  }
  if (draft.sent) {
    return <Badge>Last AI draft already sent</Badge>;
  }
  if (draft.isStale) {
    return <Badge tone="amber">Draft is older than the latest changes</Badge>;
  }
  return <Badge tone="green">AI draft ready</Badge>;
}

function NotesPanel({ ticketId }) {
  const [body, setBody] = useState('');
  const queryClient = useQueryClient();
  const notes = useQuery({ queryKey: queryKeys.notes(ticketId), queryFn: () => listNotes(ticketId) });

  const noteMutation = useMutation({
    mutationFn: () => postNote(ticketId, body),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: queryKeys.notes(ticketId) });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    noteMutation.mutate();
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Internal notes</h2>
        <p className="text-xs text-slate-500">Only the BookLeaf team can see these.</p>
      </div>

      {notes.isPending && <Loading />}
      {notes.error && <ErrorBox error={notes.error} onRetry={notes.refetch} />}
      {notes.data?.length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
      {notes.data?.length > 0 && (
        <ul className="space-y-2">
          {notes.data.map((note) => (
            <li key={note.id} className="rounded-md bg-slate-50 p-2 text-sm">
              <p className="mb-0.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{note.admin?.name}</span> · {formatDateTime(note.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{note.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          className={`${inputClass} min-h-20`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={5000}
          placeholder="Add a note for the team"
          aria-label="New internal note"
          required
        />
        {noteMutation.error && <ErrorBox error={noteMutation.error} />}
        <Button type="submit" variant="secondary" disabled={noteMutation.isPending}>
          Add note
        </Button>
      </form>
    </Card>
  );
}
