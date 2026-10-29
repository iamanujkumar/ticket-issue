import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { createTicket, fieldError, listBooks, queryKeys } from '../api.js';
import { Button, Card, ErrorBox, Field, PageTitle, inputClass } from '../components.jsx';

const ATTACHMENT_LIMITS = { MAX_FILES: 3, MAX_BYTES: 5 * 1024 * 1024 };
const ATTACHMENT_TYPES = 'image/*,.pdf';

export function NewTicketPage() {
  const [searchParams] = useSearchParams();
  const [bookId, setBookId] = useState(searchParams.get('bookId') ?? '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const books = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
      navigate(`/tickets/${ticket.id}`);
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    createMutation.mutate({ bookId: bookId || null, subject, description });
  }

  const error = createMutation.error;
  const isFieldError = error?.code === 'VALIDATION_ERROR';

  return (
    <>
      <PageTitle title="Raise a support query" />
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Which book is this about?" error={fieldError(error, 'bookId')}>
            <select className={inputClass} value={bookId} onChange={(event) => setBookId(event.target.value)}>
              <option value="">General / Account Level</option>
              {books.data?.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                  {book.status === 'IN_PRODUCTION' ? ' (in production)' : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subject" error={fieldError(error, 'subject')}>
            <input
              className={inputClass}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              minLength={5}
              maxLength={200}
              required
            />
          </Field>

          <Field label="Describe your query" error={fieldError(error, 'description')}>
            <textarea
              className={`${inputClass} min-h-40`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={20}
              maxLength={5000}
              required
            />
          </Field>

          <AttachmentPicker />

          {error && !isFieldError && <ErrorBox error={error} />}

          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Submitting…' : 'Submit query'}
          </Button>
        </form>
      </Card>
    </>
  );
}

function AttachmentPicker() {
  const [files, setFiles] = useState([]);
  const [problem, setProblem] = useState('');

  function handleChange(event) {
    const chosen = Array.from(event.target.files);
    event.target.value = '';

    const tooLarge = chosen.find((file) => file.size > ATTACHMENT_LIMITS.MAX_BYTES);
    if (tooLarge) {
      setProblem(`${tooLarge.name} is larger than 5 MB.`);
      return;
    }
    if (files.length + chosen.length > ATTACHMENT_LIMITS.MAX_FILES) {
      setProblem(`You can attach up to ${ATTACHMENT_LIMITS.MAX_FILES} files.`);
      return;
    }
    setProblem('');
    setFiles([...files, ...chosen]);
  }

  return (
    <div className="text-sm">
      <span className="mb-1 block font-medium text-slate-700">Attachments (optional)</span>
      <input type="file" multiple accept={ATTACHMENT_TYPES} onChange={handleChange} className="text-sm" />
      {problem && <p className="mt-1 text-red-700">{problem}</p>}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2">
              <span>{file.name}</span>
              <button
                type="button"
                className="text-xs text-slate-500 underline"
                onClick={() => setFiles(files.filter((_, position) => position !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Images or PDF, up to 5 MB each. File upload isn&apos;t available yet, so files are not sent with your query. If
        our team needs photos, we&apos;ll tell you where to send them.
      </p>
    </div>
  );
}
