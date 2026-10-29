import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { login } from '../api.js';
import { HOME_BY_ROLE, ME_KEY, useMe } from '../auth.jsx';
import { Button, Card, Field, inputClass } from '../components.jsx';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: user } = useMe();

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: ({ user: loggedInUser }) => {
      queryClient.setQueryData(ME_KEY, loggedInUser);
      navigate(HOME_BY_ROLE[loggedInUser.role], { replace: true });
    },
  });

  if (user) {
    return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  }

  function handleSubmit(event) {
    event.preventDefault();
    loginMutation.mutate({ email, password });
  }

  const error = loginMutation.error;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold text-emerald-800">BookLeaf Support</h1>
        <p className="mb-5 text-sm text-slate-600">Log in to your author or team account.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error && <p className="text-sm text-red-700">{error.details?.[0]?.message ?? error.message}</p>}

          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
